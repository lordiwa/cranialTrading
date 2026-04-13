---
phase: 01-global-a11y-css-sweep
plan: B
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ui/BaseModal.vue
  - src/components/ui/BaseToast.vue
  - src/components/ui/BaseLoader.vue
  - src/components/ui/SvgIcon.vue
  - src/components/ui/SpriteIcon.vue
  - src/components/ui/ConfirmModal.vue
  - src/components/ui/PromptModal.vue
  - src/components/ui/WelcomeModal.vue
  - src/components/ui/HelpCarouselModal.vue
  - src/locales/en.json
  - src/locales/es.json
  - src/locales/pt.json
autonomous: true
requirements:
  - AXSS-02
  - AXSS-04
  - AXSS-05
  - NICE-05
  - NICE-06

must_haves:
  truths:
    - "Screen readers announce toasts via aria-live='polite' on the toast container"
    - "All icon SVGs in BaseToast are aria-hidden (decorative)"
    - "BaseLoader spinner has role='status' and aria-label"
    - "SvgIcon has aria-hidden='true' by default (overridable)"
    - "SpriteIcon has aria-hidden='true' and role='img' behavior"
    - "ConfirmModal, PromptModal, WelcomeModal, HelpCarouselModal each have role='dialog' aria-modal='true' aria-labelledby"
    - "i18n keys common.aria.* exist in all 3 locale files for skipToContent and loading"
  artifacts:
    - path: "src/components/ui/BaseToast.vue"
      provides: "aria-live='polite' role='status' on container; aria-hidden on decorative SVGs"
    - path: "src/components/ui/BaseLoader.vue"
      provides: "role='status' and aria-label on spinner div"
    - path: "src/components/ui/SvgIcon.vue"
      provides: "aria-hidden='true' as default prop"
    - path: "src/components/ui/SpriteIcon.vue"
      provides: "aria-hidden='true' role='img' as defaults"
    - path: "src/components/ui/ConfirmModal.vue"
      provides: "role='dialog' aria-modal='true' aria-labelledby pointing to title h2"
    - path: "src/components/ui/PromptModal.vue"
      provides: "role='dialog' aria-modal='true' aria-labelledby pointing to title h2"
    - path: "src/components/ui/WelcomeModal.vue"
      provides: "role='dialog' aria-modal='true' aria-labelledby pointing to welcome h2"
    - path: "src/components/ui/HelpCarouselModal.vue"
      provides: "role='dialog' aria-modal='true' aria-labelledby pointing to panel title"
    - path: "src/locales/en.json"
      provides: "common.aria.loading, common.actions.skipToContent keys"
    - path: "src/locales/es.json"
      provides: "common.aria.loading, common.actions.skipToContent keys"
    - path: "src/locales/pt.json"
      provides: "common.aria.loading, common.actions.skipToContent keys"
  key_links:
    - from: "ConfirmModal.vue h2 :id='confirmTitleId'"
      to: "outer div :aria-labelledby='confirmTitleId'"
      via: "unique ID generated in script setup"
    - from: "BaseToast.vue outer div aria-live='polite'"
      to: "screen reader announcement pipeline"
      via: "WAI-ARIA live region"
---

<objective>
Add ARIA attributes to the shared UI layer: toast live region, spinner status role, modal dialog roles on the four standalone modals, and aria-hidden defaults on the two icon components. Add the i18n keys that Plans A and C depend on.

Purpose: BaseModal already has role="dialog" — this plan covers the four modals that implement their own overlay pattern (ConfirmModal, PromptModal, WelcomeModal, HelpCarouselModal) and the shared utility components (BaseToast, BaseLoader, SvgIcon, SpriteIcon). After this plan, every modal in the app is announced as a dialog.

Output: 9 component files updated, 3 locale files updated.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/01-global-a11y-css-sweep/01-CONTEXT.md

<interfaces>
<!-- BaseModal.vue already correct — has role="dialog" aria-modal="true" :aria-labelledby="titleId" -->
<!-- Do NOT touch BaseModal.vue in this plan (Plan A/C leave it alone too) -->

