# CampusFind — Master TODO

> Goal: take CampusFind from a strong portfolio/working beta to a secure, polished, production-quality campus lost & found platform.
>
> Priority legend:
> - P0 = security/correctness blocker
> - P1 = important product/UX work
> - P2 = polish, trust, differentiation
> - P3 = optional/future enhancement

---

## 0. Definition of Done

- [x] Production build passes with no TypeScript errors
- [x] Critical item state transitions are atomic

# PHASE 1 — SECURITY & BACKEND HARDENING

## 1. Fix `resolveItem` transaction architecture — P0

- [x] Move all transaction reads before transaction writes
- [x] Keep reward calculation pure inside the transaction
- [x] Preserve idempotent point-award behavior
- [x] Add emulator coverage for repeated resolution calls
- [x] Add emulator coverage for concurrent resolution calls
- [x] Add emulator coverage for unauthorized resolution
- [x] Add emulator coverage for invalid resolution state
- [x] Add emulator coverage for already-resolved items
- [x] Add emulator coverage for admin resolution

## 2. Make item status changes server-authoritative — P0

Status changes are now routed through the trusted `resolveItem` callable. The client-side generic item update API explicitly excludes `status`, and Firestore rules reject direct client status writes. The repository audit found the UI status workflow using `resolveItem` rather than direct Firestore status writes.

- [x] Design the allowed item state transitions
- [x] Decide who can perform each transition
- [x] Create/finish callable Cloud Function(s) for resolution/claim workflows
- [x] Move status-changing logic into Cloud Functions
- [x] Validate current status server-side
- [x] Validate actor permissions server-side
- [x] Update status and related gamification atomically
- [x] Update `src/services/itemService.ts`
- [x] Remove direct client status writes from the dedicated status-update service
- [x] Search entire repository for `updateDoc(...status...)`
- [x] Search for all other client-side status mutation paths
- [x] Verify no UI can bypass the callable function
- [x] Block direct client status changes in Firestore rules
- [x] Add emulator coverage for legal transitions
- [x] Add emulator coverage for illegal transitions
- [x] Run full build + emulator test suite locally

Suggested state model to document:

### LOST
- `STILL_LOST`
- `MATCH_FOUND`
- `CLAIMED`
- `RECOVERED`

### FOUND
- `AVAILABLE`
- `PENDING_CLAIM`
- `RETURNED`
- `UNCLAIMED`

- [x] Define which transitions are legal
- [x] Reject impossible transitions server-side

---

# PHASE 2 — FIRESTORE RULES HARDENING

## 3. Lock down item updates — P0

- [x] Use `diff().affectedKeys()` for item updates
- [x] Prevent users from changing `reportedBy`
- [x] Prevent users from changing ownership fields
- [x] Prevent users from changing moderation fields
- [x] Prevent users from changing server-managed timestamps
- [x] Prevent users from changing status directly
- [x] Restrict allowed editable fields
- [x] Add emulator tests for rule bypass attempts

## 4. Lock down user stats — P0

- [x] Prevent normal users from editing points
- [x] Prevent normal users from editing counters
- [x] Prevent normal users from editing achievements
- [x] Prevent normal users from editing streaks
- [x] Add explicit tests for every protected field

## 5. Harden point awards — P0

- [x] Prevent client-created point awards
- [x] Prevent client modification of point awards
- [x] Prevent client deletion of point awards
- [x] Test award tampering through emulator

# PHASE 3 — REALTIME DATABASE CHAT SECURITY

## 6. Redesign RTDB chat rules — P0

- [x] Verify conversation membership
- [x] Verify sender identity
- [x] Prevent message impersonation
- [x] Prevent editing immutable metadata
- [x] Prevent users from writing to arbitrary conversations
- [x] Prevent reading conversations without membership
- [x] Restrict participant list edits
- [x] Restrict message deletion
- [x] Add emulator tests

Phase 3 chat security is verified with 22/22 passing Realtime Database emulator tests. Coverage includes conversation membership, sender identity, impersonation protection, immutable message metadata, participant membership changes, unauthorized conversation access, arbitrary-field rejection, and message deletion protection.

# PHASE 4 — GEMINI / AI SECURITY

## 7. Move Gemini calls server-side — P0

Phase 4 is complete and verified. Gemini credentials are no longer exposed to the client, AI requests run through Firebase callable Cloud Functions, and server-side validation/rate limiting protect the Gemini integration. The frontend no longer contains the Gemini SDK or import-map entry.

- [x] Remove Gemini API key from client bundle
- [x] Move Gemini calls to Cloud Functions
- [x] Validate prompt inputs server-side
- [x] Add rate limiting
- [x] Add abuse protection
- [x] Add cost controls
- [x] Add logging
- [x] Add failure handling

Verification completed September 14, 2026:
- Frontend production build passes with no TypeScript errors
- `VITE_GEMINI_API_KEY` is absent from the repository
- `@google/genai` is absent from the frontend and dependency/import-map configuration
- `GEMINI_API_KEY` is configured as a Firebase Functions secret
- AI input size, candidate count, candidate fields, image MIME type, and image payload limits are validated server-side
- Gemini prompt inputs are treated as untrusted and prompt-injection instructions are explicitly ignored
- AI responses are validated before being returned to the client
- Server-side Firestore rate limiting is enforced per authenticated user
- Gemini requests use the stable production model `gemini-3.8-flash`
- Functions lint passes
- Functions TypeScript build passes
- Firestore rules regression suite passes 15/15 tests
- `resolveItem` emulator suite passes 8/8 tests

