# Phase 1: Global A11y & CSS Sweep - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Make every interactive element in Cranial Trading accessible to keyboard-only and screen reader users. Eliminate systemic CSS/HTML antipatterns (transition:all, missing img dimensions, missing aria attributes) across the entire codebase. This is a wide, shallow sweep — most changes are 1-3 lines per file, touching 22+ files.

</domain>

<decisions>
## Implementation Decisions

### Focus Ring Style (D-01)
- **D-01:** Replace all `focus:outline-none` with `focus-visible:ring-2 ring-neon ring-offset-2 ring-offset-primary`. This matches the existing neon brand color and provides visible contrast against the black background. Apply via updated utility classes in `style.css` (`btn-base`, `input-base`) so most components inherit automatically.
- **D-02:** Remove bare `focus:outline-none` from inline Tailwind classes in templates. Where a component has `focus:outline-none focus:border-neon`, replace with `focus-visible:ring-2 ring-neon ring-offset-2 ring-offset-primary`.

### Transition Property Lists (D-03)
- **D-03:** Replace `transition: all` in each utility class with only the properties it animates:
  - `btn-base` → `transition: background-color, border-color, color, opacity 150ms ease-out`
  - `input-base` → `transition: border-color, box-shadow 150ms ease-out`
  - `card-base` → `transition: transform, box-shadow 300ms ease-in-out`
  - `modal-content` → `transition: opacity, transform 300ms ease-in-out`
  - `transition-fast/normal/slow` → `transition: background-color, border-color, color, opacity, transform [duration] ease-out`

### Icon Button Labeling (D-04)
- **D-04:** Use i18n keys for all aria-labels. Create new keys under `common.aria.*` namespace in all 3 locale files (en.json, es.json, pt.json). Example: `t('common.aria.clearInput')`, `t('common.aria.toggleVisibility')`, `t('common.aria.flipCard')`.

### Modal ARIA (D-05)
- **D-05:** Add `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` to BaseModal.vue. Generate a unique ID for the title slot and bind `aria-labelledby` to it. All modals that use BaseModal inherit these attributes automatically.
- **D-06:** For modals NOT using BaseModal (ConfirmModal, PromptModal, WelcomeModal, HelpCarouselModal), add the same ARIA attributes directly.

### Skip Navigation (D-07)
- **D-07:** Add a skip-nav link as the first focusable element in App.vue. Target: `<a href="#main-content" class="sr-only focus:not-sr-only ...">`. Add `id="main-content"` to the `<main>` wrapper around `<RouterView>`.

### Toast ARIA (D-08)
- **D-08:** Add `aria-live="polite"` and `role="status"` to the toast container in BaseToast.vue.

### Semantic Buttons (D-09)
- **D-09:** Replace clickable `<div>` and `<span>` elements with `<button>` in: GlobalSearch.vue (user card results), MobileSearchOverlay.vue (user card results), CollectionGridCard.vue (compact mode card), DashboardView.vue (suggestion items).

### Color Scheme Meta (D-10)
- **D-10:** Add `<meta name="color-scheme" content="dark">` and `<meta name="theme-color" content="#000000">` to index.html.

### Image Dimensions (D-11)
- **D-11:** Add `width` and `height` to all dynamic `<img>` elements. For card images: `width="244" height="340"` (standard MTG card ratio 488:680 at half size). For avatars: `width="40" height="40"` (or whatever size the avatar container uses).

### Overscroll Behavior (D-12)
- **D-12:** Add `overscroll-behavior: contain` to BaseModal.vue's scroll container. This prevents scroll bleed-through to the page behind on iOS.

### Card Name Translation (D-13)
- **D-13:** Add `translate="no"` wrapper to MTG card name displays. Implement as a utility class or inline attribute on card name elements across CollectionGridCard, search results, deck views.

### Date Formatting (D-14)
- **D-14:** Create a utility function `formatDate(date: Date, locale: string)` using `Intl.DateTimeFormat`. Replace all `toLocaleDateString()` calls with this utility, passing the app's current locale from vue-i18n.

### Touch Action (D-15)
- **D-15:** Add `touch-action: manipulation` to buttons and interactive elements globally via `@layer base` in style.css.