<!-- ConfirmModal.vue inner content div (line ~32): -->
<!-- <div class="relative bg-primary border border-silver-50 shadow-strong max-w-md w-full p-6 transition-normal rounded-lg"> -->
<!--   <h2 v-if="confirmStore.options.title" class="text-h3 font-bold text-silver text-center mb-3"> -->

<!-- PromptModal.vue inner content div (line ~34): -->
<!-- <div class="relative bg-primary border border-silver-50 shadow-strong max-w-md w-full p-6 transition-normal rounded-lg"> -->
<!--   <h2 v-if="promptStore.options.title" class="text-h3 font-bold text-silver text-center mb-3"> -->

<!-- WelcomeModal.vue inner modal div (line ~53): -->
<!-- <div class="relative bg-primary border border-neon rounded px-8 py-10 max-w-md w-full mx-4 text-center"> -->
<!--   <h2 class="text-h2 font-bold text-neon mb-3">{{ t('tour.welcome.title') }}</h2> -->

<!-- HelpCarouselModal.vue inner modal div (line ~56): -->
<!-- <div class="relative bg-primary border border-silver-30 rounded-md w-full max-w-md md:max-w-lg lg:max-w-xl shadow-strong"> -->
<!--   panel title somewhere in header -->

<!-- SvgIcon.vue: <svg class="svg-icon inline-block" ...> — needs aria-hidden="true" -->
<!-- SpriteIcon.vue: <span class="sprite-icon inline-block" ...> — needs aria-hidden="true" role="img" -->
<!-- BaseToast.vue: outer wrapper div inside Teleport — needs aria-live="polite" role="status" -->
<!-- BaseLoader.vue: inner spin div — needs role="status" aria-label -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add i18n keys to all 3 locale files (atomic)</name>
  <files>src/locales/en.json, src/locales/es.json, src/locales/pt.json</files>
  <action>
CRITICAL: Read ALL THREE locale files first (en.json, es.json, pt.json), then write all three in the same step. Never add a key to fewer than 3 files. Anti-loop Rule 3.

In each locale file, find the `"common"` object and add two new entries:

1. Inside `"common" > "actions"`, add:
   `"skipToContent": "Skip to main content"` (en)
   `"skipToContent": "Saltar al contenido principal"` (es)
   `"skipToContent": "Ir para o conteúdo principal"` (pt)

2. Add a new `"aria"` object inside `"common"` (at the same level as "actions" and "labels"):
   ```json
   "aria": {
     "loading": "Loading",
     "closeModal": "Close modal",
     "flipCard": "Flip card",
     "clearInput": "Clear input",
     "toggleVisibility": "Toggle visibility",
     "nextSlide": "Next slide",
     "prevSlide": "Previous slide"
   }
   ```

   Spanish translations:
   ```json
   "aria": {
     "loading": "Cargando",
     "closeModal": "Cerrar modal",
     "flipCard": "Voltear carta",
     "clearInput": "Limpiar campo",
     "toggleVisibility": "Mostrar/ocultar",
     "nextSlide": "Siguiente",
     "prevSlide": "Anterior"
   }
   ```

   Portuguese translations:
   ```json
   "aria": {
     "loading": "Carregando",
     "closeModal": "Fechar modal",
     "flipCard": "Virar carta",
     "clearInput": "Limpar campo",
     "toggleVisibility": "Mostrar/ocultar",
     "nextSlide": "Próximo",
     "prevSlide": "Anterior"
   }
   ```

Per D-04.
  </action>
  <verify>
    <automated>node -e "const en=require('./src/locales/en.json');const es=require('./src/locales/es.json');const pt=require('./src/locales/pt.json');['en','es','pt'].forEach((l,i)=>[en,es,pt][i].common.aria&&[en,es,pt][i].common.actions.skipToContent?console.log(l+' OK'):process.exit(1))"</automated>
  </verify>
  <done>All 3 locale files parse as valid JSON. en.common.aria.loading, es.common.aria.loading, pt.common.aria.loading all exist. en.common.actions.skipToContent exists in all 3 files.</done>
