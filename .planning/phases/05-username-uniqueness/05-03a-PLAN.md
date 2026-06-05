---
phase: 05-username-uniqueness
plan: 03a
type: execute
wave: 2
depends_on:
  - "05-01"
  - "05-02"
files_modified:
  - src/stores/auth.ts
requirements:
  - UNIQ-03
requirements_addressed:
  - UNIQ-03
must_haves:
  truths:
    - "register() rejects an invalid-format username BEFORE creating any Firebase Auth user (toast usernameInvalidFormat, returns false)"
    - "register() stores the NORMALIZED lowercase username (consistent with changeUsername)"
    - "register() rolls back (deleteUser) the just-created Auth user if the username reservation fails"
    - "reserveUniqueUsername(uid, base) reserves base, retries with suffixes, and on exhaustion reserves user_<uid8> (never the colliding 'Usuario')"
    - "loginWithGoogle() new-user branch reserves a unique username via reserveUniqueUsername, always converging"
    - "loadUserData() self-heal branch reserves a unique username via reserveUniqueUsername (no raw 'Usuario' write)"
  artifacts:
    - path: "src/stores/auth.ts"
      provides: "register + reserveUniqueUsername helper + loginWithGoogle + loadUserData wired to reservation/normalization"
      contains: "isValidUsername, normalizeUsername, reserveUsername, reserveUniqueUsername, deleteUser"
  key_links:
    - from: "register"
      to: "reserveUsername + deleteUser rollback"
      via: "if (!reserved) await deleteUser(userCredential.user)"
      pattern: "deleteUser\\(userCredential.user\\)"
    - from: "loginWithGoogle new-user branch"
      to: "reserveUniqueUsername"
      via: "shared helper call"
      pattern: "reserveUniqueUsername\\("
    - from: "loadUserData self-heal branch"
      to: "reserveUniqueUsername"
      via: "shared helper call (sibling of loginWithGoogle, Rule 6)"
      pattern: "reserveUniqueUsername\\("
---

<objective>
Wire the atomic reservation primitive (Plan 02) and normalization utils (Plan 01) into ALL FOUR `/users`-doc creation paths atomically (UNIQ-03, Anti-loop Rule 6) — but split across two plans to keep each ≤4 tasks. This plan (03a) covers the THREE paths that CREATE a `/users` doc: `register` with validation + reservation + deleteUser rollback (D-06), `loginWithGoogle` new-user branch (D-07), and the `loadUserData` self-heal branch (D-06b). It introduces the shared `reserveUniqueUsername(uid, base)` helper so the Google-login and self-heal paths stay parallel siblings (Rule 6). Plan 03b covers the update-only path (`changeUsername`, D-08), the UX pre-check (`checkUsernameAvailable`, D-13), and i18n (D-18).

Purpose: Close every duplicate-creation hole. `register` previously stored a raw username with only a non-atomic pre-check; `loginWithGoogle` created docs with NO uniqueness check; and `loadUserData`'s self-heal (which is ALSO the documented fallback when register's deleteUser rollback fails) wrote a raw, un-reserved `displayName || email-split || 'Usuario'` — where `'Usuario'` collides for every displayName-less user. After 03a, all three creation paths go through the atomic `/usernames` reservation and store normalized lowercase usernames (D-05).

Output: modified `src/stores/auth.ts` (register, new `reserveUniqueUsername` helper, loginWithGoogle new-user branch, loadUserData self-heal branch).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/05-username-uniqueness/05-CONTEXT.md
@CLAUDE.md
@src/stores/auth.ts
@.planning/phases/05-username-uniqueness/05-01-PLAN.md
@.planning/phases/05-username-uniqueness/05-02-PLAN.md

