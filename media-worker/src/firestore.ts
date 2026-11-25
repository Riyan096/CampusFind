// Minimal Firestore REST client with admin access, for the server-authoritative
// endpoints (item resolution, report points). Uses a Google service account so
// it can write fields the security rules forbid clients to touch.
// https://cloud.google.com/firestore/docs/reference/rest
import { importPKCS8, SignJWT } from "jose";

import type { DocData, Write } from "./resolution.ts";

export interface FirestoreEnv {
  FIREBASE_PROJECT_ID: string;
  /** Service account key JSON (Cloudflare secret). Needs only the Cloud Datastore User role. */
  GOOGLE_SERVICE_ACCOUNT?: string;
  /** host:port of the Firestore emulator. Local tests only; never set in production. */
  FIRESTORE_EMULATOR_HOST?: string;
}

export class FirestoreError extends Error {
  readonly status: number;
  readonly grpcStatus?: string;
  constructor(message: string, status: number, grpcStatus?: string) {
    super(message);
    this.status = status;
    this.grpcStatus = grpcStatus;
  }
}

// ------------------------------------------------------------------ auth

let cachedToken: { token: string; expiresAt: number; email: string } | null = null;

async function accessToken(env: FirestoreEnv): Promise<string> {
  // The emulator treats "owner" as an admin credential that bypasses rules.
  if (env.FIRESTORE_EMULATOR_HOST) return "owner";
  if (!env.GOOGLE_SERVICE_ACCOUNT) throw new Error("GOOGLE_SERVICE_ACCOUNT is not configured.");

  const key = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.email === key.client_email && cachedToken.expiresAt > now + 60) {
    return cachedToken.token;
  }

  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(key.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await importPKCS8(key.private_key, "RS256"));

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new FirestoreError("Service account sign-in failed.", response.status);
  const result = await response.json() as { access_token: string; expires_in: number };
  cachedToken = { token: result.access_token, expiresAt: now + result.expires_in, email: key.client_email };
  return result.access_token;
}

// ---------------------------------------------------------------- values

type Value = Record<string, unknown>;

export function toValue(v: unknown): Value {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "object") return { mapValue: { fields: toFields(v as DocData) } };
  throw new Error(`Unsupported Firestore value: ${typeof v}`);
}

export function toFields(data: DocData): Record<string, Value> {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)]));
}

export function fromValue(v: Value): unknown {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("stringValue" in v) return v.stringValue;
  // Timestamps come back as ISO strings, matching how the app stores most dates.
  if ("timestampValue" in v) return v.timestampValue;
  if ("referenceValue" in v) return v.referenceValue;
  if ("geoPointValue" in v) return v.geoPointValue;
  if ("bytesValue" in v) return v.bytesValue;
  if ("arrayValue" in v) return ((v.arrayValue as { values?: Value[] }).values || []).map(fromValue);
  if ("mapValue" in v) return fromFields((v.mapValue as { fields?: Record<string, Value> }).fields || {});
  return null;
}

export function fromFields(fields: Record<string, Value>): DocData {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromValue(v)]));
}

// --------------------------------------------------------------- requests

/** Only plain document IDs; blocks path traversal like "a/b" from user input. */
export const isDocId = (id: string) => /^[A-Za-z0-9_-]{1,128}$/.test(id);

function databasePath(env: FirestoreEnv) {
  return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)`;
}

function baseUrl(env: FirestoreEnv) {
  const host = env.FIRESTORE_EMULATOR_HOST ? `http://${env.FIRESTORE_EMULATOR_HOST}` : "https://firestore.googleapis.com";
  return `${host}/v1/${databasePath(env)}/documents`;
}

const docName = (env: FirestoreEnv, path: string) => `${databasePath(env)}/documents/${path}`;

async function call<T>(env: FirestoreEnv, method: string, suffix: string, body?: unknown): Promise<T> {
  const response = await fetch(baseUrl(env) + suffix, {
    method,
    headers: { Authorization: `Bearer ${await accessToken(env)}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({})) as T & { error?: { message?: string; status?: string } };
  if (!response.ok) {
    const error = (Array.isArray(result) ? result[0]?.error : result.error) as { message?: string; status?: string } | undefined;
    throw new FirestoreError(error?.message || `Firestore request failed (${response.status}).`,
      response.status, error?.status);
  }
  return result;
}

function encodeWrite(env: FirestoreEnv, write: Write) {
  const update = { name: docName(env, write.path), fields: toFields(write.data) };
  if (write.op === "create") return { update, currentDocument: { exists: false } };
  // updateMask limits the write to these fields, which gives set-with-merge semantics.
  const updateMask = { fieldPaths: Object.keys(write.data) };
  return write.op === "update" ?
    { update, updateMask, currentDocument: { exists: true } } :
    { update, updateMask };
}

/** Commit writes without a transaction. Used by tests to seed data. */
export async function commit(env: FirestoreEnv, writes: Write[]): Promise<void> {
  await call(env, "POST", ":commit", { writes: writes.map((w) => encodeWrite(env, w)) });
}

// ------------------------------------------------------------ transactions

export interface Transaction {
  /** Read documents by path; missing documents come back as null. */
  getAll(paths: string[]): Promise<Array<DocData | null>>;
  /** Equality query on one collection. */
  where(collection: string, field: string, value: string): Promise<DocData[]>;
}

const MAX_ATTEMPTS = 5;

/**
 * Run fn inside a Firestore transaction and commit the writes it returns.
 * Reads lock the documents they touch, so two concurrent runs cannot both
 * see "no award yet"; the loser is aborted and retried against fresh data.
 */
export async function runTransaction<T>(
  env: FirestoreEnv,
  fn: (tx: Transaction) => Promise<{ writes: Write[]; result: T }>,
): Promise<T> {
  let previous: string | undefined;
  for (let attempt = 1; ; attempt++) {
    // retryTransaction tells Firestore this retries an aborted attempt, which raises its lock priority.
    const { transaction } = await call<{ transaction: string }>(env, "POST", ":beginTransaction", {
      options: { readWrite: previous ? { retryTransaction: previous } : {} },
    });
    previous = transaction;
    const tx: Transaction = {
      async getAll(paths) {
        const rows = await call<Array<{ found?: { name: string; fields?: Record<string, Value> }; missing?: string }>>(
          env, "POST", ":batchGet", { documents: paths.map((p) => docName(env, p)), transaction });
        const byName = new Map(rows.filter((r) => r.found).map((r) => [r.found!.name, fromFields(r.found!.fields || {})]));
        return paths.map((p) => byName.get(docName(env, p)) ?? null);
      },
      async where(collection, field, value) {
        const rows = await call<Array<{ document?: { fields?: Record<string, Value> } }>>(env, "POST", ":runQuery", {
          transaction,
          structuredQuery: {
            from: [{ collectionId: collection }],
            where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } },
          },
        });
        return rows.filter((r) => r.document).map((r) => fromFields(r.document!.fields || {}));
      },
    };

    try {
      const { writes, result } = await fn(tx);
      await call(env, "POST", ":commit", { transaction, writes: writes.map((w) => encodeWrite(env, w)) });
      return result;
    } catch (error) {
      await call(env, "POST", ":rollback", { transaction }).catch(() => undefined);
      const contended = error instanceof FirestoreError && error.grpcStatus === "ABORTED";
      if (!contended || attempt >= MAX_ATTEMPTS) throw error;
      // Random backoff so contending requests don't collide again on the retry.
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 100 * 2 ** attempt));
    }
  }
}
