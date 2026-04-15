---
phase: 02-dashboardview-decomposition
plan: C
type: execute
wave: 3
depends_on:
  - A
  - B
files_modified:
  - src/views/SavedMatchesView.vue
  - src/views/DashboardView.vue
  - src/composables/useDashboardMatches.ts
  - tests/unit/composables/useDashboardMatches.test.ts
  - src/router/index.ts
  - CLAUDE.md
autonomous: true
requirements:
  - ARCH-01
  - ARCH-04

must_haves:
  truths:
    - "SavedMatchesView imports groupMatchesByUser from ../utils/matchGrouping and deletes the inline copy at lines 406-444 (preserves Plan 02-A artifact)."
    - "SavedMatchesView imports getTotalUserCount from ../services/stats and replaces the inline getDocs(collection(db, 'users')) + docs.length-1 block at lines 720-722 with await loadTotalUsers() or equivalent inline await getTotalUserCount() - 1 call."
    - "SavedMatchesView calls matchesStore.loadDiscardedUserIds() instead of the inline loadDiscardedMatches at lines 201-220; the inline function is deleted. The local discardedMatchIds ref remains; its populator changes to: discardedMatchIds.value = await matchesStore.loadDiscardedUserIds() (preserves error-fallback semantics via the store method — empty Set on error)."
    - "SavedMatchesView calls matchesStore.persistCalculatedMatches(foundMatches) instead of the inline saveMatchesToFirebase at lines 583-641; the inline function is deleted. Behavior preserved: the store method has the identical 4-step sequence with _notificationOf preservation and per-match try/catch around notifyMatchUser (verified identical in drift analysis)."
    - "SavedMatchesView calls matchesStore.discardCalculatedMatch(match) instead of the inline discardMatchToFirestore at lines 222-252; the inline function is deleted. The caller (handleDiscardMatch, line ~650) then mutates discardedMatchIds.value.add(match.otherUserId) locally — preserves the existing behavior where the ref-mutation happened inside discardMatchToFirestore."
    - "SavedMatchesView's inline calculateMatches at lines 446-579 is NOT migrated to the composable. It stays inline but now consumes the imported helpers (groupMatchesByUser, matchesStore.persistCalculatedMatches). The `as unknown as 'VENDO'` type-coercion cast at line 554 is preserved verbatim — known tech debt (SimpleMatch.type is 3-valued but the value here is 'BIDIRECTIONAL' | 'UNIDIRECTIONAL')."
    - "handleDiscardMatch (line ~650) dual-path logic is preserved: if matchId matches a calculated match, use discardCalculatedMatch path; otherwise matchesStore.discardMatch(matchId, tab). This is SavedMatchesView-specific behavior not in the composable."
    - "handleSaveMatch (line ~645) still calls matchesStore.saveMatch(match) then loadSavedMatchesWithEmails() — unchanged."
    - "Blocked-users inline code in SavedMatchesView (BlockedUser interface line 59, blockedUsers ref line 66, loadBlockedUsers/unblockUser/handleBlockByUsername/openBlockedUsersModal + BaseModal template) stays UNCHANGED in this plan — out of scope; flagged as tech debt for future phase."
    - "DashboardView.vue is DELETED (unrouted dead code per router/index.ts:43-45 /dashboard → /saved-matches redirect since commit 212488f on 2026-02-09)."
    - "useDashboardMatches composable and its test file are DELETED (orphaned after this migration — no view consumes it). The Plan 02-B store methods (loadDiscardedUserIds, persistCalculatedMatches, discardCalculatedMatch) and services (stats.ts, publicCards.ts searchPublicCards) REMAIN because SavedMatchesView now consumes them."
    - "The /dashboard redirect in router/index.ts:43-45 is PRESERVED (removing it would break any external bookmarks). DashboardView.vue file deletion is orthogonal to the route definition."
    - "CLAUDE.md references to DashboardView (lines 346, 381) are updated to reflect deletion — SavedMatchesView is the sole match-calculation host."
  artifacts:
    - path: "src/views/SavedMatchesView.vue"
      provides: "Live match-calculation view wired to matchesStore methods + utility helpers (no inline Firestore wrappers)"
    - path: "src/views/DashboardView.vue"
      provides: "DELETED — dead code since 2026-02-09"
    - path: "src/composables/useDashboardMatches.ts"
      provides: "DELETED — orphaned after migration"
    - path: "tests/unit/composables/useDashboardMatches.test.ts"
      provides: "DELETED — orphaned after composable deletion"
  key_links:
    - from: "src/views/SavedMatchesView.vue"
      to: "src/utils/matchGrouping.ts groupMatchesByUser"
      via: "import { groupMatchesByUser } from '../utils/matchGrouping'"
    - from: "src/views/SavedMatchesView.vue"
      to: "src/services/stats.ts getTotalUserCount"
      via: "import { getTotalUserCount } from '../services/stats'"
    - from: "src/views/SavedMatchesView.vue"
      to: "src/stores/matches.ts loadDiscardedUserIds + persistCalculatedMatches + discardCalculatedMatch"
      via: "matchesStore.loadDiscardedUserIds() / matchesStore.persistCalculatedMatches(found) / matchesStore.discardCalculatedMatch(m)"
    - from: "router/index.ts /dashboard"
      to: "/saved-matches"
      via: "redirect preserved — no DashboardView.vue reference after deletion"