<interfaces>
<!-- From Plan 01 (src/utils/username.ts): -->
```typescript
export function normalizeUsername(raw: string): string;
export function isValidUsername(raw: string): boolean;
```
<!-- From Plan 02 (already in auth.ts store + return): -->
```typescript
const reserveUsername: (uid: string, norm: string) => Promise<boolean>;
const releaseUsername: (norm: string) => Promise<void>;
```
<!-- deleteUser must be added to the firebase/auth import (auth.ts lines 3-15). -->
<!-- New shared helper (D-06b, D-07): -->
```typescript
// Generate a normalized base, reserve it; on collision append suffixes (cap ~8);
// on exhaustion reserve user_<uid first 8 chars>. Returns the reserved username.
async function reserveUniqueUsername(uid: string, base: string): Promise<string>;
```
<!-- Relevant existing lines:
     loadUserData self-heal else-branch ~69-92 (the setDoc with displayName||email||'Usuario');
     register ~111; loginWithGoogle ~158, new-user branch ~167-182. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add imports + reserveUniqueUsername shared helper to auth.ts</name>
  <files>src/stores/auth.ts</files>
  <read_first>
    - src/stores/auth.ts (import lines 3-21; generateUsernameSuggestions suffixes ~347; reserveUsername from Plan 02; the store return block ~679-703)
    - .planning/phases/05-username-uniqueness/05-CONTEXT.md (D-06b + D-07 — shared generate+reserve-with-retry; final fallback user_<uid8> NOT 'Usuario')
    - .planning/phases/05-username-uniqueness/05-01-PLAN.md (normalizeUsername API)
    - CLAUDE.md (Rule 1 read+trace; Rule 6 parallel siblings; Rule 7)
  </read_first>
  <behavior>
    - auth.ts imports `deleteUser` from firebase/auth (alphabetical placement) and `{ normalizeUsername, isValidUsername }` from ../utils/username.
    - A new `reserveUniqueUsername(uid, base)` helper exists: normalizes base, tries base then base+suffix (8 suffixes), then bounded random-numeric retries, then a guaranteed-unique `user_<uid.slice(0,8)>` fallback (also reserved). Returns the reserved normalized username string.
    - Helper is added to the store's return object so it is testable/reusable.
  </behavior>
  <action>
1. Add `deleteUser` to the firebase/auth import (lines 3-15), after `createUserWithEmailAndPassword,`:
```typescript
    deleteUser,
```

2. Add the utils import after line 21 (`import { formatDate } ...`):
```typescript
import { normalizeUsername, isValidUsername } from '../utils/username';
```

3. Add the shared helper inside `useAuthStore`, placed just before `loginWithGoogle` (~line 158) so the two consumers are adjacent (Rule 6):
```typescript
    /**
     * Generate a normalized base username and reserve it atomically, retrying
     * with suffixes on collision (D-07, D-06b). Always converges to a reserved,
     * unique username. Shared by loginWithGoogle (new user) and loadUserData
     * (self-heal) so the two creation paths stay parallel siblings.
     * Final fallback is uid-derived (user_<uid8>) — never the colliding 'Usuario'.
     */
    const reserveUniqueUsername = async (uid: string, base: string): Promise<string> => {
        const normBase = normalizeUsername(base) || `user_${uid.slice(0, 8)}`;
        const suffixes = ['', '_mtg', '_tcg', '_cards', '01', '02', '99', '_pro'];
        for (const suffix of suffixes) {
            const candidate = normalizeUsername(`${normBase}${suffix}`);
            // eslint-disable-next-line no-await-in-loop -- sequential reservation attempts are intentional
            if (await reserveUsername(uid, candidate)) return candidate;
        }
        let guard = 0;
        while (guard < 8) {
            const candidate = normalizeUsername(`${normBase}${Math.floor(Math.random() * 9000) + 1000}`);
            guard++;
            // eslint-disable-next-line no-await-in-loop -- sequential reservation attempts are intentional
            if (await reserveUsername(uid, candidate)) return candidate;
        }
        // Guaranteed-unique last resort.
        const fallback = `user_${uid.slice(0, 8)}`;
        await reserveUsername(uid, fallback);
        return fallback;
    };
```

4. Add `reserveUniqueUsername,` to the store's `return { ... }` block.

Run `npx vite build`.

Commit: `feat(05-03a): add reserveUniqueUsername helper + deleteUser/normalize imports`
  </action>
  <verify>
    <automated>grep -n "reserveUniqueUsername\|deleteUser,\|normalizeUsername, isValidUsername" src/stores/auth.ts && npx vite build 2>&1 | tail -8</automated>
  </verify>
  <acceptance_criteria>
    - `grep -F "import { normalizeUsername, isValidUsername } from '../utils/username'" src/stores/auth.ts` returns 1
    - `grep -c "deleteUser," src/stores/auth.ts` returns 1 (import)
    - `grep -c "const reserveUniqueUsername" src/stores/auth.ts` returns 1
    - `grep -F "user_\${uid.slice(0, 8)}" src/stores/auth.ts` returns at least 2 (normBase fallback + last-resort)
    - `grep -c "reserveUniqueUsername," src/stores/auth.ts` returns at least 1 (return block)
    - `npx vite build` exits 0
  </acceptance_criteria>
  <done>deleteUser + util imports added; reserveUniqueUsername helper implemented with suffix retry + uid-derived fallback (no 'Usuario'); exported from the store; build green.</done>
