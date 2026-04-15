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
  - src/views/SavedMatchesView.vue
  - package.json
  - .planning/phases/02-dashboardview-decomposition/02-D-SUMMARY.md
autonomous: true
requirements:
  - AXSS-07

must_haves:
  truths:
    - "SavedMatchesView.vue onMounted body follows the MEMORY.md + CLAUDE.md rule: outer function is SYNC (not async), and any async initialization is invoked via `void initView()` WITHOUT await — mirrors the canonical pattern in UserProfileView.vue:472-474."
    - "The 4 awaits previously inside the async onMounted body move into a new async `initView` function defined in the same `<script setup>` scope. onMounted just calls `void initView()` and returns synchronously."
    - "Behavior preservation: all user-facing state transitions are identical — spinner shows during load, tabs render once data loads, calculateMatches still triggers if collection OR preferences exist. The ONLY change is the lifecycle wrapper."
    - "The `loading.value = true` / `finally { loading.value = false }` wrappers MOVE INTO `initView` so the spinner still shows during async work. The `if (!authStore.user) return` gate stays at the TOP of `initView` (same position relative to awaits)."
    - "The query-param match-highlight handler (current lines ~732-738 inside onMounted) MUST run AFTER initView() completes. Required pattern: `onMounted(() => { void initView().then(() => { /* query-param scroll + router.replace */ }) })`. Rationale: scrollToMatch (defined at line 679-689) queries DOM via `document.querySelector('[data-match-id=...]')` — if invoked before calculateMatches() completes, the elements don't exist yet and it silently no-ops. The inline-at-mount pattern is WRONG."
    - "Known tech debt: MessagesView:69, DecksView:556, CollectionView:3496, MatchCard:50 still have `onMounted(async` pattern. All 4 are behind `requiresAuth: true` routes so the anonymous-user repro cannot fire today. Fixing them is deferred — logged in SUMMARY as Phase 03+ candidate work."
    - "package.json version bumps MINOR: 1.23.0 → 1.24.0. Rationale: Phase 02 as a whole added new exported public APIs in Plan B (src/services/stats.ts, src/services/publicCards.ts searchPublicCards, matchesStore new methods). Per CLAUDE.md semver: minor = new features/API integrations. Phase-level semver unit applies even though Plan D itself is a refactor."
    - "No E2E spec changes in this plan. SavedMatchesView already has coverage via e2e/specs/matches/match-calculation.spec.ts and match-management.spec.ts (both navigate to /saved-matches). The Plan 02-D fix is covered by the existing suite — any regression in onMounted ordering would break the calc-spec."
    - "02-D-SUMMARY.md explicitly notes: (a) the MEMORY.md rule is a universal coding standard, not a live production bug today — all async-onMounted sites are behind auth gates; (b) the DashboardView deletion + SavedMatchesView migration (Plan 02-C) closed the DashboardView-related parts of the rule; (c) remaining 4 sites (MessagesView, DecksView, CollectionView, MatchCard) are tech-debt candidates for Phase 03+."
  artifacts:
    - path: "src/views/SavedMatchesView.vue"
      provides: "onMounted refactored to sync wrapper + void initView() — compliant with MEMORY.md rule"
    - path: "package.json"
      provides: "version bumped to 1.24.0"
    - path: ".planning/phases/02-dashboardview-decomposition/02-D-SUMMARY.md"
      provides: "Phase 02 closeout with honest scope-pivot narrative"
  key_links:
    - from: "src/views/SavedMatchesView.vue onMounted"
      to: "new `initView` helper (same file)"
      via: "onMounted(() => { void initView() })"
    - from: "SavedMatchesView.vue pattern"
      to: "UserProfileView.vue:472-474 canonical implementation"
      via: "same anti-async-onMounted pattern"
---

<objective>
Close Phase 02 by fixing SavedMatchesView's async-onMounted anti-pattern (AXSS-07), bumping the phase version, and writing an honest SUMMARY that records the scope pivot from "decompose DashboardView" to "migrate SavedMatchesView + delete DashboardView".

