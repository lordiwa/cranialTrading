---
phase: 02-dashboardview-decomposition
plan: D
type: execute
wave: 4
depends_on:
  - A
  - B
  - C
files_modified:
  - src/views/DashboardView.vue
  - e2e/specs/dashboard-anonymous.spec.ts
  - e2e/specs/dashboard-match-flow.spec.ts
  - e2e/specs/smoke/dashboard-and-profile.spec.ts
  - package.json
autonomous: true
requirements:
  - AXSS-07
  - ARCH-01

must_haves:
  truths:
    - "DashboardView.vue's onMounted callback is NOT async and contains NO await — async work is delegated to a separate initDashboard() function called via `void initDashboard()`"
    - "DashboardView.vue is under 400 lines (Phase 02 success criterion #1)"
    - "DashboardView.vue has zero `from 'firebase/firestore'` imports (Phase 02 success criterion #1)"
    - "An E2E spec exercises anonymous /dashboard load with no console errors and no unhandled promise rejections (regression guard for the production bug noted in MEMORY.md)"
    - "An E2E spec exercises the match flow (login → recalculate → save → discard → reload) to guard Plan B's behavior preservation"
    - "A smoke E2E spec loads /saved-matches and /profile/<self> with no pageerror — regression guard for Plan A blast-radius (UserProfileView, SavedMatchesView)"
    - "package.json version is bumped 1.23.0 → 1.23.1 (PATCH per user Plan-Phase decision #4)"
    - "All previously-passing unit tests still pass; no NEW E2E failures vs the v1.23.0 baseline (5 known failures from MEMORY.md)"
  artifacts:
    - path: "src/views/DashboardView.vue"
      provides: "Final form: thin orchestrator < 400 lines, sync onMounted with void initDashboard"
    - path: "e2e/specs/dashboard-anonymous.spec.ts"
      provides: "Regression guard: anonymous user can hit /dashboard without async-onMounted profile-load breakage"
    - path: "e2e/specs/dashboard-match-flow.spec.ts"
      provides: "Regression guard: full match calculate / save / discard / reload flow"
    - path: "e2e/specs/smoke/dashboard-and-profile.spec.ts"
      provides: "Smoke regression guard: SavedMatchesView and UserProfileView mount cleanly after Plan A MATCH_LIFETIME_DAYS centralization"
    - path: "package.json"
      provides: "Version 1.23.1"
  key_links:
    - from: "DashboardView.vue onMounted callback"
      to: "initDashboard async function"
      via: "void initDashboard() — fire-and-forget, no await in the lifecycle hook itself"
    - from: "e2e/specs/dashboard-anonymous.spec.ts"
      to: "src/views/DashboardView.vue runtime behavior"
      via: "Playwright loads /dashboard without auth and asserts no console errors"
---

<objective>
Close out Phase 02 with the async-onMounted fix (the headline AXSS-07 requirement and the production bug in MEMORY.md), final DashboardView trim under 400 lines, two new Playwright regression specs, and a patch version bump. By the end of this plan every Phase 02 success criterion is observably true.

Purpose: Plans A/B/C did the heavy lifting (extractions, decompositions, deletions). This plan delivers the irreversible no-async-onMounted fix as its own atomic commit (so any reactivity regression is bisectable), adds the E2E guards required by MEMORY.md "E2E before push", and ships a patch release.

Output: Final DashboardView.vue, 2 new E2E specs, package.json bump.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/02-dashboardview-decomposition/RESEARCH.md
@.planning/phases/02-dashboardview-decomposition/02-A-PLAN.md
@.planning/phases/02-dashboardview-decomposition/02-B-PLAN.md
@.planning/phases/02-dashboardview-decomposition/02-C-PLAN.md
@CLAUDE.md

<interfaces>
<!-- ============================================================ -->
<!-- DashboardView.vue post-Plan-C state (expected, ~450-550 lines) -->
<!-- ============================================================ -->

