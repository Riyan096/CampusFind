# CampusFind Media Worker

This is a separate Cloudflare Worker for private chat photo uploads and delivery, and for the server-authoritative item resolution and points routes that replace the `resolveItem` and `awardPoints` Cloud Functions (so the app can stay on the Firebase Spark plan). It does not host the CampusFind website.

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
- `POST /api/items/resolve`: JSON `{itemId, newStatus}`. Changes an item's status and, for a confirmed return, awards the reporter's points exactly once, in one Firestore transaction. Replaces the `resolveItem` Cloud Function; rules live in `src/resolution.ts`.
- `POST /api/points/report`: JSON `{activityType: "report", itemId}`. Awards report points once per item to its reporter. Replaces the `awardPoints` Cloud Function.

Both data routes need the Firebase bearer token and an `X-Firebase-AppCheck` token. They write with a service account (`GOOGLE_SERVICE_ACCOUNT` secret, Cloud Datastore User role only), because the security rules correctly forbid clients from writing points. Errors come back as `{error, code}` with the old Cloud Function codes (`permission-denied`, `failed-precondition`, ...).

## Tests

```powershell
npm test                # unit tests (no emulator needed)
npm run test:emulator   # item/points routes against the Firestore emulator (needs Java)
```

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

Settings for the item/points routes:

- `FIREBASE_PROJECT_NUMBER` (var): numeric project number from Firebase console > Project settings. Required to verify App Check tokens; without it those routes refuse every request.
- `GOOGLE_SERVICE_ACCOUNT` (secret): service account key JSON. Set with `npx wrangler secret put GOOGLE_SERVICE_ACCOUNT`. Never commit it or put it in a `VITE_*` variable.
- `APP_CHECK_DISABLED="true"`: local `.dev.vars` only, because the local Vite app usually runs without App Check. Never set it in production.
