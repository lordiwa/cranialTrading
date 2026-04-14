---
phase: 01-global-a11y-css-sweep
plan: C
subsystem: component-a11y-sweep
tags: [accessibility, focus-visible, semantic-html, i18n-locale, translate-no, img-dimensions, formatDate]
dependency_graph:
  requires: [plan-A, plan-B]
  provides: [focus-visible ring pattern wired across 18 files, div→button replacements in 4 components, formatDate wiring in 6 sites, translate=no on MTG names, img width/height on dynamic thumbnails, Unicode ellipsis across locales]
  affects: [DashboardView, SavedMatchesView, SettingsView, SavedContactCard, DeckCard, auth.ts, CollectionGridCard, CardGridSearch, GlobalSearch, MobileSearchOverlay, en.json, es.json, pt.json, plus 18 files from Task 1 focus sweep]
tech_stack:
  added: []
  patterns: [focus-visible ring pattern, translate=no for preserving MTG names under browser auto-translation, explicit width/height for CLS prevention, Intl.DateTimeFormat via formatDate utility, Unicode U+2026 ellipsis over literal "..."]
key_files:
  created: []
  modified:
    - src/views/DashboardView.vue
    - src/views/SavedMatchesView.vue
    - src/views/SettingsView.vue
    - src/views/MessagesView.vue
    - src/components/contacts/SavedContactCard.vue
    - src/components/decks/DeckCard.vue
    - src/stores/auth.ts
    - src/components/collection/CollectionGridCard.vue
    - src/components/common/CardGridSearch.vue
    - src/components/ui/GlobalSearch.vue
    - src/components/ui/MobileSearchOverlay.vue
    - src/components/ui/CardFilterBar.vue
    - src/components/ui/BaseSelect.vue
    - src/components/collection/AddCardModal.vue
    - src/components/collection/EditCardModal.vue
    - src/components/collection/CardDetailModal.vue
    - src/components/collection/ImportDeckModal.vue
    - src/components/search/AdvancedFilterModal.vue
    - src/components/search/FilterPanel.vue
    - src/components/decks/EditDeckCardModal.vue
    - src/components/decks/AddCardToDeckModal.vue
    - src/components/decks/CreateDeckModal.vue
    - src/components/binders/CreateBinderModal.vue
    - src/components/preferences/ImportPreferencesModal.vue
    - src/locales/en.json
    - src/locales/es.json
    - src/locales/pt.json
decisions:
  - "div→button in CollectionGridCard compact mode preserves the existing ref (compactCardRef) — buttons expose the same DOM properties used by the IntersectionObserver"
  - "auth.ts gets its locale via useI18n() inside the store action rather than hoisting — Pinia actions can call composables at call time"
  - "SettingsView + SavedContactCard wrap formatDate in a computed so the template stays declarative; templates originally called toLocaleDateString() directly"
  - "Card images use width/height attributes matching the Scryfall 'small' variant natural size (146×204 for CardGridSearch) and half-resolution for thumbnail slots (40×56 w-10 h-14, 48×67 w-12 h-[67px]) — prevents CLS without forcing display size"
  - "Unicode … replacement applied with a bulk replace across locale string values; no keys or regex patterns contained '...' so a plain replaceAll was safe"
metrics:
  duration: 20min
  completed_date: "2026-04-14"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 27
---

# Phase 01 Plan C: Component A11y Sweep Summary

Per-component accessibility sweep: focus-visible rings across 18 files, semantic buttons replacing clickable divs in 4 components, formatDate() wired into 6 toLocaleDateString call sites, translate="no" on MTG card names, explicit img dimensions for CLS prevention, Unicode ellipsis across all 3 locale files.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | focus-visible ring sweep | b88a5f3 | 18 .vue files (inputs, selects, buttons) |
| 2 | div→button semantic HTML | ee6bf9f | GlobalSearch, MobileSearchOverlay, CollectionGridCard, DashboardView |
| 3 | formatDate + translate=no + img dimensions + Unicode ellipsis | (this commit) | 6 formatDate sites, 4 MTG name sites, 4 img-dim sites, 3 locale files |

## What Changed (Task 3 specifics)

**A. formatDate() wiring (6 sites):** replaced `date.toLocaleDateString()` with `formatDate(date, locale.value)` in DashboardView (formatLastSync), SavedMatchesView (formatLastSync), SettingsView (createdAt via computed), SavedContactCard (savedAt via computed), DeckCard (updatedAt inline), and auth.ts (rate-limit toast, locale retrieved via useI18n() inside the action).

**B. translate="no" (4 components):** added to card-name display elements in CollectionGridCard (compact + full + 2 fallback spans), CardGridSearch, GlobalSearch (collection + users + scryfall), MobileSearchOverlay (collection + users + scryfall) — prevents browser auto-translation of MTG names which must remain canonical.

**C. Explicit img width/height (4 components):** added to dynamic card thumbnails — CollectionGridCard (244×340), CardGridSearch (146×204), GlobalSearch (40×56), MobileSearchOverlay (48×67). Avatar imgs already had 14×14 from Plan B.

**D. Unicode ellipsis (3 locales):** bulk replacement of literal `"..."` → `"…"` across en.json, es.json, pt.json (78 replacements per file). All 3 files re-validated as parseable JSON.

## Verification

- `npm run test:unit`: 516 passed (31 files)
- `npm run test:unit -- formatDate`: 7 passed
- `npx vite build`: built in 23.48s, no new errors
- `grep -rn "toLocaleDateString" src/ --include="*.ts" --include="*.vue"`: no matches outside formatDate.ts fallback
- `grep -rn "focus:outline-none" src/ --include="*.vue"` without paired focus indicator: no matches
- JSON parse check on all 3 locale files: ok

## Notes

- Pre-existing Spanish "Guardado:" hardcoded label in SavedContactCard.vue line 45 was left as-is (not in scope; flagged for a future i18n pass).
- Plan C verification pattern held across all 3 tasks: commit per task, full build + tests at end.
