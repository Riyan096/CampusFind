# CampusFind production readiness

This checklist separates repository work from settings that must be completed in the Firebase, Cloudflare, and hosting dashboards. Do not treat a checked source-code item as proof that a cloud-console setting is enabled.

## Current verified status

- Firestore rules emulator suite: 35/35 passed on `main` (reported by the project owner on 2026-11-10).
- Realtime Database and Storage rule emulator test files are present; the RTDB suite now has a dedicated npm script and explicit emulator port. These suites still need to be run on the current branch.
- Firestore rules are version-controlled in `firestore.rules`.
- Realtime Database rules are version-controlled in `database.rules.json`.
- Firebase Storage rules are version-controlled in `storage.rules`.
- Local `.env*` files are excluded by the root `.gitignore` (with `.env.example` explicitly allowed); Cloudflare `.dev.vars*` and Wrangler state are excluded.
- Firebase Web API configuration is public client configuration. It must not be treated as authorization; rules and App Check provide protection.
- Gemini is documented as a server-side Firebase Functions secret, not a Vite variable.

## Important launch blockers and architecture notes

1. **Firebase Spark versus callable Cloud Functions:** the React app calls Firebase callable functions for Gemini image analysis, smart matching, and item resolution. The repository also contains server-side cleanup and chat/notification functions. Deploying Firebase Cloud Functions requires the Blaze billing plan. If this project must remain on Spark, those features need a supported alternative (for example, a separately secured Cloudflare Worker) or must be disabled before launch. Do not assume these callable endpoints work just because the frontend builds.
2. **Chat media worker is not integrated:** the media-worker README currently says the frontend is not connected and the worker must not be deployed until the photo-message rules, UI, and end-to-end tests are complete. The current React app uses Firebase Storage for item/profile images. Keep the chat media worker out of production until the integration is finished and tested.
3. **Production domains are unknown:** `media-worker/wrangler.toml` currently allows only localhost origins. Do not replace this with a wildcard. Add the exact production origin (and only the preview origin you intend to support) after the final hosting domain is known.
4. **Cloud console state is not visible from this repository:** deployed rules, Authentication providers/domains, App Check registration/enforcement, Cloudinary settings, billing plan, and usage alerts must be verified in their respective dashboards.

## Repository changes

- Firebase App Check initialization is wired into `src/services/firebase.ts` using the reCAPTCHA Enterprise web provider.
- Configure `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` in the hosting environment after registering the web app in Firebase App Check. The site key is public. Never put a reCAPTCHA secret, Cloudinary API secret, Gemini key, or service-account credential in a `VITE_*` variable.
- If the site key is missing, the app still starts but logs a production error. This is intentional for local development; a production release must not proceed until App Check is configured and verified.

## Firebase console tasks

1. Confirm the Firebase project is `campusfind-app` and verify the selected billing plan.
2. In Authentication, enable only the sign-in providers the app actually supports (currently email/password), review password policy, and add the production hosting domain under authorized domains.
3. In App Check, register the web app with reCAPTCHA Enterprise, configure the exact production and intended preview domains in reCAPTCHA Enterprise, then copy the **site key** into the hosting variable `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`.
4. Deploy the reviewed rules from the repository using the Firebase CLI:
   - `firebase deploy --only firestore:rules`
   - `firebase deploy --only database`
   - `firebase deploy --only storage`
5. In App Check metrics, monitor valid/invalid/unknown requests for each supported product before enabling enforcement. Enforce only after confirming legitimate production traffic is receiving valid App Check tokens. Do not enable enforcement blindly.
6. Verify Firestore, RTDB, and Storage deployed rules in the Firebase console match the committed files. Rules in one Firebase product do not protect another product.
7. Configure usage monitoring and budget alerts. Firebase usage quotas and Google Cloud billing alerts are separate concerns; a budget alert is not a hard spending cap.
8. Test with two independent accounts and confirm private user documents, chats, messages, typing state, and user-specific data cannot be read by the other account.

## Cloudflare and Cloudinary tasks

- Keep `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` as Cloudflare Worker secrets only. Never commit them or put them in Vite variables.
- Keep `FIREBASE_PROJECT_ID` and `CLOUDINARY_CLOUD_NAME` as non-secret Worker vars.
- Once the final site URL is known, set `ALLOWED_ORIGINS` to comma-separated exact origins, for example `https://campusfind.example`. Include a preview origin only if it is deliberately supported. Never use `*`.
- Review Cloudinary upload and delivery settings, authenticated asset delivery, transformation limits, and account usage limits.
- Do not deploy this worker until the frontend uses it and chat attachment rules/UI/end-to-end tests exist. Current code comments and README indicate that integration is incomplete.

## Hosting and build tasks

- Set the Vite Firebase client configuration in the hosting provider's production environment variables. These values are public client configuration, not secrets.
- Set `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` after App Check registration.
- Set `VITE_MEDIA_WORKER_URL` only if the worker is actually integrated and deployed; otherwise leave the app on its current Firebase Storage path.
- Set a dedicated GIPHY public client key only if GIF search is enabled. Assume it is visible to every visitor and apply provider-side restrictions/quotas where available.
- Do not configure `VITE_EMAIL_API_KEY`: the current email service is a demo logger, not a real email provider. It is explicitly disabled until a server-side email integration exists.
- Never set `GEMINI_API_KEY`, Cloudinary API secret, Firebase service-account JSON, or other private credentials as `VITE_*` variables.
- Run `npm ci`, `npm run lint`, and `npm run build` from the repository root in a clean checkout.
- From `functions/`, run `npm run test:rules`, `npm run test:database-rules`, and `npm run test:storage-rules`.
- Verify the host is configured for a Vite SPA fallback to `index.html` if client-side routes are introduced.

## Functional smoke tests

Run these against the deployed staging/preview site before public launch:

- Sign up with a new email, sign in, sign out, and sign in again.
- Verify the password-reset flow added to the sign-in screen works end-to-end using Firebase Authentication.
- Test protected pages while signed out and signed in.
- Create, edit, search, and report an item; verify image upload, image read, and image deletion behavior.
- Test item status transitions with the reporter account and a second account.
- Test chat creation, message send/read, replies, reactions, typing state, blocking, and notifications.
- Confirm blocked users cannot start or continue prohibited interactions.
- Test on a narrow mobile viewport and desktop; check browser console and network failures.
- Test malformed files, oversized files, unsupported MIME types, expired auth tokens, and failed network requests.

## Launch decision

Do not call the app production-ready until:
- App Check is registered, initialized in the production build, monitored, and then enforced for the relevant services.
- The deployed Firestore, RTDB, and Storage rules have been verified.
- The Firebase Spark/Cloud Functions dependency has been resolved.
- The production domain is known and the media worker CORS configuration is intentionally set (if the worker is used).
- The hosting build and the two-account end-to-end smoke tests pass.
- A privacy policy, abuse/report contact, and an operational process for reviewing reports/removing inappropriate content are published.