---

<objective>
Pivot Phase 02 to its real scope: migrate the LIVE view (SavedMatchesView.vue, ~1030 lines, mounted at `/saved-matches`) to consume the helpers, services, and store methods extracted by Plans 02-A and 02-B. Delete DashboardView.vue (unrouted dead code since 2026-02-09) and the now-orphaned `useDashboardMatches` composable.

**Purpose:** Phase 02's original premise — "decompose DashboardView.vue" — was misaimed. `/dashboard` redirects to `/saved-matches` (router/index.ts:43-45); DashboardView is never rendered. The match pipeline LIVES inline in SavedMatchesView. Plans 02-A (utils) and 02-B (composable + store methods + services) produced legitimately useful infrastructure — this plan puts that infrastructure to work on the live view and deletes the orphans.

**Behavior preservation:** SavedMatchesView.vue's user-facing behavior MUST NOT change. Same tabs, same recalculate button, same save/discard handlers, same blocked-users modal. Only the implementation of three inline Firestore wrappers (`loadDiscardedMatches`, `saveMatchesToFirebase`, `discardMatchToFirestore`) and two pure helpers (`groupMatchesByUser`, inline user-count getDocs) is replaced by calls to the extracted infrastructure. The drift analysis confirmed the inline versions are logically identical to the extracted versions — migration is behavior-neutral.

**Scope discipline:** SavedMatchesView's inline `calculateMatches` at lines 446-579 STAYS INLINE. Migrating it to `useDashboardMatches.calculateMatches` would require widening `MatchCard`'s `match: SimpleMatch` prop to accept `CalculatedMatch`, or widening `SimpleMatch.type` to 4-valued — both out of scope. Composable is therefore orphaned and deleted. Blocked-users inline code stays UNCHANGED — out of scope, flagged as tech debt.

**Output:** SavedMatchesView trimmed by ~160 lines; 3 inline functions replaced by imports; 2 dead files (DashboardView.vue + useDashboardMatches.ts + composable test) removed; CLAUDE.md updated.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/02-dashboardview-decomposition/02-A-SUMMARY.md
@.planning/phases/02-dashboardview-decomposition/02-B-SUMMARY.md
@CLAUDE.md

