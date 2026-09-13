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
- [ ] ESLint passes with no errors/warnings that we intend to keep
- [ ] Firebase Firestore rules tested in the Firebase Emulator
- [ ] Firebase Realtime Database rules tested in the Firebase Emulator
- [ ] Storage rules tested
- [ ] Critical Cloud Functions tested
- [ ] No secrets/API keys exposed in the frontend bundle
- [ ] Users cannot award themselves points or modify authoritative stats
- [ ] Users cannot modify protected item fields/statuses directly
- [ ] Users cannot manipulate other users' profiles/private data
- [ ] Chat participants cannot alter protected chat metadata or impersonate another sender
- [ ] Critical item state transitions are atomic
- [ ] Mobile UX is solid
- [ ] Loading/error/empty states are consistent
- [ ] Accessibility pass completed
- [ ] Security/privacy review completed before public launch

---

# PHASE 1 — SECURITY & BACKEND HARDENING

## 1. Fix `resolveItem` transaction architecture — P0

Current concern: the resolution flow performs writes and then calls additional transaction logic that performs reads. Firestore transactions require reads to happen before writes.

- [x] Inspect current `resolveItem` Cloud Function
- [x] Move every required read to the beginning of the transaction
- [x] Read item snapshot
- [x] Read reporter/user snapshot(s)
- [x] Read point-award/idempotency document
- [x] Validate all authorization/state conditions
- [x] Calculate the reward using a pure helper
- [x] Calculate streak changes
- [x] Calculate achievement unlocks
- [x] Perform all writes only after reads/validation/calculation
- [x] Update item status atomically
- [x] Update user stats atomically
- [x] Create idempotency/point-award record atomically
- [x] Return the authoritative item/stats/result
- [x] Test concurrent resolution attempts
- [x] Test repeated resolution calls
- [x] Test unauthorized resolution
- [x] Test invalid item states

## 2. Make item status changes server-authoritative — P0

Current concern: the client still has a direct Firestore status-update path.

- [ ] Design the allowed item state transitions
- [ ] Decide who can perform each transition
- [ ] Create/finish callable Cloud Function(s) for resolution/claim workflows
- [ ] Move status-changing logic into Cloud Functions
- [ ] Validate current status server-side
- [ ] Validate actor permissions server-side
- [ ] Update status and related gamification atomically
- [ ] Update `src/services/itemService.ts`
- [ ] Remove direct client status writes
- [ ] Search entire repository for `updateDoc(...status...)`
- [ ] Search for all other client-side status mutation paths
- [ ] Verify no UI can bypass the callable function

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

- [ ] Define which transitions are legal
- [ ] Reject impossible transitions server-side

## 3. Tighten Firestore item rules — P0

Current rules allow the reporter/admin to update broad item fields.

- [ ] Restrict editable fields using `diff().affectedKeys()`
- [ ] Prevent users from changing `reportedBy`
- [ ] Prevent users from changing immutable timestamps
- [ ] Prevent users from changing protected ownership/claim fields
- [ ] Prevent normal users from directly changing `status`
- [ ] Prevent users from modifying gamification fields
- [ ] Decide which item fields reporters can edit:
  - [ ] title
  - [ ] description
  - [ ] location
  - [ ] category
  - [ ] image metadata
- [ ] Move sensitive fields behind Cloud Functions
- [ ] Keep admin override narrowly scoped

Example direction:

```js
request.resource.data.diff(resource.data).affectedKeys()
  .hasOnly([
    'title',
    'description',
    'location',
    'category',
    'images',
    'updatedAt'
  ])
```

- [ ] Add emulator tests for every protected field

## 4. Lock down `/users` — P0

Current issue: signed-in users can broadly read user documents.

- [ ] Decide which user information is public
- [ ] Create `/publicProfiles/{uid}` if needed
- [ ] Store only safe public information there:
  - [ ] displayName
  - [ ] photoURL
  - [ ] reputation summary (if implemented)
- [ ] Keep private profile/account fields restricted
- [ ] Restrict user document reads to the owner/admin where appropriate
- [ ] Restrict user updates with affected-key validation
- [ ] Prevent normal users from changing:
  - [ ] `isAdmin`
  - [ ] points
  - [ ] streaks
  - [ ] achievements
  - [ ] moderation status
  - [ ] reputation
  - [ ] account flags