<!-- onMounted (current state — STILL ASYNC after Plan B/C):
onMounted(async () => {
  if (!authStore.user) return

  const savedClearState = loadClearDataState()
  if (savedClearState?.status === 'in_progress') {
    void resumeClearData(savedClearState)
    return
  }
  if (savedClearState?.status === 'complete') clearClearDataState()

  await initMatchData()  // (Plan B's helper — replaces loadDiscardedMatches + totalUsers)

  loading.value = true
  try {
    await Promise.all([
      collectionStore.loadCollection(),
      preferencesStore.loadPreferences(),
    ])
    if (collectionStore.cards.length > 0 || preferencesStore.preferences.length > 0) {
      await calculateMatches()
    }
  } finally {
    loading.value = false
  }
})

onUnmounted is now empty (Plan C moved click-listener into useDashboardPublicSearch).
If empty, DELETE the onUnmounted hook entirely.
-->

<!-- TARGET — sync onMounted with void-fire-and-forget initDashboard:
const initDashboard = async (): Promise<void> => {
  if (!authStore.user) return

  const savedClearState = loadClearDataState()
  if (savedClearState?.status === 'in_progress') {
    void resumeClearData(savedClearState)
    return
  }
  if (savedClearState?.status === 'complete') clearClearDataState()

  await initMatchData()
  loading.value = true
  try {
    await Promise.all([
      collectionStore.loadCollection(),
      preferencesStore.loadPreferences(),
    ])
    if (collectionStore.cards.length > 0 || preferencesStore.preferences.length > 0) {
      await calculateMatches()
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void initDashboard()
})
-->

<!-- The CRITICAL pattern (from CLAUDE.md MEMORY): the onMounted callback
     itself MUST NOT be async and MUST contain NO `await`. The async work
     lives in a separate function which is called via `void` (or just by
     name with no await). This pattern was established for the anonymous
     profile loading bug — see MEMORY.md and the comment in src/stores/auth.ts. -->

<!-- E2E test infrastructure (verified by ls e2e/):
       e2e/auth.setup.ts          → auth bootstrap
       e2e/fixtures, helpers, pages, specs
     Existing specs live in e2e/specs/. New specs go there. -->

<!-- Playwright version: ^1.58.2 (verified package.json devDependencies) -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace async onMounted with sync onMounted + void initDashboard, delete remaining onUnmounted, final DashboardView trim under 400 lines</name>
  <files>src/views/DashboardView.vue</files>
  <action>
Anti-loop Rule 1: read DashboardView.vue in full first. Confirm post-Plan-C structure: imports → store wiring → composable destructures → small format helpers (formatLastSync) → handlers (handleSaveMatch and handleDiscardMatch destructured from composable) → onMounted (async — to be fixed) → onUnmounted (likely empty or just the click listener removal).

---

**Step A — Refactor onMounted**

1. Above the current onMounted, define `initDashboard` as a NAMED async arrow:
   ```typescript
   const initDashboard = async (): Promise<void> => {
     if (!authStore.user) return

     const savedClearState = loadClearDataState()
     if (savedClearState?.status === 'in_progress') {
       void resumeClearData(savedClearState)
       return
     }
     if (savedClearState?.status === 'complete') clearClearDataState()

     await initMatchData()

     loading.value = true
     try {
       await Promise.all([
         collectionStore.loadCollection(),
         preferencesStore.loadPreferences(),
       ])
       if (collectionStore.cards.length > 0 || preferencesStore.preferences.length > 0) {
         await calculateMatches()
       }
     } finally {
       loading.value = false
     }
   }
   ```

2. Replace the existing `onMounted(async () => { ... })` block with:
   ```typescript
   onMounted(() => {
     void initDashboard()
   })
   ```

   The callback is sync; `void` discards the promise from `initDashboard()` so unhandled-rejection guards are silenced (any internal errors are caught by the `try/finally` inside `initDashboard` already).

3. **CRITICAL — anti-regression grep** before saving:
   `grep -nE "onMounted\\(\\s*async" src/views/DashboardView.vue` → MUST return ZERO.
   `grep -n "onMounted" src/views/DashboardView.vue` → MUST return exactly ONE line and it MUST contain `() =>` not `async () =>`.

   If either grep fails, restore and re-do the change.

---

**Step B — Delete onUnmounted if empty**

After Plan C removed the click-listener cleanup, onUnmounted likely contains only `document.removeEventListener('click', handleClickOutside)` (which references a non-existent local function — type error) OR is already empty. Decide:
- If empty → DELETE the entire `onUnmounted(() => {})` block.
- If it contains stale references → DELETE the stale references and, if empty, delete the hook entirely.
- Remove `onUnmounted` from the `vue` import if no longer used.

---

**Step C — Final import audit + line-count check**

Run `grep -n "^import" src/views/DashboardView.vue` and verify imports are minimal:
- vue: `onMounted, ref` only (drop onUnmounted, watch, computed if not used)
- router: stays
- stores: collection, preferences, auth, matches (for type SimpleMatch / MatchCardType if template uses them — verify), decks (verify), toast, confirm
- composables: useI18n, useDashboardMatches, useBlockedUsers, useClearUserData, useDashboardPublicSearch
- utils: formatDate (still used by formatLastSync), getAvatarUrlForUser
- components: AppContainer, BaseLoader, BaseButton, BaseModal, MatchCard, HelpTooltip
- types: CalculatedMatch (re-imported from useDashboardMatches per Plan B); SimpleMatch / MatchCardType only if template uses them

For each import, run `grep -n "<imported-name>" src/views/DashboardView.vue` — if zero hits outside the import line, REMOVE.

**Line count check:**
```bash
wc -l src/views/DashboardView.vue
```
Target: **strictly less than 400 lines**. Apply this 3-tier contingency:

| `wc -l` reports | Action |
|-----------------|--------|
| ≤ 400           | PASS — proceed to Step D. |
| 401-410         | EXTRACT `DashboardPublicSearchSection.vue` as a TEMPLATE-ONLY sub-component (no script extraction). Move the `<section>` containing the public-search input, suggestions dropdown, results grid, and Scryfall fallback out of DashboardView's template and into the new component. Pass the composable's refs in as props (or have the new component re-call `useDashboardPublicSearch()` — choose whichever keeps DashboardView smaller). NO behavior changes; this is purely a `<template>` split to get under 400 lines. |
| > 410           | STOP. Do NOT continue to Step D. Report to orchestrator: a composable extraction is incomplete (likely Plan B's match-section template or Plan C's clear-data progress UI is still inline at template-level). The orchestrator decides whether to (a) revisit Plan B/C with a focused gap-closure plan, or (b) authorize a stretch sub-component extraction. Do NOT silently ship a > 410-line DashboardView. |

Audit for dead code before deciding to extract:
- Unused refs / computeds / handlers
- Comments / blank-line clusters that survived deletions
- Type interfaces that could be moved to src/types/

If a sub-component extraction is performed (the 401-410 branch), document it in the SUMMARY: which template block was moved, the new component's path, and confirmation that no `<script>` logic was duplicated.

---

**Step D — Final firestore-import audit**

```bash
grep -n "from 'firebase/firestore'" src/views/DashboardView.vue
grep -n "from '../services/firebase'" src/views/DashboardView.vue
```
Both MUST return ZERO. If either has hits, find the lingering call site and either move it to the appropriate composable/service or document why it must remain (acceptable answers: NONE — the success criterion explicitly forbids these imports).

---

**Atomic-commit checklist before saving:**
- [ ] `grep -nE "onMounted\(\s*async" src/views/DashboardView.vue` → ZERO
- [ ] `grep -n "from 'firebase/firestore'" src/views/DashboardView.vue` → ZERO
- [ ] `grep -n "from '../services/firebase'" src/views/DashboardView.vue` → ZERO
- [ ] `wc -l src/views/DashboardView.vue` reports < 400
- [ ] `npm run test:unit` passes
- [ ] `npx vue-tsc --noEmit` passes
- [ ] `npx vite build` passes
  </action>
  <verify>
    <automated>npm run test:unit && npx vue-tsc --noEmit && npx vite build 2>&1 | tail -10 && wc -l src/views/DashboardView.vue && (grep -nE "onMounted\(\s*async" src/views/DashboardView.vue && echo "FAIL: async onMounted still present" || echo "PASS: onMounted is sync") && (grep -n "from 'firebase/firestore'" src/views/DashboardView.vue && echo "FAIL: firestore import remains" || echo "PASS: no firestore imports")</automated>
  </verify>
  <done>onMounted is sync (no async, no await). initDashboard is a named async function called via void from onMounted. DashboardView.vue is < 400 lines (`wc -l` confirms). Zero firebase/firestore imports. Type-check + tests + build all pass. The two grep guards report PASS.</done>
</task>

<task type="auto">
  <name>Task 2: Add Playwright E2E specs for anonymous-load regression and match-flow regression</name>
  <files>e2e/specs/dashboard-anonymous.spec.ts, e2e/specs/dashboard-match-flow.spec.ts</files>
  <action>
Anti-loop Rule 1: read 1-2 existing specs in `e2e/specs/` first to learn the project's Playwright conventions (page object usage, fixture imports, expect patterns, baseURL handling). Mirror those conventions in the new specs.

---

**A. `e2e/specs/dashboard-anonymous.spec.ts` — anonymous regression guard**

Purpose: catch a re-introduction of the async-onMounted profile-loading bug (MEMORY.md). The spec loads /dashboard with no auth session and asserts:
- The page renders (no white screen / unhandled rejection)
- No console.error / pageerror events
- The expected anonymous-state UI element appears (a sign-in CTA or empty state — confirm by inspecting the existing dashboard template before writing the assertion)

```typescript
import { test, expect } from '@playwright/test'

test.describe('DashboardView — anonymous user', () => {
  test('loads /dashboard without async-onMounted regressions', async ({ page }) => {
    const consoleErrors: string[] = []
    const pageErrors: string[] = []

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', err => pageErrors.push(err.message))

    // No auth setup — anonymous browsing
    await page.goto('/dashboard', { waitUntil: 'networkidle' })

    // Page must have rendered something (not a blank chunk-load failure)
    await expect(page.locator('body')).toBeVisible()

    // The dashboard either shows an unauth state or redirects to /login.
    // Both are acceptable; what matters is "no async-onMounted crash".
    // Adjust this selector after inspecting the actual unauth-state UI.
    const url = page.url()
    expect(url).toMatch(/(dashboard|login|home|\/$)/)

    // Hard guards: no console errors, no unhandled exceptions
    expect(pageErrors, `Page errors:\\n${pageErrors.join('\\n')}`).toEqual([])
    // Filter known-noise console errors (Firebase auth network warnings on first
    // load are common). Whitelist only EXACT prefixes; new errors surface.
    const filtered = consoleErrors.filter(e =>
      !e.includes('Failed to load resource') && // common net errors in CI
      !e.includes('FirebaseError: Firebase') && // expected for anon
      !e.includes('Missing or insufficient permissions'), // expected for anon
    )
    expect(filtered, `Unexpected console errors:\\n${filtered.join('\\n')}`).toEqual([])
  })
})
```

NOTES on the whitelist: review the actual console output the first time the spec is run; expand the whitelist ONLY for errors that pre-existed in v1.23.0 baseline (5 known E2E failures per the user's instruction). Do not silence new errors introduced by Phase 02 work.

---

**B. `e2e/specs/dashboard-match-flow.spec.ts` — match flow regression guard**

Purpose: catch behavior regressions in Plan B's calculateMatches / save / discard pipeline. Uses the existing auth.setup.ts fixture (per existing spec convention).

**Pre-test manual seed (MANDATORY before running this E2E spec in CI or locally):**

The Playwright spec below uses `test.skip(matchCount === 0, ...)` to gracefully no-op on empty seeds. That skip is a safety valve, NOT permission to ship without a real run. The executor MUST manually seed at least once and confirm the spec actually exercises the save/discard branch:

1. Open `https://cranial-trading-dev.web.app` as TEST_USER_A (use the existing dev credentials in `.env.local` or the project's auth fixture).
2. Click SINCRONIZAR / Recalculate Matches.
3. Confirm at least one match card renders. If zero cards appear, the dev Firebase seed has no compatible peers — **seed a second test user (TEST_USER_B) with an overlapping collection first** (a few cards in `sale` or `trade` matching TEST_USER_A's `wishlist` entries). This is a one-time setup cost; document the seed user credentials in the SUMMARY for future regression runs.
4. As TEST_USER_A, save one match (ME INTERESA / save button), reload the page, and confirm the saved match persists in the SAVED tab.
5. Discard a different match (DESCARTAR / discard button), confirm the modal, reload, and confirm the discarded match does NOT reappear.

**If this manual smoke fails (saved doesn't persist OR discarded reappears), Plan B's persistCalculatedMatches / discardCalculatedMatch port has a regression. STOP — do NOT proceed to Plan D's commit. Diagnose per Anti-loop Rule 5 first.**

Only after the manual smoke passes is the executor authorized to consider the Playwright spec's PASS/SKIP outcome acceptable (see existing test.skip rationale below).


```typescript
import { test, expect } from '@playwright/test'

// IMPORTANT — this spec relies on the project's auth fixture. Read
// e2e/auth.setup.ts and the existing specs to confirm the fixture name
// (likely "authenticatedPage" or similar) before authoring.

test.describe('DashboardView — match flow', () => {
  test('login → recalculate → save → discard → reload preserves state', async ({ page }) => {
    // 1. Navigate to the dashboard while authenticated (use the project's
    //    auth fixture / state file — adapt this line to match the
    //    existing spec convention, e.g. test.use({ storageState: ... })
    //    or context.addCookies(...)).
    await page.goto('/dashboard', { waitUntil: 'networkidle' })

    // 2. The match section must render without errors.
    //    Locate by a stable test-id or visible text. If the template
    //    lacks a data-testid, ADD one to the match-section root in this
    //    plan as a small follow-up edit (document in SUMMARY).
    const matchSection = page.locator('[data-testid="dashboard-matches"], section:has-text("Matches")').first()
    await expect(matchSection).toBeVisible({ timeout: 10_000 })

    // 3. Click recalculate — the spec is permissive: a no-collection user
    //    sees an empty-matches state, which is also valid behavior.
    const recalculate = page.getByRole('button', { name: /recalculat/i }).first()
    if (await recalculate.isVisible().catch(() => false)) {
      await recalculate.click()
      // Wait for the loading spinner to clear (or the empty-state to appear)
      await page.waitForLoadState('networkidle')
    }

    // 4. The save/discard flow only runs if at least one match exists.
    //    Skip gracefully if no matches present (matches require a real
    //    seeded user with collection + matching public_cards).
    const matchCard = page.locator('[data-testid="match-card"]').first()
    const matchCount = await matchCard.count()
    test.skip(matchCount === 0, 'No matches available in this seed; cannot exercise save/discard branch')

    // 5. Save the first match.
    const saveBtn = matchCard.getByRole('button', { name: /save|guardar/i }).first()
    await saveBtn.click()
    await expect(page.getByText(/saved|guardado/i).first()).toBeVisible({ timeout: 5_000 })

    // 6. Discard the second match (if available) or the same one.
    const discardable = await page.locator('[data-testid="match-card"]').count()
    if (discardable >= 1) {
      const discardBtn = page.locator('[data-testid="match-card"]').first()
        .getByRole('button', { name: /discard|descartar|eliminar/i }).first()
      await discardBtn.click()
      // confirm modal
      const confirmYes = page.getByRole('button', { name: /yes|sí|confirm/i }).first()
      if (await confirmYes.isVisible().catch(() => false)) await confirmYes.click()
    }

    // 7. Reload and confirm state is preserved (saved match still saved,
    //    discarded match did not reappear).
    await page.reload({ waitUntil: 'networkidle' })
    await expect(matchSection).toBeVisible()
    // Asserting exact saved/discarded state requires user-specific seeding;
    // permissive assertion: page rendered without errors after reload.
  })
})
```

NOTES:
- This spec is intentionally permissive (skips when no matches) so it can pass against a fresh seed without flaking. The strict assertions are the page-renders-and-no-errors guards. Behavior preservation is verified by manual smoke + the unit tests in Plan B.
- If a `data-testid="dashboard-matches"` or `data-testid="match-card"` does not exist in the templates, add them in DashboardView.vue / MatchCard.vue as a small inline edit (1-2 lines). Document the addition in the SUMMARY. NO behavior change — test-ids only.

---

**Run the new specs before finishing the task:**
```bash
npm run e2e -- e2e/specs/dashboard-anonymous.spec.ts e2e/specs/dashboard-match-flow.spec.ts
```

If they fail, do NOT relax assertions to make them pass — diagnose first per Anti-loop Rule 5. Acceptable outcomes for the match-flow spec: PASS, or SKIP (no matches in seed) — both acceptable. For the anonymous spec: PASS only is acceptable (it has no skip path).

Per MEMORY.md "feedback_e2e_before_push.md", the FULL e2e suite must also be run before pushing the phase commit (Plan D's verify step does this).
  </action>
  <verify>
    <automated>npm run e2e -- e2e/specs/dashboard-anonymous.spec.ts 2>&1 | tail -20</automated>
  </verify>
  <done>Both spec files exist and run. The anonymous spec passes. The match-flow spec passes or skips depending on seed availability (skip is acceptable). New data-testids added to template (if needed) are documented in the SUMMARY.</done>
</task>

<task type="auto">
  <name>Task 3: Add smoke E2E spec for /saved-matches and /profile/self (post-Plan-A blast-radius regression guard)</name>
  <files>e2e/specs/smoke/dashboard-and-profile.spec.ts</files>
  <action>
Plan A widened scope beyond DashboardView: it touched useGlobalSearch.ts, UserProfileView.vue, and SavedMatchesView.vue (changing 15-day inline math → getMatchExpirationDate calendar math). The plan-checker flagged that those views have NO E2E coverage in the existing suite, so a regression in `/saved-matches` or `/profile/<self>` would slip past the dashboard-focused specs added in Task 2.

Add a single 5-line-style smoke spec that loads each page and asserts no console errors / no unhandled promise rejections fire on mount. Behavior is intentionally minimal — this is a "did the page mount cleanly after the MATCH_LIFETIME_DAYS centralization" guard, not a feature test.

---

**Step 1: Confirm the auth fixture name.**

Read `e2e/fixtures/test.ts` (or wherever the project's Playwright fixtures live) to identify the authenticated-page fixture (likely `authStore` / `authedPage` / or storage-state). If unclear, also read 1-2 existing specs in `e2e/specs/` to mirror the convention.

**Step 2: Resolve TEST_USER_A's username.**

The /profile route uses a username slug, not "self". Find the username via either:
- `e2e/helpers/auth.ts` (likely exports a TEST_USER_A constant)
- The auth fixture's user object
- A hardcoded value in `e2e/auth.setup.ts`

If no helper exists, hardcode the dev username with a TODO comment + reference to wherever the credential lives.

**Step 3: Create `e2e/specs/smoke/dashboard-and-profile.spec.ts`:**

```typescript
import { test, expect } from '../../fixtures/test'  // adjust path to match project

// TODO(executor): replace TEST_USER_A_USERNAME with the actual dev test username.
// Source: e2e/helpers/auth.ts or e2e/auth.setup.ts (whichever defines the dev user).
const TEST_USER_A_USERNAME = 'TEST_USER_A_USERNAME'

test.describe('Dashboard + Profile smoke (post-Plan-A MATCH_LIFETIME_DAYS change)', () => {
  test('saved-matches page loads without console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto('/saved-matches')
    await page.waitForLoadState('networkidle')
    expect(errors).toHaveLength(0)
  })

  test('own-profile page loads without console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(`/profile/${TEST_USER_A_USERNAME}`)
    await page.waitForLoadState('networkidle')
    expect(errors).toHaveLength(0)
  })
})
```

**Step 4: Run the spec to confirm it actually loads the pages (not just times out):**

```bash
npm run e2e -- e2e/specs/smoke/dashboard-and-profile.spec.ts
```

If both tests pass → done. If either fails:
- `pageerror` fires → there IS a regression; diagnose per Anti-loop Rule 5 BEFORE relaxing the assertion.
- Page never loads (404, redirect loop) → username is wrong or auth fixture isn't applied; fix the fixture wiring.

Do NOT add to the whitelist any errors that are NEW vs. v1.23.0 baseline. The whole point of this spec is to surface Plan A regressions in views that previously had no coverage.

NOTES:
- This spec is intentionally tiny — no behavior assertions, just mount-cleanly. A future phase can expand it.
- If the `e2e/specs/smoke/` directory doesn't exist, create it; the smoke/ subfolder is a natural home for "did it render" guards distinct from full feature specs.
  </action>
  <verify>
    <automated>npm run e2e -- e2e/specs/smoke/dashboard-and-profile.spec.ts 2>&1 | tail -20</automated>
  </verify>
  <done>e2e/specs/smoke/dashboard-and-profile.spec.ts exists. Both tests (saved-matches + own-profile) pass — no pageerror fires, both pages reach networkidle. The TEST_USER_A_USERNAME placeholder has been resolved to the actual dev username (or has a documented TODO if the fixture wiring requires follow-up).</done>
</task>


<task type="auto">
  <name>Task 4: Bump version to 1.23.1 + final phase verification (full unit + build + full E2E)</name>
  <files>package.json</files>
  <action>
Per user Plan-Phase decision #4: PATCH bump (refactor with no user-visible features).

```bash
npm version patch --no-git-tag-version
```

This sets `package.json` `"version"` to `"1.23.1"` and updates `package-lock.json` accordingly.

Verify:
```bash
grep '"version"' package.json
```
Expected output: `"version": "1.23.1",`

---

**Final phase verification gate** (per MEMORY.md feedback_e2e_before_push):

1. `npm run test:unit` — ALL pass, including the 5 new test files added by Plans A/B/C
2. `npx vue-tsc --noEmit` — no type errors
3. `npx vite build` — succeeds
4. `npm run e2e` — FULL E2E suite runs. Acceptable: same number of failures as v1.23.0 baseline (5 known failures per MEMORY.md). UNACCEPTABLE: any NEW failure introduced by Phase 02.
   - Run, capture failure list, compare against baseline. If a new failure appears → diagnose (Anti-loop Rule 5) BEFORE commit. Do not push with new E2E failures.
5. Visual smoke (manual, dev server): `npm run dev` → log in → dashboard loads → all sections render (Matches, Public Search, Sync, Blocked Users modal, Clear Data flow). No console errors. Anonymous browsing also works.

---

**If Plan D's gate passes:** the phase is complete. Plans A/B/C/D commits collectively close all 5 Phase 02 requirements (AXSS-07, ARCH-01, ARCH-04, ARCH-07, ARCH-13) and all 4 success criteria.

**If gate fails:** the failing item is the blocker. Diagnose root cause (Anti-loop Rule 5: stop, read, understand BEFORE patching). Do not bypass — the verification gates exist because Phase 01 plans surfaced exactly these regression types.
  </action>
  <verify>
    <automated>grep '"version"' package.json && echo "---" && npm run test:unit && echo "---" && npx vue-tsc --noEmit && echo "---" && npx vite build 2>&1 | tail -5</automated>
  </verify>
  <done>package.json reports version 1.23.1. All unit tests pass. Type-check clean. Build clean. Full E2E run produces no new failures vs v1.23.0 baseline. Visual smoke (manual) confirms dashboard renders correctly logged in and anonymously.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Anonymous user → /dashboard | No auth — must not call any auth-required Firestore reads |
| onMounted lifecycle → async work | Async pipeline must not block the lifecycle hook itself (production bug history) |
| Playwright E2E → real Firebase project (dev) | Tests run against the dev Firebase env; data isolation is the dev project's responsibility |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02D-01 | Denial of Service | async onMounted blocking router transition | mitigate | Sync onMounted with void initDashboard — async work runs in microtask, lifecycle hook completes immediately |
| T-02D-02 | Information Disclosure | E2E spec console.error capture leaking auth tokens | accept | Only error MESSAGES are captured, not headers/cookies. Whitelist limits noise; sensitive data not in error.message field |
| T-02D-03 | Tampering | E2E test using whitelist to silence regressions | mitigate | Whitelist matches EXACT pre-existing baseline errors (5 known); new errors fail the test |
| T-02D-04 | Repudiation | Patch version 1.23.1 release without explicit commit log | mitigate | npm version patch creates a commit-friendly bump; deploy-dev / deploy-prod CLAUDE.md skills require explicit user approval before prod merge |
</threat_model>

<verification>
After all three tasks complete:

1. `npm run test:unit` — all unit tests pass (incl. the 5 new files from Plans A/B/C)
2. `npx vue-tsc --noEmit` — no type errors
3. `npx vite build` — succeeds
4. `npm run e2e` — same number of failures as v1.23.0 baseline (5); zero NEW failures
5. Async-onMounted guard:
   - `grep -nE "onMounted\(\s*async" src/views/DashboardView.vue` → ZERO
6. Line-count guard:
   - `wc -l src/views/DashboardView.vue` → < 400
7. Firestore-decoupling guard:
   - `grep -n "from 'firebase/firestore'" src/views/DashboardView.vue` → ZERO
8. Version guard:
   - `grep '"version"' package.json` → `"version": "1.23.1",`
9. E2E spec presence:
   - `ls e2e/specs/dashboard-anonymous.spec.ts e2e/specs/dashboard-match-flow.spec.ts e2e/specs/smoke/dashboard-and-profile.spec.ts` → all three exist
10. Manual smoke (dev): anonymous load + authenticated load both render the dashboard cleanly
</verification>

<success_criteria>
- onMounted in DashboardView.vue is non-async and contains no await
- DashboardView.vue is < 400 lines AND has zero firebase/firestore imports
- All three new E2E specs exist (dashboard-anonymous, dashboard-match-flow, smoke/dashboard-and-profile); the anonymous spec passes; the match-flow spec passes or skips; the smoke spec passes (both saved-matches and own-profile load with no pageerror)
- package.json version is 1.23.1
- Full E2E run shows no NEW failures vs v1.23.0 baseline
- AXSS-07 (no async onMounted) — CLOSED
- ARCH-01 (final line-count verification) — CLOSED
- All 4 Phase 02 success criteria (DashboardView < 400 + no firestore, match expiry unit-testable, SearchView O(1), MATCH_LIFETIME_DAYS single source) — CLOSED
- `npm run test:unit && npx vue-tsc --noEmit && npx vite build && npm run e2e` all pass per the success bar above
</success_criteria>

<output>
After completion, create `.planning/phases/02-dashboardview-decomposition/02-D-SUMMARY.md` using the template at `@$HOME/.claude/get-shit-done/templates/summary.md`. Include:
- Final DashboardView.vue line count + grep evidence for the three guards (async-onMounted, firestore imports, line count)
- E2E baseline comparison table: v1.23.0 failure list vs v1.23.1 failure list (must be ≤ baseline)
- New data-testids added to templates (if any) and which spec consumes them
- The diff of onMounted before/after for archival reference
- Version bump confirmation (1.23.0 → 1.23.1) and rationale (pure refactor — patch bump per CLAUDE.md semver rule + Plan-Phase decision #4)

After this SUMMARY exists, also write `.planning/phases/02-dashboardview-decomposition/02-PHASE-SUMMARY.md` aggregating all 4 plan SUMMARYs into a single phase rollup with the requirement-closure matrix:

| Requirement | Closed by Plan | Evidence |
|-------------|----------------|----------|
| AXSS-07 | D | Sync onMounted, grep guard, anonymous E2E |
| ARCH-01 | B + C + D | Composables exist, line count < 400 |
| ARCH-04 | B + C | Zero firestore imports in DashboardView |
| ARCH-07 | A | buildOwnedCountMap + computed in SearchView |
| ARCH-13 | A | Single source for MATCH_LIFETIME_DAYS, 5 consumer files import |
</output>