</task>

<task type="auto">
  <name>Task 2: Add aria-live to BaseToast and aria-hidden to decorative SVGs inside it</name>
  <files>src/components/ui/BaseToast.vue</files>
  <action>
Read BaseToast.vue first, then apply these two changes:

1. On the outermost `<div>` inside `<Teleport to="body">` (the `fixed bottom-4 right-4` div), add two attributes:
   `role="status"`
   `aria-live="polite"`
   `aria-atomic="false"`

   Result: `<div role="status" aria-live="polite" aria-atomic="false" class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full px-4 md:px-0">`

   NOTE: aria-atomic="false" means each toast item is announced individually, not the whole list.

2. Add `aria-hidden="true"` to ALL four `<svg>` elements inside the template (progress spinner, success icon, error icon, info icon). These SVGs are purely decorative — the toast message text is the meaningful content.

   Example: `<svg aria-hidden="true" v-if="isProgressToast(toast) && toast.status === 'active'" class="w-4 h-4 animate-spin" ...>`

Per D-08, D-20.
  </action>
  <verify>
    <automated>npx vite build 2>&1 | tail -5</automated>
  </verify>
  <done>Build passes. BaseToast outer div has role="status" aria-live="polite". All 4 SVGs in the template have aria-hidden="true".</done>
</task>

<task type="auto">
  <name>Task 3: aria-hidden defaults on SvgIcon + SpriteIcon, role=status on BaseLoader</name>
  <files>src/components/ui/SvgIcon.vue, src/components/ui/SpriteIcon.vue, src/components/ui/BaseLoader.vue</files>
  <action>
Read all three files first, then apply:

**SvgIcon.vue** — add an optional `ariaHidden` prop defaulting to `true`, and bind it to the SVG:

In `<script setup>`:
```typescript
interface Props {
  name: string
  size?: 'tiny' | 'small' | 'medium' | 'large' | 'xl' | '2xl' | '3xl' | '4xl'
  ariaHidden?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'small',
  ariaHidden: true,
})
```

In `<template>`, add to the `<svg>` element:
`:aria-hidden="props.ariaHidden ? 'true' : undefined"`
`focusable="false"`

The `focusable="false"` prevents SVGs from receiving tab focus in older IE/Edge (defensive).

Per D-20.

---

**SpriteIcon.vue** — add `aria-hidden` and `role` props:

In `<script setup>`, extend the Props interface:
```typescript
interface Props {
  name: string
  size?: 'tiny' | 'small' | 'medium' | 'large' | 'xl'
  class?: string
  ariaHidden?: boolean
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 'small',
  class: '',
  ariaHidden: true,
  ariaLabel: '',
})
```

In `<template>`, add to the `<span>` element:
`:aria-hidden="props.ariaHidden ? 'true' : undefined"`
`:role="props.ariaLabel ? 'img' : undefined"`
`:aria-label="props.ariaLabel || undefined"`

Per D-20.

---

**BaseLoader.vue** — add role and aria-label to the spinner div:

Read the file. The spinner is the inner `<div class="animate-spin rounded-full ...">`. Add to that div:
`role="status"`
`:aria-label="t('common.aria.loading')"`

This requires importing useI18n. Add to `<script setup>`:
```typescript
import { useI18n } from '../../composables/useI18n'
const { t } = useI18n()
```

The outer wrapper `<div class="flex items-center justify-center">` should get `aria-live="polite"` so status changes announce.

Per D-19.
  </action>
  <verify>
    <automated>npx vite build 2>&1 | tail -5</automated>
  </verify>
  <done>Build passes. SvgIcon renders with aria-hidden="true" by default. SpriteIcon renders with aria-hidden="true" by default. BaseLoader spinner div has role="status". All three files compile without TypeScript errors.</done>