- [ ] Verify email/identity fields cannot be abused

## 5. Lock down `pointAwards` — P0

- [ ] Prevent clients from creating point-award documents
- [ ] Prevent clients from modifying point-award documents
- [ ] Prevent clients from deleting point-award documents
- [ ] Allow only backend/admin operations
- [ ] Allow users to read their own award history if desired

Target rule:

```js
match /pointAwards/{awardId} {
  allow read: if isSignedIn() && request.auth.uid == userId;
  allow create, update, delete: if false;
}
```

## 6. Finish server-authoritative gamification — P0

- [ ] Remove client-controlled point amounts
- [ ] Remove `_amount` from `StorageService.addPoints()`
- [ ] Ensure server decides all point values
- [ ] Validate `activityType` server-side
- [ ] Validate `itemId` server-side
- [ ] Validate the user's relationship to the item
- [ ] Ensure `claim`/`return` cannot be abused
- [ ] Ensure report rewards require a legitimate report
- [ ] Ensure duplicate activities are idempotent
- [ ] Keep deterministic award IDs
- [ ] Test duplicate requests
- [ ] Test concurrent requests
- [ ] Test replay attacks
- [ ] Test unauthorized item IDs
- [ ] Add daily/periodic reward limits if needed

## 7. Move Gemini API access off the client — P0

Current concern: `VITE_GEMINI_API_KEY` is exposed to the browser.

- [ ] Remove Gemini secret from frontend environment variables
- [ ] Create Cloud Function/API endpoint for Gemini requests
- [ ] Validate authenticated user
- [ ] Validate request payload
- [ ] Add server-side rate limiting
- [ ] Add request-size limits
- [ ] Add timeout handling
- [ ] Sanitize/validate AI inputs
- [ ] Return only the data the client actually needs
- [ ] Add abuse protection
- [ ] Rotate the currently exposed key
- [ ] Remove old key from local env/config where appropriate
- [ ] Check Git history for accidentally committed secrets
- [ ] Add `.env*` protection to `.gitignore`

## 8. Replace client-side Gemini rate limiting — P0

- [ ] Remove reliance on browser-local rate limiting as a security control
- [ ] Add server-side rate limits
- [ ] Rate-limit by authenticated UID
- [ ] Consider IP-level protection where available
- [ ] Add cooldowns for expensive operations
- [ ] Return useful rate-limit errors to UI
- [ ] Track AI usage for admins

## 9. Harden Realtime Database chat rules — P0

Current concern: participants have broad write access.

- [ ] Review entire RTDB structure
- [ ] Restrict chat access to actual participants
- [ ] Prevent non-participants from reading messages
- [ ] Prevent users from adding themselves to arbitrary chats
- [ ] Prevent users from removing other participants
- [ ] Prevent users from changing protected chat metadata
- [ ] Prevent users from changing another user's sender ID
- [ ] Ensure message sender matches authenticated UID
- [ ] Restrict editable message fields
- [ ] Protect `lastMessage`
- [ ] Protect participant lists
- [ ] Protect timestamps where appropriate
- [ ] Decide whether chat deletion should be replaced with archival
- [ ] Prevent users from deleting another participant's messages
- [ ] Test all rule cases in Emulator

## 10. Harden Firebase Storage rules — P0

- [ ] Review Storage Rules
- [ ] Require authentication for uploads
- [ ] Restrict upload path by UID/item ownership
- [ ] Restrict file size
- [ ] Restrict MIME types
- [ ] Reject suspicious file extensions/types
- [ ] Use randomized/non-guessable filenames
- [ ] Prevent users from overwriting arbitrary files
- [ ] Prevent users from deleting other users' images
- [ ] Validate images server-side where practical
- [ ] Check image metadata
- [ ] Consider image dimension limits
- [ ] Consider image compression/resizing
- [ ] Verify deleted items clean up associated files

## 11. Add security-rule tests — P0

Create a Firebase Emulator test suite.

### Firestore
- [ ] Unauthenticated reads/writes rejected
- [ ] User profile isolation
- [ ] Admin permissions
- [ ] Item ownership
- [ ] Item field restrictions
- [ ] Status restrictions
- [ ] Notification ownership
- [ ] Point-award protection
- [ ] Admin settings protection