<drift_analysis_evidence>
The SavedMatchesView drift investigation (2026-04-15) confirmed line-by-line:
- `saveMatchesToFirebase` (SavedMatchesView:583) IS logically identical to `matchesStore.persistCalculatedMatches` — same 4-step sequence, same `_notificationOf` filter (line 593), same per-match try/catch around `notifyMatchUser`.
- `discardMatchToFirestore` (SavedMatchesView:222) IS logically identical to `matchesStore.discardCalculatedMatch` — same sequential two-step, same deletion predicate `data.id === match.id || data.otherUserId === match.otherUserId`. ONE drift: SavedMatchesView mutates `discardedMatchIds.value.add(match.otherUserId)` INSIDE the function (line 239); the store method does NOT. Caller must perform this mutation after the store call to preserve behavior.
- `groupMatchesByUser` (SavedMatchesView:406) is ZERO drift from `src/utils/matchGrouping.ts`.
- `loadDiscardedMatches` (SavedMatchesView:201-220) is ZERO drift from `matchesStore.loadDiscardedUserIds` (which the store method was explicitly a verbatim port of).
- Inline user-count block at SavedMatchesView:720-722 is a verbatim inline of `getDocs(collection(db, 'users')).docs.length - 1` — `services/stats.ts:getTotalUserCount()` returns the unclamped count (we subtract 1 at call site).
</drift_analysis_evidence>

<key_invariants>
- SavedMatchesView is a Pinia-store-heavy view. The store methods on `useMatchesStore` live in `src/stores/matches.ts:566-742` (added by Plan 02-B). Their implementations have Amendment A-M protections already baked in.
- `matches_nuevos`, `matches_guardados`, `matches_eliminados` Firestore paths are used by both DashboardView (dead) and SavedMatchesView (live). After this plan only SavedMatchesView + the store methods reference them.
- The `/dashboard` redirect in router/index.ts:43 STAYS — removing it is risky (external bookmarks, Plan A's skip-nav, notFound fallback in UserProfileView line 485 `<RouterLink to="/dashboard">` rides the redirect). Only the DashboardView.vue file itself is deleted.
- `UserProfileView.vue:485` has `<RouterLink to="/dashboard">` inside the not-found fallback. After deletion that link still works (redirects). Do NOT change this.
- The `useGlobalSearch.ts` composable (Plan 02-A touched it) and `SearchView.vue` (consumes `buildOwnedCountMap`) reference `src/utils/` artifacts — those stay.
</key_invariants>
</context>

<tasks>

<task type="auto">
  <name>Task 1: SavedMatchesView Slice A — swap pure helpers (groupMatchesByUser + getTotalUserCount)</name>
  <files>src/views/SavedMatchesView.vue</files>
  <action>
Anti-loop Rule 1: read `src/views/SavedMatchesView.vue` in full (1030 lines) before editing. Confirm the exact line numbers below by grep — drift analysis was run on HEAD 2526daf; minor offsets possible.

**Atomic edit list (save once at end):**

1. **Add imports** at the top of `<script setup>` (grouped with existing `../utils/` and `../services/` imports, alphabetically sorted per lint rule):
   ```typescript
   import { getTotalUserCount } from '../services/stats'
   import { groupMatchesByUser } from '../utils/matchGrouping'
   ```

2. **Delete the inline `groupMatchesByUser` function** (current lines ~406-444). The util export has an identical signature and return shape (verified by drift analysis).

3. **Replace the inline user-count block** inside `onMounted` (current lines ~720-722):
   ```typescript
   // BEFORE:
   const usersRef = collection(db, 'users')
   const usersSnapshot = await getDocs(usersRef)
   totalUsers.value = usersSnapshot.docs.length - 1 // Excluir al usuario actual

   // AFTER:
   totalUsers.value = Math.max(0, (await getTotalUserCount()) - 1) // Excluir al usuario actual
   ```
   Note `Math.max(0, ...)` clamp — `getTotalUserCount` fails-closed to 0 (Plan B Amendment A); clamping avoids negative totalUsers.

4. **Remove the now-unused `collection` / `getDocs` imports** IF they're no longer referenced in SavedMatchesView (verify via grep — other Firestore calls may still use them; don't remove unused imports that ARE used). The `collection` import is likely still needed for blocked-users inline code.
  </action>
  <verify>
    <automated>
