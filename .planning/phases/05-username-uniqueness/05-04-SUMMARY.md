# Plan 05-04 Summary — Deterministic username resolution (UNIQ-04)

**Status:** ✅ Complete (TDD)
**Date:** 2026-06-05

## What was built

### `src/services/userLookup.ts` (NEW)
```typescript
export async function resolveUsernameToUid(
  uname: string
): Promise<{ id: string; data: Record<string, unknown> } | null>
```
Algorithm (D-10): normalize → index-first `getDoc('/usernames/{norm}')` → `getDoc('/users/{uid}')`; on index miss OR missing user doc, legacy fallback `where('username','==',norm) limit(1)`; else `null`. Empty/whitespace username short-circuits to `null` (no reads).

### `tests/unit/services/userLookup.test.ts` (NEW)
6 cases (mocked firestore, REAL normalizeUsername): index hit, normalizes input before lookup, legacy fallback on index miss, null when both miss, legacy fallback when index points to a deleted user doc, null on empty input. 6/6 pass.

### Three resolution sites rewired (D-11, Rule 1+6)
- `src/views/UserProfileView.vue` — `findUserByUsername` now delegates to `resolveUsernameToUid` (feeds `userId.value` → buyRequests ownerUid: the SCRUM-70 path). Pruned `limit` from the firestore import (only it became unused; `where/query/collection/getDocs/addDoc` still used by interest + card loaders).
- `src/components/user/UserProfileHoverCard.vue` — `loadUserInfo` resolves via the service; card-count query unchanged. Pruned `limit` (kept `collection/getDocs/query/where`).
- `src/views/SavedMatchesView.vue` — `handleBlockByUsername` resolves via the service; `userNotFound` toast on `null`. Pruned `limit/query/where` (kept `addDoc/collection/deleteDoc/doc/getDoc/getDocs`).

## Verification
- `npm run test:unit`: 78 files / **1072 tests pass** (no regressions).
- `npx vue-tsc --noEmit`: **clean** — no orphaned firestore imports in any of the 3 files (CI pre-commit safe; `vite build` alone would not catch this).
- `grep` acceptance: `resolveUsernameToUid` present 3×/2×/2×; **zero** `where('username', '==` lookups remain in any site.
- `npx vite build`: ✅.

## Commit
- `feat(05-04): deterministic resolveUsernameToUid wired into all 3 resolution sites`

## Note for Plan 05
After backfill, the legacy `where`/`limit(1)` fallback becomes dead for real users (deferred cleanup — keep until backfill is verified 100% in prod).