### RTDB
- [ ] Chat participant read access
- [ ] Non-participant denied
- [ ] Sender identity
- [ ] Metadata protection
- [ ] Message editing/deletion
- [ ] Participant manipulation

### Storage
- [ ] Upload ownership
- [ ] File size
- [ ] File type
- [ ] Delete permissions

- [ ] Run security tests in CI

---

# PHASE 2 — DATA INTEGRITY & RELIABILITY

## 12. Audit every Firestore write

- [ ] Search repository for `setDoc`
- [ ] Search for `addDoc`
- [ ] Search for `updateDoc`
- [ ] Search for direct `deleteDoc`
- [ ] Classify every write:
  - [ ] Safe client write
  - [ ] Should be server-only
  - [ ] Needs validation
  - [ ] Needs transaction
- [ ] Remove duplicate write paths
- [ ] Ensure authoritative fields have one owner

## 13. Centralize item lifecycle

- [ ] Create a clear item state machine
- [ ] Document valid transitions
- [ ] Add server-side transition validation
- [ ] Prevent race conditions
- [ ] Handle simultaneous claims
- [ ] Handle simultaneous resolution
- [ ] Handle already-resolved items
- [ ] Handle deleted/archived items

## 14. Improve error handling

- [ ] Standardize Cloud Function errors
- [ ] Add user-friendly frontend error messages
- [ ] Do not expose sensitive backend errors
- [ ] Add retry handling for transient Firebase failures
- [ ] Avoid duplicate writes after retries
- [ ] Add error logging
- [ ] Add admin-visible error monitoring if desired

## 15. Add audit logs — P1

Create backend-only `/auditLogs/{logId}`.

Track:
- [ ] ITEM_CREATED
- [ ] ITEM_UPDATED
- [ ] ITEM_RESOLVED
- [ ] ITEM_CLAIMED
- [ ] ITEM_DELETED
- [ ] POINTS_AWARDED
- [ ] ACHIEVEMENT_UNLOCKED
- [ ] REPORT_SUBMITTED
- [ ] USER_SUSPENDED
- [ ] USER_BANNED
- [ ] ADMIN_ACTION

Each log should ideally include:
- [ ] actor UID
- [ ] target ID
- [ ] action
- [ ] timestamp
- [ ] relevant metadata
- [ ] source/function

- [ ] Restrict audit logs to admins/backend
- [ ] Prevent users from deleting audit logs

---

# PHASE 3 — CLAIM / RETURN WORKFLOW

## 16. Build a proper claim verification system — P1

Instead of simply changing a status:

- [ ] User clicks "Claim"
- [ ] Create claim request
- [ ] Notify item owner/reporter
- [ ] Owner reviews claim
- [ ] Owner accepts/rejects
- [ ] Add optional proof/questions
- [ ] Prevent duplicate active claims
- [ ] Prevent claiming your own lost item
- [ ] Prevent claiming already-returned items
- [ ] Record decision
- [ ] Update item atomically
- [ ] Award points only after valid completion

Potential claim fields:
- [ ] claimantId
- [ ] itemId
- [ ] message
- [ ] proof/question answers
- [ ] status
- [ ] createdAt
- [ ] reviewedAt
- [ ] reviewerId

## 17. Add return confirmation

- [ ] Reporter/owner confirms return
- [ ] Claimant confirms receipt
- [ ] Handle disagreement
- [ ] Add optional handoff notes
- [ ] Add optional meetup/location guidance
- [ ] Mark item returned only after valid confirmation
- [ ] Trigger gamification after confirmation
- [ ] Notify both users

---

# PHASE 4 — TRUST & SAFETY

## 18. Report system — P1

Allow reporting of:

- [ ] Item
- [ ] User
- [ ] Chat/message

Report reasons:
- [ ] Spam
- [ ] Fake listing
- [ ] Harassment
- [ ] Inappropriate content
- [ ] Scam/fraud
- [ ] Stolen item
- [ ] Personal information
- [ ] Other

- [ ] Create moderation queue
- [ ] Store report status
- [ ] Prevent report spam
- [ ] Add rate limits
- [ ] Allow admins to resolve reports
- [ ] Notify reporter when appropriate

## 19. Moderation dashboard — P1

Admin features:

