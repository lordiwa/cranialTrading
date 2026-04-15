# Phase 02 - Plan Check (DashboardView Decomposition)

**Checked:** 2026-04-14
**Plans reviewed:** 02-A, 02-B, 02-C, 02-D
**Baseline verified:** package.json = 1.23.0, DashboardView.vue = 1470 lines, 5 files carry MATCH_LIFETIME_DAYS duplicates.

## Verdict: NEEDS-FIX-BEFORE-EXECUTION

The plans are well-structured and goal-backward-coherent, but several concrete issues must be fixed in the PLAN.md files before Wave 2 starts. None are architectural; all are surface fixes that remove execution ambiguity.

---

## Success Criteria Coverage

| SC | Statement | Closed By | Verdict | Evidence |
|----|-----------|-----------|---------|----------|
| SC-1 | DashboardView.vue under 400 lines AND zero firebase/firestore imports | C (firestore removal) + D (line-count audit) | PASS | Plan C Task 3 requires grep of firebase/firestore in DashboardView to return ZERO. Plan D Task 1 verify adds wc -l guard and duplicate firestore grep. Together they close SC-1. |
| SC-2 | Match expiry calculation reachable via unit test without mounting | A (extract + TDD) + B (buildMatchFromUserGroup tests) | PASS | Plan A creates src/utils/matchExpiry.ts plus src/utils/matchGrouping.ts with failing-first tests. Plan B Task 2 adds buildMatchFromUserGroup as an exported pure function with 5 unit tests that mock priceMatching - no mount required. |
| SC-3 | SearchView.getOwnedCount O(1) via computed Map | A Task 3A | PASS | Plan A Task 3A replaces filter+reduce with a computed buildOwnedCountMap(collectionStore.cards) and .get(name) lookup. Perf-tested 10k cards under 50ms. |
| SC-4 | MATCH_LIFETIME_DAYS defined in one place (matches.ts) and imported everywhere | A Task 2 | WARN | Plan A edits all 5 consumer files correctly, but the constant lives in src/utils/matchExpiry.ts, not src/stores/matches.ts. Single-source goal is met; the literal "in matches.ts" wording from ROADMAP is not. See Blocker 1. |

## Requirement Coverage

| Req | Closed By | Verdict | Evidence |
|-----|-----------|---------|----------|
| AXSS-07 | D Task 1 | PASS | Plan D defines initDashboard and converts onMounted(async ...) to onMounted(() => void initDashboard()); verify grep for onMounted-async returns ZERO. |
| ARCH-01 | B Task 3 + C Task 3 + D Task 1 | PASS | B extracts match pipeline (~400 LOC delete), C extracts blocked/clear/public-search (~500 LOC delete), D trims remainder to under 400. |
| ARCH-04 | B Task 1 + C Tasks 2-3 | PASS | 11 inline Firestore call sites move to useMatchesStore, src/services/stats.ts, src/services/publicCards.ts, useBlockedUsers, useDashboardPublicSearch. Grep guards confirm. |
| ARCH-07 | A Task 1 + A Task 3A | PASS | buildOwnedCountMap util + computed wiring in SearchView. |
| ARCH-13 | A Tasks 1-2 | PASS | Single constant in src/utils/matchExpiry.ts; 5 consumer files import it; grep guards in plan and verification. |

---

## Blockers (fix before execution)

### Blocker 1 - SC-4 wording vs. Plan A chosen home for the constant

- Where: ROADMAP SC-4 says MATCH_LIFETIME_DAYS is defined in exactly one place (matches.ts). Plan A parks it in src/utils/matchExpiry.ts.
- Why it matters: A strict verifier reading SC-4 literally will fail the phase. matches.ts will import the constant, not define it.
- Evidence: 02-A-PLAN.md artifacts line - src/utils/matchExpiry.ts provides MATCH_LIFETIME_DAYS. RESEARCH section on MATCH_LIFETIME_DAYS Deduplication explicitly recommends the util approach.
- Fix options:
  1. Update ROADMAP.md SC-4 to read: defined in exactly one place (src/utils/matchExpiry.ts). Matches RESEARCH recommendation.
  2. Move the export into src/stores/matches.ts and have consumers import from the store. Worse - utils are Firebase-free and easier to unit-test.
- Recommendation: Option 1 (update ROADMAP wording).

### Blocker 2 - Plan D version bump references an undocumented decision

