---
phase: 05-username-uniqueness
plan: 03b
type: execute
wave: 3
depends_on:
  - "05-01"
  - "05-02"
  - "05-03a"
files_modified:
  - src/stores/auth.ts
  - src/locales/en.json
  - src/locales/es.json
  - src/locales/pt.json
requirements:
  - UNIQ-03
requirements_addressed:
  - UNIQ-03
must_haves:
  truths:
    - "changeUsername() reserves the new username BEFORE releasing the old one (no name loss on failure)"
    - "changeUsername() rolls back the new reservation (releaseUsername) if the updateDoc throws"
    - "checkUsernameAvailable() checks the /usernames index first, falling back to the legacy query"
    - "auth.messages.usernameInvalidFormat exists in en.json, es.json, AND pt.json with the ASCII '3-20' string"
  artifacts:
    - path: "src/stores/auth.ts"
      provides: "changeUsername reserve-new→release-old + index-aware checkUsernameAvailable"
      contains: "reserveUsername, releaseUsername, getDoc(doc(db, 'usernames'"
    - path: "src/locales/en.json"
      provides: "auth.messages.usernameInvalidFormat (en, ASCII 3-20)"
      contains: "usernameInvalidFormat"
    - path: "src/locales/es.json"
      provides: "auth.messages.usernameInvalidFormat (es, ASCII 3-20)"
      contains: "usernameInvalidFormat"
    - path: "src/locales/pt.json"
      provides: "auth.messages.usernameInvalidFormat (pt, ASCII 3-20)"
      contains: "usernameInvalidFormat"
  key_links:
    - from: "changeUsername"
      to: "reserveUsername(new) before releaseUsername(old)"
      via: "reserve-new-then-release-old ordering"
      pattern: "releaseUsername\\("
    - from: "checkUsernameAvailable"
      to: "/usernames index read"
      via: "getDoc(doc(db,'usernames',norm))"
      pattern: "getDoc\\(doc\\(db, ?'usernames'"
---

<objective>
Finish UNIQ-03 by wiring the update-only path and the UX pre-check: `changeUsername` with reserve-new-before-release-old + rollback (D-08), `checkUsernameAvailable` made index-aware (D-13), and the `auth.messages.usernameInvalidFormat` key in all three locales using ASCII `3-20` (D-18, CLAUDE.md Rule 3). This plan depends on 03a because both edit `src/stores/auth.ts` (sequential, no file conflict in the same wave).

Purpose: `changeUsername` already stored lowercase but had a non-atomic availability check; reserve-first ordering guarantees the username is never lost if the update fails (D-08). `checkUsernameAvailable` stays a fast UX pre-check (the reservation in 03a is the real guarantee) but must consult the new index. The i18n string supports register's new format-validation toast (added in 03a).

Output: modified `src/stores/auth.ts` (changeUsername + checkUsernameAvailable); `usernameInvalidFormat` in en/es/pt.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/05-username-uniqueness/05-CONTEXT.md
@CLAUDE.md
@src/stores/auth.ts
@src/locales/en.json
@.planning/phases/05-username-uniqueness/05-02-PLAN.md
@.planning/phases/05-username-uniqueness/05-03a-PLAN.md

<interfaces>
<!-- From Plan 01: normalizeUsername (imported into auth.ts by 03a). -->
<!-- From Plan 02: reserveUsername / releaseUsername (in the store). -->
<!-- changeUsername ~393-442; checkUsernameAvailable ~312-340. -->
<!-- i18n: auth.messages.usernameTaken is the LAST key in auth.messages (en/es/pt line 221).
     Adding usernameInvalidFormat requires a trailing comma after usernameTaken.
     ASCII '3-20' (NOT en-dash) per D-18:
       en: "Username must be 3-20 letters, numbers, or underscores"
       es: "El nombre de usuario debe tener 3-20 letras, números o guiones bajos"
       pt: "O nome de usuário deve ter 3-20 letras, números ou sublinhados" -->