- [ ] Open reports
- [ ] Report details
- [ ] User history
- [ ] Item history
- [ ] Chat/message evidence where permitted
- [ ] Resolve/dismiss report
- [ ] Suspend user
- [ ] Ban user
- [ ] Restore user
- [ ] Remove problematic item
- [ ] Add moderator notes
- [ ] Audit every moderator action

## 20. Suspicious activity detection — P2

Detect patterns such as:

- [ ] Many reports in a short period
- [ ] Many claims in a short period
- [ ] Repeated rejected claims
- [ ] Duplicate/similar item submissions
- [ ] Duplicate images
- [ ] Rapid point farming
- [ ] Repeated account creation
- [ ] Unusual chat activity
- [ ] Repeated reports against many users

- [ ] Create risk score
- [ ] Flag suspicious accounts
- [ ] Notify admins
- [ ] Avoid automatically banning based only on an AI score

---

# PHASE 5 — CORE USER EXPERIENCE

## 21. My Items dashboard — P1

Create a dedicated dashboard for the current user.

Tabs/sections:
- [ ] My Lost Items
- [ ] My Found Items
- [ ] Active
- [ ] Pending Claim
- [ ] Claimed
- [ ] Recovered/Returned
- [ ] Archived

Features:
- [ ] Edit item
- [ ] View details
- [ ] See claims
- [ ] See matches
- [ ] Delete/archive where allowed
- [ ] Search/filter
- [ ] Status badges

## 22. Better item details

- [ ] Image gallery
- [ ] Fullscreen image viewer
- [ ] Image zoom
- [ ] Clear status badge
- [ ] Reported date
- [ ] Location
- [ ] Category
- [ ] Reporter/owner info
- [ ] Claim button
- [ ] Match information
- [ ] Chat button
- [ ] Report button

## 23. AI match confidence + explainability — P1

Instead of only saying an item matches:

- [ ] Show match confidence
- [ ] Explain why it matched
- [ ] Show matching attributes:
  - [ ] category
  - [ ] location
  - [ ] description
  - [ ] visual similarity
  - [ ] time/date
- [ ] Clearly label AI-generated information
- [ ] Avoid presenting AI matches as certainty
- [ ] Allow users to dismiss incorrect matches

## 24. Automatic match notifications — P1

- [ ] Detect likely lost/found matches
- [ ] Create notification
- [ ] Include item preview
- [ ] Include confidence
- [ ] Deep-link to item
- [ ] Allow dismissing match
- [ ] Prevent notification spam
- [ ] Track useful/incorrect matches for future tuning

## 25. Notifications center

- [ ] Item match
- [ ] Claim request
- [ ] Claim accepted/rejected
- [ ] Item status changed
- [ ] Chat message
- [ ] Achievement unlocked
- [ ] Moderation notice
- [ ] System notice

- [ ] Mark read
- [ ] Mark all read
- [ ] Delete/archive
- [ ] Deep-link to source
- [ ] Unread count

## 26. Chat UX improvements

Existing status/read-receipt scaffolding should be finished.

- [ ] Optimistic message sending
- [ ] Sending indicator
- [ ] Sent state
- [ ] Delivered state
- [ ] Read state
- [ ] Unread count
- [ ] Last-message preview
- [ ] Typing indicator
- [ ] Image attachments
- [ ] Image preview before sending
- [ ] Retry failed messages
- [ ] Message timestamps
- [ ] Better chat empty state
- [ ] Conversation archive instead of destructive delete where appropriate

## 27. Search and browse improvements

- [ ] Search debounce
- [ ] Search by title
- [ ] Search description
- [ ] Search category
- [ ] Search location
- [ ] Filter Lost/Found
- [ ] Filter status
- [ ] Filter date
- [ ] Sort newest
- [ ] Sort closest
- [ ] Sort relevance
- [ ] Save search
- [ ] Recently viewed
- [ ] Favorites/bookmarks

## 28. Campus location picker

- [ ] Building selector
- [ ] Campus map
- [ ] Pin location
- [ ] Floor/room where appropriate
- [ ] Normalize building names
- [ ] Make locations searchable
- [ ] Show nearby items
- [ ] Avoid requiring overly precise private location data

---

# PHASE 6 — LOADING, EMPTY, ERROR & ACCESSIBILITY UX