npm run test:unit && npx vue-tsc --noEmit && npx vite build 2>&1 | tail -10

# Post-edit greps:
grep -n "const groupMatchesByUser" src/views/SavedMatchesView.vue  # must be 0 (inline deleted)
grep -n "from '../utils/matchGrouping'" src/views/SavedMatchesView.vue  # must be 1 (import added)
grep -n "from '../services/stats'" src/views/SavedMatchesView.vue  # must be 1
grep -n "getDocs(usersRef)\|collection(db, 'users')" src/views/SavedMatchesView.vue  # must be 0 for the user-count use
    </automated>
  </verify>
  <done>SavedMatchesView imports groupMatchesByUser + getTotalUserCount. Inline groupMatchesByUser deleted. User-count block replaced by service call. Type-check clean, build succeeds, tests pass (547+ unchanged).</done>
</task>

<task type="auto">
  <name>Task 2: SavedMatchesView Slice B — swap Firestore wrappers (loadDiscardedUserIds, persistCalculatedMatches, discardCalculatedMatch)</name>
  <files>src/views/SavedMatchesView.vue</files>
  <action>
Anti-loop Rule 1: re-read SavedMatchesView.vue post-Task-1 to confirm line numbers.

**Atomic edit list:**

1. **Replace `loadDiscardedMatches`** (current lines ~201-220). Delete the inline function. At its only call site in `onMounted` (current line ~705), replace:
   ```typescript
   await loadDiscardedMatches()
   ```
   with:
   ```typescript
   discardedMatchIds.value = await matchesStore.loadDiscardedUserIds()
   ```
   The `discardedMatchIds` local ref (line ~56) STAYS. The store method's internal try/catch returns an empty Set on Firestore error — matching the inline version's fallback behavior.

2. **Replace `saveMatchesToFirebase` call** inside `calculateMatches` (current line ~569):
   ```typescript
   // BEFORE:
   await saveMatchesToFirebase(foundMatches)

   // AFTER:
   await matchesStore.persistCalculatedMatches(foundMatches)
   ```
   Then **delete the inline `saveMatchesToFirebase` function** (current lines ~583-641). Behavior is identical (drift analysis verified the 4-step sequence + `_notificationOf` filter + per-match try/catch).

3. **Replace `discardMatchToFirestore` call** inside `handleDiscardMatch` (current line ~654):
   ```typescript
   // BEFORE:
   await discardMatchToFirestore(calcMatch)

   // AFTER:
   await matchesStore.discardCalculatedMatch(calcMatch)
   discardedMatchIds.value.add(calcMatch.otherUserId) // preserve mutation that was inline in the deleted function
   ```
   **The explicit `discardedMatchIds.value.add(...)` AT THE CALL SITE is load-bearing.** The inline function mutated this ref at line 239; the store method does not. Without this line, discarded users re-surface on recalculate.
   Then **delete the inline `discardMatchToFirestore` function** (current lines ~222-252).

4. **Remove now-unused imports** if any (verify via grep — `addDoc`, `deleteDoc`, `doc`, `Timestamp`, `getMatchExpirationDate`, `notifyMatchUser` may be reducible; verify each is still used by remaining code before removing). Alphabetical-sort the import block per lint rule.
  </action>
  <verify>
    <automated>
npm run test:unit && npx vue-tsc --noEmit && npx vite build 2>&1 | tail -10

