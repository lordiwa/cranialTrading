# Phase 02 — DashboardView Decomposition — Context

**Date:** 2026-04-14
**Prior phase shipped:** v1.23.0 (Phase 01 — Global A11y & CSS Sweep)

## Scope

Decompose `src/views/DashboardView.vue` (1470 lines) into focused composables + services, remove inline Firestore, remove async onMounted, optimize SearchView's getOwnedCount, and deduplicate MATCH_LIFETIME_DAYS.

## Decisions recorded this phase

| # | Decision | Rationale | Where enforced |
|---|----------|-----------|-----------------|
| 1 | MATCH_LIFETIME_DAYS lives in `src/utils/matchExpiry.ts`, not `src/stores/matches.ts` | utils are Firebase-free and easier to unit-test; matches.ts imports it like every other consumer. ROADMAP SC-4 updated to reflect. | ROADMAP.md SC-4 wording, Plan A |
| 2 | Include the 3 "out-of-scope" files in MATCH_LIFETIME_DAYS dedup (useGlobalSearch.ts, UserProfileView.vue, SavedMatchesView.vue) | SC-4 says "imported everywhere it is used". Leaving inline `* 15` arithmetic violates that literally. Plan A expands scope. | Plan A Task 2 |
| 3 | Auto-suggest in DashboardView's public search: verbatim port, don't force reuse of useSearchSuggestions | Impedance mismatch — existing composable mixes collection + scryfall; DashboardView needs scryfall-only. `TODO(phase-04+)` for future extraction. | Plan C |
| 4 | Version bump: PATCH (1.23.0 → 1.23.1) | Phase 02 is behavior-preserving refactor — no new UI surface, no new API integrations. Per CLAUDE.md semver rules, patch is correct. | Plan D |
| 5 | BlockedUsersModal stays inline in DashboardView + SavedMatchesView (not extracted to shared component) | Stretch goal deferred; decomposition-focused phase. Noted for a follow-up. | Plan C (deferred) |

## Anti-loop rule commitments (from CLAUDE.md)

- **Rule 1 (read before touching):** every composable extraction must `grep -rn` call sites before moving logic.
- **Rule 2 (no scope creep):** only extract what the requirements mandate — don't refactor adjacent code.
- **Rule 6 (atomic parallel changes):** removing a ref from DashboardView AND adding it to a composable = same commit.

## Risks flagged by plan-checker

1. **Verbatim-port discipline:** Plans B and C have ~11 "copy body from DashboardView" tasks. Executor must preserve toast/confirm/localStorage behavior EXACTLY. Mitigation: strict-diff verify gates on each port task (see each plan's verify block).
2. **E2E test coverage gap:** the dashboard-match-flow regression may SKIP on fresh dev seed (no matches). Plan D Task 3 includes a manual smoke step to seed a match and verify.
3. **Under-400-lines target:** post-extraction DashboardView may land at 370–420 lines. If > 400, Plan D Task 4 triggers a template sub-extraction (DashboardPublicSearchSection.vue) as a fallback.

## Success criteria (from ROADMAP)

1. `DashboardView.vue` < 400 lines and zero `from 'firebase/firestore'` imports
2. Match expiry logic reachable via unit test without mounting
3. `SearchView.getOwnedCount` uses O(1) Map lookup
4. `MATCH_LIFETIME_DAYS` defined once (utils/matchExpiry.ts) and imported everywhere

## Resume file

`.planning/phases/02-dashboardview-decomposition/02-A-PLAN.md` — Wave 1 (foundation).