## 29. Loading states — P1

Replace abrupt blank screens with:

- [ ] Skeleton cards
- [ ] Skeleton item details
- [ ] Skeleton chat list
- [ ] Skeleton leaderboard
- [ ] Skeleton admin dashboard
- [ ] Button loading states
- [ ] Upload progress
- [ ] AI analysis progress

## 30. Empty states — P1

Create useful empty states for:

- [ ] No items
- [ ] No search results
- [ ] No saved searches
- [ ] No notifications
- [ ] No chats
- [ ] No claims
- [ ] No achievements
- [ ] No leaderboard data
- [ ] No admin reports

Each should have:
- [ ] Clear explanation
- [ ] Helpful action
- [ ] Appropriate illustration/icon

## 31. Error states

- [ ] Network failure
- [ ] Firebase failure
- [ ] Permission denied
- [ ] AI unavailable
- [ ] Image upload failure
- [ ] Chat failure
- [ ] Claim failure
- [ ] Stale item
- [ ] Deleted item

- [ ] Use consistent error UI
- [ ] Add retry buttons where appropriate
- [ ] Avoid exposing technical stack traces

## 32. Accessibility — P1

- [ ] Keyboard navigation
- [ ] Visible focus states
- [ ] Correct heading hierarchy
- [ ] ARIA labels where necessary
- [ ] Accessible modal behavior
- [ ] Escape closes dialogs
- [ ] Screen-reader-friendly status messages
- [ ] Alt text for images
- [ ] Sufficient contrast
- [ ] Do not rely on color alone
- [ ] Form labels/errors
- [ ] Touch targets large enough
- [ ] Test with keyboard only
- [ ] Run Lighthouse accessibility audit

---

# PHASE 7 — MOBILE & RESPONSIVE POLISH

## 33. Mobile navigation

- [ ] Review bottom navigation
- [ ] Keep important actions reachable
- [ ] Avoid overcrowding
- [ ] Add responsive menu where necessary
- [ ] Preserve current tab state
- [ ] Test small phones
- [ ] Test tablets

## 34. Responsive views

Test:
- [ ] Home
- [ ] Report
- [ ] Browse
- [ ] Item details
- [ ] Map
- [ ] Chat
- [ ] Profile
- [ ] Leaderboard
- [ ] Admin

- [ ] Fix overflow
- [ ] Fix modal sizing
- [ ] Fix image sizing
- [ ] Fix long text
- [ ] Fix keyboard/input behavior

---

# PHASE 8 — GAMIFICATION POLISH

## 35. Achievement UX

- [ ] Achievement cards
- [ ] Locked/unlocked states
- [ ] Progress bars
- [ ] Unlock animation
- [ ] Toast when unlocked
- [ ] Achievement detail modal
- [ ] Show exact requirement
- [ ] Show earned date

## 36. Reputation system — P2

Possible metrics:

- [ ] Successful returns
- [ ] Helpful reports
- [ ] Successful claims
- [ ] Verified returns
- [ ] Community trust score

Possible levels:
- [ ] New Member
- [ ] Helper
- [ ] Trusted Helper
- [ ] Campus Hero

- [ ] Keep reputation server-authoritative
- [ ] Do not allow users to manually edit it

## 37. Anti-point-farming

- [ ] Daily report reward cap
- [ ] Duplicate report detection
- [ ] Require meaningful reports
- [ ] Reward completed returns more heavily
- [ ] Reward verified helpful behavior
- [ ] Detect suspicious activity
- [ ] Never trust client-provided point values

---

# PHASE 9 — ADMIN & ANALYTICS

## 38. Admin dashboard improvements — P1/P2

Add:

- [ ] Total lost items
- [ ] Total found items
- [ ] Open claims
- [ ] Returned items
- [ ] Return rate
- [ ] Average resolution time
- [ ] Active users
- [ ] Reports
- [ ] Moderation queue
- [ ] AI match success rate
- [ ] Points awarded
- [ ] Suspicious activity flags

## 39. Campus analytics — P2

- [ ] Most common lost-item categories
- [ ] Most common locations
- [ ] Hotspot map
- [ ] Peak reporting times
- [ ] Return rate by category
- [ ] Return rate by location
- [ ] Average time to recovery

- [ ] Use aggregated/anonymized data
- [ ] Avoid exposing individual user behavior