</task>

<task type="auto">
  <name>Task 4: Add role=dialog + aria-modal + aria-labelledby to 4 standalone modals</name>
  <files>src/components/ui/ConfirmModal.vue, src/components/ui/PromptModal.vue, src/components/ui/WelcomeModal.vue, src/components/ui/HelpCarouselModal.vue</files>
  <action>
Read each file first. Apply the ARIA dialog pattern to the inner modal content div in each.

**Pattern (same for all 4):**
- Generate a unique title ID in `<script setup>`: `const dialogTitleId = \`modal-title-\${Math.random().toString(36).slice(2, 9)}\``
- On the inner modal content `<div>`, add: `role="dialog"` `aria-modal="true"` `:aria-labelledby="dialogTitleId"`
- On the `<h2>` that serves as the title, bind: `:id="dialogTitleId"`

---

**ConfirmModal.vue:**

In `<script setup>` add:
```typescript
const dialogTitleId = `confirm-modal-${Math.random().toString(36).slice(2, 9)}`
```

On inner div (the `relative bg-primary border border-silver-50...` div), add:
`role="dialog"` `aria-modal="true"` `:aria-labelledby="dialogTitleId"`

On the `<h2 v-if="confirmStore.options.title"...>`, add `:id="dialogTitleId"`.

---

**PromptModal.vue:**

Same pattern. In `<script setup>` add:
```typescript
const dialogTitleId = `prompt-modal-${Math.random().toString(36).slice(2, 9)}`
```

On inner div (the `relative bg-primary...` div), add the 3 dialog attributes.
On the `<h2 v-if="promptStore.options.title"...>`, add `:id="dialogTitleId"`.

Also, the input has `focus:outline-none focus:border-neon` — replace with `focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-primary focus:outline-none focus:border-neon`. Keep focus:outline-none because the border already provides visual feedback here.

---

**WelcomeModal.vue:**

In `<script setup>` add:
```typescript
const dialogTitleId = `welcome-modal-${Math.random().toString(36).slice(2, 9)}`
```

On the inner modal div (the `relative bg-primary border border-neon rounded...` div), add the 3 dialog attributes.
On the `<h2 class="text-h2 font-bold text-neon mb-3">`, add `:id="dialogTitleId"`.

---

**HelpCarouselModal.vue:**

Read the full file to find the title element. In `<script setup>` add:
```typescript
const dialogTitleId = `help-modal-${Math.random().toString(36).slice(2, 9)}`
```

On the inner modal content div (the `relative bg-primary border border-silver-30 rounded-md...` div), add the 3 dialog attributes.
Identify the element that serves as the panel heading/title and add `:id="dialogTitleId"`.

Also add `overscroll-behavior: contain` to each modal's scroll container div (the inner content div that has overflow). This covers ARCH-09 for standalone modals not using BaseModal's .modal-content class. Add as an inline Tailwind class: `[overscroll-behavior:contain]` or as a style attribute.

Per D-05, D-06, D-12.
  </action>
  <verify>
    <automated>npx vite build 2>&1 | tail -5</automated>
  </verify>
  <done>Build passes. Each of the 4 modals has role="dialog" aria-modal="true" aria-labelledby on the inner content div. The referenced ID exists in each modal's title element. No TypeScript errors.</done>
</task>

<task type="auto">
  <name>Task 5: Wire aria-label to icon-only buttons using i18n keys from Task 1</name>
  <files>src/components/collection/CollectionGridCard.vue, src/components/ui/HelpCarouselModal.vue, src/components/ui/BaseInput.vue, src/components/ui/FloatingActionButton.vue, src/components/ui/HelpTooltip.vue, src/components/ui/CardFilterBar.vue, src/components/ui/MobileSearchOverlay.vue</files>
  <action>
Read each file first. For every icon-only button (a button containing only an SvgIcon/SpriteIcon/emoji with no visible text), add `:aria-label="t('common.aria.KEY')"` using the keys created in Task 1.