**Purpose.** MEMORY.md + CLAUDE.md rule: "Never use async onMounted with await — breaks profile loading in production for anonymous users." Investigation determined this is a universal coding standard derived from a historical bug in UserProfileView (already fixed at line 472 with the canonical `onMounted(() => { void loadProfile() })` pattern). Of the 5 remaining `onMounted(async` sites before this plan, 4 live on `requiresAuth: true` routes and are therefore defensively safe today. SavedMatchesView is being actively modified by Plan 02-C anyway — fixing its async-onMounted here is the correct close-out.

**Scope discipline.** Do NOT fix MessagesView, DecksView, CollectionView, or MatchCard in this plan. They're not broken today (auth-gated) and fixing them without dedicated regression testing invites cross-plan breakage. Flag them as Phase 03+ tech debt in the SUMMARY.

**Output.** 1 file refactored (SavedMatchesView), 1 file updated (package.json version), 1 SUMMARY written. No new source files, no new tests.
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
@.planning/phases/02-dashboardview-decomposition/02-C-PLAN.md
@CLAUDE.md

<canonical_pattern>
From `src/views/UserProfileView.vue:472-474`:
```typescript
onMounted(() => {
  void loadProfile();
});
```
The outer function is synchronous (one-arg arrow, no `async`). The async work is kicked off via `void` — fires the promise but doesn't await. The onMounted lifecycle hook returns immediately. Anonymous users' render path (if ever exposed to this view) is never blocked by awaits.
</canonical_pattern>

<current_saved_matches_onmounted>
Post-Plan-02-C, SavedMatchesView.vue onMounted looks approximately (line numbers will shift after 02-C — verify at execution time):
```typescript
onMounted(async () => {
  if (!authStore.user) return

  discardedMatchIds.value = await matchesStore.loadDiscardedUserIds()  // was: await loadDiscardedMatches()

  loading.value = true
  try {
    contactsStore.loadSavedContacts()  // fire-and-forget — already correct pattern
    await Promise.all([
      matchesStore.loadAllMatches(),
      collectionStore.loadCollection(),
      preferencesStore.loadPreferences(),
    ])
    await loadSavedMatchesWithEmails()
    totalUsers.value = Math.max(0, (await getTotalUserCount()) - 1)  // was: inline getDocs(users)
    if (collectionStore.cards.length > 0 || preferencesStore.preferences.length > 0) {
      await calculateMatches()
    }
  } finally {
    loading.value = false
  }

  // Query param match highlight (stays synchronous — route-reactive glue)
  if (route.query.match) {
    scrollToMatch(route.query.match as string)
  }
})
```
7 awaits. Outer function is async. Violates MEMORY.md rule.
</current_saved_matches_onmounted>

