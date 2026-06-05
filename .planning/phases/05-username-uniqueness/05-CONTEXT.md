# Phase 5: Username Uniqueness (@username) - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning
**Source:** Manual grooming of Jira SCRUM-73 (GSD SDK orchestration unavailable — gsd-sdk CLI version-mismatched; this phase is off the "Frontend Modernization" roadmap milestone but tracked here for documentation parity)
**Jira:** SCRUM-73 — "Forzar username único al registrarse + resolución robusta de @username"

<domain>
## Phase Boundary

Guarantee that every `@username` resolves to exactly one user account, atomically. Close the three real holes discovered during SCRUM-70 QA that let duplicate usernames exist and let public profiles / buy requests resolve to the wrong account:

1. **Atomic uniqueness** via a `/usernames/{username}` index collection with create-only Firestore rules (no TOCTOU).
2. **Canonical normalization** of usernames (lowercase) across all creation paths.
3. **Deterministic resolution** of `@username` → `uid` in all three call sites (no more non-deterministic `limit(1)`).
4. **Data remediation**: audit + dedup the existing `/users` collection in dev and prod, then backfill the index.

**Root-cause insight (verified in code):** `submitBuyRequest(ownerUid, ...)` (`src/stores/buyRequests.ts:32`) trusts an `ownerUid` produced by the username→uid resolution chain (`UserProfileView.vue` `findUserByUsername` → `userId.value`). With duplicate `@rafael_m` docs and `limit(1)`, the anonymous visitor resolved to the wrong (old) doc, so the buy request was written under a uid the owner never read. Fixing the 3 resolution sites + removing duplicates fixes the SCRUM-70 incident at its root.

</domain>

<decisions>
## Implementation Decisions

### Scope (USER LOCKED via grooming)
- **Atomicity level:** Robust — `/usernames/{username}` index collection with create-only rules (true atomic uniqueness), NOT just a query pre-check.
- **Data:** Full remediation — audit AND mass dedup/rename of existing duplicates in prod (prod was *reported* clean but we verify), plus index backfill for all users.

### Username Index Collection
- **D-01 (USER LOCKED):** New Firestore collection `/usernames/{normalizedUsername}`. Doc ID = the normalized (lowercase, trimmed) username. Doc body: `{ uid: <ownerUid>, createdAt: <Date> }`.
- **D-02 (USER LOCKED):** Firestore rules for `/usernames/{username}`:
  - `allow read: if true;` — anonymous availability checks during registration need read access (no auth yet at check time).
  - `allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;` — only an authed user reserving their own uid.
  - `allow delete: if request.auth != null && resource.data.uid == request.auth.uid;` — owner releases their own reservation (for changeUsername).
  - **No `update` rule** — this is the uniqueness guarantee. A `setDoc` onto an existing doc is evaluated by Firestore rules as an `update` (because `resource != null`), which is denied → the write fails with `permission-denied`. That denial IS the "username already taken" signal. No transaction needed.