<!-- settings.changeUsername.* keys already exist (invalidFormat en.json:1394; taken/success/error/rateLimited under :1388) — reuse, do NOT add. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add auth.messages.usernameInvalidFormat to en/es/pt (ASCII 3-20, atomic all 3)</name>
  <files>src/locales/en.json, src/locales/es.json, src/locales/pt.json</files>
  <read_first>
    - src/locales/en.json (auth.messages object; usernameTaken last key line 221)
    - src/locales/es.json (usernameTaken line 221)
    - src/locales/pt.json (usernameTaken line 221)
    - .planning/phases/05-username-uniqueness/05-CONTEXT.md (D-18 — ASCII hyphen 3-20, exact strings)
    - CLAUDE.md (Rule 3 — all 3 locales atomically)
  </read_first>
  <behavior>
    - en.json auth.messages.usernameInvalidFormat === "Username must be 3-20 letters, numbers, or underscores" (ASCII hyphen)
    - es.json === "El nombre de usuario debe tener 3-20 letras, números o guiones bajos" (ASCII hyphen)
    - pt.json === "O nome de usuário deve ter 3-20 letras, números ou sublinhados" (ASCII hyphen)
    - usernameTaken gets a trailing comma; new key on the next line; all JSON valid.
  </behavior>
  <action>
In EACH locale file, add the new key after the existing `usernameTaken` (line ~221). USE THE ASCII HYPHEN `3-20`, NOT an en-dash, so the action text and the acceptance greps match byte-for-byte.

en.json:
```json
      "usernameTaken": "This username is already taken. Please choose another.",
      "usernameInvalidFormat": "Username must be 3-20 letters, numbers, or underscores"
```

es.json:
```json
      "usernameTaken": "Este username ya está en uso. Elige otro.",
      "usernameInvalidFormat": "El nombre de usuario debe tener 3-20 letras, números o guiones bajos"
```

pt.json:
```json
      "usernameTaken": "Este username já está em uso. Escolha outro.",
      "usernameInvalidFormat": "O nome de usuário deve ter 3-20 letras, números ou sublinhados"
```

Do NOT touch any other key. Each file must remain valid JSON.