### Tabular Numbers (D-16)
- **D-16:** Add `font-variant-numeric: tabular-nums` to price display elements. Implement via a Tailwind utility class `tabular-nums` on price containers.

### Text Wrap Balance (D-17)
- **D-17:** Add `text-wrap: balance` to all `<h1>`, `<h2>`, `<h3>` elements via `@layer base` in style.css.

### Unicode Ellipsis (D-18)
- **D-18:** Replace literal `...` with `…` in loading state strings. Check i18n files and hardcoded strings.

### Spinner ARIA (D-19)
- **D-19:** Add `role="status"` and `aria-label` to BaseLoader.vue and inline spinner SVGs (CollectionGrid loading indicator).

### Decorative Icon ARIA (D-20)
- **D-20:** Add `aria-hidden="true"` to SvgIcon.vue, SpriteIcon.vue, and decorative SVGs in BaseToast.vue. For SvgIcon/SpriteIcon, add it as a default prop that can be overridden.

### Claude's Discretion
- Exact Tailwind ring offset values (ring-offset-1 vs ring-offset-2) — pick what looks best against the black bg
- Whether to create a shared BaseSpinner component or just add ARIA to existing inline spinners
- Exact width/height values for avatar images across different contexts

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Accessibility
- `src/style.css` — Global utility classes (btn-base, input-base, card-base, modal-content, transition-*)
- `src/components/ui/BaseModal.vue` — Modal base component (ARIA target)
- `src/components/ui/BaseToast.vue` — Toast system (aria-live target)
- `src/components/ui/BaseButton.vue` — Button base (focus ring target)
- `src/components/ui/BaseInput.vue` — Input base (focus ring target)
- `src/components/ui/SvgIcon.vue` — Icon component (aria-hidden target)
- `src/components/ui/SpriteIcon.vue` — Sprite icon component (aria-hidden target)

### Components with clickable divs to fix
- `src/components/ui/GlobalSearch.vue` — div click handlers for user results
- `src/components/ui/MobileSearchOverlay.vue` — same pattern
- `src/components/collection/CollectionGridCard.vue:378` — compact mode card div
- `src/views/DashboardView.vue:1243` — suggestion items

### Modals needing direct ARIA (not using BaseModal)
- `src/components/ui/ConfirmModal.vue`
- `src/components/ui/PromptModal.vue`
- `src/components/ui/WelcomeModal.vue`
- `src/components/ui/HelpCarouselModal.vue`

### Date formatting call sites
- `src/views/DashboardView.vue:97`
- `src/views/SavedMatchesView.vue:161`
- `src/components/matches/SavedContactCard.vue:46`
- `src/views/SettingsView.vue:828`
- `src/components/decks/DeckCard.vue:99`

### i18n files (all 3 must be updated together)
- `src/locales/en.json`
- `src/locales/es.json`
- `src/locales/pt.json`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `style.css` already has `btn-base`, `input-base`, `card-base`, `modal-content` utility classes — updating these propagates focus ring and transition fixes to all consumers
- `BaseModal.vue` wraps most modals — ARIA changes here propagate to 10+ modal components
- `SvgIcon.vue` and `SpriteIcon.vue` render all icons — adding `aria-hidden` here covers most decorative icons
- `prefers-reduced-motion` global override already exists in `style.css:397-404`
- Tailwind config has `neon` color token defined — can reference it for ring color

### Established Patterns
- All components use Tailwind utility classes inline in templates
- i18n uses `t('key.path')` pattern with vue-i18n
- Modal components either extend BaseModal or implement their own overlay pattern
- Anti-loop rule: changes to en.json/es.json/pt.json MUST happen atomically (all 3 in same step)

### Integration Points
- `index.html` — meta tags for color-scheme and theme-color
- `App.vue` — skip-nav link and main content landmark
- `style.css @layer base` — global touch-action, text-wrap, tabular-nums rules

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard accessibility patterns. Follow WCAG 2.1 AA guidelines and Vercel Web Interface Guidelines as audited.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-global-a11y-css-sweep*
*Context gathered: 2026-04-13*