</task>

<task type="auto">
  <name>Task 2: Wire register() — validate + normalize + reserve + deleteUser rollback (D-06)</name>
  <files>src/stores/auth.ts</files>
  <read_first>
    - src/stores/auth.ts (register ~111-138; reserveUsername helper; reserveUniqueUsername from Task 1)
    - .planning/phases/05-username-uniqueness/05-CONTEXT.md (D-06 exact 5-step sequence; D-05 store normalized; risk flag: deleteUser must run while user is auth.currentUser)
    - CLAUDE.md (Rule 1; Rule 7)
  </read_first>
  <behavior>
    - register: if !isValidUsername(username) → toast auth.messages.usernameInvalidFormat, return false (BEFORE createUserWithEmailAndPassword).
    - after createUserWithEmailAndPassword: const norm = normalizeUsername(username); const reserved = await reserveUsername(userId, norm).
    - if !reserved → await deleteUser(userCredential.user); toast auth.messages.usernameTaken; return false.
    - setDoc /users/{userId} with username: norm.
    - success path otherwise unchanged (sendEmailVerification, loadUserData, accountCreated).
  </behavior>
  <action>
Replace the body of `register` (current ~111-138) with the D-06 sequence:
```typescript
    const register = async (email: string, password: string, username: string, location: string) => {
        // D-06 step 1: validate format BEFORE creating any auth user.
        if (!isValidUsername(username)) {
            toastStore.show(t('auth.messages.usernameInvalidFormat'), 'error');
            return false;
        }

        let userCredential;
        try {
            // D-06 step 2: create the auth user.
            userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const userId = userCredential.user.uid;
            const norm = normalizeUsername(username);

            // D-06 step 3: atomically reserve the username.
            const reserved = await reserveUsername(userId, norm);
            if (!reserved) {
                // D-06 step 4: rollback — delete the just-created auth user
                // (allowed: it is the freshly-authenticated current user).
                await deleteUser(userCredential.user);
                toastStore.show(t('auth.messages.usernameTaken'), 'error');
                return false;
            }

            // D-06 step 5: persist the user doc with the NORMALIZED username (D-05).
            await setDoc(doc(db, 'users', userId), {
                email,
                username: norm,
                location,
                createdAt: new Date(),
            });

            await sendEmailVerification(userCredential.user);
            await loadUserData(userId);
            toastStore.show(t('auth.messages.accountCreated'), 'success');
            return true;
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : t('auth.messages.registerError');
            toastStore.show(errMsg, 'error');
            return false;
        }
    };
```
Note: the old non-atomic `checkUsernameAvailable` pre-check is removed from register (the reservation IS the guarantee, D-13). `checkUsernameAvailable` itself is updated in Plan 03b for the form UX.

Run `npx vite build`.

Commit: `feat(05-03a): register validates format, reserves atomically, rolls back on conflict`
  </action>
  <verify>
    <automated>grep -n "isValidUsername(username)\|deleteUser(userCredential\|reserveUsername(userId\|username: norm" src/stores/auth.ts && npx vite build 2>&1 | tail -8</automated>
  </verify>
  <acceptance_criteria>
    - `grep -F "if (!isValidUsername(username))" src/stores/auth.ts` returns 1
    - `grep -F "t('auth.messages.usernameInvalidFormat')" src/stores/auth.ts` returns at least 1
    - `grep -F "const reserved = await reserveUsername(userId, norm)" src/stores/auth.ts` returns 1
    - `grep -c "deleteUser(userCredential.user)" src/stores/auth.ts` returns 1
    - `grep -F "username: norm," src/stores/auth.ts` returns at least 1
    - register no longer calls checkUsernameAvailable: `grep -A30 "const register = async" src/stores/auth.ts | grep -c "checkUsernameAvailable"` returns 0
    - `npx vite build` exits 0
  </acceptance_criteria>
  <done>register validates format first, reserves atomically, rolls back the auth user on conflict, stores the normalized username.</done>