---

# PHASE 10 — PRIVACY & ACCOUNT MANAGEMENT

## 40. Privacy controls — P1

- [ ] Decide what profile data is public
- [ ] Profile visibility setting
- [ ] Hide email from other users
- [ ] Hide unnecessary personal information
- [ ] Control notification preferences
- [ ] Control AI matching preferences if appropriate

## 41. Account deletion — P1

- [ ] Add Delete Account UI
- [ ] Require re-authentication where needed
- [ ] Delete/anonymize user-owned data appropriately
- [ ] Handle authored items
- [ ] Handle chats
- [ ] Handle claims
- [ ] Handle notifications
- [ ] Handle Storage files
- [ ] Handle Firebase Auth account
- [ ] Preserve necessary audit records without retaining unnecessary PII

## 42. Data retention

- [ ] Decide how long resolved items remain
- [ ] Decide how long chats remain
- [ ] Decide how long notifications remain
- [ ] Decide how long reports remain
- [ ] Add archival/deletion jobs if needed

---

# PHASE 11 — PERFORMANCE

## 43. Code splitting / lazy loading — P1

Current build has a large App bundle.

- [ ] Measure current bundle
- [ ] Lazy-load `BrowseView`
- [ ] Lazy-load `ChatView`
- [ ] Lazy-load `AdminView`
- [ ] Lazy-load `MapView`
- [ ] Lazy-load `LeaderboardView`
- [ ] Lazy-load less-used routes/views
- [ ] Rebuild and compare bundle size
- [ ] Verify no UX regression

## 44. Image performance

- [ ] Compress uploaded images
- [ ] Generate thumbnails
- [ ] Lazy-load images
- [ ] Use appropriate image dimensions
- [ ] Avoid loading full-resolution images in cards
- [ ] Cache where appropriate

## 45. Firestore query performance

- [ ] Review all listeners
- [ ] Avoid unnecessary full-collection reads
- [ ] Add pagination/infinite scrolling
- [ ] Add appropriate indexes
- [ ] Limit result counts
- [ ] Unsubscribe cleanly
- [ ] Avoid duplicate subscriptions

---

# PHASE 12 — TESTING

## 46. Unit tests — P1

Test:

- [ ] Gamification calculations
- [ ] Streak logic
- [ ] Achievement logic
- [ ] Item status transitions
- [ ] Search sanitization
- [ ] Image validation
- [ ] Data normalization
- [ ] Utility functions

## 47. Integration tests

- [ ] Create item
- [ ] Edit item
- [ ] Claim item
- [ ] Resolve item
- [ ] Award points
- [ ] Unlock achievement
- [ ] Send chat message
- [ ] Read notification
- [ ] Upload image

## 48. End-to-end tests

Critical user journeys:

- [ ] Sign up/login
- [ ] Report lost item
- [ ] Report found item
- [ ] Find possible match
- [ ] Start chat
- [ ] Claim item
- [ ] Confirm return
- [ ] Receive points
- [ ] Unlock achievement
- [ ] Admin moderation flow

## 49. Regression testing

Before each major release:

- [ ] `npm run build`
- [ ] ESLint
- [ ] TypeScript
- [ ] Firebase Emulator tests
- [ ] Critical E2E flows
- [ ] Mobile check
- [ ] Accessibility check
- [ ] Security checklist

---

# PHASE 13 — CODE QUALITY / ARCHITECTURE

## 50. Remove obsolete client gamification code

- [ ] Remove old direct Firestore stats writes
- [ ] Remove duplicated point-calculation logic
- [ ] Keep UI helpers read/display-only
- [ ] Keep authoritative calculations server-side
- [ ] Remove `_amount` from `StorageService.addPoints`
- [ ] Search for old gamification APIs
- [ ] Delete dead code

## 51. Clean up `BrowseView`

- [ ] Keep `BrowseViewProps` minimal
- [ ] Remove unused `onItemClick`
- [ ] Fix reporter lookup typing
- [ ] Avoid unnecessary effect state updates
- [ ] Keep server-returned item as authoritative
- [ ] Prevent duplicate resolution emails
- [ ] Review all callbacks for stale state
- [ ] Review effects for dependency correctness

## 52. Clean up `App.tsx`

