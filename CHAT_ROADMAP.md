# CampusFind Chat — Development Log & Roadmap

> Living project notes for the chat system. Update this file as features are implemented, tested, or reprioritized.

## Current implementation

### Architecture and Firebase Spark compatibility
- [x] Reworked chat creation, conversation subscriptions, message subscriptions, sending, read receipts, leaving, and deletion to use **Cloud Firestore** instead of depending on chat Cloud Functions.
- [x] Chat creation reads the item owner from the item record, prevents users from starting a conversation with themselves, and reuses an existing conversation for the same item/participants where applicable.
- [x] Conversation lists query chats by participant membership; messages live in each chat's `messages` subcollection.
- [x] Removed the chat view's dependency on the `joinItemChat` and `notifyChatMessage` callable functions.
- [x] Kept the chat workflow usable on the Firebase **Spark/free plan** without deploying Cloud Functions.
- [x] Added Firestore rules for participant-only chat and message access, validated message notifications, per-user read timestamps, and per-user chat settings.
- [x] Preserved existing Realtime Database chat data; the migration did not require deleting old RTDB chat records. The active chat implementation described here uses Firestore.

### Conversation and message UX
- [x] Fixed item-linked chat auto-selection so a Firestore snapshot update does not repeatedly switch the selected conversation.
- [x] Fixed chat-list ordering around pending server timestamps by normalizing snapshots with estimated server timestamps.
- [x] Added per-user read timestamps and an unread blue dot beside conversations with a newer incoming message.
- [x] Marked a conversation as read when its messages are loaded/opened.
- [x] Added pinned, muted, and archived states stored per user, so one participant's settings do not change the other participant's preferences.
- [x] Sorted pinned conversations above unpinned conversations.
- [x] Added an Active / Archived chat view and a three-dot conversation menu for Pin/Unpin, Mute/Unmute, and Archive/Unarchive.
- [x] Added menu dismissal that supports multiple conversation rows without intercepting the selected menu action.
- [x] Added visual unread conversation highlighting and status indicators for pinned/muted chats.

### Notifications
- [x] Added in-app notifications for incoming chat messages using a separate notification write after the message is committed. A notification-write failure should not undo or block a successfully sent message.
- [x] Added notification navigation to the related conversation.
- [x] Added a notification dropdown and a fuller notification center.
- [x] Added All / Unread / Read filters, selection, select-all for the currently visible filter, mark-selected-read, delete-selected, Mark all read, and Delete all with confirmation.
- [x] Added a soft two-note notification sound, enabled by default for new users, with a user preference to turn it off.
- [x] Avoided playing the sound for old notifications on initial app load; browser autoplay restrictions mean sound may require prior user interaction.
- [x] Added unread indicators to the Messages navigation item and unread conversation styling.

### Important behavior and limitations
- In-app message notifications depend on the recipient having the app open and an active Firestore listener. **Background/browser push notifications are not implemented.**
- Reliable push delivery while the app is closed generally needs a push-delivery setup and server-side sending. Do not add a Cloud Functions dependency without first deciding how to support the Firebase Spark plan.
- The Messages navigation indicator currently uses unread chat-message notifications; keep it consistent with per-conversation read state so it clears when a user reads the relevant chat.
- Pin, mute, and archive persistence depends on the latest Firestore rules being deployed. After pulling a rules change, deploy with:
  ```powershell
  firebase deploy --only firestore:rules
  ```
