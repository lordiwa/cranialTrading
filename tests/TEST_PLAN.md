# Test Plan - Match System

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