- Where: 02-D-PLAN.md must_haves states: package.json version is bumped 1.23.0 to 1.23.1 (PATCH per user Plan-Phase decision #4). No CONTEXT.md exists under .planning/phases/02-dashboardview-decomposition/ recording this decision.
- Why it matters: CLAUDE.md says: when unsure which bump, ask the user. Phase 02 extracts 3 composables + 2 services + 3 utils. That is arguably larger than minor tweaks (which maps to PATCH per CLAUDE.md). The user prompt to the checker confirms 1.23.1, so the decision is valid - but it is not recorded in-tree, which makes the plan reference dangling.
- Fix: Add a one-line note in Plan D (or create a minimal CONTEXT.md): Version decision: PATCH (1.23.1) confirmed by user on 2026-04-14. Rationale: behavior-preserving refactor, no user-visible feature changes.
- Priority: lower than Blocker 1 and 3 but required for audit traceability.

### Blocker 3 - Plans B and C contain about 11 PORT-verbatim stubs to be filled in at execute time

- Where: 02-B-PLAN.md Task 1C (persistCalculatedMatches body is comment-only stub) and Task 2 (handleSaveMatch, handleDiscardMatch bodies). 02-C-PLAN.md Task 1 (4 clear-data action stubs), Task 2A (4 blocked-users action stubs), Task 2B (5 public-search action stubs).
- Why it matters: PORT-verbatim instructions are not the same as written code. An executor worktree may port incorrectly, skip a toast call, or mangle error handling. The verify steps (npm run test:unit) only cover the mocked-store layer; toast/confirm/localStorage behavior is not tested. Anti-loop Rule 1 says read before touching but does not guarantee byte-equivalence in a manual port. This is the single largest regression risk in the phase.
- Affected call sites (count about 11):
  - persistCalculatedMatches (calls notifyMatchUser - user-visible cloud function)
  - handleSaveMatch, handleDiscardMatch (user-visible toast + confirm modal)
  - loadBlockedUsers, openBlockedUsersModal, unblockUser, handleBlockByUsername
  - deleteCollectionStep, executeClearData, resumeClearData, clearAllData (destructive user-data flow)
  - handleSearchInput, selectSuggestion, handleClickOutside, searchPublicCards, addToWishlist
- Fix options:
  1. Inline the verbatim bodies into the PLAN.md so executors copy-paste exact blocks (safest, but adds ~400 lines to plans).
  2. Add a strict-diff verify gate to each stub task: create a pre-edit backup of DashboardView.vue (e.g. DashboardView.vue.baseline), and have each verify step diff the extracted body against the original source range, asserting only identifier renames differ.
  3. Require the dev agent to commit the pre-port state first (backup), port, then commit, so a git-level diff can be reviewed.
- Recommendation: Option 2 for persistCalculatedMatches and the clearAllData chain (highest user-visible impact); Option 1 or manual review for the smaller handlers.

---

## Warnings (non-blocking)

### Warning 1 - depends_on format uses plan-A style but frontmatter is plan: A

Plan B uses depends_on: [plan-A]. Plan C uses depends_on: [plan-A, plan-B]. Plan D uses depends_on: [plan-A, plan-B, plan-C]. The frontmatter field is plan: A (not plan-A). Wave numbers are consistent (1/2/3/4) so the chain is semantically correct. The gsd-tools plan-structure verifier may accept or reject depending on its regex. Suggest aligning to depends_on: [A] / [A, B] / [A, B, C] before Wave 2 to avoid a verifier stop.

### Warning 2 - Plan A widens blast radius beyond RESEARCH scope

Plan A header explicitly extends scope to useGlobalSearch.ts, UserProfileView.vue, SavedMatchesView.vue (all marked out of scope in RESEARCH). The deviation is justified by SC-4 wording but:
- The 3 SavedMatchesView sites change from Date.now() + 15 * 86400000 ms math to setDate(+15) calendar math. Plan A documents this as an intentional behavior change.
- No regression test is added for /saved-matches or /profile/self screens.
- Fix: add a 5-line smoke E2E to Plan D that loads those two routes and asserts no console errors. Analogous to dashboard-anonymous.spec.ts.

### Warning 3 - Plan D dashboard-match-flow.spec.ts will likely SKIP in CI

The spec includes test.skip(matchCount === 0, ...). A fresh dev Firebase seed typically has zero matches. Plan D explicitly accepts SKIP. That means Plan B calculateMatches port has NO end-to-end guard - unit tests cover buildMatchFromUserGroup (pure) but not persistCalculatedMatches (Firestore-writing). Combined with Blocker 3, this is the weakest safety net in the phase.
- Fix: require a manual smoke step in Plan D Task 3 where the executor seeds at least one match in dev Firebase, runs recalculate, and visually confirms a match card appears AND a saved match persists through a page reload.

### Warning 4 - Plan D may not hit under-400 lines without template sub-extraction

Research estimates DashboardView post-phase at about 320-380 lines. But current file is 1470 lines; template alone is ~310 lines. After all extractions:
- Script block: ~60 lines
- Template: ~310 lines (unchanged - template decomposition is out of scope)
- Total: ~370-400 lines (on the edge)
If Plan D wc -l check reports 401-420 lines, the plan tells the executor to document the breakdown and defer sub-component extraction. That may fail SC-1. Add a contingency to Plan D: if under-400 is missed by fewer than 10 lines, extract DashboardPublicSearchSection.vue as a template-only sub-component (no logic migration); if missed by more, stop and escalate.

---

## Strengths

1. TDD discipline is concrete. Plan A writes failing tests BEFORE implementation with explicit RED/GREEN checkpoints, fake-timers for DST/leap-year math, and perf assertions.
2. Dependency graph is correct. A(1) -> B(2) -> C(3) -> D(4). C correctly depends on A but NOT on B (blocked/clear/search are orthogonal to match pipeline).
3. Anti-loop-rule citations are explicit and embedded at task level with grep commands in done blocks.
4. The async-onMounted change is isolated into its own atomic commit (Plan D Task 1) for bisectability per MEMORY.md.
5. Firestore removal is verifiable by grep at every plan, cumulative zero at Plan D.
6. Plan-level file blast radius is non-overlapping at each wave: A edits utils + consumers; B edits stores/services/composable + DashboardView; C edits composables + DashboardView; D edits DashboardView + e2e + package.json. The only file every wave touches is DashboardView.vue - correct, since it is the decomposition target.

---

## Proceed to execute?

NOT YET. Resolve the three Blockers:
1. ROADMAP SC-4 wording OR constant-home (30 seconds).
2. Record version-bump decision in-tree (1 minute).
3. Tighten the 11 verbatim-port stubs with diff gates or inline bodies (10-20 minutes of editing B and C).

After those fixes, Wave 1 (Plan A) is safe to launch.
