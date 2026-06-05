# Plan 05-03a Summary — Creation paths wired to atomic reservation (UNIQ-03, part 1)

**Status:** ✅ Complete
**Date:** 2026-06-05

## What was built — `src/stores/auth.ts`
- **Imports:** added `deleteUser` (firebase/auth) and `{ isValidUsername, normalizeUsername }` (../utils/username).
- **`reserveUniqueUsername(uid, base): Promise<string>`** — shared helper: normalizes base, tries base + 7 suffixes, then 8 bounded random-numeric attempts, then a guaranteed-unique `user_<uid.slice(0,8)>` fallback (reserved). Never returns the colliding `'Usuario'`. Exported from the store.
- **`register()`** (D-06): validates format first (`isValidUsername` → toast `usernameInvalidFormat`, return false BEFORE creating any auth user); creates auth user; `reserveUsername(uid, norm)`; on failure `deleteUser(userCredential.user)` rollback + `usernameTaken` toast; stores `username: norm` (normalized, D-05). The old non-atomic `checkUsernameAvailable` pre-check was removed from register (reservation is the guarantee).
- **`loginWithGoogle()` new-user branch** (D-07) and **`loadUserData()` self-heal branch** (D-06b) both reserve via the shared `reserveUniqueUsername` (parallel siblings, Rule 6). The raw `'Usuario'` write is gone; self-heal fallback is uid-derived.
- The outer `loadUserData` catch (no setDoc) was left untouched — not a creation path.

## Verification
- `npm run test:unit`: 1066/1066 pass (no regressions; suite count before plan 04).
- `npx vue-tsc --noEmit`: clean. `npx eslint src/stores/auth.ts`: 0 errors, 0 warnings (removed 2 unnecessary `no-await-in-loop` disable directives — that rule is not enabled).
- `npx vite build`: ✅.

## Deviations
- Import order: used alphabetical `{ isValidUsername, normalizeUsername }` to satisfy the `sort-imports` lint rule (the plan's acceptance grep expected `normalizeUsername, isValidUsername`; lint compliance takes priority — the hook blocks commits).
- Combined the plan's 3 tasks into ONE commit (all edits in a single file, one logical unit) to avoid 3 slow pre-commit hook runs.

## Commit
- `feat(05-03a): wire atomic username reservation into all creation paths`

## Note for Plan 03b
`changeUsername` (D-08), `checkUsernameAvailable` index-first (D-13), and i18n `usernameInvalidFormat` (D-18, ASCII `3-20`) remain. Stored usernames from all CREATE paths are now normalized lowercase.