- [ ] Remove obsolete `onItemClick` prop
- [ ] Keep `refreshData` only where actually needed
- [ ] Review global state responsibilities
- [ ] Consider extracting app navigation/state logic
- [ ] Consider route-based code splitting
- [ ] Avoid unnecessary full-data refreshes

## 53. Service-layer cleanup

Review:

- [ ] `itemService.ts`
- [ ] `gamificationService.ts`
- [ ] `gamificationApi.ts`
- [ ] `StorageService.ts`
- [ ] `geminiService.ts`
- [ ] `chatService.ts`
- [ ] `firebase.ts`

For each:
- [ ] One clear responsibility
- [ ] No duplicated logic
- [ ] No client-controlled authoritative values
- [ ] Consistent error handling
- [ ] Consistent TypeScript types

---

# PHASE 14 — OBSERVABILITY & OPERATIONS

## 54. Logging

- [ ] Add structured Cloud Function logs
- [ ] Log important failures
- [ ] Log suspicious activity
- [ ] Avoid logging sensitive user data
- [ ] Add useful correlation/request IDs where practical

## 55. Monitoring

- [ ] Monitor Cloud Functions errors
- [ ] Monitor AI failures
- [ ] Monitor Firebase permission errors
- [ ] Monitor image upload failures
- [ ] Monitor unusual traffic
- [ ] Monitor notification failures

## 56. Backups / recovery

- [ ] Understand Firestore backup options
- [ ] Back up important production data
- [ ] Document recovery procedure
- [ ] Test restore process before relying on it

---

# PHASE 15 — PRODUCT DIFFERENTIATORS

## 57. Saved searches — P2

- [ ] Save search filters
- [ ] Name saved searches
- [ ] Notify when matching item appears
- [ ] Allow disabling/deleting saved searches

## 58. Recently viewed — P2

- [ ] Store recently viewed item IDs
- [ ] Show recent items
- [ ] Clear history
- [ ] Respect privacy settings

## 59. Smart campus notifications — P2

Examples:
- [ ] "A found item matching your lost report was posted."
- [ ] "Your claim was accepted."
- [ ] "Someone reported an item near your selected campus location."
- [ ] "Your item has been inactive for 7 days."

- [ ] Add notification preferences
- [ ] Prevent notification spam

## 60. Campus statistics — P2

Potential public dashboard:

- [ ] Items recovered
- [ ] Active reports
- [ ] Top categories
- [ ] Recovery rate
- [ ] Average recovery time
- [ ] Campus hotspots

---

# PHASE 16 — ONBOARDING & POLISH

## 61. First-time user onboarding — P2

- [ ] Explain Lost vs Found
- [ ] Explain how claims work
- [ ] Explain AI matching
- [ ] Explain points/achievements
- [ ] Explain safety/reporting
- [ ] Ask campus/location preferences if needed

## 62. Forms

Report form:
- [ ] Better validation
- [ ] Character counters
- [ ] Image preview
- [ ] Upload progress
- [ ] Clear errors
- [ ] Prevent accidental navigation loss
- [ ] Draft saving

Claim form:
- [ ] Clear instructions
- [ ] Proof/question prompts
- [ ] Confirmation step

## 63. Toasts and feedback

- [ ] Standardize toast styles
- [ ] Success
- [ ] Error
- [ ] Warning
- [ ] Info
- [ ] Achievement
- [ ] Match found
- [ ] Claim received

---

# PHASE 17 — FINAL SECURITY REVIEW

## 64. Threat-model CampusFind

Review:

- [ ] Authentication bypass
- [ ] Authorization bypass
- [ ] IDOR / insecure direct object access
- [ ] Privilege escalation
- [ ] Point manipulation
- [ ] Achievement manipulation
- [ ] Item status manipulation
- [ ] Chat impersonation
- [ ] Chat data leakage
- [ ] Profile data leakage
- [ ] Storage abuse
- [ ] Gemini API abuse
- [ ] Spam
- [ ] Claim fraud
- [ ] Account takeover considerations
- [ ] Rate-limit bypass
- [ ] Replay attacks
- [ ] Race conditions

## 65. Secret scan

- [ ] Search repository for API keys
- [ ] Search for Firebase private credentials
- [ ] Search for `AIza`
- [ ] Search for `VITE_*KEY`
- [ ] Search for tokens/secrets
- [ ] Check `.env` files
- [ ] Check Git history
- [ ] Rotate any exposed secrets