</task>

<task type="auto">
  <name>Task 3: Wire loginWithGoogle (D-07) AND loadUserData self-heal (D-06b) to reserveUniqueUsername — atomic siblings</name>
  <files>src/stores/auth.ts</files>
  <read_first>
    - src/stores/auth.ts (loadUserData self-heal else-branch ~69-92; loginWithGoogle ~158-198, new-user branch ~167-182; reserveUniqueUsername from Task 1)
    - .planning/phases/05-username-uniqueness/05-CONTEXT.md (D-07 Google new-user; D-06b loadUserData self-heal — both via the SAME shared helper, Rule 6; fallback user_<uid8> NOT 'Usuario')
    - CLAUDE.md (Rule 1 trace BOTH siblings; Rule 6 atomic; no async onMounted is unrelated here; Rule 7)
  </read_first>
  <behavior>
    - loginWithGoogle !userDoc.exists() branch: derive raw base from displayName/email, call reserveUniqueUsername(uid, rawBase), setDoc /users with the returned reserved username.
    - loadUserData self-heal else-branch (when userDoc does NOT exist): derive raw base from displayName/email, call reserveUniqueUsername(userId, rawBase), set user.value.username = reserved, setDoc /users with the reserved username. The colliding `'Usuario'` literal is removed from the setDoc path.
    - Both paths use reserveUniqueUsername (parallel siblings).
  </behavior>
  <action>
**Sibling A — loginWithGoogle new-user branch** (~167-182). Replace with:
```typescript
            if (!userDoc.exists()) {
                // D-07: derive a base, then reserve a unique username (shared helper).
                /* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- empty string should fallback */
                const rawBase = firebaseUser.displayName?.toLowerCase().replaceAll(/\s+/g, '_').replaceAll(/[^a-z0-9_]/g, '')
                    || firebaseUser.email?.split('@')[0]
                    || 'user';
                /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
                const finalUsername = await reserveUniqueUsername(firebaseUser.uid, rawBase);

                await setDoc(doc(db, 'users', firebaseUser.uid), {
                    email: firebaseUser.email,
                    username: finalUsername,
                    location: '',
                    createdAt: new Date(),
                    avatarUrl: firebaseUser.photoURL ?? null,
                });
            }
```

**Sibling B — loadUserData self-heal else-branch** (~69-92). The current code sets `user.value` from `displayName || email-split || 'Usuario'` then setDocs it. Replace the `'Usuario'` raw derivation + setDoc so the persisted username is reserved. Within the `else { const firebaseUser = auth.currentUser; if (firebaseUser) { ... } }` block:
```typescript
                const firebaseUser = auth.currentUser;
                if (firebaseUser) {
                    // D-06b: self-heal must also reserve a unique, normalized username
                    // (was a raw 'Usuario' write that collided for displayName-less users).
                    /* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- empty string should fallback */
                    const rawBase = firebaseUser.displayName
                        || firebaseUser.email?.split('@')[0]
                        || `user_${userId.slice(0, 8)}`;
                    /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
                    const reservedUsername = await reserveUniqueUsername(userId, rawBase);

                    user.value = {
                        id: userId,
                        email: firebaseUser.email ?? '',
                        username: reservedUsername,
                        location: '',
                        createdAt: new Date(),
                    };

                    try {
                        await setDoc(doc(db, 'users', userId), {
                            email: user.value.email,
                            username: reservedUsername,
                            location: user.value.location,
                            createdAt: new Date(),
                        });
                    } catch {
                        toastStore.show(t('auth.messages.saveUserError'), 'error');
                    }
                }
```
Leave the OUTER `catch` block of loadUserData (~95-105) — which sets a transient `user.value` WITHOUT a setDoc — as-is; it does not write a /users doc, so it is not a creation path (no reservation needed there). Only the self-heal else-branch writes.

Run `npm run test:unit` (full suite) and `npx vite build`.

