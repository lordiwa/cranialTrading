# Plan 05-03b Summary — Update path + UX check + i18n (UNIQ-03, part 2)

**Status:** ✅ Complete
**Date:** 2026-06-05

## What was built

### `src/stores/auth.ts`
- **`changeUsername()`** (D-08): reserve-new-before-release-old. `newNorm`/`oldNorm` via `normalizeUsername`; `reserveUsername(uid, newNorm)` first — if it fails, suggestions + `taken` toast, abort (no mutation). On success: `updateDoc` then `releaseUsername(oldNorm)` (only if different). If `updateDoc` throws after reserve → `releaseUsername(newNorm)` rollback. Early guards (auth, format regex, rate-limit) unchanged.
- **`checkUsernameAvailable()`** (D-13): now index-first — `getDoc('/usernames/{norm}')` → taken if exists; legacy `where('username','==',norm)` fallback for not-yet-backfilled users. Normalizes input. Remains a UX-only pre-check (the reservation in 03a is the real guarantee).

### i18n — `auth.messages.usernameInvalidFormat` (all 3 locales, ASCII `3-20`)
- en: "Username must be 3-20 letters, numbers, or underscores"
- es: "El nombre de usuario debe tener 3-20 letras, números o guiones bajos"
- pt: "O nome de usuário deve ter 3-20 letras, números ou sublinhados"

(Existing `settings.changeUsername.*` keys reused — none added.)

## Verification
- JSON valid (all 3 locales). `npm run test:unit`: 78 files / 1072 tests pass. `npx vue-tsc --noEmit`: clean. `npx eslint src/stores/auth.ts`: 0 problems. `npx vite build`: ✅.

## Commit
- `feat(05-03b): changeUsername reserve/release + index-aware checkUsernameAvailable + i18n`

## Result
UNIQ-03 fully complete: all 4 creation paths (03a) + the update path (03b) reserve atomically and store normalized usernames; availability UX check consults the index.