- **D-03 (Claude's Discretion):** The create-only denial is caught and mapped to a `taken` result. Distinguishing `permission-denied`-due-to-existing from other permission errors is acceptable risk (the only way an authed user gets permission-denied on this path is an existing doc).

### Normalization (pure, TDD)
- **D-04 (USER LOCKED):** New file `src/utils/username.ts` exporting two **pure** functions:
  - `normalizeUsername(raw: string): string` → `raw.trim().toLowerCase()`
  - `isValidUsername(raw: string): boolean` → `/^\w{3,20}$/.test(raw.trim())` (matches the existing `changeUsername` regex at `auth.ts:400`)
  These are unit-tested first (RED → GREEN) per CLAUDE.md.
- **D-05 (USER LOCKED):** The canonical stored `username` field is the **normalized lowercase** value everywhere. This makes `register()` consistent with `changeUsername()` (which already stores lowercase at `auth.ts:427`). Display-case preservation is OUT of scope (deferred).

### Creation Paths (all FOUR — Anti-loop Rule 6 atomic change)

> **Enumeration (verified by grep `setDoc(doc(db, 'users'`):** there are FOUR paths that create a `/users` doc — `register` (D-06), `loginWithGoogle` (D-07), `loadUserData` self-heal (D-06b), and `changeUsername` which only *updates* an existing doc's username (D-08). All four must reserve/normalize.

- **D-06 (USER LOCKED):** `register()` (`auth.ts:111`):
  1. `if (!isValidUsername(username))` → toast `auth.messages.usernameInvalidFormat`, return false (before creating any auth user).
  2. `createUserWithEmailAndPassword(...)` → get uid.
  3. `const reserved = await reserveUsername(uid, normalizeUsername(username))`.
  4. If `!reserved` → **rollback**: `await deleteUser(userCredential.user)` (delete the just-created Firebase Auth user; allowed because it's the freshly-authenticated current user), toast `auth.messages.usernameTaken`, return false.
  5. Else `setDoc('/users/{uid}', { email, username: normalizeUsername(username), location, createdAt })`.
- **D-07 (USER LOCKED):** `loginWithGoogle()` (`auth.ts:158`), ONLY in the new-user branch (`!userDoc.exists()`): this is the hole that silently created duplicates. Generate a base username (existing displayName-derived logic, then `normalizeUsername`). Reserve with **collision retry**: if `reserveUsername` fails, append a suffix (reuse the suffix strategy from `generateUsernameSuggestions`) and retry, capped at ~8 attempts. Cannot reject a Google login, so always converge to a unique username. Then create the `/users` doc with the reserved username.
- **D-06b (USER LOCKED — added after plan-check found the 4th path):** `loadUserData()` self-heal branch (`auth.ts:69-92`): when an authenticated user has no `/users` doc, it currently writes one with `firebaseUser.displayName || email-split || 'Usuario'` — **raw, un-normalized, un-reserved** (and `'Usuario'` would collide for every displayName-less user). This is also the documented fallback if register's `deleteUser` rollback fails. Wire this write through the **same collision-retry reservation as D-07**: normalize the base (`displayName` → email-prefix → final fallback `user${uid-prefix}` NOT the colliding `'Usuario'`), `reserveUsername` with suffix retry (cap ~8), then `setDoc` the `/users` doc + set `user.value.username` to the reserved value. Extract the shared "generate + reserve unique username" logic into one helper (e.g. `reserveUniqueUsername(uid, base)`) reused by D-07 and D-06b so the two paths stay siblings (Rule 6). If reservation cannot be obtained (all retries fail) fall back to a uid-derived guaranteed-unique value (e.g. `user_${uid.slice(0,8)}`) and reserve that.
- **D-08 (USER LOCKED):** `changeUsername()` (`auth.ts:393`):
  1. Validate format + rate-limit (existing logic stays).
  2. `reserveUsername(uid, newNorm)` first — fail-safe: if taken, abort before touching anything (existing suggestions flow on failure).
  3. On success: `updateDoc('/users/{uid}', { username: newNorm, lastUsernameChange })`.
  4. Then `releaseUsername(oldNorm)` (best-effort `deleteDoc` of the previous reservation).
  5. If `updateDoc` throws after a successful reserve → best-effort `releaseUsername(newNorm)` to avoid a dangling reservation.
- **D-09 (Claude's Discretion):** New helpers in `src/stores/auth.ts` (co-located with the other username logic):
  - `reserveUsername(uid: string, norm: string): Promise<boolean>` → `try { await setDoc(doc(db,'usernames',norm), { uid, createdAt: new Date() }); return true } catch { return false }` (catches the create-only `permission-denied`).
  - `releaseUsername(norm: string): Promise<void>` → best-effort `deleteDoc(doc(db,'usernames',norm))`, swallow errors.

### Deterministic Resolution (3 parallel sites — Anti-loop Rule 1 + 6)
- **D-10 (USER LOCKED):** New shared module `src/services/userLookup.ts` exporting `resolveUsernameToUid(uname: string): Promise<{ id: string; data: Record<string, unknown> } | null>`:
  1. `const norm = normalizeUsername(uname)`.
  2. Read `/usernames/{norm}` → if exists, get `uid`, then `getDoc('/users/{uid}')` → return `{ id: uid, data }`.
  3. **Legacy fallback:** if the index doc does NOT exist (user not yet backfilled), fall back to the existing query `where('username','==',norm), limit(1)`. This keeps the app working during migration before backfill completes.
  4. Return `null` if neither path resolves.
- **D-11 (USER LOCKED):** Replace the `limit(1)` resolution in ALL THREE sites with `resolveUsernameToUid`:
  - `src/views/UserProfileView.vue:107` (`findUserByUsername`) — feeds `userId.value` → buyRequests ownerUid (the SCRUM-70 path).
  - `src/components/user/UserProfileHoverCard.vue:28`.
  - `src/views/SavedMatchesView.vue:330`.
  These are parallel siblings — change together in one plan.
- **D-12 (Claude's Discretion):** `userLookup.ts` is a `services/` module (Firebase access layer, consistent with `services/firebase.ts`). It imports `normalizeUsername` from `utils/username.ts`.

### checkUsernameAvailable
- **D-13 (USER LOCKED):** Keep `checkUsernameAvailable` (`auth.ts:312`) as a fast UX pre-check (so the user sees "taken" before submitting), but it is NO LONGER the uniqueness guarantee — the index create (D-02/D-09) is. Update it to also check `/usernames/{norm}` existence (read), keeping the legacy username-query as a fallback for not-yet-backfilled users. Normalize input via `normalizeUsername`.

### Migration Scripts (admin — run by Rafael, dev → prod)
- **D-14 (USER LOCKED):** `scripts/audit-usernames.mjs` — **read-only**. Uses Firebase Admin SDK. Reads all `/users`, groups by `normalizeUsername(username)`, reports every group with >1 member: uid, raw username, card count (count of `/users/{uid}/cards` or `card_index`), `createdAt`. Prints a human table + writes a JSON report. No writes. Runnable against dev and prod (env-selected).
- **D-15 (USER LOCKED):** `scripts/dedup-backfill-usernames.mjs` — **DRY-RUN by default**; `--apply` to write. For each duplicate group:
  1. Pick canonical: most cards; tie-break → oldest `createdAt`.
  2. Rename non-canonical docs' `username` to `${normalized}_old{N}` (and release/skip any conflicting index entry).
  3. Backfill `/usernames/{norm}` → canonical uid for ALL users (one index doc per canonical username).
  Logs every intended action in dry-run; only mutates with `--apply`.
- **D-16 (Claude's Discretion):** Admin auth via Firebase Admin SDK reading `GOOGLE_APPLICATION_CREDENTIALS` (service account JSON), or ADC (`gcloud auth application-default`) — the same ADC technique used for the manual dev fix (per project memory). Script selects project via env (`FIREBASE_PROJECT` = `cranial-trading-dev` | `cranial-trading`). Default to dev.
- **D-17 (USER LOCKED):** Rollout order:
  1. Deploy rules (D-02) + code (resolution has legacy fallback, so safe before backfill).
  2. Run `audit` on dev → review.
  3. Run `dedup-backfill --apply` on dev → verify `@username` resolution + buy-request flow.
  4. Rafael approves → repeat audit + dedup-backfill on prod.

### i18n (all three locales — CLAUDE.md Rule 3)
- **D-18 (Claude's Discretion):** `auth.messages.usernameTaken` already exists (reuse). Add `auth.messages.usernameInvalidFormat` to `en.json` / `es.json` / `pt.json`. **Use ASCII hyphen `3-20` (NOT en-dash) so action text and acceptance greps agree exactly:** "Username must be 3-20 letters, numbers, or underscores" / "El nombre de usuario debe tener 3-20 letras, números o guiones bajos" / "O nome de usuário deve ter 3-20 letras, números ou sublinhados". Verify `settings.changeUsername.*` keys already exist before reuse.

### Versioning
- **D-19 (USER LOCKED):** Minor bump → **1.34.0** (new feature + new Firestore collection/rules). `package.json` + lock regenerated in same commit (memory: package-lock sync).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope files (MUST create)
- `src/utils/username.ts` — NEW: `normalizeUsername`, `isValidUsername` (pure).
- `tests/unit/utils/username.test.ts` — NEW: unit tests for the above.
- `src/services/userLookup.ts` — NEW: `resolveUsernameToUid` (index-first, legacy fallback).
- `tests/unit/services/userLookup.test.ts` — NEW: unit tests (mock firestore).
- `scripts/audit-usernames.mjs` — NEW: read-only duplicate audit (Admin SDK).
- `scripts/dedup-backfill-usernames.mjs` — NEW: dry-run dedup + index backfill (Admin SDK).

### Phase scope files (MUST modify)
- `src/stores/auth.ts` — `register` (111), `loginWithGoogle` (158), `loadUserData` self-heal (69-92), `changeUsername` (393), `checkUsernameAvailable` (312); ADD `reserveUsername` / `releaseUsername` + shared `reserveUniqueUsername(uid, base)` helper (used by Google login D-07 and loadUserData D-06b).
- `firestore.rules` — ADD `/usernames/{username}` match block (after the `/users/{userId}` block, before the catch-all deny).
- `src/views/UserProfileView.vue` — replace `findUserByUsername` body (107) with `resolveUsernameToUid`.
- `src/components/user/UserProfileHoverCard.vue` — replace `limit(1)` query (28).
- `src/views/SavedMatchesView.vue` — replace `limit(1)` query (330).
- `src/locales/en.json` / `es.json` / `pt.json` — `auth.messages.usernameInvalidFormat`.
- `package.json` — version bump 1.34.0.

### Reference (do NOT modify, read for patterns)
- `src/stores/buyRequests.ts` — `submitBuyRequest(ownerUid,...)` consumes resolved uid (root-cause path; do not change, just understand).
- `src/views/RegisterView.vue` — calls `authStore.register`; no client format validation today.
- `src/services/firebase.ts` — `db` export + `memoryLocalCache` setup (SDK works for anonymous reads since commit 5964701, per UserProfileView comment).
- `functions/` — has `firebase-admin` dependency (reference for the migration scripts' Admin SDK usage).
- `tests/unit/helpers/fixtures.ts` — fixture factories.
- `tests/unit/composables/useGlobalSearch.test.ts` — reference for vi.mock of firebase/firestore + vue patterns.

### Project rules (MUST honor)
- `CLAUDE.md` — TDD mandate (RED→GREEN→REFACTOR), Anti-loop Rule 1 (read+trace, find ALL siblings), Rule 3 (verify i18n in all 3 locales), Rule 6 (parallel changes atomic), Rule 7 (`npm run test:unit` + `npx vite build` = done), no async `onMounted` with await, `npx vite build` (NOT `npm run build`).
- Project memory: package-lock must be regenerated in the same commit as any package.json change; E2E before push; never commit a fix until verified locally.

</canonical_refs>

<code_context>
## Existing Code Insights (verified by reading source 2026-06-05)

### Current state
- `register()` already calls `checkUsernameAvailable` (auth.ts:113) BUT stores the raw, un-normalized username (auth.ts:124) — inconsistent with `changeUsername` which stores lowercase (auth.ts:427). This case mismatch can make `@rafael_m` fail to resolve a stored `Rafael_M`.
- `loginWithGoogle()` (auth.ts:170) generates a username from displayName and creates the doc with **no availability/uniqueness check** — the primary duplicate-creation path.
- `checkUsernameAvailable` (auth.ts:312) queries `/users` for lowercase + original case; non-atomic (TOCTOU).
- Three resolution sites all use `where('username','==',uname), limit(1)` → non-deterministic with duplicates: UserProfileView.vue:109, UserProfileHoverCard.vue:28, SavedMatchesView.vue:330.
- `firestore.rules` `/users/{userId}` is publicly readable (`allow read: if true`) — so anonymous `/usernames` read (D-02) is consistent with existing public-profile posture.

### Established patterns
- Firebase SDK v9 modular imports; imports in views must be alphabetically sorted (`sort-imports` lint rule) — memory.
- Pre-existing lint warnings: `npm run build` fails at lint; use `npx vite build`.
- Vitest globals (no import of describe/it/expect); mock firebase/firestore with `vi.mock`.
- Toast: `toastStore.show(t('key'), 'success'|'error'|'info')`.

### Risk flags
- **register rollback:** `deleteUser` on the freshly-created user must run while it is `auth.currentUser` (it is, right after creation) — no re-auth needed. If `deleteUser` itself fails, surface a clear error (orphan auth user without /users doc — acceptable edge, user can retry login).
- **changeUsername rollback:** reserve-new-before-release-old ordering prevents losing the username if the update fails.
- **Migration on prod:** destructive (renames). DRY-RUN default + Rafael review of dry-run output before `--apply` is mandatory (memory: no commit/no destructive action without verification).
- **Anonymous reads:** `/usernames` read rule must be `if true` because the registration availability check runs before `createUserWithEmailAndPassword` (no auth yet).

</code_context>

<specifics>
## Specific Ideas

- The `/usernames/{username}` create-only pattern is the canonical Firestore unique-field idiom (Firebase docs "unique fields" / FirebaseExtended uniqueness). Chosen over a Cloud Function trigger for simplicity and zero cold-start cost.
- Migration scripts mirror the manual dev fix already performed (renamed `rafael_m` duplicate → `rafael_m_old` via REST PATCH + ADC token), generalized and made idempotent.

</specifics>

<deferred>
## Deferred Ideas

- Cloud Function `onWrite` trigger to defensively enforce uniqueness server-side (the rules + index already prevent it client-side).
- Reserved-username blocklist (admin, support, api, etc.).
- Display-case preservation (store original case for display while resolving lowercase).
- Migrating `checkUsernameAvailable`'s legacy dual-query away once backfill is 100% complete.

</deferred>

## Local Requirement IDs (phase-scoped — SCRUM-73 is not in .planning/REQUIREMENTS.md)

- **UNIQ-01** — Pure username normalization + validation utilities (`src/utils/username.ts`), unit-tested.
- **UNIQ-02** — `/usernames` index collection + create-only Firestore rules + `reserveUsername`/`releaseUsername` helpers.
- **UNIQ-03** — Wire atomic reservation into all creation paths (register with rollback, Google login with retry, changeUsername with release).
- **UNIQ-04** — Deterministic `resolveUsernameToUid` (index-first, legacy fallback) wired into all 3 resolution sites.
- **UNIQ-05** — Migration scripts: read-only audit + dry-run dedup/rename + index backfill (Admin SDK), dev→prod rollout.

---

*Phase: 05-username-uniqueness*
*Context gathered: 2026-06-05 (manual grooming of SCRUM-73)*
