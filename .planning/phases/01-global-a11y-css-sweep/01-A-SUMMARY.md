---
phase: 01-global-a11y-css-sweep
plan: A
subsystem: ui
tags: [tailwind, css, accessibility, i18n, intl, formatDate]

# Dependency graph
requires: []
provides:
  - Global transition:all antipatterns replaced with explicit property transitions in 5 shared utility classes
  - touch-action:manipulation applied to all interactive elements via @layer base
  - text-wrap:balance on h1/h2/h3 via @layer base
  - overscroll-behavior:contain on .modal-content
  - .tabular-nums utility class (font-variant-numeric:tabular-nums)
  - color-scheme:dark and theme-color:#000000 meta tags in index.html
  - Skip-nav link (<a href="#main-content">) as first focusable element in App.vue
  - <main id="main-content"> landmark wrapping RouterView
  - formatDate() utility (src/utils/formatDate.ts) using Intl.DateTimeFormat
  - skipToContent i18n key in en/es/pt locale files
affects:
  - 02-aria-focus-sweep (consumes .btn-base, .input-base, .card-base changes)
  - 03-component-refactor (consumes formatDate utility, main landmark)
  - Any plan adding new modals (gets overscroll-behavior:contain for free)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Explicit transition properties: never use transition:all in shared utility classes"
    - "TDD for pure utility functions: test first, implement to green"
    - "Atomic i18n key creation: always add to en/es/pt in the same commit"

key-files:
  created:
    - src/utils/formatDate.ts
    - tests/unit/utils/formatDate.test.ts
  modified:
    - src/style.css
    - index.html
    - src/App.vue
    - src/locales/en.json
    - src/locales/es.json
    - src/locales/pt.json

key-decisions:
  - "Removed focus:outline-none from .input-base @apply — it belongs on individual inputs only, not the utility class; .input-base:focus rule already provides visible border"
  - "skip-nav link placed before v-if/v-else auth blocks so keyboard users can always tab to it regardless of auth state"
  - "formatDate falls back to toLocaleDateString() if Intl constructor throws (e.g. unknown locale tag)"

patterns-established:
  - "transition pattern: list only properties that actually animate (background-color, border-color, color, opacity, transform)"
  - "formatDate signature: (date: Date | null | undefined, locale: string, options?) — callers pass nullable dates from Firestore"

requirements-completed: [AXSS-01, AXSS-08, ARCH-03, ARCH-09, ARCH-12, NICE-01, NICE-02, NICE-03]

# Metrics
duration: 20min
completed: 2026-04-13
---

# Phase 01 Plan A: Global CSS/HTML Foundation Summary

**Replaced all `transition:all` antipatterns across 5 shared utility classes, wired skip-nav landmark, added dark-mode meta tags, and created a locale-aware `formatDate()` utility — 8 requirements resolved in 7 files**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-13T17:00:00Z
- **Completed:** 2026-04-13T17:16:00Z
- **Tasks:** 3
- **Files modified:** 7 (src/style.css, index.html, src/App.vue, en/es/pt locale files, src/utils/formatDate.ts + test)

## Accomplishments

- Eliminated all `transition: all` from the 5 shared utility classes that cascade to 22+ component files, replacing each with explicit property lists — resolves ARCH-03 in one file instead of 22
- Added skip-nav link + `<main id="main-content">` landmark to App.vue — resolves AXSS-01
- Added `color-scheme:dark` and `theme-color:#000000` meta tags to index.html — resolves AXSS-08
- Added global `touch-action: manipulation`, `text-wrap: balance`, and `.tabular-nums` rules — resolves NICE-01, NICE-02, NICE-03
- Added `overscroll-behavior: contain` to `.modal-content` — resolves ARCH-09
- Created `formatDate()` utility with TDD (7 tests, RED → GREEN) — resolves ARCH-12
- All `skipToContent` i18n keys added atomically to en/es/pt locale files

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix transition:all antipatterns in style.css + add global base rules** - `66ba1da` (feat)
2. **Task 2: Add meta tags to index.html + skip-nav link + main landmark to App.vue** - `796df41` (feat)
3. **Task 3: Create formatDate utility with Intl.DateTimeFormat** - `0dae8b1` (feat)

## Files Created/Modified

- `src/style.css` — Replaced transition:all in btn-base, input-base, card-base:hover, modal-content, transition-fast/normal/slow; added touch-action, text-wrap, tabular-nums, overscroll-behavior rules
- `index.html` — Added color-scheme:dark and theme-color meta tags after viewport meta
- `src/App.vue` — Added skip-nav anchor as first template element, wrapped RouterView in `<main id="main-content">`
- `src/locales/en.json` — Added `common.actions.skipToContent: "Skip to main content"`
- `src/locales/es.json` — Added `common.actions.skipToContent: "Saltar al contenido principal"`
- `src/locales/pt.json` — Added `common.actions.skipToContent: "Ir para o conteúdo principal"`
- `src/utils/formatDate.ts` — New locale-aware date formatting utility using Intl.DateTimeFormat
- `tests/unit/utils/formatDate.test.ts` — 7 unit tests covering null, undefined, invalid Date, locale difference, custom options

## Decisions Made

- Removed `focus:outline-none` from `.input-base` `@apply` — it was suppressing visible focus rings on all inputs globally; the `.input-base:focus` rule already provides a visible neon border, so removing the outline-none from the base class is correct.
- Skip-nav link placed before the `v-if="authStore.loading"` div so keyboard users can always reach it regardless of auth state.
- `formatDate` falls back to `toLocaleDateString()` if `Intl.DateTimeFormat` throws (e.g. unknown locale tag), per the threat model T-01A-03 DoS mitigation.

## Deviations from Plan

None — plan executed exactly as written. The `focus:outline-none` removal from `.input-base` was explicitly called out in the plan's task description ("remove `focus:outline-none` from the @apply line").

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All 8 requirements for Plan A are complete (AXSS-01, AXSS-08, ARCH-03, ARCH-09, ARCH-12, NICE-01, NICE-02, NICE-03)
- `formatDate()` utility is ready for Plan C to consume (replacing `toLocaleDateString()` calls in DashboardView, SavedMatchesView, SettingsView)
- Plans B and C can proceed in parallel — Plan A has no cross-cutting concerns with either
- The `<main id="main-content">` landmark is in place for any subsequent aria-landmark work in Plan B

---
*Phase: 01-global-a11y-css-sweep*
*Completed: 2026-04-13*
