# Frontend Modernization

## What This Is

A comprehensive accessibility, code quality, and architecture modernization of Cranial Trading — an existing Vue 3 + TypeScript + Tailwind CSS Magic: The Gathering trading platform. The design system (black/neon/rust palette, custom typography) is already distinctive; this work targets structural issues surfaced by a combined Vercel Web Interface Guidelines + Vue Best Practices audit.

## Core Value

Every interactive element must be accessible to keyboard-only and screen reader users — accessibility fixes are the non-negotiable foundation that everything else builds on.

## Requirements

### Validated

- ✓ Design system is distinctive (not generic AI) — confirmed by audit
- ✓ Virtual scrolling on large lists via @tanstack/vue-virtual — existing
- ✓ Composables extracted for card allocation, card filter, collection totals, virtual grid — existing
- ✓ shallowRef used for large arrays (collection store) — existing
- ✓ Typed defineProps/defineEmits throughout — existing
- ✓ prefers-reduced-motion global override in style.css — existing

### Active

**Critical — Accessibility & Standards (8 items)**
- [ ] AXSS-01: Add skip-navigation link to main content
- [ ] AXSS-02: Add aria-live="polite" on toast notification container
- [ ] AXSS-03: Replace all focus:outline-none with focus-visible:ring-* (15+ files)
- [ ] AXSS-04: Add aria-label to all icon-only buttons (6+ components)
- [ ] AXSS-05: Add role="dialog", aria-modal="true", aria-labelledby on all modals (5 components)
- [ ] AXSS-06: Replace div/span click handlers with button elements (4+ components)
- [ ] AXSS-07: Fix async onMounted in DashboardView (violates project rule)
- [ ] AXSS-08: Add color-scheme:dark meta tag and theme-color meta

**Important — Architecture & Code Quality (13 items)**
- [ ] ARCH-01: Decompose DashboardView mega-component (1158 lines, 6 features → composables)
- [ ] ARCH-02: Decompose CollectionView mega-component (1050+ lines, 5 modes → composables)
- [ ] ARCH-03: Replace transition:all antipattern in style.css utilities (54 occurrences, 22 files)
- [ ] ARCH-04: Move inline Firestore calls in DashboardView behind services layer
- [ ] ARCH-05: Split CollectionGridCard into compact and full variants
- [ ] ARCH-06: Replace duplicated swipe logic with existing useSwipe.ts composable
- [ ] ARCH-07: Fix getOwnedCount per-card performance issue in SearchView (computed Map)
- [ ] ARCH-08: Add width/height to dynamically sourced img elements
- [ ] ARCH-09: Add overscroll-behavior:contain on modal scroll containers
- [ ] ARCH-10: Implement ARIA combobox pattern on GlobalSearch
- [ ] ARCH-11: Add translate="no" on MTG card names and brand name
- [ ] ARCH-12: Replace toLocaleDateString() with Intl.DateTimeFormat using app locale
- [ ] ARCH-13: Deduplicate MATCH_LIFETIME_DAYS constant (DashboardView → matches.ts import)

**Nice-to-Have — Polish & Optimization (11 items)**
- [ ] NICE-01: Add touch-action:manipulation globally
- [ ] NICE-02: Add font-variant-numeric:tabular-nums on price columns
- [ ] NICE-03: Add text-wrap:balance on headings
- [ ] NICE-04: Replace hardcoded "..." with Unicode ellipsis "…"
- [ ] NICE-05: Add role="status" and aria-label on loading spinners
- [ ] NICE-06: Add aria-hidden="true" on decorative SVGs/icons
- [ ] NICE-07: Remove redundant computed(() => props.cards) in CollectionGrid
- [ ] NICE-08: Move useCollectionStore() calls to composable setup in useCollectionTotals
- [ ] NICE-09: Make collectionSummary a computed derived from cards (not manually synced)
- [ ] NICE-10: Persist filter/sort state in URL query params (CollectionView)
- [ ] NICE-11: Replace router.push in buttons with anchor elements for Cmd+click support

### Out of Scope

- Visual redesign — design system is already distinctive, not generic
- New features — this is purely modernization work
- Vue Options API migration — already using Composition API throughout
- Server-side rendering / SSR — not part of this milestone
- Full E2E test coverage for audit changes — unit tests where logic changes, build verification otherwise

## Context

- **Existing app**: v1.22.0, Vue 3 + TypeScript + Vite + Firebase + Tailwind CSS
- **Audit source**: Combined Vercel Web Interface Guidelines + Vue Best Practices audit (April 2026)
- **Biggest structural debt**: DashboardView and CollectionView are mega-components with 1000+ lines each, mixing business logic, Firestore calls, and UI rendering
- **Systemic CSS issue**: `transition: all` is baked into 5 shared utility classes (`btn-base`, `input-base`, `card-base`, `modal-content`, `transition-fast/normal/slow`) affecting 22+ files
- **Accessibility baseline**: No skip-nav, no aria-live on toasts, outline-none without focus replacement is pervasive, modals lack dialog roles
- **What's already good**: Design tokens, shallowRef for perf, composables for cross-component logic, virtual scrolling, typed props/emits

## Constraints

- **Tech stack**: Vue 3 + TypeScript + Tailwind CSS + Firebase — no framework changes
- **TDD required**: Per CLAUDE.md, every logic change needs tests first (RED → GREEN → REFACTOR)
- **Branch**: All work on `develop`, never commit to `main` directly
- **Build**: Must pass `npx vite build` after every change (pre-existing lint warnings OK)
- **Anti-loop rules**: Read before touching, trace all callers, identify parallel siblings, verify i18n keys exist
- **No async onMounted**: Never use async onMounted with await — breaks anonymous user profile loading

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| All 32 findings in v1 | User wants complete modernization, not partial | — Pending |
| Coarse granularity (3-5 phases) | Batch related fixes to reduce overhead | — Pending |
| Skip domain research | We already have comprehensive audit data | — Pending |
| Accessibility first | Foundation that other work builds on | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-13 after initialization*
