# CampusFind project notes

Repository: [Riyan096/CampusFind](https://github.com/Riyan096/CampusFind), cloned from `main` on 2026-11-06. This is a compact working map for future implementation work; re-check files before changing behavior because this note can go stale.

## Product and current architecture

CampusFind is a Wayne State University focused lost-and-found web app. Signed-in users report lost/found items, browse/search/map listings, contact other users in real-time chat, receive notifications, and earn gamification rewards. There are profile, leaderboard, and admin views.

- Frontend: React 19 + TypeScript + Vite; `src/main.tsx` mounts `src/App.tsx`.
- `src/context/AuthContext.tsx` owns Firebase auth/session and profile context. `App.tsx` gates unauthenticated users at `LoginView`, subscribes to Firestore items, loads local/Firestore stats, and switches among views through `Layout` (tab state rather than a router).
- Views under `src/views/` implement Home, Report, Browse, Map, Chat, Profile, Leaderboard, Admin, Login, and AppInfo.
- Reusable UI under `src/components/`; global styles in `src/index.css`; shared domain types in `src/types.ts` and `src/types/index.ts` (verify which path imports resolve to before editing).
- Frontend integrations live in `src/services/`: `firebase.ts` initializes Auth, Firestore, RTDB, Functions, Storage; `itemService.ts` handles item reads/writes and subscriptions; `itemApi.ts` calls trusted status resolution; `chatService.ts` uses RTDB; `notificationService.ts` uses Firestore; `geminiService.ts` calls AI callable functions; `matchingService.ts` combines candidate retrieval/scoring/notifications; `firebaseStorageService.ts` handles image upload/delete; `gamificationApi.ts` invokes trusted reward calls; `StorageService.ts` retains localStorage/demo data and stats sync; `geocodeService.ts` handles campus location geocoding/cache; `emailService.ts` provides email templates/integration.
- Backend is Firebase: Firestore for items/users/public profiles/notifications/point awards, RTDB for chats/messages, Storage for images, Cloud Functions in `functions/src/` for trusted workflows. `index.ts` exports cleanup triggers, reward callable, and atomic `resolveItem`; `gamification.ts` computes protected stats/points/streaks/achievements; `aiFunctions.ts` hosts authenticated, validated and rate-limited Gemini callables (`analyzeItemImage`, `findSmartMatches`). Gemini secret is Functions-only, never a Vite env var.
- Firebase policy/config: `firestore.rules`, `database.rules.json`, `storage.rules`, `firestore.indexes.json`, `firebase.json`. Functions tests are in `functions/test/`; Firebase Emulator Suite is used for rules and resolution regression tests.

## Important behavior / invariants

- Item status changes must go through the `resolveItem` callable. LOST path: `STILL_LOST → MATCH_FOUND → CLAIMED → RECOVERED`; FOUND path: `AVAILABLE → PENDING_CLAIM → RETURNED / UNCLAIMED`. Server validates actor, current state, legal transition and writes status/reward atomically. Do not reintroduce client status writes.
- Final rewarded confirmations (`MATCH_FOUND → CLAIMED`, `PENDING_CLAIM → RETURNED`) must be made by someone other than the reporter, or by an admin, so the reporter cannot self-award return points.
- Gamification/point awards and protected user counters are server authoritative and idempotent. Client Firestore rules should continue to block changes to ownership, status, moderation fields, server timestamps, user stats and point-award records.
- RTDB chat rules were reported completed in the master TODO with emulator coverage for membership, sender identity, immutable metadata, membership changes, unauthorized access, arbitrary fields and deletion. Review both rules and tests before modifying chat schema.
- AI requests are callable functions with authenticated access, input bounds, MIME/category/schema validation and per-user rate limiting. Keep API key only in Firebase Functions secret.
- Storage has cleanup triggers for removed/replaced item images. Storage rules/uploads are an explicit outstanding hardening area; validate client checks against rules rather than assuming client MIME validation is security enforcement.

## Security fixes in this checkout (2026-11-06)

- Firestore item creation is restricted to initial LOST/FOUND states and an explicit field allowlist; updates validate timestamps and editable fields.
- New user documents are restricted to profile fields and zero initial stats. Cross-user item-match and chat notifications now use callables that verify source item ownership or chat membership/message authorship; clients cannot directly create inbox notifications.
- Chat participant additions are server-authoritative: the callable checks that the caller owns the item associated with the chat. RTDB rules allow the creator alone at chat creation and prevent client-side additions.
- Storage cleanup verifies the configured bucket and exact `users/{reporter}/items/{itemId}/{file}` namespace before deleting an image.
- Regression cases were updated or added for item/user creation, notification creation, resolution confirmation, injected chat participants, and cross-owner/wrong-bucket cleanup URLs. They have not been run in this checkout yet; callable coverage for item-owner chat joins and notification validation remains to add.

## README feature scope

The README describes these product capabilities: lost/found reporting with photos; real-time listing browse/search/filter; Gemini assisted matching; real-time chat; in-app and email notifications; authentication; points, achievements, streaks and leaderboard; admin tools; date/location/category/status search; campus-aware locations/map; responsive UI; and analytics/reporting goals. Some are foundations or aspirational claims, so confirm implementation in code before treating them as complete.

## What the project TODO says to implement next

The detailed `CampusFind_TODO.md` is the actionable backlog. Its first five security phases are marked complete (atomic resolution, server-authoritative item states, Firestore hardening, RTDB chat security, server-side Gemini security). `/users` privacy is described in Phase 5 as completed; confirm checkbox/details in the TODO before reopening it.

Outstanding items grouped from the unchecked TODO entries:

1. **P1 Storage security** (`CampusFind_TODO.md`, Phase 6): inventory all Storage operations and define path/ownership model; enforce authenticated approved paths, ownership, allowed MIME/size/metadata and intended read/delete access in rules/server; test unauthorized, oversized/unsupported, arbitrary-path cases with Storage Emulator; review orphan cleanup and image re-encoding; rerun relevant emulator suites/build.
2. **P1 Performance** (Phase 7): inspect bundle composition; lazy-load views, admin, map and AI; remove duplicate dependencies.
3. **P1 Reward abuse prevention** (Phase 8): daily report caps, duplicate detection, minimum quality, fake-return controls, moderation hooks and suspicious-activity detection.
4. **P1 Trust and safety** (Phase 9): user/item reports, content moderation, admin review queue, bans/suspensions and audit logs.
5. **P1 Item lifecycle UX** (Phase 10): My Items dashboard, status timeline, claim verification, return confirmation, match confidence/notifications, loading/empty/error states.
6. **P1 Chat UX** (Phase 11): read receipts, typing indicators, timestamps, image gallery, delete-message UX and better conversation list.
7. **P1 Campus experience** (Phase 12): campus picker and feeds, building directory, improved location search and map.
8. **P2 Search/discovery** (Phase 13): saved searches, advanced filters, suggestions, improved AI matches, similar items and personalization.
9. **P1 Notifications** (Phase 14): match/claim/return/chat events, preferences and push notifications.
10. **P2 Matching** (Phase 15): scoring, explanations, confidence display, automatic alerts and human confirmation.
11. **P2 Admin** (Phase 16): moderation queue, user/item management, analytics/reports and suspicious-activity dashboard.
12. **P2 Reputation** (Phase 17): reputation score, verified returns, trust badges, contributor levels and recognition.
13. **P2/P3 polish** (Phase 18): mobile navigation, accessibility/keyboard audit, error boundaries, improved loading/empty/toast experiences, responsive/visual consistency and docs cleanup.

## Developer commands

Root `package.json`: `npm run dev`, `npm run build`, `npm run lint`. The README also documents `npm run test:rules` and `npm run test:emulator`, but those scripts are not present in the cloned root `package.json` at this snapshot; inspect `functions/package.json` and repo test setup before relying on command names. Firebase config enables Storage emulator only (`9199` shown), so check local emulator config before running tests.

## Working approach

Before implementing a backlog item, inspect its existing view/service/rules/functions and tests, then update the relevant emulator/security tests for policy changes. Keep client UI as a caller of trusted backend workflows for status/rewards. Never put secrets in `VITE_*`. Treat README road-map checkboxes and TODO completion notes as claims to verify against the current branch.