Commit: `feat(05-03a): loginWithGoogle + loadUserData self-heal reserve unique usernames via shared helper`
  </action>
  <verify>
    <automated>grep -n "reserveUniqueUsername" src/stores/auth.ts && grep -c "'Usuario'" src/stores/auth.ts && npm run test:unit 2>&1 | tail -5 && npx vite build 2>&1 | tail -6</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "reserveUniqueUsername(" src/stores/auth.ts` returns at least 3 (declaration + loginWithGoogle + loadUserData calls)
    - `grep -F "const finalUsername = await reserveUniqueUsername(firebaseUser.uid, rawBase)" src/stores/auth.ts` returns 1
    - `grep -F "const reservedUsername = await reserveUniqueUsername(userId, rawBase)" src/stores/auth.ts` returns 1
    - The self-heal setDoc no longer writes a raw 'Usuario': `grep -A20 "self-heal must also reserve" src/stores/auth.ts | grep -c "'Usuario'"` returns 0
    - `grep -c "username: finalUsername," src/stores/auth.ts` returns 1
    - `grep -c "username: reservedUsername," src/stores/auth.ts` returns 1
    - `npm run test:unit` exits 0
    - `npx vite build` exits 0
  </acceptance_criteria>
  <done>Both the Google new-user branch and the loadUserData self-heal branch reserve a unique normalized username via the shared helper; the colliding 'Usuario' write is gone; tests + build green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Registration form → register() | User-typed username/email/password; validated client-side then crosses to Firebase Auth + Firestore |
| Google OAuth → loginWithGoogle() | displayName/email from Google; used to derive a username reserved via rules |
| Auth state → loadUserData() self-heal | An authenticated session with no /users doc triggers a server-side-derived username write |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-05-03a-01 | Tampering | register stores attacker-chosen non-normalized username | mitigate | persisted as normalizeUsername(username); validated by isValidUsername (anchored \w{3,20}) before any write |
| T-05-03a-02 | Repudiation/Orphan | deleteUser rollback fails leaving an auth user with no /users doc | accept | Rare edge (code_context risk flag). The self-heal path (loadUserData, D-06b) now reserves a unique normalized username on next load, so the recovery write is ALSO safe and reserved — no unreserved/colliding doc is ever created. User simply retries login. No security impact. |
| T-05-03a-03 | Elevation of Privilege | a path reserves a username for a uid it does not own | mitigate | reserveUsername/reserveUniqueUsername pass the authenticated uid (userCredential.user.uid / firebaseUser.uid / userId); Firestore create rule (Plan 02) enforces uid == request.auth.uid |
| T-05-03a-04 | Denial of Service | reserveUniqueUsername never converges | mitigate | Bounded: 8 suffix + 8 random attempts, then a guaranteed-unique user_<uid8> fallback that is itself reserved; \w-only candidates |
| T-05-03a-05 | Spoofing/Collision | displayName-less users all collide on 'Usuario' | mitigate | 'Usuario' literal removed from the self-heal write; fallback is uid-derived (user_<uid8>), unique per account |
</threat_model>

<verification>
1. `grep -c "reserveUniqueUsername(" src/stores/auth.ts` returns ≥ 3 (helper + 2 sibling callers)
2. `grep -F "deleteUser(userCredential.user)" src/stores/auth.ts` returns 1 (register rollback)
3. self-heal setDoc has no 'Usuario': `grep -A20 "self-heal must also reserve" src/stores/auth.ts | grep -c "'Usuario'"` returns 0
4. register body contains no checkUsernameAvailable call
5. `npm run test:unit` exits 0
6. `npx vite build` exits 0
</verification>

<success_criteria>
- All three CREATE paths (register, loginWithGoogle new-user, loadUserData self-heal) route through atomic reservation + normalization (Rule 6)
- loginWithGoogle and loadUserData share ONE reserveUniqueUsername helper (parallel siblings)
- register validates format → reserves → rollback on conflict → stores normalized username
- No 'Usuario' collision write remains; fallback is uid-derived
- Full unit suite + build green
</success_criteria>

<output>
After completion, create `.planning/phases/05-username-uniqueness/05-03a-SUMMARY.md` documenting:
- reserveUniqueUsername signature + the two siblings that call it
- register's new behavior + imports added (deleteUser, normalizeUsername, isValidUsername)
- The loadUserData self-heal change (removal of raw 'Usuario'; uid-derived fallback)
- Confirmation register no longer pre-checks via checkUsernameAvailable
- Note for Plan 03b: changeUsername/checkUsernameAvailable/i18n remain; stored usernames are now normalized
- Commit hashes
</output>