<target_shape>
```typescript
const initView = async () => {
  if (!authStore.user) return

  discardedMatchIds.value = await matchesStore.loadDiscardedUserIds()

  loading.value = true
  try {
    contactsStore.loadSavedContacts()
    await Promise.all([
      matchesStore.loadAllMatches(),
      collectionStore.loadCollection(),
      preferencesStore.loadPreferences(),
    ])
    await loadSavedMatchesWithEmails()
    totalUsers.value = Math.max(0, (await getTotalUserCount()) - 1)
    if (collectionStore.cards.length > 0 || preferencesStore.preferences.length > 0) {
      await calculateMatches()
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void initView().then(() => {
    const matchId = route.query.match
    if (matchId && typeof matchId === 'string') {
      activeTab.value = 'new'
      void scrollToMatch(matchId)
      void router.replace({ query: { ...route.query, match: undefined } })
    }
  })
})
```
**Pattern rationale** (verified by investigation 2026-04-15: `scrollToMatch` at SavedMatchesView:679-689 queries DOM via `document.querySelector('[data-match-id=...]')` — elements don't exist until `calculateMatches()` populates them):

```typescript
onMounted(() => {
  void initView().then(() => {
    const matchId = route.query.match
    if (matchId && typeof matchId === 'string') {
      activeTab.value = 'new'
      void scrollToMatch(matchId)
      void router.replace({ query: { ...route.query, match: undefined } })
    }
  })
})
```

The `.then` callback still satisfies the MEMORY.md rule (onMounted outer is sync; the promise chain is fire-and-forget from the lifecycle's perspective). The DO-NOT pattern is running the query-param handler synchronously before `initView()` — scrollToMatch would silently no-op because no `[data-match-id]` elements exist in the DOM yet.
</target_shape>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Refactor SavedMatchesView.vue onMounted to sync + void initView pattern</name>
  <files>src/views/SavedMatchesView.vue</files>
  <action>
Anti-loop Rule 1: read `src/views/SavedMatchesView.vue` in full. Line numbers will have shifted after Plan 02-C — re-grep for the `onMounted(async` declaration.

**Pre-edit audit:**
```bash
grep -n "onMounted" src/views/SavedMatchesView.vue
grep -n "scrollToMatch\|route.query.match" src/views/SavedMatchesView.vue
```

**Pattern decision is LOCKED (do not deviate):** Investigation 2026-04-15 confirmed `scrollToMatch` at line 679-689 queries DOM via `document.querySelector('[data-match-id=...]')`. Elements don't exist until `calculateMatches()` completes. MUST use `.then()` chaining pattern (see `<target_shape>` above). DO NOT run the query-param handler inline inside the new onMounted — it will no-op silently.

**Atomic edit list:**

1. **Extract the async body into `initView`**:
   - Add a new `const initView = async () => { ... }` function ABOVE the `onMounted` block.
   - Move the ENTIRE current async onMounted body into `initView`, including the `if (!authStore.user) return`, the `loading.value = true`, the try/Promise.all/finally, and the `await calculateMatches()` conditional.
   - EXCLUDE the `if (route.query.match) scrollToMatch(...)` block — that stays in onMounted.

2. **Rewrite `onMounted`** to the canonical pattern:
   ```typescript
   onMounted(() => {
     void initView().then(() => {
       if (route.query.match) {
         scrollToMatch(route.query.match as string)
       }
     })
   })
   ```
   OR if scrollToMatch is idempotent + ordering-insensitive, use the simpler:
   ```typescript
   onMounted(() => {
     void initView()
     if (route.query.match) {
       scrollToMatch(route.query.match as string)
     }
   })
   ```

3. **Anti-loop Rule 2 guardrails:**
   - Do NOT change any other part of SavedMatchesView.
   - Do NOT touch the watch() handler on route.query.match (if it exists — likely at lines ~680-698; don't refactor).
   - Do NOT rename `initView` to `init`, `loadDashboard`, etc. — use exactly `initView` to match the plan's must_have.
   - Do NOT remove the `if (!authStore.user) return` gate — it's a security gate, not a lifecycle concern.

4. **Verify no other async onMounted regressed in.** Grep `onMounted(async` in SavedMatchesView.vue — must be 0 results.
  </action>
  <verify>
    <automated>
npm run test:unit && npx vue-tsc --noEmit && npx vite build 2>&1 | tail -10

# Pattern compliance:
grep -n "onMounted(async" src/views/SavedMatchesView.vue  # must be 0
grep -n "onMounted((" src/views/SavedMatchesView.vue      # must be 1+
grep -n "const initView = async" src/views/SavedMatchesView.vue  # must be 1
grep -n "void initView()" src/views/SavedMatchesView.vue  # must be 1

# E2E regression check (SavedMatchesView is well-covered):
npx playwright test e2e/specs/matches/ 2>&1 | tail -20
    </automated>
  </verify>
  <done>SavedMatchesView.vue onMounted is synchronous. All async work lives in initView. Unit tests pass. Build succeeds. E2E match specs pass (if run). No other async onMounted introduced.</done>
</task>

<task type="auto">
  <name>Task 2: Bump package.json to 1.24.0 (minor)</name>
  <files>package.json</files>
  <action>
```bash
npm version minor --no-git-tag-version
```
This should bump 1.23.0 → 1.24.0. If current version is different, verify before running.

**Rationale for MINOR (not PATCH):** Phase 02 as a whole added new exported public APIs:
- `src/services/stats.ts` — new module, exports `getTotalUserCount`
- `src/services/publicCards.ts` — new export `searchPublicCards` + `PublicCardSearchResult` interface
- `src/stores/matches.ts` — new methods `loadDiscardedUserIds`, `persistCalculatedMatches`, `discardCalculatedMatch`

Per CLAUDE.md: "minor (x.Y.0): new features, new UI screens, new API integrations." Phase-level semver unit applies — Plan D itself is refactor but phase aggregate is minor.
  </action>
  <verify>
    <automated>
grep -n '"version":' package.json  # must show "1.24.0"
node -e "console.log(require('./package.json').version)"  # runtime read confirms
    </automated>
  </verify>
  <done>package.json version is 1.24.0. No git tag created (--no-git-tag-version). Change will be committed with SUMMARY.</done>
</task>

<task type="auto">
  <name>Task 3: Write 02-D-SUMMARY.md capturing the Phase 02 closeout narrative</name>
  <files>.planning/phases/02-dashboardview-decomposition/02-D-SUMMARY.md</files>
  <action>
Use the gsd summary template. Required sections (beyond standard frontmatter):

**1. Scope pivot callout (prominent, near the top):**
> Phase 02 began as "DashboardView decomposition" but investigation during Plan D discovered `/dashboard` redirects to `/saved-matches` (router/index.ts:43-45, added commit 212488f on 2026-02-09) — DashboardView.vue was unrouted dead code. Scope pivoted at Plan C to migrate the LIVE view (SavedMatchesView.vue). Plan D closes the async-onMounted anti-pattern on the same live view. DashboardView.vue was deleted in Plan C.

**2. Honest Requirements table:**
| Requirement | Disposition |
|-------------|-------------|
| ARCH-01 (composable extraction) | Plan 02-B created useDashboardMatches — orphaned and deleted in Plan C. Partial credit: utils (matchExpiry, ownedCount, matchGrouping) and services (stats, publicCards) ARE consumed by SearchView and SavedMatchesView. |
| ARCH-04 (no inline Firestore) | Plan C closed 3 inline Firestore wrappers in SavedMatchesView (loadDiscardedMatches, saveMatchesToFirebase, discardMatchToFirestore). SavedMatchesView's inline calculateMatches still has Firestore via matchesStore — that's considered delegation, not inline. |
| ARCH-07 (O(1) ownedCount in SearchView) | Closed in Plan 02-A. |
| ARCH-13 (single MATCH_LIFETIME_DAYS) | Closed in Plan 02-A. |
| AXSS-07 (async onMounted bug) | Closed for SavedMatchesView. NOT fixed in MessagesView:69, DecksView:556, CollectionView:3496, MatchCard:50 — flagged as tech debt (all 4 are behind auth gates). |

**3. Known tech debt:**
- 4 `onMounted(async` sites remain in MessagesView, DecksView, CollectionView, MatchCard — fix in dedicated phase with per-site regression specs
- SavedMatchesView's inline `calculateMatches` retains the `as unknown as 'VENDO'` type coercion at line ~554 — real fix requires widening `SimpleMatch.type` to 4-valued or widening MatchCard's prop
- Blocked-users inline code duplicated between (now-deleted DashboardView) and (still-in-place) SavedMatchesView — consolidate via BlockedUsersModal component extraction in Phase 03+

**4. Lessons for future phases:**
- "Read the router before planning a view decomposition" — add to planner checklist
- "Investigate live user-facing view before migration" — Plan B wasted ~1 hour building orphaned composable code
- "MEMORY.md rules are universal standards — don't assume they point at a live bug without verifying the reproduction path"

**5. Commits:**
Enumerate all Plan 02-C and 02-D commits with hash + message.

**6. Metrics:**
- Line deltas: Plan A -56, Plan B (now dead: -347 lines of DashboardView + 908 added that now delete = net -347), Plan C ~-160 in SavedMatchesView + ~-1065 (DashboardView deletion) + ~-350 (useDashboardMatches deletion), Plan D ~0 (refactor)
- Total Phase 02: ~-1900 lines deleted, ~+1500 added (utils/services/store methods/tests). Net -400 lines.
- Test count: Plan A +18 → 534; Plan B +13 → 547; Plan C -6 (composable tests deleted) → 541; Plan D 0 → 541.
- Version: 1.22.0 → 1.24.0 (+ minor for new API surface)

**7. Self-check:**
- [ ] `/saved-matches` loads, recalculates, saves, discards (manual dev smoke)
- [ ] `/dashboard` redirects (no 404)
- [ ] `npm run test:unit` passes
- [ ] `npx vite build` passes
- [ ] SavedMatchesView onMounted is synchronous
- [ ] package.json = 1.24.0
  </action>
  <verify>
    <automated>
test -f .planning/phases/02-dashboardview-decomposition/02-D-SUMMARY.md && echo "SUMMARY exists" || echo "MISSING"
grep -c "Scope pivot\|scope pivot" .planning/phases/02-dashboardview-decomposition/02-D-SUMMARY.md  # must be ≥1
grep -c "1.24.0" .planning/phases/02-dashboardview-decomposition/02-D-SUMMARY.md  # must be ≥1
grep -c "AXSS-07\|ARCH-0" .planning/phases/02-dashboardview-decomposition/02-D-SUMMARY.md  # must be ≥4 (all reqs enumerated)
    </automated>
  </verify>
  <done>02-D-SUMMARY.md exists with the scope-pivot narrative prominently, honest requirements table, tech debt log, lessons learned, commit list, metrics, and self-check. Ready for phase verification.</done>
</task>

</tasks>

<threat_model>
## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02D-01 | Denial of Service | onMounted refactor could break spinner reactivity | mitigate | `loading.value = true/false` stays wrapped around the awaits inside initView — spinner covers the same async window. Regression check: /saved-matches renders spinner on first load (manual smoke). |
| T-02D-02 | Tampering | Race between `void initView()` and route.query.match scroll | accept | `.then()` chaining preserves ordering if executor chooses that pattern; otherwise scrollToMatch is idempotent (reads DOM via `$refs` lookup). |
| T-02D-03 | Repudiation | Version bump without git tag | accept | `--no-git-tag-version` is the project convention per CLAUDE.md; tag is created at release time by merge-to-main workflow. |
</threat_model>

<verification>
After all three tasks complete:

1. `npm run test:unit` — 541 tests passing
2. `npx vue-tsc --noEmit` — 0 errors
3. `npx vite build` — succeeds
4. **Pattern audit:**
   - `grep -n "onMounted(async" src/views/SavedMatchesView.vue` → 0 matches
   - `grep -n "void initView()" src/views/SavedMatchesView.vue` → 1 match
   - `grep -n "onMounted(async" src/` → 4 matches (MessagesView, DecksView, CollectionView, MatchCard — deliberately unchanged, documented in SUMMARY)
5. `package.json` version = 1.24.0
6. `02-D-SUMMARY.md` exists with required sections
7. **E2E regression** (strongly recommended): `npx playwright test e2e/specs/matches/` — both match-calculation.spec.ts and match-management.spec.ts should pass unchanged
8. **Manual smoke on dev** (user before merge to main):
   - Login → /saved-matches → spinner shows → matches render → no stuck spinner
   - Recalculate → spinner + progress → matches update
   - Save a match → appears in Saved tab
   - Discard a match → removes; does NOT reappear after recalc
   - Navigate with `?match=xyz` query → scroll lands on the match (if one with that id exists)
   - /dashboard → redirects to /saved-matches (unchanged)
</verification>

<success_criteria>
- SavedMatchesView.vue onMounted is synchronous; async work is in `initView` invoked via `void initView()`.
- Unit tests pass (541); type-check clean; build succeeds.
- package.json version bumped to 1.24.0.
- 02-D-SUMMARY.md exists with the scope-pivot narrative, honest requirements table, 4 remaining `onMounted(async` sites logged as tech debt.
- No unchanged behavior: spinner + recalculate + save + discard all identical from user perspective.
- The 4 other `onMounted(async` sites are deliberately NOT touched — preserved as tech debt for Phase 03+.
</success_criteria>
