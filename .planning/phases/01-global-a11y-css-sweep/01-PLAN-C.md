---
phase: 01-global-a11y-css-sweep
plan: C
type: execute
wave: 2
depends_on:
  - plan-A
  - plan-B
files_modified:
  - src/components/ui/GlobalSearch.vue
  - src/components/ui/MobileSearchOverlay.vue
  - src/components/collection/CollectionGridCard.vue
  - src/views/DashboardView.vue
  - src/views/SavedMatchesView.vue
  - src/views/SettingsView.vue
  - src/components/contacts/SavedContactCard.vue
  - src/components/decks/DeckCard.vue
  - src/stores/auth.ts
  - src/components/ui/CardFilterBar.vue
  - src/components/collection/AddCardModal.vue
  - src/components/collection/EditCardModal.vue
  - src/components/decks/EditDeckCardModal.vue
  - src/components/decks/AddCardToDeckModal.vue
  - src/components/collection/CardDetailModal.vue
  - src/views/MessagesView.vue
  - src/components/search/AdvancedFilterModal.vue
  - src/components/decks/CreateDeckModal.vue
  - src/components/search/FilterPanel.vue
  - src/components/binders/CreateBinderModal.vue
  - src/components/preferences/ImportPreferencesModal.vue
autonomous: true
requirements:
  - AXSS-03
  - AXSS-04
  - AXSS-06
  - ARCH-08
  - ARCH-11
  - ARCH-12
  - NICE-04

must_haves:
  truths:
    - "No bare focus:outline-none remains anywhere in the src/ directory without a focus-visible ring replacement"
    - "Every clickable <div> in GlobalSearch, MobileSearchOverlay, CollectionGridCard (compact), and DashboardView is replaced with <button>"
    - "All toLocaleDateString() calls are replaced with formatDate() from src/utils/formatDate.ts"
    - "MTG card name displays have translate='no' to prevent browser auto-translation"
    - "All dynamic <img> elements for cards (CompactGridCard, CardGridSearch, GlobalSearch, MobileSearchOverlay) have explicit width and height attributes"
    - "Loading/ellipsis text uses Unicode '…' instead of literal '...'"
  artifacts:
    - path: "src/components/ui/GlobalSearch.vue"
      provides: "div→button for user results, img dimensions, focus-visible on search input"
    - path: "src/components/ui/MobileSearchOverlay.vue"
      provides: "div→button for user results, img dimensions"
    - path: "src/components/collection/CollectionGridCard.vue"
      provides: "compact mode div→button, img dimensions (244×340), translate=no on card name"
    - path: "src/views/DashboardView.vue"
      provides: "suggestion div→button, focus-visible on inline inputs, formatDate()"
    - path: "src/utils/formatDate.ts"
      provides: "Imported by 5 call sites (created in Plan A Task 3)"
  key_links:
    - from: "src/utils/formatDate.ts"
      to: "DashboardView, SavedMatchesView, SettingsView, SavedContactCard, DeckCard, auth.ts"
      via: "import { formatDate } from '@/utils/formatDate'"
    - from: "CollectionGridCard compact div@click"
      to: "<button @click> replacement"
      via: "semantic HTML change — same emit('cardClick', card)"
---

<objective>
Apply the template-level fixes across all components: replace remaining focus:outline-none with focus-visible:ring, convert clickable divs to semantic buttons, wire formatDate() to all call sites, add translate="no" to card name elements, add width/height to dynamic card images, and replace literal "..." with Unicode "…" in loading strings.

Purpose: Plans A and B handle infrastructure (CSS, ARIA on shared components). This plan handles the per-component sweep — the widest blast radius. It depends on Plan A (formatDate utility) and Plan B (i18n aria keys) but can run fully autonomously once those are complete.

Output: 21 files updated with targeted 1-3 line changes each.
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
<!-- formatDate utility (created by Plan A Task 3): -->
<!-- import { formatDate } from '@/utils/formatDate' -->
<!-- formatDate(date: Date | null | undefined, locale: string): string -->
<!-- Use with: formatDate(someDate, locale.value) where locale = useI18n().locale -->