**CollectionGridCard.vue:**
- Toggle public/private button (eye icon) → `:aria-label="t('common.aria.toggleVisibility')"`
- Status cycle buttons (status icons) → `:aria-label="statusLabel"` (use the existing status label string)
- Flip card button (↔️) → `:aria-label="t('common.aria.flipCard')"`

**HelpCarouselModal.vue:**
- Close button (X icon) → `:aria-label="t('common.aria.closeModal')"`
- Previous/Next buttons (if icon-only) → `:aria-label="t('common.aria.prevSlide')"` / `:aria-label="t('common.aria.nextSlide')"`
- Dot navigation buttons → `:aria-label="'Slide ' + (index + 1)"`

**BaseInput.vue:**
- Clear button (✕) → `:aria-label="t('common.aria.clearInput')"`

**FloatingActionButton.vue:**
- Replace `:title="label"` with `:aria-label="label"` (keep title for tooltip)

**HelpTooltip.vue:**
- Replace `:title="title"` with `:aria-label="title"` on the trigger button

**CardFilterBar.vue:**
- Filter toggle button (filter icon) → `:aria-label="t('common.aria.toggleVisibility')"` or a more specific key
- Bulk select toggle → `:aria-label` from its existing title

**MobileSearchOverlay.vue:**
- Back button (chevron icon) → `:aria-label="t('common.actions.back')"` or `:aria-label="t('common.aria.closeModal')"`

Also fix hardcoded Spanish aria-labels in AddCardModal.vue and EditCardModal.vue:
- Replace `aria-label="Cerrar zoom"` with `:aria-label="t('common.aria.closeModal')"`
- Replace `aria-label="Ver otro lado de la carta"` with `:aria-label="t('common.aria.flipCard')"`

Per D-04 (AXSS-04). Uses i18n keys created in Task 1.
  </action>
  <verify>
    <automated>npx vite build 2>&1 | tail -5</automated>
  </verify>
  <done>Build passes. Every icon-only button in the listed files has an aria-label attribute. No hardcoded Spanish aria-labels remain in AddCardModal or EditCardModal.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| confirmStore.options.title → aria-labelledby target | Store value rendered as text content in h2, not as HTML |
| helpStore panel title → aria-labelledby target | Panel title is a string from the help store, not user input |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01B-01 | XSS | dialog title bound via :id / aria-labelledby | accept | IDs are generated random strings, title content is {{ }} text interpolation — not v-html |
| T-01B-02 | Information Disclosure | aria-live region announces toast messages | accept | Toasts contain app-generated messages only, no user-controlled data in this flow |
| T-01B-03 | Tampering | ariaHidden prop can be overridden to false | accept | Intentional design — callers that need accessible icons (e.g. icon-only buttons) set ariaHidden=false and provide their own aria-label |
</threat_model>

<verification>
After all four tasks complete:

1. `npx vite build` — no new errors
2. `node -e "..."` locale key check from Task 1 passes
3. Manual check: open app in browser, open any confirm dialog — DevTools Accessibility tree should show role=dialog
4. Manual check: trigger a toast — screen reader (or axe browser extension) should identify the live region
</verification>

<success_criteria>
- All 3 locale files have common.aria.* keys and common.actions.skipToContent
- BaseToast outer div has aria-live="polite" role="status"
- All decorative SVGs in BaseToast have aria-hidden="true"
- BaseLoader spinner has role="status" and aria-label bound to t('common.aria.loading')
- SvgIcon defaults aria-hidden to true (overridable)
- SpriteIcon defaults aria-hidden to true (overridable)
- ConfirmModal, PromptModal, WelcomeModal, HelpCarouselModal each have role="dialog" aria-modal="true" aria-labelledby targeting their title element
- Build passes with no new errors
</success_criteria>

<output>
After completion, create `.planning/phases/01-global-a11y-css-sweep/01-B-SUMMARY.md` using the template at `@$HOME/.claude/get-shit-done/templates/summary.md`.
</output>