- The chat implementation was developed on branch `fix/free-tier-firestore-chat`, with draft PR [#1](https://github.com/Riyan096/CampusFind/pull/1). The branch/PR must be merged and the frontend deployed before production hosting receives these changes.
- Do not claim a build or test passed unless it has actually been run and verified.

---

## Planned chat features

The following are **not implemented yet**. Build and test them incrementally, keeping the Spark/free-tier requirement in mind.

### 1. Photo attachments
- [ ] Add an attachment button and image picker to the message composer.
- [ ] Support image preview before sending, cancel/remove, upload progress, retry, and clear failure states.
- [ ] Render image messages inline with a tap/click-to-expand viewer.
- [x] Define a typed image attachment on chat messages (`type`, Cloudinary `publicId`, format, byte size, width, and height); sender and timestamp are inherited from the message document.
- [x] Validate attachment metadata in Firestore rules, including chat-scoped Cloudinary public IDs, supported formats, file-size limits, and dimension limits.
- [ ] Enforce allowed image MIME types and conservative file-size limits; validate actual file content where the chosen storage service permits it.
- [x] Choose Cloudinary authenticated delivery behind a Cloudflare Worker for the Firebase Spark-compatible media path; Cloudinary credentials remain server-side.
- [x] Restrict Worker upload and media retrieval to authenticated chat participants; media retrieval also verifies the exact message document contains the requested attachment reference.
- [ ] Define retention and deletion behavior when a message or conversation is deleted.

### 2. Emoji reactions
- [x] Add a compact reaction picker to each message.
- [x] Add six quick reactions: 👍, ❤️, 😂, 😮, 😢, and 🙏.
- [x] Add a searchable full emoji picker behind a `+` button, alongside the quick-reaction row.
- [x] Let each user customize up to eight quick reactions, remove favorites, and reset the defaults.
- [x] Save quick-reaction preferences per signed-in user in local browser storage; preferences remain separate between accounts on the same device.
- [x] Validate selected custom reactions as short emoji strings in the service and bound their stored length in Firestore rules.
- [x] Allow one user to add, change, or remove their reaction to a message.
- [x] Show reaction counts and highlight the current user's selected reaction.
- [x] Enforce chat participation and per-user-only reaction changes in Firestore rules.
- [x] Update only the current user's nested reaction field instead of rewriting the entire message document.
- [ ] Run `npm install` to refresh the lockfile, run the local build, and test emoji selection/customization with two accounts. This feature does not require a Firestore rules deployment because quick-reaction preferences are stored locally.

### 3. Video attachments
- [ ] Add video selection and preview to the composer.
- [ ] Show upload progress, duration, file size, retry, and upload failure states.
- [ ] Render a video player with controls and a poster/thumbnail where available.
- [ ] Set strict duration, file-size, and MIME-type limits to control bandwidth and storage costs.
- [ ] Reuse the media-storage authorization and metadata model established for photos.
- [ ] Verify free-tier feasibility and quotas before choosing a provider; video should follow photo attachments, not precede them.

### 4. Stickers
- [x] Add a sticker button and an original curated starter pack (12 stickers).
- [x] Create a sticker picker with All / Reactions / Campus / Everyday categories and a recently-used section.
- [x] Store a stable sticker ID in the message rather than embedding image data.
- [x] Render stickers as distinct message content with accessible labels.
- [x] Keep the starter pack local and curated; custom/user-uploaded sticker packs remain out of scope for the MVP.
- [ ] Run the local build and deploy the updated Firestore rules before testing with two accounts.

### 5. GIF search
- [x] Add a GIF button and searchable GIF picker with trending results when the search field is empty.
- [x] Select GIPHY after reviewing its current API requirements: client-side search, required Powered by GIPHY attribution, and beta-key rate limit of 100 API calls per hour.
- [x] Debounce text search and paginate results in batches of 24.
- [x] Show a selected-GIF preview before sending; allow removal before send.
- [x] Store only the stable GIPHY GIF ID and provider metadata in Firestore; resolve media URLs directly from GIPHY on the client and never cache/store media URLs or GIF binaries.
- [x] Request PG-rated results and validate the provider and stable GIF ID in Firestore rules.
- [ ] Add an in-app report action for inappropriate GIF content when the broader moderation/report workflow is implemented.
- [ ] Add a local GIPHY API key to `.env` and test search, pagination, sending, and receiving with two accounts.

### 6. Report user
- [x] Add a Report user action to each conversation's action menu.
- [x] Provide structured report reasons (harassment, threats, spam, impersonation, inappropriate content, scam, or other) and optional details.
- [x] Submit reports privately without notifying or exposing the report to the reported user.
- [x] Store reporter, reported user, conversation and item references, reason, details, status, and server timestamps in `/userReports`.
- [x] Restrict report reads to the submitting user and admins; only admins can review/update reports, and reports cannot be deleted by clients.
- [x] Add an admin Reports tab with New, Reviewing, Actioned, and Dismissed statuses plus internal review notes.
- [x] Do not automatically suspend users from an unreviewed report.
- [ ] Run the local build and Firestore emulator tests, deploy updated rules, and test submission/review with two accounts.

### 7. Block user
- [x] Add Block / Unblock user actions in the active chat with a confirmation step.
- [x] Persist each block privately under the blocking user's `/users/{uid}/blockedUsers/{blockedUid}` subcollection.
- [x] Enforce blocks in Firestore rules for new chats and message creation in either direction; UI checks provide clearer feedback but are not the security boundary.
- [x] Preserve existing conversation history after a block while disabling the blocker's composer and preventing either side from sending new messages.
- [x] Check blocks before creating a new item chat so a user cannot bypass a block by opening another item conversation.
- [x] Add a Blocked Users section to the profile page so users can review public profile names/photos and unblock accounts outside an active chat.
- [x] Suppress new chat-message notifications when either participant has blocked the other; existing history remains visible.
- [ ] Decide how blocking interacts with reports and admin moderation.

---

## Suggested implementation order

1. **Data model and security design:** define message types, attachment metadata, reactions, blocks, and reports; update Firestore rules and tests before exposing controls.
2. **Photo attachments:** first media feature; validate the storage provider and Spark compatibility before coding the upload flow.
3. **Emoji reactions:** self-contained message interaction with relatively small media/storage requirements.
4. **Stickers:** implemented as a local curated pack; verify with a local build and two accounts.
5. **GIF search:** implemented with GIPHY client-side search, PG-rated results, attribution, debouncing, pagination, preview, and Firestore validation; local API-key setup and two-account testing remain.
6. **Video attachments:** optional and deferred because of larger storage and bandwidth costs.
7. **Report and block:** chat-level blocking, blocked-account management, private user reports, and admin review are implemented on `feature/block-users`; complete local verification and rules deployment before merge.

### 8. Message replies
- [x] Add a Reply action to each message.
- [x] Store a compact quoted snapshot (message ID, sender, preview text, and content type) on the reply.
- [x] Support replies to text, photos, GIFs, and stickers.
- [x] Let users cancel a reply before sending and clear reply context after a successful send.
- [x] Make quoted previews jump to and briefly highlight the original message.
- [x] Validate that reply references point to a real message in the same conversation and that preview fields match the original message.
- [ ] Run the local build and Firestore emulator tests, deploy the updated rules, and test replies with two accounts.

## Definition of done for each feature

- [ ] Works on desktop and mobile layouts.
- [ ] Has loading, empty, success, retry, and failure states where relevant.
- [ ] Enforces authorization in Firestore rules (not only in React).
- [ ] Includes validation for malformed, oversized, or unauthorized data.
- [ ] Does not require Firebase Blaze / Cloud Functions unless the project owner explicitly approves changing the free-tier constraint.
- [ ] Includes appropriate emulator/security tests.
- [ ] Does not break existing chat creation, sending, unread state, notifications, or pin/mute/archive behavior.
- [ ] Build and relevant tests are run locally and their actual results are recorded here.

## Development notes

- Active working branch for blocking: `feature/block-users` (based on `feature/chat-photo-media-worker`).
- Local verification commands:
  ```powershell
  git pull origin feature/block-users
  npm run build
  npm run dev
  ```
- Deploy Firestore rules only when rules have changed:
  ```powershell
  firebase deploy --only firestore:rules
  ```


## Blocked users management
- Added a dedicated Blocked Users navigation page with a live private block-list subscription, public profile display details, empty/loading states, and confirmation before unblocking.
- Removed the duplicate block-list panel from Profile; blocking preferences now have their own destination.
- Uses existing Firestore `/users/{uid}/blockedUsers` records and existing `unblockUser` service. No new database schema or Firebase Functions required.
- Local build and browser testing are still required before merge.


## User reporting workflow
- Added a private report form to the conversation action menu and a protected `/userReports` collection.
- Reports are scoped to an existing conversation shared by reporter and reported user; self-reports and arbitrary user-targeted reports are rejected by rules.
- Added admin-only review controls for status and internal notes. Reporting does not automatically block, suspend, or notify the reported account.
- Local build, emulator tests, Firestore rules deployment, and two-account browser testing remain required.