<!-- focus-visible ring pattern (per D-01 / D-02): -->
<!-- Replace: focus:outline-none -->
<!-- With: focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-primary -->
<!-- For inputs that also have focus:border-neon: keep the border AND add the ring -->
<!-- Remove standalone focus:outline-none only if there is NO other focus indicator -->

<!-- translate=no pattern: -->
<!-- <span translate="no">{{ card.name }}</span> -->
<!-- or inline: <p translate="no" class="...">{{ card.name }}</p> -->

<!-- div→button pattern: -->
<!-- OLD: <div class="... cursor-pointer" @click="fn()"> -->
<!-- NEW: <button type="button" class="... w-full text-left" @click="fn()"> -->
<!-- The button must have: type="button" to prevent form submission -->
<!-- Preserve all existing CSS classes — add w-full and text-left if div was block-level -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace focus:outline-none across 19 component files</name>
  <files>
    src/components/ui/CardFilterBar.vue,
    src/components/ui/GlobalSearch.vue,
    src/components/ui/MobileSearchOverlay.vue,
    src/views/DashboardView.vue,
    src/views/SavedMatchesView.vue,
    src/views/MessagesView.vue,
    src/components/collection/AddCardModal.vue,
    src/components/collection/EditCardModal.vue,
    src/components/collection/CardDetailModal.vue,
    src/components/common/CardGridSearch.vue,
    src/components/search/AdvancedFilterModal.vue,
    src/components/search/FilterPanel.vue,
    src/components/decks/EditDeckCardModal.vue,
    src/components/decks/AddCardToDeckModal.vue,
    src/components/decks/CreateDeckModal.vue,
    src/components/binders/CreateBinderModal.vue,
    src/components/preferences/ImportPreferencesModal.vue,
    src/components/ui/PromptModal.vue
  </files>
  <action>
Read each file before modifying it (Anti-loop Rule 1). For each instance of `focus:outline-none`, apply the replacement below. Do NOT blindly replace — read the context of each instance first.

**The decision rule:**

Case A — Input/select/textarea with `focus:border-neon` OR `focus:border-2`:
These already have a visible focus indicator (the neon border). Keep `focus:outline-none` to suppress the default browser outline, but ADD the ring classes alongside it:
`focus:outline-none focus:border-neon focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-primary`

Case B — Buttons/links/divs with bare `focus:outline-none` and NO other focus indicator:
Replace entirely:
`focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-primary`
(Remove focus:outline-none)

Case C — Elements with `focus:ring-2 focus:ring-neon` (already correct except using focus: not focus-visible:):
Replace `focus:ring-2` → `focus-visible:ring-2` (upgrade to focus-visible)
Keep `focus:outline-none` if there's a paired border indicator.

**Specific files and their patterns:**

`CardFilterBar.vue`: Two `<select>` elements with `focus:outline-none focus:border-neon` → Case A, add ring classes.

`GlobalSearch.vue`: `<input>` with `focus:border-neon focus:outline-none` → Case A, add ring classes.

`DashboardView.vue`:
- Line ~1231: `<input>` with `focus:border-neon focus:outline-none` → Case A, add ring classes.
- Line ~1416: `<input>` with `focus:border-neon focus:outline-none` → Case A, add ring classes.

`SavedMatchesView.vue`: Line ~975: `<input>` with `focus:border-neon focus:outline-none` → Case A, add ring classes.

`MessagesView.vue`: Line ~91: `<input>` with `focus:outline-none focus:border-2 focus:border-neon` → Case A, add ring classes.

`AddCardModal.vue`:
- Line ~392: `<input>` with `focus:border-neon focus:outline-none` → Case A, add ring.
- Line ~468: `<div class="... focus:outline-none focus:ring-2 focus:ring-neon">` → Case C, upgrade to focus-visible.

`MobileSearchOverlay.vue`: Similar to GlobalSearch — find `focus:outline-none` instances and apply Case A or B.

`CardGridSearch.vue`: Line ~196: `focus:outline-none focus-visible:ring-2 focus-visible:ring-neon` — ALREADY CORRECT, skip.