# Post-edit greps:
grep -n "const loadDiscardedMatches\|const saveMatchesToFirebase\|const discardMatchToFirestore" src/views/SavedMatchesView.vue  # must be 0 defs
grep -n "matchesStore.loadDiscardedUserIds\|matchesStore.persistCalculatedMatches\|matchesStore.discardCalculatedMatch" src/views/SavedMatchesView.vue  # must be 3+ call sites
grep -n "discardedMatchIds.value.add(calcMatch.otherUserId)" src/views/SavedMatchesView.vue  # must be ≥1 (preserves the ref mutation)
    </automated>
  </verify>
  <done>SavedMatchesView no longer defines any of the 3 inline Firestore wrappers. All 3 call sites use matchesStore methods. The load-bearing `discardedMatchIds.value.add(calcMatch.otherUserId)` mutation is preserved at the call site. Tests + type-check + build all pass.</done>
</task>

<task type="auto">
  <name>Task 3: Delete dead code — DashboardView.vue, useDashboardMatches composable + test, update CLAUDE.md</name>
  <files>
    src/views/DashboardView.vue,
    src/composables/useDashboardMatches.ts,
    tests/unit/composables/useDashboardMatches.test.ts,
    CLAUDE.md
  </files>
  <action>
Anti-loop Rule 1: grep-confirm zero imports before deletion.

**Pre-deletion audit (executor MUST run these):**
```bash
grep -rn "DashboardView\b" src/ tests/ e2e/ 2>&1 | grep -v "// " | grep -v "/\*"  # should be empty or only historical docstrings
grep -rn "useDashboardMatches" src/ tests/ e2e/ 2>&1 | grep -v "^src/composables/useDashboardMatches\|^tests/unit/composables/useDashboardMatches"
grep -rn "from '../views/DashboardView'" src/ 2>&1  # must be empty
```
If any grep returns unexpected imports, STOP and ask user — there's a live consumer.

**Deletions:**

1. `rm src/views/DashboardView.vue` — dead code since 2026-02-09 (commit 212488f added /dashboard redirect).

2. `rm src/composables/useDashboardMatches.ts` — orphaned after SavedMatchesView migration (no consumer).

3. `rm tests/unit/composables/useDashboardMatches.test.ts` — orphan tests.

4. **Do NOT touch `router/index.ts:43-45`** — the `/dashboard` → `/saved-matches` redirect STAYS (external bookmarks, UserProfileView:485 `<RouterLink to="/dashboard">` depends on it).

5. **CLAUDE.md updates**:
   - Line 346: change `"e.g., BlockedUsersModal in SavedMatchesView AND DashboardView"` to `"e.g., blocked-users inline logic exists in SavedMatchesView — DashboardView was deleted in Phase 02-C"`.
   - Line 381: change `"SavedMatchesView ↔ DashboardView (BlockedUsersModal)"` to `"SavedMatchesView (blocked-users inline — consolidation tech debt noted in Phase 02-C SUMMARY)"`.
   - Add a new entry under Files Often Modified Together (or an equivalent section): `"SavedMatchesView ↔ utils/matchGrouping, services/stats, stores/matches (match-calculation pipeline — Plan 02-C wired SavedMatchesView to extracted infrastructure)"`.

**Reduced test count expected:**
- Plan B added 13 tests (6 composable + 7 store). Deleting the composable file deletes 6 tests → 547 - 6 = 541.
- Store tests for persistCalculatedMatches / discardCalculatedMatch / loadDiscardedUserIds STAY — they now cover the live code path SavedMatchesView uses.
  </action>
  <verify>
    <automated>
# Pre-deletion audit (MUST return empty/only docstrings):
grep -rn "import.*DashboardView\|from.*DashboardView" src/ tests/ e2e/ 2>&1

# Post-deletion:
test ! -f src/views/DashboardView.vue && echo "DashboardView deleted" || echo "STILL EXISTS"
test ! -f src/composables/useDashboardMatches.ts && echo "Composable deleted" || echo "STILL EXISTS"
test ! -f tests/unit/composables/useDashboardMatches.test.ts && echo "Test deleted" || echo "STILL EXISTS"

# CLAUDE.md grep:
grep -n "DashboardView" CLAUDE.md  # all remaining occurrences must be historical / context only — no instructions referencing it as live

