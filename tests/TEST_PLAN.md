# Test Plan - Cranial Trading

## Test Suites

| Suite | File | Tests | Coverage |
|-------|------|-------|----------|
| Match System | `matches.test.ts` | 8 | Match persistence, CRUD, security |
| Collection System | `collection.test.ts` | 10 | Card CRUD, public sync, status transitions |
| Deck System | `decks.test.ts` | 11 | Deck CRUD, allocations, wishlist, formats |
| Messages System | `messages.test.ts` | 11 | Conversations, messaging, cross-user chat |

**Total: 40 tests**

---

# Match System Tests

## Overview

This document describes the automated integration tests for the Cranial Trading match system. These tests verify critical functionality that ensures users can find trading partners and manage their matches correctly.

## Test Environment

- **Framework:** Vitest
- **Type:** Integration tests (real Firebase, real authentication)
- **Test Users:** Two pre-configured test accounts (credentials in `.env.local`)
- **Run Command:** `npm run test:integration`

## Test Coverage

### 1. Bug #2 Fix: Discarded Matches Persistence

**Problem Solved:** Previously, discarded matches were stored in `localStorage`, which meant they would reappear after clearing browser data or logging in from another device.

**Solution:** Discarded matches now persist in Firestore under `users/{userId}/matches_eliminados`.

| Test | Description | Validates |
|------|-------------|-----------|
| `should persist discarded matches in Firestore matches_eliminados` | Creates a match, discards it, verifies it appears in `matches_eliminados` with status `'eliminado'` | Data correctly saved to Firestore |
| `should persist discarded matches across sessions (re-login)` | Discards a match, logs out, logs back in, verifies discarded match still exists | Persistence across sessions |
| `should allow filtering new matches by discarded otherUserIds` | Discards a user, creates new match with same user, verifies filtering works | Filtering logic for UI |

### 2. Match CRUD Operations

**Purpose:** Verify basic match creation and retrieval works correctly.

| Test | Description | Validates |
|------|-------------|-----------|
| `should create a match in matches_nuevos` | Creates a match with full data (cards, compatibility, type), retrieves and verifies all fields | Match creation, data integrity |
| `should handle multiple matches correctly` | Creates 3 matches with different users, verifies all are retrievable | Handling multiple documents |

### 3. Security Rules Verification

**Purpose:** Ensure Firestore security rules properly isolate user data.

| Test | Description | Validates |
|------|-------------|-----------|
| `should only allow reading own matches` | User A creates a match, User B tries to read their own matches, confirms they don't see User A's data | Data isolation between users |

### 4. Smoke Tests

**Purpose:** Basic connectivity and authentication verification.

| Test | Description | Validates |
|------|-------------|-----------|
| `should successfully authenticate User A` | Logs in as User A, verifies email matches | Firebase Auth works |
| `should successfully authenticate User B` | Logs in as User B, verifies email matches | Firebase Auth works |

## Data Flow Tested

```
┌─────────────────────────────────────────────────────────────────┐
│                        Match Lifecycle                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. CREATE                    2. VIEW                           │
│  ┌──────────────┐            ┌──────────────┐                  │
│  │matches_nuevos│ ─────────► │   Dashboard  │                  │
│  │  (Firestore) │            │     (UI)     │                  │
│  └──────────────┘            └──────────────┘                  │
│         │                           │                           │
│         │                           │                           │
│         ▼                           ▼                           │
│  3. SAVE                      4. DISCARD                        │
│  ┌────────────────┐          ┌──────────────────┐              │
│  │matches_guardados│          │matches_eliminados│              │
│  │   (Firestore)  │          │    (Firestore)   │              │
│  └────────────────┘          └──────────────────┘              │
│                                      │                          │
│                                      ▼                          │
│                              5. FILTER FUTURE                   │
│                              ┌──────────────────┐              │
│                              │ otherUserId used │              │
│                              │ to filter nuevos │              │
│                              └──────────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Firestore Collections Tested

| Collection | Path | Purpose |
|------------|------|---------|
| `matches_nuevos` | `users/{userId}/matches_nuevos` | New, unseen matches |
| `matches_guardados` | `users/{userId}/matches_guardados` | Saved/favorited matches |
| `matches_eliminados` | `users/{userId}/matches_eliminados` | Discarded matches (for filtering) |

## Test Helpers

Located in `tests/integration/testHelpers.ts`:

| Function | Purpose |
|----------|---------|
| `initFirebase()` | Initialize Firebase for tests |
| `loginAs(userKey)` | Authenticate as test user A or B |
| `logout()` | Sign out current user |
| `createMatch(userId, match)` | Create match in `matches_nuevos` |
| `getNewMatches(userId)` | Retrieve all new matches |
| `getDiscardedMatches(userId)` | Retrieve all discarded matches |
| `discardMatch(userId, match)` | Add match to `matches_eliminados` |
| `clearAllMatches(userId)` | Delete all matches (cleanup) |
| `cleanupTestUser(userId)` | Full cleanup including test cards |

## Not Covered (Requires Cloud Function)

The following functionality requires the `notifyMatchUser` Cloud Function to be deployed:

| Feature | Reason |
|---------|--------|
| Cross-user notifications | Security rules prevent writing to another user's collection |
| Bidirectional match creation | Requires admin privileges to notify both users |

**To test cross-user notifications:**
1. Deploy Cloud Function: `firebase deploy --only functions`
2. Test manually in the app or add Cloud Function integration tests

## Running Tests

```bash
# Run all integration tests
npm run test:integration