For all other files (EditCardModal, CardDetailModal, AdvancedFilterModal, FilterPanel, EditDeckCardModal, AddCardToDeckModal, CreateDeckModal, CreateBinderModal, ImportPreferencesModal, PromptModal): read each, find focus:outline-none, apply Case A or B based on context.

Per D-01, D-02.
  </action>
  <verify>
    <automated>npx vite build 2>&1 | tail -5</automated>
  </verify>
  <done>Build passes. `grep -r "focus:outline-none" src/` finds only instances that also have a visible focus indicator (neon border) — no bare outline-none without a ring or border replacement.</done>
</task>

<task type="auto">
  <name>Task 2: Replace clickable divs with buttons (4 components)</name>
  <files>
    src/components/ui/GlobalSearch.vue,
    src/components/ui/MobileSearchOverlay.vue,
    src/components/collection/CollectionGridCard.vue,
    src/views/DashboardView.vue
  </files>
  <action>
Read each file in full before modifying. Apply div→button replacements precisely.

**GlobalSearch.vue** — User card results section (around line 188-210):

The outer container `<div v-for="card in usersResults" ...>` has no click handler itself, but contains child elements with @click. Wrap the entire row in a single `<button>` instead:

```html
<button
  v-for="card in usersResults"
  :key="card.id"
  type="button"
  class="w-full px-4 py-3 flex items-center gap-3 hover:bg-silver-10 transition-colors border-b border-silver-20 last:border-0 text-left focus-visible:ring-2 focus-visible:ring-neon focus-visible:outline-none"
  @click="goToUserCard(card)"
>
```

Remove the individual @click handlers from the inner `<img>` and `<div class="flex-1 min-w-0 cursor-pointer">` children — the parent button handles the click now. Remove `cursor-pointer` from the inner div.

The card `<img>` thumbnail inside this button keeps its @load/@error handlers but loses its @click.

---

**MobileSearchOverlay.vue** — Same pattern as GlobalSearch users section:

Find the `<div class="flex-1 min-w-0 cursor-pointer" @click="goToUserCard(card)">` (around line 228).

The surrounding container is the iteration item. Determine if that container already has a @click or if it's the `<div class="flex-1">` only. If only the inner div has the click:
- Change `<div class="flex-1 min-w-0 cursor-pointer" @click="goToUserCard(card)">` to
  `<button type="button" class="flex-1 min-w-0 text-left" @click="goToUserCard(card)">`

If the outer iteration div is the appropriate target, apply the same approach as GlobalSearch.

---

**CollectionGridCard.vue** — Compact mode (around line 378):

```
OLD: <div v-if="compact" ref="compactCardRef" class="group cursor-pointer min-h-[180px]" @click="emit('cardClick', card)">
NEW: <button v-if="compact" ref="compactCardRef" type="button" class="group cursor-pointer min-h-[180px] w-full text-left focus-visible:ring-2 focus-visible:ring-neon focus-visible:outline-none rounded" @click="emit('cardClick', card)">
```

Close with `</button>` at the matching end tag.

IMPORTANT: The `ref="compactCardRef"` is currently typed as `ref<HTMLElement>`. Change the type to `ref<HTMLElement | null>` — this is already nullable so no change needed. But verify the usages of `compactCardRef` in the script — if any code depends on div-specific properties, update those. A button element has the same properties as div for the purposes used here.

---

**DashboardView.vue** — Suggestion items (around line 1240-1248):

```
OLD:
<div
    v-for="suggestion in suggestions"
    :key="suggestion"
    @mousedown.prevent="selectSuggestion(suggestion)"
    class="px-4 py-2 hover:bg-silver-10 cursor-pointer text-small text-silver border-b border-silver-30 transition-all"
>
  {{ suggestion }}
</div>

NEW:
<button
    v-for="suggestion in suggestions"
    :key="suggestion"
    type="button"
    @mousedown.prevent="selectSuggestion(suggestion)"
    class="w-full px-4 py-2 hover:bg-silver-10 cursor-pointer text-small text-silver border-b border-silver-30 transition-all text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neon"
>
  {{ suggestion }}
</button>
```

Per D-09.
  </action>
  <verify>
    <automated>npx vite build 2>&1 | tail -5</automated>
  </verify>
  <done>Build passes. No TypeScript errors. The 4 components compile. Clickable divs in GlobalSearch user results, MobileSearchOverlay user results, CollectionGridCard compact mode, and DashboardView suggestions are now semantic button elements.</done>