---

# PHASE 18 — RELEASE CHECKLIST

## 66. Pre-release

- [ ] Production Firebase project configured
- [ ] Production rules deployed
- [ ] Storage rules deployed
- [ ] Cloud Functions deployed
- [ ] Environment variables configured securely
- [ ] Gemini server endpoint working
- [ ] Rate limiting enabled
- [ ] Error monitoring enabled
- [ ] Admin account verified
- [ ] Backups/recovery understood

## 67. Final QA

- [ ] Fresh account test
- [ ] Existing account test
- [ ] Lost item test
- [ ] Found item test
- [ ] Claim test
- [ ] Return test
- [ ] Chat test
- [ ] AI match test
- [ ] Notification test
- [ ] Gamification test
- [ ] Admin moderation test
- [ ] Mobile test
- [ ] Accessibility test
- [ ] Security-rule test
- [ ] Offline/network failure test

## 68. Production smoke test

- [ ] Login
- [ ] Report
- [ ] Browse
- [ ] Search
- [ ] Item details
- [ ] Claim
- [ ] Chat
- [ ] Notification
- [ ] Return
- [ ] Points
- [ ] Achievement
- [ ] Admin

---

# RECOMMENDED IMPLEMENTATION ORDER

## Sprint 1 — Security blockers
- [x] Fix `resolveItem` transaction
- [ ] Make status changes server-authoritative
- [ ] Tighten item rules
- [ ] Lock down user profiles
- [ ] Lock down point awards
- [ ] Harden RTDB chat rules
- [ ] Harden Storage rules
- [ ] Move Gemini API key server-side
- [ ] Add server-side AI rate limiting

## Sprint 2 — Automated security testing
- [ ] Firebase Emulator setup
- [ ] Firestore rules tests
- [ ] RTDB rules tests
- [ ] Storage rules tests
- [ ] Gamification tests
- [ ] Resolution/claim race-condition tests

## Sprint 3 — Core product workflows
- [ ] My Items
- [ ] Claim verification
- [ ] Return confirmation
- [ ] Notifications
- [ ] AI match confidence
- [ ] Automatic match notifications

## Sprint 4 — UX polish
- [ ] Loading states
- [ ] Empty states
- [ ] Error states
- [ ] Chat read receipts
- [ ] Image gallery
- [ ] Mobile navigation
- [ ] Accessibility
- [ ] Search/filter improvements

## Sprint 5 — Trust & safety
- [ ] Reporting
- [ ] Moderation queue
- [ ] Suspensions/bans
- [ ] Audit logs
- [ ] Suspicious activity detection

## Sprint 6 — Performance & quality
- [ ] Lazy loading
- [ ] Image optimization
- [ ] Firestore query optimization
- [ ] Unit/integration/E2E tests
- [ ] Code cleanup
- [ ] Monitoring

## Sprint 7 — Differentiation
- [ ] Reputation
- [ ] Saved searches
- [ ] Smart notifications
- [ ] Campus analytics
- [ ] Campus statistics
- [ ] Advanced AI matching

---

# TOP 10 THINGS TO DO FIRST

1. [x] **Fix `resolveItem` transaction correctness**
2. [ ] **Move item status changes fully server-side**
3. [ ] **Tighten Firestore item/user/point-award rules**
4. [ ] **Lock down RTDB chat rules**
5. [ ] **Move Gemini API key/calls to Cloud Functions**
6. [ ] **Add server-side rate limiting**
7. [ ] **Build Firebase Emulator security tests**
8. [ ] **Implement proper claim + return verification**
9. [ ] **Build My Items + notifications**
10. [ ] **Add reporting/moderation + audit logs**

---

# Nice-to-have / Later

- [ ] Campus reputation levels
- [ ] Saved searches
- [ ] Recently viewed
- [ ] Campus hotspot map
- [ ] Public recovery statistics
- [ ] Advanced AI visual matching
- [ ] Push notifications
- [ ] Typing indicators
- [ ] Draft reports
- [ ] Image similarity detection
- [ ] Duplicate item detection
- [ ] PWA/offline support
- [ ] Campus-specific customization
- [ ] Multi-campus support