# CampusFind Media Worker

This is a separate Cloudflare Worker for private chat photo uploads and delivery. It does not host the CampusFind website.

## Current scope

- Runs locally with Wrangler; no deployment is required.
- Verifies Firebase Authentication ID tokens.
- Checks the signed-in user's membership in the Firestore chat document.
- Accepts JPEG, PNG, and WebP images up to 8 MB.
- Uploads images to Cloudinary using authenticated delivery.
- Proxies image retrieval after checking chat membership again.
- Keeps Cloudinary API credentials on the Worker, never in browser code.

## Local setup

From the repository root:

```powershell
cd media-worker
npm install
Copy-Item .dev.vars.example .dev.vars
```

Open `media-worker/.dev.vars` and replace the placeholders with the API Key and API Secret from Cloudinary Settings → API Keys.

Do not commit `.dev.vars`, share its contents, or add either credential to a `VITE_*` variable.

Start the local Worker:

```powershell
npm run dev
```

Wrangler should serve the Worker locally at `http://localhost:8787`. The health endpoint is:

```text
http://localhost:8787/health
```

The health endpoint does not require Firebase authentication. Upload and image endpoints do.

## Endpoints

- `POST /api/upload`: multipart form fields `chatId` and `file`; requires `Authorization: Bearer <Firebase ID token>`.
- `GET /api/media?chatId=...&messageId=...&publicId=...&format=...`: requires the same Firebase bearer token, checks chat membership, and verifies that the exact message document contains the matching image attachment metadata before proxying the image.
- `GET /health`: local health check.

## Integration status

The frontend is connected:

- `src/views/ChatView.tsx` uploads chat photos to `POST /api/upload` and stores the returned metadata as the message `attachment`.
- `src/components/AuthenticatedChatImage.tsx` loads chat photos through `GET /api/media`.
- `firestore.rules` validates message attachments (`validImageAttachment`: type, `publicId` path, format, size, and dimensions).

Both frontend files fall back to `http://localhost:8787` when `VITE_MEDIA_WORKER_URL` is unset, so a production build without that variable cannot send or show chat photos.

Still missing before deployment:

- Emulator tests for creating photo messages (valid and invalid attachments). The Firestore rules suite currently only covers removing an attachment.
- Tests for the Worker itself (auth, membership, file type and size limits).
- An end-to-end test with two accounts: upload, view, and confirm a non-participant is refused.
- Production `ALLOWED_ORIGINS` (see Configuration).

Do not deploy this Worker until those are done.

## Configuration

Non-secret local settings are in `wrangler.toml`:

- Firebase project: `campusfind-app`
- Cloudinary cloud name: `an5eg6cs`
- Allowed browser origins: Vite local development ports 5173 and 4173

If your local Vite app uses a different port, add that exact origin to `ALLOWED_ORIGINS`.