</task>

<task type="auto">
  <name>Task 3: Wire formatDate(), add translate=no, add img dimensions, fix Unicode ellipsis</name>
  <files>
    src/views/DashboardView.vue,
    src/views/SavedMatchesView.vue,
    src/views/SettingsView.vue,
    src/components/contacts/SavedContactCard.vue,
    src/components/decks/DeckCard.vue,
    src/stores/auth.ts,
    src/components/collection/CollectionGridCard.vue,
    src/components/common/CardGridSearch.vue,
    src/components/ui/GlobalSearch.vue,
    src/components/ui/MobileSearchOverlay.vue,
    src/locales/en.json,
    src/locales/es.json,
    src/locales/pt.json
  </files>
  <action>
Read each file before modifying. Apply these four types of changes:

---

**A. Replace toLocaleDateString() with formatDate() — 6 call sites**

All 6 files need:
```typescript
import { formatDate } from '@/utils/formatDate'
```

Then replace each call:

`DashboardView.vue` line ~97:
`return date.toLocaleDateString()` → `return formatDate(date, locale.value)`
Confirm `locale` is already available from `useI18n()`. If not: `const { t, locale } = useI18n()`.

`SavedMatchesView.vue` line ~161:
`return date.toLocaleDateString()` → `return formatDate(date, locale.value)`
Add locale destructure from useI18n if not already present.

`SettingsView.vue` line ~828 (template, not script):
`{{ authStore.user?.createdAt.toLocaleDateString() }}`
→ Create a computed in script: `const formattedCreatedAt = computed(() => formatDate(authStore.user?.createdAt, locale.value))`
→ In template: `{{ formattedCreatedAt }}`

`src/components/contacts/SavedContactCard.vue` line ~46 (template):
`{{ new Date(contact.savedAt).toLocaleDateString() }}`
→ Create a computed: `const formattedSavedAt = computed(() => formatDate(new Date(contact.savedAt), locale.value))`
→ In template: `{{ formattedSavedAt }}`
Add `import { computed } from 'vue'` and `const { locale } = useI18n()` if not present.

`src/components/decks/DeckCard.vue` line ~99 (template):
`{{ t('decks.card.updated', { date: deck.updatedAt.toLocaleDateString() }) }}`
→ `{{ t('decks.card.updated', { date: formatDate(deck.updatedAt, locale.value) }) }}`
Add `const { t, locale } = useI18n()` if locale not already destructured.

`src/stores/auth.ts` line ~408:
`toastStore.show(t('settings.changeUsername.rateLimited', { date: nextChangeDate.toLocaleDateString() }), 'error')`
→ `toastStore.show(t('settings.changeUsername.rateLimited', { date: formatDate(nextChangeDate, locale.value) }), 'error')`
In the auth store, get locale via `useI18n().locale` — check if useI18n is already imported, if not import it. The store is Pinia so useI18n() works inside store actions.

Per D-14.

---

**B. Add translate="no" to MTG card name displays**

Per D-13, add `translate="no"` as an attribute to elements that display MTG card names.

`CollectionGridCard.vue`:
Find the element that renders `{{ card.name }}` as the card's display name. Add `translate="no"` to that element. There may be multiple instances (compact + full mode). Apply to all.

`CardGridSearch.vue`:
Find elements rendering card names from search results. Add `translate="no"`.

`GlobalSearch.vue`:
Find `<p class="text-small font-bold text-silver truncate">{{ card.name }}</p>` in collection results. Add `translate="no"` to the `<p>`.

`MobileSearchOverlay.vue`:
Same pattern — `<p class="text-small font-bold text-silver truncate">{{ card.cardName }}</p>`. Add `translate="no"`.

---

**C. Add width and height to dynamic card/avatar img elements**

Per D-11, add explicit `width` and `height` attributes to dynamic `<img>` elements.

`CollectionGridCard.vue` — Two `<img>` instances (compact ~line 382, full ~line 512):
Add `width="244" height="340"` (standard MTG card at half resolution, 3:4 ratio).