Commit: `feat(05-03b): add auth.messages.usernameInvalidFormat to en/es/pt (ASCII 3-20)`
  </action>
  <verify>
    <automated>grep -c "usernameInvalidFormat" src/locales/en.json src/locales/es.json src/locales/pt.json && node -e "require('./src/locales/en.json');require('./src/locales/es.json');require('./src/locales/pt.json');console.log('json ok')"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "usernameInvalidFormat" src/locales/en.json` returns 1
    - `grep -c "usernameInvalidFormat" src/locales/es.json` returns 1
    - `grep -c "usernameInvalidFormat" src/locales/pt.json` returns 1
    - `grep -F "Username must be 3-20 letters, numbers, or underscores" src/locales/en.json` returns 1 (ASCII hyphen)
    - `grep -F "El nombre de usuario debe tener 3-20 letras" src/locales/es.json` returns 1 (ASCII hyphen)
    - `grep -F "O nome de usuário deve ter 3-20 letras" src/locales/pt.json` returns 1 (ASCII hyphen)
    - `node -e "require('./src/locales/en.json');require('./src/locales/es.json');require('./src/locales/pt.json')"` exits 0
  </acceptance_criteria>
  <done>usernameInvalidFormat present in all three locales with the D-18 ASCII-hyphen strings; all JSON valid.</done>
</task>

<task type="auto">
  <name>Task 2: Wire changeUsername() — reserve-new-before-release-old (D-08)</name>
  <files>src/stores/auth.ts</files>
  <read_first>
    - src/stores/auth.ts (changeUsername ~393-442; reserveUsername/releaseUsername; normalizeUsername imported by 03a)
    - .planning/phases/05-username-uniqueness/05-CONTEXT.md (D-08 exact 5-step sequence; risk flag: reserve-new-before-release-old)
    - CLAUDE.md (Rule 1; Rule 7)
  </read_first>
  <behavior>
    - Early guards (not authenticated, format regex, rate-limit) UNCHANGED.
    - newNorm = normalizeUsername(newUsername); oldNorm = normalizeUsername(user.value.username).
    - reserveUsername(uid, newNorm) FIRST; if false → suggestions + taken toast, abort (no mutation).
    - On success: updateDoc /users/{uid} { username: newNorm, lastUsernameChange }; update local state; releaseUsername(oldNorm) if old != new.
    - If updateDoc throws after reserve → releaseUsername(newNorm); return failure.
  </behavior>
  <action>
Keep the early-return guards UNCHANGED. Replace the availability + write section (current ~414-441, starting at `// Check availability`) with:
```typescript
        // D-08: reserve the NEW username first (atomic). Fail-safe: abort before any mutation.
        const newNorm = normalizeUsername(newUsername);
        const oldNorm = normalizeUsername(user.value.username);

        const reserved = await reserveUsername(user.value.id, newNorm);
        if (!reserved) {
            const suggestions = await generateUsernameSuggestions(newNorm);
            toastStore.show(t('settings.changeUsername.taken'), 'error');
            return { success: false, suggestions };
        }

        try {
            await updateDoc(doc(db, 'users', user.value.id), {
                username: newNorm,
                lastUsernameChange: new Date()
            });

            user.value.username = newNorm;
            user.value.lastUsernameChange = new Date();

            // Best-effort release of the previous reservation (D-08 step 4).
            if (oldNorm && oldNorm !== newNorm) {
                await releaseUsername(oldNorm);
            }

            toastStore.show(t('settings.changeUsername.success'), 'success');
            return { success: true };
        } catch (error) {
            console.error('Error changing username:', error);
            // D-08 step 5: roll back the new reservation to avoid a dangling entry.
            await releaseUsername(newNorm);
            toastStore.show(t('settings.changeUsername.error'), 'error');
            return { success: false };
        }
```
Reuse existing `settings.changeUsername.*` keys (already present) — do NOT add new settings keys.

Run `npx vite build`.

Commit: `feat(05-03b): changeUsername reserves new before releasing old, rolls back on failure`
  </action>
  <verify>
    <automated>grep -n "const newNorm\|releaseUsername(oldNorm)\|releaseUsername(newNorm)\|reserveUsername(user.value.id, newNorm)" src/stores/auth.ts && npx vite build 2>&1 | tail -8</automated>
  </verify>
  <acceptance_criteria>
    - `grep -F "const newNorm = normalizeUsername(newUsername)" src/stores/auth.ts` returns 1
    - `grep -F "const oldNorm = normalizeUsername(user.value.username)" src/stores/auth.ts` returns 1
    - `grep -F "await reserveUsername(user.value.id, newNorm)" src/stores/auth.ts` returns 1
    - `grep -F "await releaseUsername(oldNorm)" src/stores/auth.ts` returns 1
    - `grep -F "await releaseUsername(newNorm)" src/stores/auth.ts` returns 1 (rollback in catch)
    - reserve precedes updateDoc in the changeUsername body (manual order check)
    - `npx vite build` exits 0
  </acceptance_criteria>
  <done>changeUsername reserves the new username before mutating, releases the old on success, rolls back the new reservation if the update throws.</done>
</task>

<task type="auto">
  <name>Task 3: Upgrade checkUsernameAvailable() to be index-aware (D-13)</name>
  <files>src/stores/auth.ts</files>
  <read_first>
    - src/stores/auth.ts (checkUsernameAvailable ~312-340; normalizeUsername imported by 03a)
    - .planning/phases/05-username-uniqueness/05-CONTEXT.md (D-13 — index-first read, normalize input, legacy fallback)
    - CLAUDE.md (Rule 7)
  </read_first>
  <behavior>
    - Normalize input via normalizeUsername.
    - First read /usernames/{norm}; if it exists → return false (taken).
    - Else fall back to legacy /users where('username','==',norm) query (not-yet-backfilled users).
    - Returns true only if NEITHER finds the name. UX-only pre-check.
  </behavior>
  <action>
