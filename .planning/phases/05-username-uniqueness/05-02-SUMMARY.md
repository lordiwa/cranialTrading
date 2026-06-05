# Plan 05-02 Summary — Username uniqueness primitive (UNIQ-02)

**Status:** ✅ Complete
**Date:** 2026-06-05

## What was built

### 1. Firestore rule — `firestore.rules`
New top-level `match /usernames/{username}` block, a SIBLING of `match /users/{userId}` (inserted right after the `/users` block closes, before the catch-all deny):
```
match /usernames/{username} {
  allow read: if true;
  allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;
  allow delete: if request.auth != null && resource.data.uid == request.auth.uid;
  // No update rule — denial on an existing doc is the "taken" signal.
}
```
The absence of an `update`/`write` rule IS the atomic uniqueness guarantee (D-02): a `setDoc` onto an existing doc is evaluated as an UPDATE and denied.

### 2. Helpers — `src/stores/auth.ts`
- `deleteDoc` added to the firebase/firestore import.
- `reserveUsername(uid, norm): Promise<boolean>` — `setDoc('/usernames/{norm}', {uid, createdAt})`; true on success, false on any throw (catches create-only permission-denied).
- `releaseUsername(norm): Promise<void>` — best-effort `deleteDoc`, never throws.
- Both exported from the store for Plan 03a/03b.

### 3. Tests — `tests/unit/stores/usernameReservation.test.ts`
2 describe blocks, 5 `it` cases (mocked firestore): reserve→true on resolve, false on permission-denied, false on any error; release→calls deleteDoc, never throws. 5/5 pass.

## Verification
- `npm run test:unit` full suite: 77 files / 1066 tests pass (no regressions).
- `npx vite build`: ✅ built in ~17.6s.

## Commits
- feat(05-02): add /usernames create-only Firestore rule for atomic username uniqueness
- feat/test(05-02): reserveUsername/releaseUsername helpers + unit tests

## ⚠ Rollout reminder (D-17 step 1)
The rule is authored but NOT deployed. Before Plan 05 backfill (and ideally before Plan 03a/04 hit dev), deploy:
```
firebase deploy --only firestore:rules --project cranial-trading-dev
```
Safe to deploy independently: resolution still has a legacy query fallback (Plan 04) until backfill completes, and no app code relies on the rule yet.