`CardGridSearch.vue` — Card images in search results:
Read the img element. Add `width="63" height="88"` (small card thumbnail at ~1/4 size) or check the actual rendered size in the template context (likely a small card thumbnail).

`GlobalSearch.vue`:
- Card thumbnail images: `width="40" height="56"` (w-10 h-14 in Tailwind = 40×56px).
- Avatar images: `width="14" height="14"` (w-3.5 h-3.5 = 14×14px).

`MobileSearchOverlay.vue`:
- Card thumbnail images: `width="48" height="67"` (w-12 h-[67px] per existing code).
- Avatar images: `width="14" height="14"`.

---

**D. Replace literal "..." with Unicode "…" in i18n locale files**

Per D-18, read en.json, es.json, and pt.json and replace all occurrences of `"..."` within string values with `"…"` (U+2026 HORIZONTAL ELLIPSIS).

Examples from en.json that need replacing:
- `"deleting": "DELETING..."` → `"DELETING…"`
- `"loading": "LOADING..."` → `"LOADING…"`
- `"saving": "SAVING..."` → `"SAVING…"`
- `"sending": "SENDING..."` → `"SENDING…"`
- `"searching": "SEARCHING..."` → `"SEARCHING…"`
- Any other `...` patterns in string values

Apply the SAME replacements to es.json and pt.json (they have their own `...` instances).

Do NOT replace `...` that appear in JSON keys (there should be none) or in regex patterns. Only replace `...` within translatable string values.

ATOMIC: Read all 3 locale files, make all changes, write all 3 in the same pass.

Per D-18.
  </action>
  <verify>
    <automated>npm run test:unit -- formatDate && npx vite build 2>&1 | tail -5</automated>
  </verify>
  <done>formatDate tests still pass. Build passes with no new errors. No toLocaleDateString() calls remain in the 6 target files. MTG card name elements have translate="no". Dynamic card img elements have width and height attributes. No literal "..." remains in locale file string values.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| MTG card names → DOM | Card names come from Firestore/Scryfall, displayed as text — no HTML injection |
| User search suggestions → button text | Suggestions are Firestore user card names, rendered as text content |
| Date formatting → display | formatDate accepts Date objects from Firestore, formats via Intl — no user string eval |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01C-01 | XSS | translate="no" attribute on card names | accept | Card names are text-interpolated ({{ }}), not v-html — no injection risk |
| T-01C-02 | Spoofing | div→button in suggestion list | accept | Buttons are still bound to the same selectSuggestion() handler — no privilege change |
| T-01C-03 | Info Disclosure | formatDate in auth.ts toast | accept | Date is the user's own username rate-limit date, not sensitive external data |
| T-01C-04 | Denial of Service | formatDate with Intl constructor | mitigate | Try/catch in formatDate.ts fallback prevents crash if locale string is malformed |
</threat_model>

<verification>
After all three tasks complete:

1. `npm run test:unit -- formatDate` — all pass
2. `npx vite build` — no new errors
3. `grep -rn "focus:outline-none" src/ --include="*.vue"` — only instances with a paired neon border (no bare outline-none)
4. `grep -rn "toLocaleDateString" src/` — returns no results (all replaced)
5. `grep -rn '\.\.\.' src/locales/en.json` — returns no results in string values
6. Manual tab-navigation check: interactive elements in GlobalSearch, CollectionGrid, and DashboardView show visible neon ring on keyboard focus
</verification>

<success_criteria>
- No bare focus:outline-none without a visible focus indicator remains in src/
- All 4 clickable divs are replaced with semantic button elements that build and render correctly
- All 6 toLocaleDateString() call sites use formatDate() with the app locale
- MTG card name elements have translate="no" in CollectionGridCard, CardGridSearch, GlobalSearch, MobileSearchOverlay
- Dynamic card img elements have explicit width and height attributes
- Locale files use Unicode "…" instead of literal "..." in all string values
- npm run test:unit passes, npx vite build passes
</success_criteria>

<output>
After completion, create `.planning/phases/01-global-a11y-css-sweep/01-C-SUMMARY.md` using the template at `@$HOME/.claude/get-shit-done/templates/summary.md`.
</output>
