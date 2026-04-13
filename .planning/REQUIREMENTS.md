# Requirements: Frontend Modernization

**Defined:** 2026-04-13
**Core Value:** Every interactive element must be accessible to keyboard-only and screen reader users

## v1 Requirements

### Accessibility

- [ ] **AXSS-01**: App has skip-navigation link to main content for keyboard users
- [ ] **AXSS-02**: Toast notifications announce to screen readers via aria-live="polite"
- [ ] **AXSS-03**: All interactive elements have visible focus ring via focus-visible (replacing outline-none across 15+ files)
- [ ] **AXSS-04**: All icon-only buttons have aria-label describing their action (6+ components)
- [ ] **AXSS-05**: All modal dialogs have role="dialog", aria-modal="true", and aria-labelledby (5 components)
- [ ] **AXSS-06**: All clickable div/span elements are replaced with semantic button elements (4+ components)
- [ ] **AXSS-07**: DashboardView onMounted does not use async/await (project rule compliance)
- [ ] **AXSS-08**: App declares color-scheme:dark and theme-color meta tags for native UI consistency

### Architecture

- [ ] **ARCH-01**: DashboardView decomposed — match calculation, blocked users, clear data, public search, sync, and state persistence extracted into composables
- [ ] **ARCH-02**: CollectionView decomposed — import state machine, delete-deck state machine, filter mapping, deck display cards, and pagination params extracted into composables
- [ ] **ARCH-03**: transition:all replaced with explicit property lists in style.css utilities (btn-base, input-base, card-base, modal-content, transition-fast/normal/slow)
- [ ] **ARCH-04**: DashboardView Firestore calls (searchPublicCards, sendInterestFromSearch) moved behind services/stores layer
- [ ] **ARCH-05**: CollectionGridCard split into CollectionGridCardCompact and CollectionGridCardFull with thin routing shell
- [ ] **ARCH-06**: CollectionGridCard swipe logic replaced with existing useSwipe.ts composable
- [ ] **ARCH-07**: SearchView getOwnedCount converted from per-card filter/reduce to computed Map with O(1) lookup
- [ ] **ARCH-08**: All dynamically-sourced img elements have explicit width and height attributes
- [ ] **ARCH-09**: All modal/drawer scroll containers have overscroll-behavior:contain
- [ ] **ARCH-10**: GlobalSearch implements ARIA combobox pattern (role, aria-expanded, aria-controls, keyboard nav)
- [ ] **ARCH-11**: MTG card names and brand name wrapped with translate="no"
- [ ] **ARCH-12**: All toLocaleDateString() calls replaced with Intl.DateTimeFormat using app locale
- [ ] **ARCH-13**: MATCH_LIFETIME_DAYS constant deduplicated — single source in matches.ts, imported by DashboardView

### Polish

- [ ] **NICE-01**: Interactive elements have touch-action:manipulation globally for no tap delay
- [ ] **NICE-02**: Price columns use font-variant-numeric:tabular-nums for stable alignment
- [ ] **NICE-03**: Headings use text-wrap:balance to prevent orphaned words
- [ ] **NICE-04**: All loading/ellipsis text uses Unicode "…" instead of "..."
- [ ] **NICE-05**: Loading spinners have role="status" and aria-label="Loading"
- [ ] **NICE-06**: Decorative SVG/icon elements have aria-hidden="true"
- [ ] **NICE-07**: CollectionGrid removes redundant computed(() => props.cards) wrapper
- [ ] **NICE-08**: useCollectionTotals calls useCollectionStore() at composable setup, not inside async callbacks
- [ ] **NICE-09**: collectionSummary in collection store is a computed derived from cards, not manually synced
- [ ] **NICE-10**: CollectionView filter/sort state persisted in URL query params
- [ ] **NICE-11**: Navigation actions use anchor elements instead of button + router.push for Cmd+click support

## v2 Requirements

(None — all 32 findings included in v1)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Visual redesign | Design system already distinctive — not generic AI |
| New features | This milestone is purely modernization |
| SSR / prerendering | Separate initiative, not part of this audit |
| Full E2E test suite for changes | Unit tests for logic changes, build verification otherwise |
| Options API migration | Already using Composition API throughout |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AXSS-01 | — | Pending |
| AXSS-02 | — | Pending |
| AXSS-03 | — | Pending |
| AXSS-04 | — | Pending |
| AXSS-05 | — | Pending |
| AXSS-06 | — | Pending |
| AXSS-07 | — | Pending |
| AXSS-08 | — | Pending |
| ARCH-01 | — | Pending |
| ARCH-02 | — | Pending |
| ARCH-03 | — | Pending |
| ARCH-04 | — | Pending |
| ARCH-05 | — | Pending |
| ARCH-06 | — | Pending |
| ARCH-07 | — | Pending |
| ARCH-08 | — | Pending |
| ARCH-09 | — | Pending |
| ARCH-10 | — | Pending |
| ARCH-11 | — | Pending |
| ARCH-12 | — | Pending |
| ARCH-13 | — | Pending |
| NICE-01 | — | Pending |
| NICE-02 | — | Pending |
| NICE-03 | — | Pending |
| NICE-04 | — | Pending |
| NICE-05 | — | Pending |
| NICE-06 | — | Pending |
| NICE-07 | — | Pending |
| NICE-08 | — | Pending |
| NICE-09 | — | Pending |
| NICE-10 | — | Pending |
| NICE-11 | — | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 0
- Unmapped: 32 (pending roadmap creation)

---
*Requirements defined: 2026-04-13*
*Last updated: 2026-04-13 after initial definition*
