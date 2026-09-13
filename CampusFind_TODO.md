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

- [ ] Production build passes with no TypeScript errors
- [ ] Critical item state transitions are atomic

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

Status changes are now routed through the trusted `resolveItem` callable. The client-side generic item update API explicitly excludes `status`, and Firestore rules reject direct client status changes. The repository audit found the UI status workflow using `resolveItem` rather than direct Firestore status writes.

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
- [ ] Add explicit tests for every protected field

## 5. Harden point awards — P0

- [x] Prevent client-created point awards
- [x] Prevent client modification of point awards
- [x] Prevent client deletion of point awards
- [ ] Test award tampering through emulator

# PHASE 3 — REALTIME DATABASE CHAT SECURITY

## 6. Redesign RTDB chat rules — P0

- [ ] Verify conversation membership
- [ ] Verify sender identity
- [ ] Prevent message impersonation
- [ ] Prevent editing immutable metadata
- [ ] Prevent users from writing to arbitrary conversations
- [ ] Prevent reading conversations without membership
- [ ] Restrict participant list edits
- [ ] Restrict message deletion
- [ ] Add emulator tests

# PHASE 4 — GEMINI / AI SECURITY

## 7. Move Gemini calls server-side — P0

- [ ] Remove Gemini API key from client bundle
- [ ] Move Gemini calls to Cloud Functions
- [ ] Validate prompt inputs server-side
- [ ] Add rate limiting
- [ ] Add abuse protection
- [ ] Add cost controls
- [ ] Add logging
- [ ] Add failure handling

# PHASE 5 — DATA ACCESS / PRIVACY

## 8. Restrict `/users` reads — P1

- [ ] Create public profile projection
- [ ] Limit sensitive profile fields
- [ ] Replace broad user reads
- [ ] Audit all user queries

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