# Run tests in watch mode
npm run test

# Run with UI
npm run test:ui
```

## Environment Setup

Required in `.env.local`:
```
# Firebase config (already present)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PROJECT_ID=...
# ... other Firebase vars

# Test user credentials
TEST_USER_A_EMAIL=<email>
TEST_USER_A_PASSWORD=<password>
TEST_USER_A_USERNAME=<username>
TEST_USER_B_EMAIL=<email>
TEST_USER_B_PASSWORD=<password>
TEST_USER_B_USERNAME=<username>
```

## Known Warnings

**BloomFilter Error:** You may see `BloomFilterError: Invalid hash count: 0` in stderr. This is a harmless Firebase SDK warning that occurs when collections are emptied during cleanup. It does not affect test results.

---

# Collection System Tests

## Overview

Tests the card collection functionality which is the core of the application. Users must be able to reliably add, edit, and delete cards, and those cards must correctly sync to public collections for the matching algorithm to work.

## Test Coverage

### 1. Card CRUD Operations

| Test | Description | Validates |
|------|-------------|-----------|
| `should add a card to collection` | Creates a card with full data, retrieves and verifies all fields | Card creation, data integrity |
| `should update a card` | Creates card, updates quantity/condition/price, verifies changes | Update operations |
| `should delete a card` | Creates card, deletes it, verifies it no longer exists | Delete operations |
| `should handle multiple cards` | Creates 5 cards, verifies all retrievable | Handling multiple documents |

### 2. Public Sync - Trade/Sale Cards

**Purpose:** Cards marked as `trade` or `sale` must appear in `public_cards` for the matching algorithm.

| Test | Description | Validates |
|------|-------------|-----------|
| `should sync trade card to public_cards` | Creates trade card, syncs, verifies in public_cards | Trade cards visible to matching |
| `should sync sale card to public_cards` | Creates sale card, syncs, verifies in public_cards | Sale cards visible to matching |
| `should NOT sync collection card to public_cards` | Creates collection card, verifies NOT in public_cards | Private cards stay private |

### 3. Public Sync - Wishlist Cards

**Purpose:** Cards marked as `wishlist` must appear in `public_preferences` so other users can find potential trades.

| Test | Description | Validates |
|------|-------------|-----------|
| `should sync wishlist card to public_preferences` | Creates wishlist card, syncs, verifies in public_preferences | Wishlist visible for matching |

### 4. Card Status Transitions

**Purpose:** When a card's status changes, public collections must update accordingly.

| Test | Description | Validates |
|------|-------------|-----------|
| `should update public_cards when status changes` | Card starts as collection, changes to trade, verifies now in public_cards | Status change triggers sync |

### 5. Smoke Tests

| Test | Description | Validates |
|------|-------------|-----------|
| `should have Firestore access` | Reads cards collection | Basic connectivity |

## Data Flow Tested

```
┌─────────────────────────────────────────────────────────────────┐
│                     Card Lifecycle                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  USER'S PRIVATE COLLECTION                                      │
│  ┌──────────────────────────────────────────────────────┐      │
│  │          /users/{userId}/cards/{cardId}              │      │
│  │                                                      │      │
│  │  status: 'collection' | 'sale' | 'trade' | 'wishlist'│      │
│  └──────────────────────────────────────────────────────┘      │
│              │                           │                      │
│              │ status='trade'|'sale'     │ status='wishlist'   │
│              ▼                           ▼                      │
│  ┌─────────────────────┐    ┌─────────────────────────┐        │
│  │   /public_cards     │    │  /public_preferences    │        │
│  │                     │    │                         │        │
│  │ Cards other users   │    │ Cards user is looking   │        │
│  │ can potentially     │    │ for (wishlist items)    │        │
│  │ trade/buy           │    │                         │        │
│  └─────────────────────┘    └─────────────────────────┘        │
│              │                           │                      │
│              └───────────┬───────────────┘                      │
│                          ▼                                      │
│                 ┌─────────────────┐                             │
│                 │ MATCH ALGORITHM │                             │
│                 │                 │                             │
│                 │ Finds users who │                             │
│                 │ want what you   │                             │
│                 │ have & vice     │                             │
│                 │ versa           │                             │
│                 └─────────────────┘                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Firestore Collections Tested

| Collection | Path | Purpose |
|------------|------|---------|
| `cards` | `users/{userId}/cards` | User's private card inventory |
| `public_cards` | `public_cards` | Global searchable trade/sale inventory |
| `public_preferences` | `public_preferences` | Global searchable wishlist |

