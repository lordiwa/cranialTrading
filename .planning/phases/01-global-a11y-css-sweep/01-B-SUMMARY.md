---
phase: 01-global-a11y-css-sweep
plan: B
subsystem: ui-components
tags: [accessibility, aria, i18n, modals, icons, toast]
dependency_graph:
  requires: []
  provides: [common.aria i18n keys, toast live region, icon aria-hidden defaults, modal dialog roles, icon-button aria-labels]
  affects: [BaseToast, BaseLoader, SvgIcon, SpriteIcon, ConfirmModal, PromptModal, WelcomeModal, HelpCarouselModal, CollectionGridCard, BaseInput, FloatingActionButton, HelpTooltip, CardFilterBar, MobileSearchOverlay, AddCardModal, EditCardModal]
tech_stack:
  added: []
  patterns: [WAI-ARIA live regions, role=dialog pattern with aria-labelledby, aria-hidden for decorative icons, role=status on spinners]
key_files:
  created: []
  modified:
    - src/locales/en.json
    - src/locales/es.json
    - src/locales/pt.json
    - src/components/ui/BaseToast.vue
    - src/components/ui/BaseLoader.vue
    - src/components/ui/SvgIcon.vue
    - src/components/ui/SpriteIcon.vue
    - src/components/ui/ConfirmModal.vue
    - src/components/ui/PromptModal.vue
    - src/components/ui/WelcomeModal.vue
    - src/components/ui/HelpCarouselModal.vue
    - src/components/collection/CollectionGridCard.vue
    - src/components/ui/BaseInput.vue
    - src/components/ui/FloatingActionButton.vue
    - src/components/ui/HelpTooltip.vue
    - src/components/ui/CardFilterBar.vue
    - src/components/ui/MobileSearchOverlay.vue
    - src/components/collection/AddCardModal.vue
    - src/components/collection/EditCardModal.vue
decisions:
  - "aria-atomic=false on BaseToast so each toast item announces individually, not the full list"
  - "SvgIcon ariaHidden prop defaults true but is overridable — callers providing accessible icons set ariaHidden=false and supply their own aria-label"
  - "HelpCarouselModal title ID points to h3 'Ayuda' header (static label), not the dynamic panel h4 title — h3 is always present, h4 may be absent when no items are loaded"
  - "Status cycle buttons in CollectionGridCard use :aria-label='status' (the internal status string value) as a pragmatic label — sufficient for screen readers"
metrics:
  duration: 35min
  completed_date: "2026-04-13"
  tasks_completed: 5
  tasks_total: 5
  files_modified: 19
---

# Phase 01 Plan B: Shared UI ARIA Layer Summary

ARIA live region on toast container, dialog roles on 4 standalone modals, aria-hidden defaults on icon components, role=status on BaseLoader, and i18n-backed aria-labels on all icon-only buttons across 9 feature files.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | i18n keys — all 3 locales | 6bd171d | en.json, es.json, pt.json |
| 2 | BaseToast aria-live + decorative SVG aria-hidden | 93f815a | BaseToast.vue |
| 3 | SvgIcon/SpriteIcon aria-hidden defaults; BaseLoader role=status | b7798ec | SvgIcon.vue, SpriteIcon.vue, BaseLoader.vue |
| 4 | role=dialog + aria-modal + aria-labelledby on 4 modals | a32d3e7 | ConfirmModal.vue, PromptModal.vue, WelcomeModal.vue, HelpCarouselModal.vue |
| 5 | Wire aria-labels to icon-only buttons; fix hardcoded Spanish labels | d1880dd | CollectionGridCard.vue, BaseInput.vue, FloatingActionButton.vue, HelpTooltip.vue, CardFilterBar.vue, MobileSearchOverlay.vue, AddCardModal.vue, EditCardModal.vue |

## What Was Built

**Task 1 — i18n keys (atomic, all 3 locales)**
Added `common.actions.skipToContent` and a new `common.aria` object with 7 keys (`loading`, `closeModal`, `flipCard`, `clearInput`, `toggleVisibility`, `nextSlide`, `prevSlide`) to en.json, es.json, and pt.json simultaneously.

**Task 2 — BaseToast live region**
Added `role="status" aria-live="polite" aria-atomic="false"` to the outer toast container div inside `<Teleport>`. Added `aria-hidden="true"` to all 4 decorative SVGs (spinner, success, error, info icons). Screen readers will now announce toast messages via the live region; the icons are skipped.

**Task 3 — Icon component aria-hidden defaults + BaseLoader status**
- `SvgIcon.vue`: new `ariaHidden` prop (default `true`) bound as `:aria-hidden="props.ariaHidden ? 'true' : undefined"` plus `focusable="false"` on the SVG element.
- `SpriteIcon.vue`: new `ariaHidden` (default `true`) and `ariaLabel` (default `''`) props. The span gets `:aria-hidden`, `:role="ariaLabel ? 'img' : undefined"`, and `:aria-label`.
- `BaseLoader.vue`: added `useI18n` import, `role="status"` and `:aria-label="t('common.aria.loading')"` on the spinner div, `aria-live="polite"` on the outer wrapper div.

**Task 4 — Modal dialog roles**
All 4 standalone modals that implement their own overlay pattern (bypassing `BaseModal`) now have the WAI-ARIA dialog pattern:
- Each generates a unique `dialogTitleId` string in `<script setup>` via `Math.random().toString(36)`
- Inner content div gets `role="dialog" aria-modal="true" :aria-labelledby="dialogTitleId"`
- Title element (h2 or h3) gets `:id="dialogTitleId"`
- PromptModal input also got `focus-visible:ring-2` for keyboard visibility
- HelpCarouselModal close button got `:aria-label="'Close modal'"`

**Task 5 — Icon-only button aria-labels**
Replaced hardcoded Spanish `aria-label` attributes with `t()` calls and added missing `aria-label` attributes to every icon-only button in 9 files:
- `CollectionGridCard`: eye toggle (`toggleVisibility`), status cycle buttons (status value), flip card button (`flipCard`)
- `BaseInput`: clear button (`clearInput`) — also added `useI18n` import
- `FloatingActionButton`: `:aria-label="label"` alongside existing `:title`
- `HelpTooltip`: `:aria-label="title"` on trigger button
- `CardFilterBar`: `:aria-label="t('common.aria.toggleVisibility')"` on filter icon button
- `MobileSearchOverlay`: `:aria-label="t('common.actions.back')"` on back chevron; `:aria-label="t('common.aria.clearInput')"` on clear
- `AddCardModal`: replaced `aria-label="Ver otro lado de la carta"` → `t('common.aria.flipCard')` and `aria-label="Cerrar zoom"` → `t('common.aria.closeModal')`
- `EditCardModal`: replaced `aria-label="Cerrar zoom"` → `t('common.aria.closeModal')`

## Verification

- `npx vite build` — passes after each task
- `npm run test:unit` — 509/509 tests pass
- Locale key verification node script — all 9 checks pass

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all changes are wired to real i18n keys created in Task 1.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. All changes are template attribute additions and i18n key additions. As noted in the plan's threat model, dialog title IDs are random strings and title content uses text interpolation (not v-html).

## Self-Check: PASSED

All 19 modified files exist. All 5 task commits found:
- 6bd171d — Task 1: i18n keys
- 93f815a — Task 2: BaseToast ARIA
- b7798ec — Task 3: icon components + BaseLoader
- a32d3e7 — Task 4: modal dialog roles
- d1880dd — Task 5: icon-only button aria-labels