Replace the body of `checkUsernameAvailable` (~312-340) with:
```typescript
    const checkUsernameAvailable = async (username: string): Promise<boolean> => {
        try {
            const norm = normalizeUsername(username);

            // D-13: index-first. If a reservation exists, it's taken.
            const indexDoc = await getDoc(doc(db, 'usernames', norm));
            if (indexDoc.exists()) {
                return false;
            }

            // Legacy fallback for users not yet backfilled into the index.
            const usersRef = collection(db, 'users');
            const qLegacy = query(usersRef, where('username', '==', norm));
            const snapshot = await getDocs(qLegacy);
            return snapshot.empty;
        } catch (error) {
            console.error('Error checking username:', error);
            return false;
        }
    };
```
This is a UX pre-check only (D-13) — the atomic guarantee is the reservation (03a). Run `npm run test:unit` (full suite) and `npx vite build`.

Commit: `feat(05-03b): checkUsernameAvailable reads /usernames index first with legacy fallback`
  </action>
  <verify>
    <automated>grep -n "getDoc(doc(db, 'usernames', norm))" src/stores/auth.ts && npm run test:unit 2>&1 | tail -6 && npx vite build 2>&1 | tail -6</automated>
  </verify>
  <acceptance_criteria>
    - `grep -F "getDoc(doc(db, 'usernames', norm))" src/stores/auth.ts` returns 1
    - `grep -A15 "const checkUsernameAvailable" src/stores/auth.ts | grep -c "where('username', '==', norm)"` returns 1 (legacy fallback retained)
    - `npm run test:unit` exits 0 (no regressions)
    - `npx vite build` exits 0
  </acceptance_criteria>
  <done>checkUsernameAvailable normalizes input, checks the index first, falls back to the legacy query. Full unit suite + build green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Settings form → changeUsername() | Authenticated user-typed new username crosses to the index + /users doc |
| Registration form → checkUsernameAvailable() | Username typed for the UX availability hint (pre-submit) reads the index |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-05-03b-01 | Tampering | changeUsername loses the username on a mid-flight failure | mitigate | reserve-new-before-release-old (D-08); updateDoc failure releases the NEW reservation, old reservation untouched until update succeeds |
| T-05-03b-02 | Spoofing | changeUsername reserves a username for another uid | mitigate | reserveUsername passes user.value.id; Firestore create rule (Plan 02) enforces uid == request.auth.uid |
| T-05-03b-03 | Information Disclosure | checkUsernameAvailable confirms a username exists to anonymous callers | accept | Consistent with the public /usernames read (Plan 02 D-02) and public /users profiles; no PII |
| T-05-03b-04 | Information Disclosure | i18n error reveals nothing sensitive | accept | usernameInvalidFormat is a generic format message, no PII |
</threat_model>

<verification>
1. `grep -c "usernameInvalidFormat" src/locales/en.json src/locales/es.json src/locales/pt.json` each return 1 (ASCII 3-20)
2. `grep -F "await releaseUsername(oldNorm)" src/stores/auth.ts` AND `grep -F "await releaseUsername(newNorm)" src/stores/auth.ts` each return 1
3. `grep -F "getDoc(doc(db, 'usernames', norm))" src/stores/auth.ts` returns 1
4. `npm run test:unit` exits 0
5. `npx vite build` exits 0
</verification>

<success_criteria>
- changeUsername: reserve-new → update → release-old, rollback-new on update failure (D-08)
- checkUsernameAvailable: index-first with legacy fallback (UX pre-check only, D-13)
- usernameInvalidFormat present in all 3 locales with ASCII 3-20 (Rule 3, D-18)
- Full unit suite + build green
</success_criteria>

<output>
After completion, create `.planning/phases/05-username-uniqueness/05-03b-SUMMARY.md` documenting:
- changeUsername + checkUsernameAvailable new behavior
- The three i18n strings added (ASCII 3-20) and their location
- Note for Plan 04: stored usernames are normalized lowercase → resolution can rely on normalized lookups
- Commit hashes
</output>
