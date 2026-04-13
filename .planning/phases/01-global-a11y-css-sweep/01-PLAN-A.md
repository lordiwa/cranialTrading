---
phase: 01-global-a11y-css-sweep
plan: A
type: execute
wave: 1
depends_on: []
files_modified:
  - src/style.css
  - index.html
  - src/App.vue
  - src/utils/formatDate.ts
autonomous: true
requirements:
  - AXSS-01
  - AXSS-08
  - ARCH-03
  - ARCH-09
  - ARCH-12
  - NICE-01
  - NICE-02
  - NICE-03

must_haves:
  truths:
    - "A visible skip-nav link exists as the first focusable element in the app"
    - "The main content area has id='main-content' so the skip link works"
    - "transition:all is gone from btn-base, input-base, card-base, modal-content, transition-fast/normal/slow"
    - "index.html declares color-scheme:dark and theme-color:#000000"
    - "A formatDate() utility using Intl.DateTimeFormat exists and is importable"
    - "touch-action:manipulation is applied globally to interactive elements"
    - "font-variant-numeric:tabular-nums is defined as a utility class"
    - "text-wrap:balance is applied to h1, h2, h3 in @layer base"
  artifacts:
    - path: "src/style.css"
      provides: "Updated utility classes — transition, touch-action, text-wrap, tabular-nums"
    - path: "index.html"
      provides: "Meta tags for color-scheme and theme-color"
    - path: "src/App.vue"
      provides: "Skip-nav link + main content landmark"
    - path: "src/utils/formatDate.ts"
      provides: "Locale-aware date formatting utility"
  key_links:
    - from: "src/App.vue skip-nav <a href='#main-content'>"
      to: "<main id='main-content'> in App.vue"
      via: "anchor href matching element id"
    - from: "src/utils/formatDate.ts"
      to: "src/views/DashboardView.vue, SavedMatchesView.vue, SettingsView.vue"
      via: "import and replace toLocaleDateString() calls"
---

<objective>
Deliver the global CSS/HTML foundation fixes: replace transition:all antipatterns in shared utility classes, add meta tags for color scheme, wire the skip-navigation landmark, create the formatDate utility, and add global @layer base rules for touch-action, text-wrap, and tabular-nums.

Purpose: These changes cascade automatically to every consumer of btn-base, input-base, card-base, modal-content, and the transition-* utilities — fixing ARCH-03 in 5 lines rather than 22 files. The formatDate utility created here is consumed by Plan C.

Output: Updated src/style.css, index.html with two meta tags, App.vue with skip-nav, and src/utils/formatDate.ts.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-global-a11y-css-sweep/01-CONTEXT.md

<interfaces>
<!-- Existing classes in src/style.css that are changing — show current state for executor -->
<!-- @layer components: -->
<!-- .btn-base: transition: all 150ms ease-out  →  replace with explicit properties -->
<!-- .input-base: transition: all 150ms ease-out + focus:outline-none  →  fix both -->
<!-- .card-base:hover: transition: all 300ms ease-in-out  →  replace -->
<!-- .modal-content: transition: all 300ms ease-in-out  →  replace -->
<!-- @layer utilities: -->
<!-- .transition-fast: transition: all 150ms ease-out  →  replace -->
<!-- .transition-normal: transition: all 300ms ease-in-out  →  replace -->
<!-- .transition-slow: transition: all 500ms ease-in-out  →  replace -->

<!-- App.vue current template root: -->
<!-- <div v-if="authStore.loading"> ... <BaseLoader> ... </div> -->
<!-- <div v-else class="min-h-screen flex flex-col"> -->
<!--   <div :class="['flex-1', ...]"><RouterView /></div> -->
<!--   <AppFooter v-if="showFooter" /> -->
<!-- </div> -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix transition:all antipatterns in style.css + add global base rules</name>
  <files>src/style.css</files>
  <action>
Make these exact replacements in src/style.css. Read the file first, then apply:

1. In .btn-base (line ~107), replace:
   `transition: all 150ms ease-out;`
   with:
   `transition: background-color, border-color, color, opacity 150ms ease-out;`
   Also add to .btn-base:
   `touch-action: manipulation;`

2. In .input-base (line ~164), replace:
   `transition: all 150ms ease-out;`
   with:
   `transition: border-color, box-shadow 150ms ease-out;`
   Also remove `focus:outline-none` from the @apply line — it belongs on individual inputs only, not the utility class. The .input-base:focus rule already handles the visible border.

3. In .card-base:hover (line ~185), replace:
   `transition: all 300ms ease-in-out;`
   with:
   `transition: transform, box-shadow 300ms ease-in-out;`

4. In .modal-content (line ~214), replace:
   `transition: all 300ms ease-in-out;`
   with:
   `transition: opacity, transform 300ms ease-in-out;`
   Also add to .modal-content:
   `overscroll-behavior: contain;`

5. In @layer utilities, replace the three transition utilities:
   `.transition-fast { transition: all 150ms ease-out; }`
   →  `.transition-fast { transition: background-color, border-color, color, opacity, transform 150ms ease-out; }`
   `.transition-normal { transition: all 300ms ease-in-out; }`
   →  `.transition-normal { transition: background-color, border-color, color, opacity, transform 300ms ease-in-out; }`
   `.transition-slow { transition: all 500ms ease-in-out; }`
   →  `.transition-slow { transition: background-color, border-color, color, opacity, transform 500ms ease-in-out; }`

6. In @layer base (after the existing `html` and `body` rules), add a new block:

```css
    button,
    [role="button"],
    a,
    input,
    select,
    textarea,
    label[for] {
        touch-action: manipulation;
    }

    h1, h2, h3 {
        text-wrap: balance;
    }
```

7. In @layer utilities, add after .no-spinner rules:

