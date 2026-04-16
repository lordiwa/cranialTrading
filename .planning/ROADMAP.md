# Roadmap: Frontend Modernization

## Overview

Systematically modernize Cranial Trading v1.22.0 by sweeping accessibility fixes across the entire codebase first, then decomposing the two mega-components (DashboardView and CollectionView) that carry the heaviest structural debt, and finally polishing the GlobalSearch interaction model. Each phase groups work by blast radius — files that must be touched together stay in the same phase to minimize merge conflicts and review overhead.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Global A11y & CSS Sweep** - Accessibility fixes and systemic CSS/HTML corrections across all files
- [ ] **Phase 2: DashboardView Decomposition** - Decompose the 1158-line DashboardView mega-component into composables + fix its rule violations
- [ ] **Phase 3: CollectionView Decomposition** - Split the 4579-line CollectionView into 3 route-level views + composables, split CollectionGridCard, wire useSwipe, add URL-synced filters
- [ ] **Phase 4: GlobalSearch & Navigation Polish** - ARIA combobox on GlobalSearch and anchor-based navigation

## Phase Details

### Phase 1: Global A11y & CSS Sweep
**Goal**: Every interactive element in the app is accessible to keyboard and screen reader users, and systemic CSS/HTML antipatterns are eliminated globally
**Depends on**: Nothing (first phase)
**Requirements**: AXSS-01, AXSS-02, AXSS-03, AXSS-04, AXSS-05, AXSS-06, AXSS-08, ARCH-03, ARCH-08, ARCH-09, ARCH-11, ARCH-12, NICE-01, NICE-02, NICE-03, NICE-04, NICE-05, NICE-06
**Success Criteria** (what must be TRUE):
  1. A keyboard-only user can skip repeated navigation and reach main content directly via a visible skip link
  2. A screen reader announces toast notifications as they appear without focus movement
  3. Every interactive element shows a visible focus ring when navigated to with the keyboard (no bare outline-none remaining)
  4. All icon-only buttons announce their purpose to screen readers via aria-label
  5. All modal dialogs are announced as dialogs with accessible names by screen readers
**Plans**: 3 plans
Plans:
- [ ] 01-PLAN-A.md — CSS/HTML global foundation: transition:all fix, skip-nav, meta tags, formatDate utility, touch-action/text-wrap/tabular-nums
- [ ] 01-PLAN-B.md — Component ARIA sweep: BaseToast live region, BaseLoader status, SvgIcon/SpriteIcon aria-hidden, 4 standalone modal dialog roles, i18n aria keys
- [ ] 01-PLAN-C.md — Template fixes: focus:outline-none→focus-visible:ring, div→button, img dimensions, translate=no, formatDate wiring, Unicode ellipsis
**UI hint**: yes

### Phase 2: DashboardView Decomposition
**Goal**: DashboardView is a thin orchestrator that delegates match calculation, blocked users, clear data, public search, sync, and state persistence to focused composables, with no inline Firestore calls and no async onMounted
**Depends on**: Phase 1
**Requirements**: ARCH-01, ARCH-04, ARCH-07, ARCH-13, AXSS-07
**Success Criteria** (what must be TRUE):
  1. DashboardView.vue is under 400 lines and contains no direct Firestore imports
  2. Match expiry calculation logic is reachable via unit test without mounting the component
  3. SearchView getOwnedCount does not re-scan the collection array on every card render (O(1) lookup via computed Map)
  4. MATCH_LIFETIME_DAYS is defined in exactly one place (src/utils/matchExpiry.ts — Firebase-free, unit-testable) and imported everywhere it is used, including src/stores/matches.ts
**Plans**: 4 plans (A/B/C/D — see .planning/phases/02-dashboardview-decomposition/)
**UI hint**: yes

### Phase 3: CollectionView Decomposition
**Goal**: CollectionView.vue (4579 lines) is split into 3 route-level views (CollectionView, DeckView, BinderView) each under 600 lines, with import/delete state machines and filter/pagination logic extracted into composables; CollectionGridCard is split into compact and full variants with useSwipe; filter state syncs bidirectionally with the URL
**Depends on**: Phase 2
**Requirements**: ARCH-02, ARCH-05, ARCH-06, NICE-07, NICE-08, NICE-09, NICE-10
**Success Criteria** (what must be TRUE):
  1. CollectionView.vue is under 600 lines with no duplicated state machine logic inline
  2. DeckView.vue and BinderView.vue exist as first-class route-level views at /decks/:id? and /binders/:id?
  3. CollectionGridCard renders via a routing shell that delegates to CollectionGridCardCompact or CollectionGridCardFull — no duplicated swipe handlers
  4. Swiping a collection card uses useSwipe.ts with no inline touch event listeners remaining in CollectionGridCard
  5. Changing a filter or sort in CollectionView updates the browser URL, and refreshing the page restores the same filtered view
**Plans**: 5 plans
Plans:
- [x] 03-A-PLAN.md — Pure helper foundation: extract collectionFilters.ts + importHelpers.ts, fix NICE-07/08/09
- [x] 03-B-PLAN.md — State machine composables: useCollectionImport, useDeckDeletion, useCollectionFilterUrl, useCollectionPagination (NICE-10)
- [ ] 03-C-PLAN.md — Route split: create DeckView.vue + BinderView.vue, update router, eliminate viewMode
- [x] 03-D-PLAN.md — CollectionGridCard split: routing shell + Compact + Full variants, wire useSwipe (ARCH-05, ARCH-06)
- [ ] 03-E-PLAN.md — Closeout: dead code audit, line count verification, version bump, user verification
**UI hint**: yes

### Phase 4: GlobalSearch & Navigation Polish
**Goal**: GlobalSearch exposes a fully keyboard-navigable ARIA combobox and navigation actions support Cmd+click / middle-click browser behavior
**Depends on**: Phase 3
**Requirements**: ARCH-10, NICE-11
**Success Criteria** (what must be TRUE):
  1. A screen reader announces the GlobalSearch as a combobox with its expanded/collapsed state and the number of available suggestions
  2. Keyboard users can navigate GlobalSearch suggestions with arrow keys and select with Enter without a mouse
  3. Navigation actions (e.g. "Go to deck", "View profile") open in a new tab when Cmd+clicked or middle-clicked
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Global A11y & CSS Sweep | 0/3 | Not started | - |
| 2. DashboardView Decomposition | 0/TBD | Not started | - |
| 3. CollectionView Decomposition | 0/5 | Planning complete | - |
| 4. GlobalSearch & Navigation Polish | 0/TBD | Not started | - |