# Standard gate:
npm run test:unit && npx vue-tsc --noEmit && npx vite build 2>&1 | tail -10
# Expected: 541 tests passing (6 fewer after composable test deletion), type-check clean, build succeeds.
    </automated>
  </verify>
  <done>Three files deleted. CLAUDE.md updated to reflect new reality. No imports broken. Tests pass at new count. The /dashboard redirect still works (tested by visiting /dashboard in dev → lands on /saved-matches).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User auth (authStore.user) → SavedMatchesView match ops | SavedMatchesView gates the entire view on `if (!authStore.user) return` in onMounted (line 702). Match ops inherit this gate. |
| matchesStore methods | Same gate (store methods early-return on missing auth). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02C-01 | Tampering | discardedMatchIds ref mutation moving from inline fn to call site | mitigate | Explicit `discardedMatchIds.value.add(calcMatch.otherUserId)` in handleDiscardMatch — unit-testable behavior preserved. Drift analysis + must_haves truth make this load-bearing. |
| T-02C-02 | Denial of Service | getTotalUserCount fail-closed changes semantics (was: throws; now: returns 0 → totalUsers clamped to 0) | accept | Net improvement — previously an unhandled getDocs rejection would leave `loading.value = true` permanently. Now it's graceful. |
| T-02C-03 | Information Disclosure | DashboardView.vue deletion exposes no data (file never rendered) | accept | N/A |
| T-02C-04 | Repudiation | `/dashboard` redirect preserved — bookmark behavior stable | accept | Router unchanged. |
</threat_model>

<verification>
After all three tasks complete:

1. `npm run test:unit` — 541 tests passing (547 - 6 from composable test deletion; 0 new failures)
2. `npx vue-tsc --noEmit` — 0 errors
3. `npx vite build` — succeeds
4. **Migration audit greps:**
   - `grep -n "const groupMatchesByUser\|const loadDiscardedMatches\|const saveMatchesToFirebase\|const discardMatchToFirestore" src/views/SavedMatchesView.vue` → 0 matches
   - `grep -n "matchesStore.persistCalculatedMatches\|matchesStore.discardCalculatedMatch\|matchesStore.loadDiscardedUserIds" src/views/SavedMatchesView.vue` → 3+ call sites
   - `grep -rn "DashboardView" src/ tests/ e2e/` — only historical docstrings, no imports
5. **Line count:** SavedMatchesView is approximately -160 lines (~1030 → ~870).
6. **Manual smoke on dev** (user or orchestrator):
   - Login → /saved-matches → matches render with progress
   - Recalculate → matches update, matches_nuevos cleaned, matches_nuevos docs with `_notificationOf` preserved (check Firestore console)
   - Save a match → appears in the "Saved" tab
   - Discard a match → removes from list, does NOT reappear after recalculate (tests `discardedMatchIds.value.add` at the call site)
   - Visit /dashboard → redirects to /saved-matches (unchanged)
7. **E2E suite:** existing `e2e/specs/matches/*` suite should pass unchanged. They already target `/saved-matches`.
</verification>

<success_criteria>
- SavedMatchesView no longer defines groupMatchesByUser, loadDiscardedMatches, saveMatchesToFirebase, or discardMatchToFirestore inline.
- SavedMatchesView imports from utils/matchGrouping, services/stats, stores/matches for these responsibilities.
- The load-bearing `discardedMatchIds.value.add(calcMatch.otherUserId)` mutation is preserved at the call site after `matchesStore.discardCalculatedMatch`.
- DashboardView.vue file deleted; `/dashboard` redirect in router still works.
- useDashboardMatches composable + its test file deleted.
- CLAUDE.md updated (no stale DashboardView references in parallel-sibling guidance).
- All tests pass (541); type-check clean; build succeeds.
- Manual smoke on dev confirms identical user-facing behavior.
</success_criteria>