## Card Statuses

| Status | Stored In | Visible To Others | Used For |
|--------|-----------|-------------------|----------|
| `collection` | cards only | No | Personal inventory tracking |
| `trade` | cards + public_cards | Yes | Finding trade partners |
| `sale` | cards + public_cards | Yes | Finding buyers |
| `wishlist` | cards + public_preferences | Yes | Finding sellers/traders |

---

# Deck System Tests

## Overview

Tests deck management including creation, card allocations from collection, and wishlist tracking for cards not yet owned.

## Test Coverage

### 1. Deck CRUD Operations

| Test | Description | Validates |
|------|-------------|-----------|
| `should create a deck` | Creates deck with name, format, colors | Deck creation |
| `should update a deck` | Updates name, format, colors | Update operations |
| `should delete a deck` | Deletes deck, verifies removal | Delete operations |
| `should handle multiple decks` | Creates 4 decks with different formats | Multiple documents |

### 2. Card Allocations

| Test | Description | Validates |
|------|-------------|-----------|
| `should allocate a card to a deck` | Links collection card to deck | Basic allocation |
| `should allocate cards to sideboard` | Allocates with `isInSideboard: true` | Sideboard tracking |
| `should handle multiple allocations` | Allocates 2 cards to same deck | Multiple allocations |

### 3. Wishlist Management

| Test | Description | Validates |
|------|-------------|-----------|
| `should add card to deck wishlist` | Adds card user doesn't own | Wishlist creation |
| `should handle mixed allocations and wishlist` | Both owned and wanted cards | Mixed deck state |

### 4. Deck Formats

| Test | Description | Validates |
|------|-------------|-----------|
| `should support all deck formats` | Creates decks for all 5 formats | Format validation |

## Data Flow Tested

```
┌─────────────────────────────────────────────────────────────────┐
│                     Deck Structure                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  /users/{userId}/decks/{deckId}                                │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  name, format, colors, commander                     │      │
│  │                                                      │      │
│  │  allocations: [                                      │      │
│  │    { cardId, quantity, isInSideboard }  ←── Links   │      │
│  │  ]                                       to cards    │      │
│  │                                                      │      │
│  │  wishlist: [                                         │      │
│  │    { scryfallId, name, quantity... }  ←── Cards     │      │
│  │  ]                                     not owned     │      │
│  │                                                      │      │
│  │  stats: { totalCards, ownedCards, completionPct }   │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

# Messages System Tests

## Overview

Tests the real-time chat functionality between users.

## Test Coverage

### 1. Conversation Creation

| Test | Description | Validates |
|------|-------------|-----------|
| `should create a conversation` | Creates conversation with 2 participants | Conversation creation |
| `should generate consistent ID` | Same ID regardless of who initiates | Deduplication |
| `should store participant names` | Names stored for display | Participant metadata |

### 2. Message Sending

| Test | Description | Validates |
|------|-------------|-----------|
| `should send a message` | Sends message, verifies content | Message creation |
| `should update lastMessage` | Conversation shows latest message | Preview updates |
| `should handle multiple messages in order` | Messages maintain chronological order | Ordering |

### 3. Cross-User Messaging

| Test | Description | Validates |
|------|-------------|-----------|
| `should allow both users to send` | User A and B both send messages | Bidirectional |
| `should be visible to both participants` | Both users see the conversation | Visibility |

### 4. Message Properties

| Test | Description | Validates |
|------|-------------|-----------|
| `should mark messages as unread` | New messages have `read: false` | Unread tracking |
| `should store sender information` | senderId, senderUsername stored | Sender metadata |

## Data Flow Tested

```
┌─────────────────────────────────────────────────────────────────┐
│                   Messaging Structure                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  /conversations/{conversationId}                               │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  id: "userA_userB" (alphabetically sorted)           │      │
│  │  participantIds: [userA, userB]                      │      │
│  │  participantNames: { userA: "name", userB: "name" }  │      │
│  │  lastMessage: "preview text"                         │      │
│  │  lastMessageTime: timestamp                          │      │
│  └──────────────────────────────────────────────────────┘      │
│         │                                                       │
│         ▼                                                       │
│  /conversations/{id}/messages/{messageId}                      │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  senderId, senderUsername                            │      │
│  │  recipientId                                         │      │
│  │  content: "message text"                             │      │
│  │  createdAt: timestamp                                │      │
│  │  read: false                                         │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

# Running Tests

## Rate Limiting

Firebase has authentication rate limits. If you see `auth/quota-exceeded`:
- **Wait 5 minutes** before running tests again
- Run individual test suites instead of all at once

```bash
# Run specific suite to avoid rate limits
npm run test:integration -- tests/integration/matches.test.ts
npm run test:integration -- tests/integration/collection.test.ts
npm run test:integration -- tests/integration/decks.test.ts
npm run test:integration -- tests/integration/messages.test.ts
```