```css
    .tabular-nums {
        font-variant-numeric: tabular-nums;
    }
```

Do NOT touch any other rules. Do NOT change the prefers-reduced-motion block.

Per D-03, D-09 (touch-action), D-15, D-16, D-17.
  </action>
  <verify>
    <automated>npx vite build 2>&1 | tail -5</automated>
  </verify>
  <done>Build passes. `transition: all` does not appear anywhere in style.css. The .tabular-nums utility class exists. `touch-action: manipulation` is in @layer base. `text-wrap: balance` targets h1/h2/h3. `overscroll-behavior: contain` is in .modal-content.</done>
</task>

<task type="auto">
  <name>Task 2: Add meta tags to index.html + skip-nav link + main landmark to App.vue</name>
  <files>index.html, src/App.vue</files>
  <action>
**index.html** — add two meta tags inside `<head>`, immediately after the `<meta name="viewport">` line:

```html
    <meta name="color-scheme" content="dark" />
    <meta name="theme-color" content="#000000" />
```

Per D-10.

---

**src/App.vue** — make two changes to the template:

1. Add a skip-nav link as the FIRST child of the root template, before the `v-if="authStore.loading"` div:

```html
  <a
    href="#main-content"
    class="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-[9999] focus-visible:px-4 focus-visible:py-2 focus-visible:bg-neon focus-visible:text-primary focus-visible:font-bold focus-visible:rounded focus-visible:outline-none"
  >
    {{ t('common.actions.skipToContent') }}
  </a>
```

The sr-only class from Tailwind hides it until focused; focus-visible:not-sr-only reveals it visually when a keyboard user tabs to it.

2. In the `v-else` branch, wrap `<RouterView />` with a `<main>` element carrying the landmark id:

```html
    <div v-else class="min-h-screen flex flex-col">
      <div :class="['flex-1', authStore.user ? 'pb-12 md:pb-0' : '']">
        <main id="main-content">
          <RouterView />
        </main>
      </div>
      <AppFooter v-if="showFooter" />
    </div>
```

Note: The i18n key `common.actions.skipToContent` MUST be added in Task 3 below (in Plan B). This task only adds the template markup. The key will resolve once Plan B's i18n task runs. If running Plan A standalone before Plan B, temporarily use the English string directly.

Per D-07.
  </action>
  <verify>
    <automated>npx vite build 2>&1 | tail -5</automated>
  </verify>
  <done>Build passes. index.html contains both meta tags. App.vue renders an `<a href="#main-content">` before auth loading div. The main content area has `id="main-content"`. Visually, the skip link is invisible until focused with keyboard.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Create formatDate utility with Intl.DateTimeFormat</name>
  <files>src/utils/formatDate.ts, tests/unit/utils/formatDate.test.ts</files>
  <behavior>
    - formatDate(new Date('2024-03-15'), 'en') → matches locale-formatted date string (not undefined, not empty)
    - formatDate(new Date('2024-03-15'), 'es') → locale-formatted string different from 'en' result
    - formatDate(null, 'en') → returns '' (empty string, no throw)
    - formatDate(undefined, 'en') → returns '' (empty string, no throw)
    - formatDate(new Date('invalid'), 'en') → returns '' (invalid date guard)
    - The returned strings are non-empty for valid dates
  </behavior>
  <action>
**Write tests first** at tests/unit/utils/formatDate.test.ts, run `npm run test:unit -- formatDate` to confirm RED.

Then implement src/utils/formatDate.ts:

```typescript
/**
 * Format a date using the app's current locale via Intl.DateTimeFormat.
 * Replaces all toLocaleDateString() calls. Returns '' for invalid/null/undefined.
 */
export function formatDate(
  date: Date | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }
): string {
  if (!date) return ''
  if (isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale, options).format(date)
  } catch {
    return date.toLocaleDateString()
  }
}
```

The function signature must accept `Date | null | undefined` — callers pass nullable dates from Firestore.

Per D-14.
  </action>
  <verify>
    <automated>npm run test:unit -- formatDate</automated>
  </verify>
  <done>All formatDate tests pass. The function exists at src/utils/formatDate.ts and is exported. It handles null, undefined, and invalid Date objects without throwing.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user HTML input → DOM | No user-controlled content rendered in this plan (meta tags, CSS, utilities only) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01A-01 | Tampering | skip-nav href="#main-content" | accept | Static anchor to same-page ID — no user input, no XSS vector |
| T-01A-02 | Information Disclosure | theme-color meta tag | accept | Value is hardcoded #000000 — exposes brand color only, not sensitive |
| T-01A-03 | Denial of Service | formatDate with invalid Date | mitigate | Guard `isNaN(date.getTime())` prevents TypeError crash; try/catch wraps Intl constructor |
</threat_model>

<verification>
After all three tasks complete:

1. `npx vite build` — no new errors
2. `npm run test:unit -- formatDate` — all pass
3. Manually confirm in browser dev tools: `<meta name="color-scheme" content="dark">` exists in document head
4. Tab through the app once — the skip-nav link should appear visually when focused
5. `grep -r "transition: all" src/style.css` — should return nothing
</verification>

<success_criteria>
- `transition: all` does not appear anywhere in src/style.css
- index.html contains `<meta name="color-scheme" content="dark">` and `<meta name="theme-color" content="#000000">`
- App.vue has a skip-nav link as first focusable element targeting #main-content
- `<main id="main-content">` wraps RouterView
- formatDate.ts exports a function that passes all unit tests and handles null/undefined/invalid Date
- Build passes
</success_criteria>

<output>
After completion, create `.planning/phases/01-global-a11y-css-sweep/01-A-SUMMARY.md` using the template at `@$HOME/.claude/get-shit-done/templates/summary.md`.
</output>