Note: Vite reports a non-blocking large-chunk warning for the main application bundle (~638 kB). Bundle optimization is tracked separately under Phase 7 — Performance.

---

# PHASE 5 — DATA ACCESS / PRIVACY

## 8. Restrict `/users` reads — P1

Phase 5 is complete. Private user documents are restricted to the owning user and admins, while leaderboard/public-facing statistics are served from a dedicated `publicProfiles` projection. Public profile writes are constrained so users can only mirror their own authoritative private stats; gamification updates write the private stats and public projection together server-side.

- [x] Create public profile projection
- [x] Limit sensitive profile fields
- [x] Replace broad user reads
- [x] Audit all user queries
- [x] Backfill public profiles for existing users on authenticated startup
- [x] Create public profiles for new signups
- [x] Keep profile display name synchronized
- [x] Keep profile photo synchronized
- [x] Prevent public-profile stat tampering
- [x] Verify Firestore privacy regression coverage

Verification completed September 15, 2026:
- Private `/users/{uid}` reads are limited to the same user or an admin
- Leaderboard/rank queries use `publicProfiles` instead of the private `users` collection
- Existing users with a private profile are automatically synchronized to `publicProfiles` during authenticated startup
- New signups create both the private user document and public profile
- Profile display-name updates synchronize private and public profile documents
- Profile photo updates now synchronize private and public profile documents
- Public profile writes cannot forge points, report/return/claim counters, or change another user's profile
- Firestore rules regression suite passes 15/15 tests
- `resolveItem` emulator suite passes 8/8 tests
- Frontend production build passes

---

# PHASE 6 — STORAGE SECURITY

## 9. Harden image uploads — P1

- [ ] Validate file type server-side
- [ ] Validate file size server-side
- [ ] Restrict upload paths to authenticated users
- [ ] Prevent arbitrary storage writes
- [ ] Verify ownership of uploaded files
- [ ] Consider image processing pipeline

# PHASE 7 — PERFORMANCE

## 10. Reduce bundle size — P1

- [ ] Analyze bundle composition
- [ ] Lazy-load large views
- [ ] Lazy-load admin dashboard
- [ ] Lazy-load maps
- [ ] Lazy-load AI functionality
- [ ] Reduce duplicate dependencies

# PHASE 8 — GAMIFICATION SECURITY

## 11. Prevent point farming — P1

- [ ] Add daily report limits
- [ ] Add duplicate-report detection
- [ ] Add minimum report quality checks
- [ ] Prevent fake returns
- [ ] Add moderation hooks
- [ ] Add suspicious activity detection

# PHASE 9 — TRUST & SAFETY

## 12. Add reporting/moderation — P1

- [ ] User reporting
- [ ] Item reporting
- [ ] Content moderation
- [ ] Admin review queue
- [ ] Ban/suspension system
- [ ] Audit logs

# PHASE 10 — ITEM UX

## 13. Improve item lifecycle UX — P1

- [ ] My Items dashboard
- [ ] Clear item status timeline
- [ ] Claim verification flow
- [ ] Return confirmation
- [ ] AI match confidence
- [ ] Match notifications
- [ ] Loading states
- [ ] Empty states
- [ ] Error states

# PHASE 11 — CHAT UX

## 14. Improve messaging — P1

- [ ] Read receipts
- [ ] Typing indicators
- [ ] Message timestamps
- [ ] Image gallery improvements
- [ ] Message deletion UX
- [ ] Conversation list improvements

# PHASE 12 — CAMPUS UX

## 15. Campus-aware experience — P1

- [ ] Campus picker
- [ ] Campus-specific item feeds
- [ ] Building directory
- [ ] Better location search
- [ ] Map improvements

# PHASE 13 — SEARCH & DISCOVERY

## 16. Search improvements — P2

- [ ] Saved searches
- [ ] Advanced filters
- [ ] Search suggestions
- [ ] Better AI matching
- [ ] Similar items
- [ ] Personalized results

# PHASE 14 — NOTIFICATIONS

## 17. Notification system — P1

- [ ] Match notifications
- [ ] Claim notifications
- [ ] Return notifications
- [ ] Chat notifications
- [ ] Notification preferences
- [ ] Push notifications

# PHASE 15 — AI MATCHING

## 18. Smart matching — P2

- [ ] AI match scoring
- [ ] Explain why items match
- [ ] Match confidence display
- [ ] Automatic match notifications
- [ ] Human confirmation step

# PHASE 16 — ADMIN

## 19. Admin dashboard — P2

- [ ] Moderation queue
- [ ] User management
- [ ] Item management
- [ ] Analytics
- [ ] Reports
- [ ] Suspicious activity dashboard

# PHASE 17 — REPUTATION

## 20. Reputation system — P2

- [ ] Reputation score
- [ ] Verified returns
- [ ] Trust badges
- [ ] Contributor levels
- [ ] Community recognition

# PHASE 18 — POLISH

## 21. Final polish — P2/P3

- [ ] Mobile navigation
- [ ] Accessibility audit
- [ ] Keyboard navigation
- [ ] Error boundaries
- [ ] Better loading UX
- [ ] Better empty states
- [ ] Better toast system
- [ ] Responsive polish
- [ ] Visual consistency
- [ ] Documentation cleanup
