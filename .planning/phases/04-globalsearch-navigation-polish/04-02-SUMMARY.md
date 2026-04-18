---
plan: 04-02
name: WAI-ARIA combobox template wiring
phase: 04-globalsearch-navigation-polish
status: complete
autonomous: false
completed: 2026-04-17
commits:
  - 3afcac4 feat(04-02) apply ARIA combobox attributes to GlobalSearch and MobileSearchOverlay
requirements_addressed:
  - ARCH-10
key_files:
  modified:
    - src/components/ui/GlobalSearch.vue
    - src/components/ui/MobileSearchOverlay.vue
must_haves_verified:
  - GlobalSearch.vue exposes role="combobox" + aria-expanded + aria-controls + aria-activedescendant on input
  - MobileSearchOverlay.vue exposes identical ARIA attributes (Rule 6 parallel)
  - Active-tab results container has role="listbox" with unique id matching aria-controls
  - Each result row has role="option" with index-based id (option-{tab}-{index}) and aria-selected
  - Wrapper has aria-busy bound to loading
  - sr-only aria-live="polite" span renders ariaLiveMessage from composable
  - handleInputKeydown dispatches ArrowUp/Down/Home/End/Enter to moveHighlight/selectHighlighted
  - IME guard present (e.isComposing || e.keyCode === 229)
  - aria-expanded binds to isExpanded computed (Pitfall 1 avoided)
---

# Plan 04-02 Summary: WAI-ARIA Combobox Template Wiring

## What Was Built

Wired the `useGlobalSearch` composable's keyboard-nav and live-region state (built in Plan 01) into both `GlobalSearch.vue` and `MobileSearchOverlay.vue` templates. Both files edited atomically in the same commit per Anti-loop Rule 6.

### GlobalSearch.vue changes
- **Input:** `role="combobox"`, `aria-expanded` bound to `isExpanded`, `aria-controls="search-listbox-{activeTab}"`, `aria-haspopup="listbox"`, `aria-autocomplete="list"`, `aria-activedescendant`.
- **Active-tab results container:** `role="listbox"`, `id="search-listbox-{activeTab}"`, `aria-label`.
- **Each result row:** `role="option"`, `id="option-{tab}-{index}"`, `aria-selected`.
- **Wrapper:** `aria-busy` bound to `loading`.
- **Live region:** `<span aria-live="polite" aria-atomic="true" class="sr-only">{{ ariaLiveMessage }}</span>` as first child.
- **Keyboard:** new `handleInputKeydown` with IME guard dispatching arrows/home/end/enter.
- **v-if:** replaced compound `isOpen && (loading || totalResults > 0)` with `isExpanded` computed (Pitfall 1).
- **`/` hint:** `aria-hidden="true"`.
- **Clear button:** `aria-label="t('header.search.clearAriaLabel')"` (key added in Plan 03).

### MobileSearchOverlay.vue changes
Parallel twin — identical attribute set, same commit (Rule 6). Each of 3 tab result containers gets its own `role="listbox"` wrapper with correct `id`/`aria-label`.

## Verification

- `npm run test:unit` — 716 tests pass (49 files)
- `npx vite build` — exits 0 (no type errors)
- Grep audit confirms both files contain `role="combobox"`, `role="listbox"`, `role="option"`, `aria-activedescendant`, `aria-live="polite"`, `aria-busy`, `e.isComposing`
- User approved checkpoint (browser verification: "finish")

## Known Gap (intentional, deferred to Plan 03)

`header.search.clearAriaLabel` key doesn't exist yet in locale files. At runtime the custom `useI18n.t()` returns the key literal as fallback. Plan 03 adds the key to en/es/pt in the same task that adds all other new i18n keys.

## Requirements Addressed

- **ARCH-10** (ARIA combobox pattern): wired. Plan 01 provided logic; Plan 02 wired templates. Plan 03 closes the loop with i18n keys.

## Related Plans

- Depends on: `04-01-PLAN.md` (composable exports)
- Blocks: `04-03-PLAN.md` (i18n keys + RouterLink conversions)
