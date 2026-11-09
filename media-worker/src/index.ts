import { createRemoteJWKSet, jwtVerify } from "jose";

interface Env {
  FIREBASE_PROJECT_ID: string;
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
  ALLOWED_ORIGINS: string;
}

interface AuthenticatedUser {
  uid: string;
  idToken: string;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["jpg", "png", "webp"]);
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;

  const allowed = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers({
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  });

  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}

function withCors(response: Response, origin: string | null): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders(origin)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha1Hex(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value)));
}

async function deliverySignature(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "").slice(0, 8);
}

async function authenticate(request: Request, env: Env): Promise<AuthenticatedUser | null> {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  try {
    const idToken = match[1];
    const { payload } = await jwtVerify(idToken, FIREBASE_JWKS, {
      audience: env.FIREBASE_PROJECT_ID,
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      algorithms: ["RS256"],
    });

    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    return { uid: payload.sub, idToken };
  } catch {
    return null;
  }
}

async function isChatParticipant(
  chatId: string,
  user: AuthenticatedUser,
  env: Env
): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(chatId)) return false;

  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/chats/${encodeURIComponent(chatId)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${user.idToken}` },
  });

  if (!response.ok) return false;

  const document = await response.json() as {
    fields?: {
      participantIds?: {
        arrayValue?: { values?: Array<{ stringValue?: string }> };
      };
    };
  };

  const participants = document.fields?.participantIds?.arrayValue?.values || [];
  return participants.some((entry) => entry.stringValue === user.uid);
}

function imageFormat(file: File, bytes: Uint8Array): "jpg" | "png" | "webp" | null {
  const type = file.type.toLowerCase();

  if (
    type === "image/jpeg" &&
    bytes.length >= 3 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  ) return "jpg";

  if (
    type === "image/png" &&
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "png";

  if (
    type === "image/webp" &&
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return "webp";

  return null;
}

async function uploadImage(request: Request, env: Env, user: AuthenticatedUser): Promise<Response> {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_IMAGE_BYTES + 64 * 1024) {
    return json({ error: "Image is too large. The maximum size is 8 MB." }, 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected a multipart form containing a photo and chatId." }, 400);
  }

  const chatId = form.get("chatId");
  const file = form.get("file");

  if (typeof chatId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(chatId)) {
    return json({ error: "A valid chatId is required." }, 400);
  }

  if (!(file instanceof File)) {
    return json({ error: "A photo file is required." }, 400);
  }

  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    return json({ error: "Choose an image between 1 byte and 8 MB." }, 413);
  }

  if (!(await isChatParticipant(chatId, user, env))) {
    return json({ error: "You do not have access to this conversation." }, 403);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = imageFormat(file, bytes);
  if (!format) {
    return json({ error: "Only valid JPEG, PNG, and WebP images are supported." }, 415);
  }

  const publicId = `campusfind/chats/${chatId}/${crypto.randomUUID()}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const signaturePayload = `public_id=${publicId}&timestamp=${timestamp}&type=authenticated`;
  const signature = await sha1Hex(signaturePayload + env.CLOUDINARY_API_SECRET);

  const cloudinaryForm = new FormData();
  cloudinaryForm.set("file", new Blob([bytes], { type: file.type }), `photo.${format}`);
  cloudinaryForm.set("api_key", env.CLOUDINARY_API_KEY);
  cloudinaryForm.set("timestamp", String(timestamp));
  cloudinaryForm.set("type", "authenticated");
  cloudinaryForm.set("public_id", publicId);
  cloudinaryForm.set("signature", signature);

  const uploadUrl = `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/upload`;
  const cloudinaryResponse = await fetch(uploadUrl, { method: "POST", body: cloudinaryForm });

  if (!cloudinaryResponse.ok) {
    const details = await cloudinaryResponse.json().catch(() => ({})) as { error?: { message?: string } };
    console.error("Cloudinary upload failed:", cloudinaryResponse.status, details.error?.message || "Unknown error");
    return json({ error: "The photo could not be uploaded. Please try again." }, 502);
  }

  const result = await cloudinaryResponse.json() as {
    public_id: string;
    format: string;
    bytes: number;
    width: number;
    height: number;
  };

  if (!ALLOWED_FORMATS.has(result.format) || result.public_id !== publicId) {
    console.error("Cloudinary returned unexpected image metadata.");
    return json({ error: "The uploaded photo returned unexpected metadata." }, 502);
  }

  return json({
    publicId: result.public_id,
    format: result.format,
    bytes: result.bytes,
    width: result.width,
    height: result.height,
  }, 201);
}

async function serveImage(request: Request, env: Env, user: AuthenticatedUser): Promise<Response> {
  const url = new URL(request.url);
  const chatId = url.searchParams.get("chatId") || "";
  const publicId = url.searchParams.get("publicId") || "";
  const format = (url.searchParams.get("format") || "").toLowerCase();

  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(chatId) ||
    !ALLOWED_FORMATS.has(format) ||
    !publicId.startsWith(`campusfind/chats/${chatId}/`) ||
    !/^[A-Za-z0-9-]{36}$/.test(publicId.slice(`campusfind/chats/${chatId}/`.length))
  ) {
    return json({ error: "Invalid image reference." }, 400);
  }

  if (!(await isChatParticipant(chatId, user, env))) {
    return json({ error: "You do not have access to this conversation." }, 403);
  }

  const deliveryPath = `${publicId}.${format}`;
  const signature = await deliverySignature(`${deliveryPath}${env.CLOUDINARY_API_SECRET}`);
  const imageUrl = `https://res.cloudinary.com/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/authenticated/s--${signature}--/${deliveryPath}`;

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    console.error("Cloudinary image delivery failed:", imageResponse.status);
    return json({ error: "The photo could not be retrieved." }, 404);
  }

  const headers = new Headers({
    "Content-Type": imageResponse.headers.get("Content-Type") || `image/${format}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });

  return new Response(imageResponse.body, { status: 200, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request, env);
    const requestOrigin = request.headers.get("Origin");

    if (requestOrigin && !origin) {
      return json({ error: "This origin is not allowed." }, 403);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return withCors(json({ ok: true, service: "campusfind-media" }), origin);
    }

    if (
      !((request.method === "POST" && url.pathname === "/api/upload") ||
        (request.method === "GET" && url.pathname === "/api/media"))
    ) {
      return withCors(json({ error: "Not found." }, 404), origin);
    }

    const user = await authenticate(request, env);
    if (!user) {
      return withCors(json({ error: "A valid Firebase sign-in is required." }, 401), origin);
    }

    try {
      const response = request.method === "POST"
        ? await uploadImage(request, env, user)
        : await serveImage(request, env, user);
      return withCors(response, origin);
    } catch (error) {
      console.error("Media Worker request failed:", error);
      return withCors(json({ error: "The media request could not be completed." }, 500), origin);
    }
  },
};
