# Phase 4: GlobalSearch & Navigation Polish - Research

**Researched:** 2026-04-17
**Domain:** WAI-ARIA Combobox / Vue Router RouterLink / Custom i18n composable
**Confidence:** HIGH (primary targets verified from source code; i18n finding is HIGH from direct file reads)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Keep 3 tabs (collection/users/scryfall). Active tab's result list IS the combobox listbox. Arrow keys stay within active tab only. Tab-switch via click or Tab key — not arrows.
- D-02: Arrow keys wrap at ends. Home/End jump to first/last item of active tab.
- D-03: Enter with text but no highlight → navigate to `/search?q=<query>`. Enter with highlighted item → trigger that item's click action.
- D-04: Clear button gets `aria-label="{header.search.clearAriaLabel}"`. `/` hint gets `aria-hidden="true"`.
- D-07: Convert to RouterLink in 4 categories (~22 sites): GlobalSearch composable handlers (3), deck/binder cards in list views (8), match notifications + text anchors (8), AppHeader+UserPopover (2).
- D-08: Imperative redirects stay as `router.push` (post-auth, post-action, side-effect navigation like restartTour, modal-open intents).
- D-09: `<RouterLink :to="...">` with `@click.prevent="handler"` for side effects. RouterLink natively honors modifier clicks. No manual `event.metaKey` checks needed.
- D-10: ME INTERESA stays as sibling `<button>` outside RouterLink — never nested interactive elements.
- D-11: Scryfall click → `/collection?addCard=<name>` wrapped in RouterLink.
- D-12: Single `<span aria-live="polite" class="sr-only">` for result count. Updates debounced ~500ms.
- D-13: `aria-busy="true"` on combobox wrapper during loading; live region writes "Searching…" during load.
- D-14: On tab switch, announce newly-active tab's count via same live region.
- D-16: MobileSearchOverlay.vue gets full combobox parity — parallel edit with GlobalSearch.vue (Anti-loop Rule 6).
- D-17: `/` shortcut stays desktop-only. Unchanged.
- D-18: Autofocus timing (100ms setTimeout after nextTick) unchanged.
- D-19: New i18n keys in en/es/pt: `header.search.clearAriaLabel`, `header.search.searching`, `header.search.resultsCount` (pluralized), `header.search.tabNames.{collection,users,scryfall}`.

### Claude's Discretion
- D-05: Use `aria-activedescendant` on input. Focus stays on input; options never receive focus.
- D-06: `role="combobox"` + `aria-expanded` + `aria-controls` + `aria-haspopup="listbox"` on the input wrapper. `role="listbox"` on active-tab results container. `role="option"` + unique id + `aria-selected` on each row.
- D-15: Debounce + live-region state lives in `useGlobalSearch` (`ariaLiveMessage` ref). Both templates bind to it.
- D-20: `useGlobalSearch` grows: `activeDescendantId`, `moveHighlight(direction)`, `selectHighlighted()`, `ariaLiveMessage`.
- D-21: New route-resolver helpers (`resolveCollectionRoute`, `resolveUserRoute`, `resolveScryfallRoute`) return route descriptor objects for `:to=` binding on RouterLink.

### Deferred Ideas (OUT OF SCOPE)
- Cmd+K universal search shortcut
- Moving focus after Vue Transition ends (transitionend event) on mobile overlay
- App-wide RouterLink migration (all 36 router.push sites including imperative redirects)
- Arrow-keys-cross-tabs hybrid pattern
- Auto-select-first-result on Enter
- sr-only announcement of `/` keyboard hint
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ARCH-10 | GlobalSearch implements ARIA combobox pattern (role, aria-expanded, aria-controls, keyboard nav) | Q1/Q2/Q5/Q6 findings cover exact attribute map, keyboard event approach, live-region debounce, and composable API shape |
| NICE-11 | Navigation actions use anchor elements instead of button + router.push for Cmd+click support | Q3 finding confirms RouterLink's guardEvent natively handles modifier clicks; Q8 classifies all 22 call sites |
</phase_requirements>

---

## Summary

Phase 4 adds two orthogonal concerns to `GlobalSearch.vue` + `MobileSearchOverlay.vue` + `useGlobalSearch.ts`:

**ARCH-10 (Combobox):** The WAI-ARIA "Combobox with Listbox Popup" pattern is well-documented. Required attributes are clear and unambiguous. The per-tab listbox design (D-01) fits the pattern without modification: the active tab's result container becomes the listbox that `aria-controls` points to. Keyboard nav state and live-region logic move into `useGlobalSearch` so both templates stay thin and symmetric (Anti-loop Rule 6).

**NICE-11 (RouterLink):** Vue Router 4's `RouterLink` source code confirms that `guardEvent` exits early when `e.metaKey`, `e.ctrlKey`, `e.altKey`, or `e.button !== 0` — meaning Cmd+click, Ctrl+click, and middle-click are ALL handled natively by the browser without router navigation. The `@click.prevent` side-effect pattern runs regardless of modifier state (the handler fires before `guardEvent`), which means dropdown close happens even on Cmd+click — this is the desired behavior (dropdown closes, browser opens link in new tab).

**Critical i18n discovery:** This project uses a **custom i18n composable** (`useI18n.ts`), NOT the vue-i18n library. The `t()` function only supports simple `{placeholder}` interpolation. There is NO built-in pluralization (`|` pipe or ICU syntax). The `itemCount: "{count} item | {count} items"` key in en.json is purely decorative — it is never called with `tc()` anywhere in the codebase; the `|` characters are stored as literal string content. Pluralization for `resultsCount` must be implemented differently (see Q4 finding).

**Primary recommendation:** Split into 3 plans: Plan A (composable expansion + unit tests), Plan B (ARIA template changes — GlobalSearch.vue + MobileSearchOverlay.vue in parallel), Plan C (RouterLink conversions + i18n closeout).

---

## Standard Stack

No new library installations required. All tools already present.

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vue Router 4 | existing | RouterLink, useRouter | Already 185× used as RouterLink in codebase |
| Vue 3 Composition API | existing | composable state, refs, watch | Entire codebase pattern |
| Tailwind CSS | existing | `sr-only` utility for aria-live region | Already used throughout |
| Custom useI18n | existing | Translation and interpolation | Project-standard (NOT vue-i18n) |

### No new dependencies
This phase is a template + composable change only. Zero new packages.

---

## Architecture Patterns

### Recommended File Change Organization

```
src/
├── composables/
│   └── useGlobalSearch.ts         # Grows: activeDescendantId, moveHighlight, selectHighlighted,
│                                  # ariaLiveMessage, resolveCollectionRoute, resolveUserRoute,
│                                  # resolveScryfallRoute — Plan A
├── components/ui/
│   ├── GlobalSearch.vue           # ARIA attributes, RouterLink, keyboard @keydown — Plan B
│   └── MobileSearchOverlay.vue   # PARALLEL mirror of GlobalSearch.vue changes — Plan B
├── locales/
│   ├── en.json                    # header.search.clearAriaLabel, searching, resultsCount,
│   ├── es.json                    # tabNames.{collection,users,scryfall} — Plan C
│   └── pt.json                    #
└── views/
    ├── CollectionView.vue          # RouterLink at :627, :629, :659, :693 — Plan C
    ├── DecksView.vue              # RouterLink at :331 (user-click only), rest STAY as router.push — Plan C
    ├── DeckView.vue               # RouterLink at :283 — Plan C
    ├── BinderView.vue             # RouterLink at :155 — Plan C
    └── SearchView.vue             # STAYS as router.push (see Q8) — Plan C
```

### Pattern 1: WAI-ARIA Combobox with Listbox Popup (per-tab)

**What:** Input element with `role="combobox"`, linked via `aria-controls` to a listbox, with keyboard navigation managed via `aria-activedescendant` (focus stays on input).

**When to use:** Whenever an input has a popup list of selectable suggestions.

**Exact attribute map (VERIFIED: w3.org/WAI/ARIA/apg/patterns/combobox):**

Input element:
```html
<input
  role="combobox"
  aria-expanded="true|false"
  aria-controls="search-listbox-collection"
  aria-haspopup="listbox"
  aria-autocomplete="list"
  aria-activedescendant="option-card-42"
  aria-label="Search cards"
/>
```

Listbox container (active tab's result list):
```html
<div
  id="search-listbox-collection"
  role="listbox"
  aria-label="Collection results"
>
```

Option rows:
```html
<div
  id="option-card-42"
  role="option"
  aria-selected="true"
  ...
>
```

**Source:** [WAI-ARIA APG Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) [VERIFIED: w3.org]

### Pattern 2: id Uniqueness Across Tabs

**Critical:** Option IDs must be globally unique within the page. Since results from all 3 tabs share the same DOM (only one tab shown at a time), collision risk between `collection`, `users`, and `scryfall` tabs is real.

**Verified risk:** `collectionResults` are `Card[]` with `.id` from Firestore (string). `usersResults` are `PublicCardResult[]` with `.id` from Firestore `public_cards` doc IDs. `scryfallResults` are `ScryfallCard[]` with `.id` from Scryfall UUID. While structurally different, they are all opaque strings — there is no guarantee a collection card id cannot match a user card doc id.

**Solution:** Prefix option ids: `option-collection-{card.id}`, `option-user-{card.id}`, `option-scryfall-{card.id}`.

**`activeDescendantId` construction:** `\`option-${activeTab.value}-${highlightedIndex.value}-item\`` — index-based is safer than id-based since we slice results to 8 max.

### Pattern 3: Keyboard Handler in Vue 3

**Use a single `@keydown="handleKeydown"` handler on the input** (not separate `@keydown.down`, `@keydown.up` bindings). Reasons:

1. `Home` and `End` have no Vue shorthand modifiers (`.home` / `.end` do not exist in Vue 3). [VERIFIED: vuejs.org/guide/essentials/event-handling]
2. IME composition check: `if (e.isComposing) return` must be the first line — prevents arrow navigation while CJK input is composing.
3. All 4 directions + Enter + Escape in one handler is more readable and testable.

```typescript
// Source: Vue 3 docs + verified from existing handleKeydown in GlobalSearch.vue
const handleKeydown = (e: KeyboardEvent) => {
  if (e.isComposing) return   // IME safety
  if (!isOpen.value) return
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); moveHighlight('down'); break
    case 'ArrowUp':   e.preventDefault(); moveHighlight('up'); break
    case 'Home':      e.preventDefault(); moveHighlight('home'); break
    case 'End':       e.preventDefault(); moveHighlight('end'); break
    case 'Enter':     e.preventDefault(); selectHighlighted(); break
    case 'Escape':    isOpen.value = false; break
  }
}
```

The existing `handleKeydown` in `GlobalSearch.vue` (line 41) and `MobileSearchOverlay.vue` (line 52) currently only handles Escape — they will be extended in-place, not replaced.

### Pattern 4: RouterLink with Side-Effect Click

**Verified behavior (VERIFIED: github.com/vuejs/router RouterLink.ts source):**

`RouterLink`'s internal `guardEvent` function returns early (skips `router.push`) when:
- `e.metaKey || e.altKey || e.ctrlKey || e.shiftKey` (modifier keys → browser handles natively)
- `e.button !== 0` (middle-click → browser handles natively)
- `e.defaultPrevented` (another handler already prevented default)

When `@click.prevent="sideEffect"` is on a RouterLink:
- Vue fires the click handler first, which sets `e.defaultPrevented = true`
- `guardEvent` sees `defaultPrevented` and skips router navigation
- But the side effect function has already run
- On normal left-click: RouterLink calls `e.preventDefault()` inside `guardEvent` and does `router.push`

**Wait — this means `@click.prevent` breaks RouterLink navigation on normal clicks.** [ASSUMED — requires test verification to confirm exact Vue 3 event ordering]

The D-09 decision states "RouterLink natively honors Cmd+click / middle-click by ignoring its own navigation in those cases and deferring to browser default — the `@click.prevent` handler correspondingly skips on modifier clicks." This is **partially correct**: modifier clicks do cause `guardEvent` to return early (confirmed). But the claim that `@click.prevent` "skips on modifier clicks" is not fully verified — `@click.prevent` fires unconditionally (it's a Vue event modifier on the DOM element, not a Vue Router concern).

**Safer pattern confirmed in Vue Router docs (CITED: router.vuejs.org/guide/advanced/extending-router-link):**

Instead of `@click.prevent`, use `@click.stop` (to prevent bubbling to parent) or pass a handler without `.prevent` if you only need the side effect:

```html
<!-- Option A: Side effect only, RouterLink handles navigation -->
<RouterLink :to="route" @click="closeDropdown">...</RouterLink>

<!-- Option B: If you also need to block default (e.g., calling router.push manually) -->
<RouterLink :to="route" @click.prevent="handleNavigate">...</RouterLink>
```

For GlobalSearch result clicks where we want:
1. Normal click → navigate to route + close dropdown
2. Cmd+click → open in new tab + close dropdown (side effect runs)

**Correct pattern:**
```html
<RouterLink :to="resolveCollectionRoute(card)" @click="isOpen = false; searchQuery = ''">
  ...
</RouterLink>
```

No `.prevent` needed — just call the side effect. RouterLink handles navigation. On Cmd+click, RouterLink skips its navigation (guardEvent exits early due to metaKey), browser opens new tab, AND the `@click` handler fires closing the dropdown. This is correct UX.

**The `@click.prevent` in D-09 description applies only to cases where the side effect REPLACES navigation** (e.g., calling `router.push` yourself), which is not needed here since we're providing `:to=`.

### Anti-Patterns to Avoid

- **`@click.prevent` on RouterLink when `:to=` is provided:** Breaks normal navigation (guardEvent sees `defaultPrevented=true`). Use `@click` without `.prevent` for side effects.
- **Moving focus to listbox options:** Breaks typing continuity (user can't continue typing if focus leaves the input). Use `aria-activedescendant` instead. [VERIFIED: WAI-ARIA APG]
- **Duplicate `aria-live` spans:** Both `GlobalSearch.vue` and `MobileSearchOverlay.vue` must render their own sr-only span (they are in different DOM trees — desktop header vs. mobile overlay). Since `ariaLiveMessage` is shared from `useGlobalSearch`, the message is the same but each component renders its own span. This is correct — there is no "duplicate" problem because only one component is visible at a time.
- **Nesting `<RouterLink>` inside user result rows where ME INTERESA button also lives:** The user card row uses `<div>` as container with a `<button>` for the card navigation (line 195-223 GlobalSearch.vue). When converting to RouterLink, the outer `<div>` becomes `<RouterLink>` for the card link, and ME INTERESA stays as a sibling `<button>` in a flex container — NOT inside the link. [VERIFIED: existing code structure]
- **Tab buttons as role=tablist:** The 3 result-type buttons (collection/users/scryfall) are NOT ARIA tabs. They are plain `<button>` elements that switch which listbox is visible. Do NOT add `role="tab"` or `role="tablist"` — that creates a second ARIA widget alongside the combobox. The combobox pattern owns the entire component.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pluralization | Custom switch/ternary per string | Two-key approach (see Q4) | Custom i18n has no `tc()` — use separate singular/plural keys |
| ARIA live region | Multiple `aria-live` spans | Single debounced `ariaLiveMessage` ref in composable | Multiple spans compete; debounce prevents NVDA queue overflow |
| Modifier click detection | `if (e.metaKey)` checks in every click handler | `<RouterLink :to="...">` | RouterLink's `guardEvent` does this correctly for all cases |
| Focus management | Moving DOM focus to option elements | `aria-activedescendant` on input | Focus-in-listbox breaks text input continuity |
| Option ID uniqueness | Reusing `card.id` directly | Prefixed IDs: `option-{tab}-{index}` | Cross-tab Firestore ID collisions are possible |

---

## Q1: WAI-ARIA Combobox — Exact Attribute Map

**Source:** [VERIFIED: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/]

### Input element (role=combobox)

| Attribute | Value | Notes |
|-----------|-------|-------|
| `role` | `"combobox"` | Required |
| `aria-expanded` | `"true"` / `"false"` | Required — bind to `isOpen` |
| `aria-controls` | `"search-listbox-{activeTab}"` | References active listbox ID |
| `aria-haspopup` | `"listbox"` | Required (implicit default but should be explicit) |
| `aria-autocomplete` | `"list"` | Tells AT that suggestions appear while typing |
| `aria-activedescendant` | `"option-{tab}-{index}"` or `""` | ID of highlighted option, or empty string |
| `aria-label` | `t('header.search.placeholder')` | Or `aria-labelledby` |

### Listbox container (active tab's result div)

| Attribute | Value |
|-----------|-------|
| `id` | `"search-listbox-{activeTab}"` — matches `aria-controls` |
| `role` | `"listbox"` |
| `aria-label` | `t('header.search.tabNames.{activeTab}')` |

### Option rows (each result item)

| Attribute | Value |
|-----------|-------|
| `id` | `"option-{tab}-{index}"` (index 0–7) |
| `role` | `"option"` |
| `aria-selected` | `"true"` when highlighted, `"false"` otherwise |

### Combobox wrapper div (the outer `<div ref="containerRef">`)

| Attribute | Value |
|-----------|-------|
| `aria-busy` | `"true"` when `loading`, `"false"` otherwise |

### What ARIA-expanded tracks

`aria-expanded` should track whether the **listbox popup is currently visible** — not whether there are results. The popup renders when `isOpen && (loading || totalResults > 0)`. So `aria-expanded` = `isOpen && (loading || totalResults > 0)`. [VERIFIED: WAI-ARIA APG — "set to true when the popup is visible"]

### Tablist integration

The 3 result-type buttons (collection/users/scryfall) do NOT get `role="tab"`. They are inside the combobox popup and are plain `<button>` elements. Adding `role="tab"` / `role="tablist"` would create a conflicting ARIA widget. The combobox pattern owns the popup. Screen readers navigate the popup via arrow keys + `aria-activedescendant`, not via tablist navigation.

### Common pitfalls

- **`aria-expanded="true"` with no rendered listbox:** WAVE flags this as error. Solution: only set `aria-expanded="true"` when the popup is actually rendered (same condition as the `v-if` on the results div).
- **NVDA + Chrome:** NVDA reads `aria-activedescendant` changes well in Chrome as of 2024. Old NVDA versions (pre-2019) had issues — not a concern for modern support targets.
- **VoiceOver + Safari:** VoiceOver reads option content when `aria-activedescendant` changes on input. Works correctly with `aria-autocomplete="list"`. Does NOT require focus to move to the option.
- **TalkBack + Android:** `aria-activedescendant` support in TalkBack is inconsistent in mobile Chrome. Since mobile users access `MobileSearchOverlay.vue` (not the desktop combobox), and TalkBack users on Android typically swipe between elements rather than use arrow keys, the keyboard-nav part of ARCH-10 is less critical on mobile. The ARIA roles (`combobox`/`listbox`/`option`) still improve TalkBack semantics significantly even without perfect `aria-activedescendant` support. [ASSUMED — no TalkBack-specific verification performed this session]

---

## Q2: aria-activedescendant vs. Moving Focus

**Decision is correct (D-05).** [VERIFIED: WAI-ARIA APG Combobox Pattern]

The WAI-ARIA spec explicitly states: "DOM focus remains on the combobox" while `aria-activedescendant` identifies the active descendant in the popup.

Screen reader behavior:
- **NVDA + Chrome:** Announces option content when `aria-activedescendant` value changes. Works without focus moving.
- **JAWS + Chrome/Edge:** Same. JAWS reads the element referenced by `aria-activedescendant`.
- **VoiceOver + Safari/Chrome:** Same. VoiceOver announces the referenced element's accessible name.
- **TalkBack + Chrome Android:** Partial support. Combobox role + listbox roles are recognized; `aria-activedescendant` announcement may be inconsistent. [ASSUMED based on known TalkBack limitations]

When `activeTab` switches while an item is highlighted, `activeDescendantId` should be reset to `null` (the new tab's highlight starts at -1 / no item selected). This prevents the input's `aria-activedescendant` from pointing to an option that no longer exists in the listbox.

---

## Q3: Vue Router RouterLink — Modifier Click Behavior

**Source:** [VERIFIED: github.com/vuejs/router blob/main/packages/router/src/RouterLink.ts]

### guardEvent function (confirmed from source)

RouterLink's internal `guardEvent` exits early (skips `router.push`) when:
- `e.metaKey || e.altKey || e.ctrlKey || e.shiftKey` — modifier keys present
- `e.button !== 0` — middle-click or right-click
- `e.defaultPrevented` — another handler already called `preventDefault()`
- `target="_blank"` attribute present

### Critical finding: `@click.prevent` interaction

**Do NOT use `@click.prevent` on a `<RouterLink :to="...">` when the goal is "run side effect, let RouterLink handle navigation."**

Reason: Vue executes the `@click.prevent` handler (setting `e.defaultPrevented = true`) before `guardEvent` runs. `guardEvent` then sees `defaultPrevented = true` and skips router navigation entirely. The link becomes non-functional for normal left-clicks.

**Correct pattern for side effects:**
```html
<!-- Correct: side effect runs, RouterLink navigates -->
<RouterLink :to="resolveCollectionRoute(card)" @click="isOpen = false">
  ...
</RouterLink>

<!-- Wrong: breaks normal navigation -->
<RouterLink :to="resolveCollectionRoute(card)" @click.prevent="isOpen = false">
  ...
</RouterLink>
```

**On Cmd+click/middle-click:**
1. Browser fires mousedown → click
2. Vue `@click="isOpen = false"` handler runs (side effect executes — dropdown closes)
3. RouterLink's `guardEvent` checks `e.metaKey === true` → returns early, no `router.push`
4. Browser handles native `<a href>` behavior → opens new tab (because RouterLink renders as `<a>`)

Result: dropdown closes AND new tab opens. This is correct UX.

**Note on D-09 wording:** D-09 says "the `@click.prevent` handler correspondingly skips on modifier clicks." This is imprecise — Vue's `@click` handler does NOT skip on modifier clicks. What skips is RouterLink's internal navigation. The `@click` side effect always runs. This is actually the right behavior for our use case (close dropdown regardless of click type).

---

## Q4: i18n Pluralization — Critical Discovery

**Source:** [VERIFIED: direct read of `src/composables/useI18n.ts`]

### This project uses a custom i18n composable, NOT vue-i18n

The `useI18n.ts` file is a hand-written composable with:
- Simple `{placeholder}` interpolation only
- No `tc()` (translate with count) function
- No pipe `|` syntax parsing
- No ICU `{count, plural, ...}` support

The `itemCount: "{count} item | {count} items"` key in en.json is **never actually used for pluralization** — it appears to be a dormant key. The `|` is stored as a literal string character in the JSON, not parsed as a plural separator. No component calls `tc(key, count)` anywhere in the codebase.

### Required approach for `header.search.resultsCount`

Since there is no pluralization engine, use **two separate keys**:

**en.json approach:**
```json
"header": {
  "search": {
    "clearAriaLabel": "Clear search",
    "searching": "Searching…",
    "resultsCount": "{count} results in {tabName}",
    "resultsCountSingular": "{count} result in {tabName}",
    "tabNames": {
      "collection": "collection",
      "users": "users",
      "scryfall": "Scryfall"
    }
  }
}
```

**Usage in composable:**
```typescript
const key = count === 1 ? 'header.search.resultsCountSingular' : 'header.search.resultsCount'
ariaLiveMessage.value = t(key, { count, tabName: t(`header.search.tabNames.${activeTab.value}`) })
```

This is consistent with how the rest of the codebase handles count-dependent strings (e.g., conditional ternary in template).

**All three locale files (en/es/pt) must have both keys.** [CLAUDE.md Rule 3]

### Existing `header.search` keys (confirmed from en.json)

Already present: `placeholder`, `tabs.collection`, `tabs.users`, `tabs.scryfall`, `noResults`, `addToCollection`, `cancel`, `advancedSearch`.

New keys needed: `clearAriaLabel`, `searching`, `resultsCount`, `resultsCountSingular`, `tabNames.collection`, `tabNames.users`, `tabNames.scryfall`.

The `MobileSearchOverlay.vue:129` has `aria-label` for clear button using `t('common.aria.clearInput')` — the new `clearAriaLabel` key is more specific. Both components should use the new key for consistency.

---

## Q5: Live Region Debounce Timing

**Source:** [ASSUMED based on accessibility community guidance — not formally verified against NVDA/VoiceOver test suite this session]

### 500ms debounce for live region (D-12) — appropriate

The existing input debounce is 300ms (useGlobalSearch.ts line 60). The live region update at 500ms means: user stops typing → input debounce fires at 300ms (search starts) → results return (Firestore/Scryfall, ~100–500ms) → live region fires ~500ms after the search resolves. Net timing: ~800ms–1s after last keystroke before announcement. This is within the acceptable range for `polite` live regions.

### Rapid typing → aria-busy cycling

When a user types rapidly, `loading` toggles true/false multiple times. `aria-busy` will cycle. Screen readers (NVDA, VoiceOver) generally ignore intermediate `aria-busy` state changes and only announce the final state. This is safe.

### Implementation: live region updates after results arrive, not on timer

The debounce should be applied to the **announcement**, not the search trigger. Pattern:

```typescript
// In useGlobalSearch — lives next to existing searchTimeout
let liveRegionTimeout: ReturnType<typeof setTimeout> | null = null

const scheduleLiveRegionUpdate = (message: string) => {
  if (liveRegionTimeout) clearTimeout(liveRegionTimeout)
  liveRegionTimeout = setTimeout(() => {
    ariaLiveMessage.value = message
  }, 500)
}
```

Call `scheduleLiveRegionUpdate()` at two points:
1. After `performSearch` completes (results loaded)
2. When `activeTab` changes (watch on `activeTab`)

During loading: set `ariaLiveMessage.value = t('header.search.searching')` immediately (no debounce for the "searching" state — users need immediate feedback that search is in progress).

---

## Q6: Keyboard Event Handling — Vue 3 Best Practices

**Source:** [VERIFIED: vuejs.org/guide/essentials/event-handling — key modifiers section]

### Single handler approach (recommended)

Use `@keydown="handleKeydown"` (single handler) not `@keydown.down.prevent` / `@keydown.up.prevent` modifiers. Reasons:
- `Home` and `End` keys: Vue 3 has no `.home` / `.end` modifiers. They work via `e.key === 'Home'` in JS.
- IME composition guard (`e.isComposing`) must be first check — not possible with multiple decorators.
- Unit-testable as a pure function.

### e.preventDefault() for arrow/home/end keys

Arrow keys scroll the page by default. `Home`/`End` jump to page start/end. Call `e.preventDefault()` for all 4 in the handler. Do NOT call it for Escape (let Escape bubble for other listeners if needed).

### IME composition safety

```typescript
if (e.isComposing || e.keyCode === 229) return
```

`keyCode === 229` is a legacy compatibility check for older browsers where `isComposing` was unreliable. Both checks together cover all major browsers. [ASSUMED — keyCode 229 check is standard practice but not formally verified against browser compat tables this session]

### Tab key behavior

When a user presses Tab inside the input, focus moves to the next focusable element (the first tab-switching button). This is correct default browser behavior — do NOT intercept Tab. The 3 result-type buttons are focusable and appear after the input in DOM order.

---

## Q7: Codebase Integration Details

**Source:** [VERIFIED: direct reads of GlobalSearch.vue, MobileSearchOverlay.vue, useGlobalSearch.ts]

### Data shapes

| Tab | Array type | Key used in v-for | Unique? |
|-----|-----------|-------------------|---------|
| collection | `Card[]` | `card.id` (Firestore doc ID) | Within tab yes; cross-tab: potentially collides with users |
| users | `PublicCardResult[]` | `card.id` (Firestore public_cards doc ID) | Within tab yes; cross-tab: could collide |
| scryfall | `ScryfallCard[]` | `card.id` (Scryfall UUID like `a3b4-...`) | Within tab yes; cross-tab: very unlikely to collide with Firestore IDs but not guaranteed |

**Recommendation:** Use index-based option IDs: `option-{activeTab}-{index}`. Max 8 items per tab. `aria-activedescendant` = `option-collection-3`, etc. No collision possible.

### Existing 300ms debounce location

`useGlobalSearch.ts` lines 50–63. The `searchTimeout` variable pattern should be replicated for `liveRegionTimeout` — same file, same `ReturnType<typeof setTimeout>` type pattern.

### Vue Router import in useGlobalSearch

`useGlobalSearch.ts` line 2: `import { useRouter } from 'vue-router'` — already imported. Route resolver helpers (`resolveCollectionRoute` etc.) can be added as pure functions alongside the existing `goTo*` functions.

### `isOpen` and `aria-expanded`

Current `isOpen` tracks if the dropdown is open. The results container renders when `isOpen && (loading || totalResults > 0)` (GlobalSearch.vue line 116). `aria-expanded` on the input must match this same condition (not just `isOpen`) to avoid WAVE's "aria-expanded=true but no popup visible" error.

### Existing `handleKeydown` in GlobalSearch.vue

Lines 41–46: currently handles `Escape` only. Will be extended in-place.

Lines 53–61: `onMounted` / `onUnmounted` attach document-level click listener. The document-level `keydown` listener on line 54 also handles Escape at document level. After extension, the input-level `@keydown` handler handles all arrow/home/end/enter keys; document-level continues to handle Escape for click-outside scenarios.

### `MobileSearchOverlay.vue` parallel structure

- Lines 52–56: `handleKeydown` handles Escape only → extend in-place (same change as GlobalSearch)
- Lines 64–77: local `goToCollection`, `goToUserCard`, `goToScryfall` wrappers that call the composable's versions + `emit('close')`. After RouterLink conversion, these wrappers still exist for `Enter`-key selection via `selectHighlighted()`. The template RouterLink `@click="emit('close')"` handles the mouse-click close.

---

## Q8: NICE-11 Call-Site Classification

**Source:** [VERIFIED: direct read of each flagged file]

| File:Line | Function / Context | Trigger | Destination | Classification | Converts to RouterLink? |
|-----------|-------------------|---------|-------------|----------------|------------------------|
| `SearchView.vue:38` | `handleBack()` → called by `<BaseButton @click="handleBack">` | User clicks "Back to Collection" button | `/collection` | **User-triggered nav** but rendered as `<BaseButton>` (not an anchor). BaseButton renders as `<button>`. Cannot be RouterLink (it's a button component). Keep as `router.push` — button-nav is acceptable when the element is not expected to be right-clickable. | **No — keep as router.push** |
| `DecksView.vue:331` | `handleCreateDeck()` after `await decksStore.createDeck()` | Post-create action (async, program-triggered after deck creation completes) | `/decks/${deckId}/edit` | **Imperative redirect** — not user-triggered nav | **No — keep as router.push** |
| `DecksView.vue:335` | `handleEditDeck(deckId)` → called by `<DeckCard @edit="handleEditDeck">` | User clicks Edit on a deck card | `/decks/${deckId}/edit` | **User-triggered nav** but it's a click on a child component event. Deck card edit button is `<button>` inside DeckCard component. Must inspect DeckCard to confirm. [ASSUMED — marked for planner-time verification of DeckCard template] | **Likely No — button in child component** |
| `DecksView.vue:388` | `handleImport()` after deck create + import | Post-import action (program-triggered) | `/decks/${deckId}/edit` | **Imperative redirect** | **No — keep as router.push** |
| `DecksView.vue:487` | `handleImportDirect()` after Moxfield import | Post-import action (program-triggered) | `/decks/${deckId}/edit` | **Imperative redirect** | **No — keep as router.push** |
| `DecksView.vue:552` | `handleImportCsv()` after CSV import | Post-import action (program-triggered) | `/decks/${deckId}/edit` | **Imperative redirect** | **No — keep as router.push** |
| `CollectionView.vue:627` | `handleCreateDeck()` after bulk allocation | Post-action (program-triggered) | `/decks/${deckId}` | **Imperative redirect** | **No — keep as router.push** |
| `CollectionView.vue:629` | `handleCreateDeck()` fallback | Post-action (program-triggered) | `/decks/${deckId}` | **Imperative redirect** | **No — keep as router.push** |
| `CollectionView.vue:659` | `handleCreateBinder()` after binder create | Post-action (program-triggered) | `/binders/${binderId}` | **Imperative redirect** | **No — keep as router.push** |
| `CollectionView.vue:693` | `handleOpenAdvancedSearch()` → called by button click | User clicks "Advanced search" button | `/search` | **User-triggered nav** but called from `<button @click>` in template. Can convert the button to a RouterLink. | **Yes — convert button to RouterLink** |
| `DeckView.vue:283` | `handleOpenAdvancedSearch()` → called by button click | User clicks "Advanced search" | `/search` | Same as CollectionView:693 | **Yes — convert button to RouterLink** |
| `BinderView.vue:155` | `handleOpenAdvancedSearch()` → called by button click | User clicks "Advanced search" | `/search` | Same pattern | **Yes — convert button to RouterLink** |
| `AppHeader.vue:46` | `goToFaq()` → called by `<button @click="goToFaq">` in help menu | User clicks FAQ in help menu | `/faq` | **User-triggered nav** — plain text link in dropdown menu | **Yes — convert to RouterLink** |
| `UserPopover.vue:221` | `handleLogout()` → `router.push('/login')` | Post-logout action (program-triggered after await logout) | `/login` | **Imperative redirect** | **No — keep as router.push** |
| `MatchNotificationsDropdown.vue:96` | `goToMatches()` calls `closeDropdown()` then push | User clicks "See all matches" | `/saved-matches` | **User-triggered nav** + side effect (close dropdown) | **Yes — convert to RouterLink with @click="closeDropdown()"** |
| `MatchNotificationsDropdown.vue:102` | `goToMatch(match)` calls `closeDropdown()` then push | User clicks specific match notification | `/saved-matches?match=X` | **User-triggered nav** + side effect (close dropdown) | **Yes — convert to RouterLink with @click="closeDropdown()"** |
| `AddCardModal.vue:424` | Inline `@click="handleClose(); router.push('/search')"` | User clicks "Advanced search" inside modal | `/search` | **User-triggered nav** + side effect (close modal) | **Yes — convert to RouterLink with @click="handleClose()"** |
| `GlobalSearch.vue:107` | Inline `@click="isOpen = false; router.push('/search')"` | User clicks "Advanced search" in dropdown | `/search` | **User-triggered nav** + side effect (close dropdown) | **Yes — convert to RouterLink with @click side effect** |
| `useGlobalSearch.ts:162` | `goToCollection(card)` — router.push | Called by template click or selectHighlighted() | `/collection?search=name` | **User-triggered (template click)** + side effects (close, clear query). Enter key also calls via selectHighlighted(). Template click path → RouterLink. Enter key path → stays as router.push via selectHighlighted(). | **Split: template click = RouterLink; Enter key = router.push in selectHighlighted()** |
| `useGlobalSearch.ts:168` | `goToUserCard(card)` — router.push | Same as above | `/@{username}` | Same split pattern | **Split: template click = RouterLink; Enter key = router.push** |
| `useGlobalSearch.ts:174` | `goToScryfall(card)` — router.push | Same as above | `/collection?addCard=name` | Same split pattern | **Split: template click = RouterLink; Enter key = router.push** |

### Revised count

CONTEXT.md said ~22 RouterLink conversion sites. After inspection, the actual count of **template-level** conversions is approximately:

- GlobalSearch.vue: ~4 (3 result type buttons + 1 advanced search link)
- MobileSearchOverlay.vue: ~4 (parallel mirror)
- CollectionView.vue: 1 (`handleOpenAdvancedSearch` button → RouterLink)
- DeckView.vue: 1 (same)
- BinderView.vue: 1 (same)
- AppHeader.vue: 1 (`goToFaq` button → RouterLink)
- MatchNotificationsDropdown.vue: 2 (goToMatches, goToMatch)
- AddCardModal.vue: 1 (advanced search link)

**Total template RouterLink conversions: ~15.** The remaining sites in the CONTEXT.md list (DecksView.vue:331/388/487/552, CollectionView.vue:627/629/659, UserPopover.vue:221) are imperative redirects that stay as `router.push`.

---

## Common Pitfalls

### Pitfall 1: aria-expanded mismatch
**What goes wrong:** Setting `aria-expanded` to `isOpen` instead of `isOpen && (loading || totalResults > 0)`. The popup has a `v-if` condition — if aria-expanded says "true" but the popup div is not rendered, WAVE and screen readers report an error.
**Why it happens:** Developers equate "open state" with `isOpen` but the template has an additional condition.
**How to avoid:** Compute `isExpanded` as a separate computed: `const isExpanded = computed(() => isOpen.value && (loading.value || totalResults.value > 0))`. Bind `aria-expanded` to `isExpanded`.

### Pitfall 2: `@click.prevent` breaking RouterLink navigation
**What goes wrong:** `<RouterLink :to="route" @click.prevent="closeDropdown">` — normal left-clicks no longer navigate because `guardEvent` sees `defaultPrevented`.
**Why it happens:** `.prevent` sets `e.defaultPrevented = true` before `guardEvent` runs.
**How to avoid:** Use `@click="closeDropdown"` without `.prevent`. RouterLink handles `e.preventDefault()` itself inside `guardEvent`.
**Warning signs:** Clicking a converted link does nothing (no navigation), but console shows no errors.

### Pitfall 3: Option IDs not unique across tabs
**What goes wrong:** Using `card.id` directly (e.g., `id="option-abc123"`) and a collection card and a public_cards doc share the same Firestore-generated ID string.
**Why it happens:** Firestore doc IDs are random strings — two different collections could generate the same ID.
**How to avoid:** Prefix with tab name and use index: `option-collection-0`, `option-users-3`, etc. Reset `activeDescendantId` to null on tab switch.

### Pitfall 4: Live region fires before results render
**What goes wrong:** `ariaLiveMessage` updates while `loading=true`. Screen reader announces "5 results" but the DOM still shows a spinner. Confusing to AT users.
**Why it happens:** Results count is debounced but the debounce starts before Firestore/Scryfall resolves.
**How to avoid:** Only call `scheduleLiveRegionUpdate(countMessage)` inside the `finally` block of `performSearch` (after `loading.value = false`). The "Searching…" message fires immediately when loading starts; the count message fires 500ms after loading ends.

### Pitfall 5: MobileSearchOverlay.vue out of sync with GlobalSearch.vue
**What goes wrong:** ARIA attributes added to GlobalSearch.vue but missing from MobileSearchOverlay.vue.
**Why it happens:** Developers treat mobile overlay as secondary — Anti-loop Rule 6 exists exactly because this recurs.
**How to avoid:** Plan B must touch both files in the same task. Checklist in plan: after every ARIA attribute added to GlobalSearch.vue, add identical attribute to MobileSearchOverlay.vue before moving to next attribute.

### Pitfall 6: Highlighting state not reset on tab switch
**What goes wrong:** User has item 3 highlighted in Collection tab, switches to Users tab — `activeDescendantId` still points to `option-collection-2`, but the active listbox is now `search-listbox-users`. Screen reader announces a non-existent descendant.
**Why it happens:** `moveHighlight` manages `highlightedIndex` but `activeTab` switches independently.
**How to avoid:** `watch(activeTab, () => { highlightedIndex.value = -1; activeDescendantId.value = null })` in `useGlobalSearch`.

---

## Code Examples

### useGlobalSearch additions (Plan A)

```typescript
// Source: new code following existing setTimeout pattern (useGlobalSearch.ts line 50)
const highlightedIndex = ref(-1)
const activeDescendantId = ref<string | null>(null)
const ariaLiveMessage = ref('')

let liveRegionTimeout: ReturnType<typeof setTimeout> | null = null

const getActiveResults = () => {
  if (activeTab.value === 'collection') return collectionResults.value
  if (activeTab.value === 'users') return usersResults.value
  return scryfallResults.value
}

const moveHighlight = (direction: 'up' | 'down' | 'home' | 'end') => {
  const results = getActiveResults()
  if (results.length === 0) return

  if (direction === 'home') {
    highlightedIndex.value = 0
  } else if (direction === 'end') {
    highlightedIndex.value = results.length - 1
  } else if (direction === 'down') {
    highlightedIndex.value = highlightedIndex.value >= results.length - 1 ? 0 : highlightedIndex.value + 1
  } else {
    highlightedIndex.value = highlightedIndex.value <= 0 ? results.length - 1 : highlightedIndex.value - 1
  }

  activeDescendantId.value = `option-${activeTab.value}-${highlightedIndex.value}`
}

const selectHighlighted = () => {
  const results = getActiveResults()
  if (highlightedIndex.value < 0 || highlightedIndex.value >= results.length) {
    // No highlight — navigate to advanced search with current query
    void router.push({ path: '/search', query: { q: searchQuery.value } })
    isOpen.value = false
    return
  }
  if (activeTab.value === 'collection') {
    goToCollection(results[highlightedIndex.value] as Card)
  } else if (activeTab.value === 'users') {
    goToUserCard(results[highlightedIndex.value] as PublicCardResult)
  } else {
    goToScryfall(results[highlightedIndex.value] as ScryfallCard)
  }
}

// Route resolvers for :to= binding
const resolveCollectionRoute = (card: Card) => ({ path: '/collection', query: { search: card.name } })
const resolveUserRoute = (card: PublicCardResult) => `/@${card.username}`
const resolveScryfallRoute = (card: ScryfallCard) => ({ path: '/collection', query: { addCard: card.name } })

// Watch for tab switch — reset highlight
watch(activeTab, () => {
  highlightedIndex.value = -1
  activeDescendantId.value = null
  // Announce new tab's count
  const count = getActiveResults().length
  const key = count === 1 ? 'header.search.resultsCountSingular' : 'header.search.resultsCount'
  scheduleLiveRegionUpdate(t(key, { count, tabName: t(`header.search.tabNames.${activeTab.value}`) }))
})
```

### ARIA combobox template skeleton (GlobalSearch.vue Plan B)

```html
<!-- Source: WAI-ARIA APG Combobox pattern + verified Vue 3 binding syntax -->
<div ref="containerRef" class="relative" :aria-busy="loading ? 'true' : 'false'">
  <!-- sr-only live region -->
  <span aria-live="polite" aria-atomic="true" class="sr-only">{{ ariaLiveMessage }}</span>

  <div class="relative">
    <!-- input: role=combobox -->
    <input
      ref="inputRef"
      v-model="searchQuery"
      role="combobox"
      :aria-expanded="isExpanded ? 'true' : 'false'"
      :aria-controls="isExpanded ? `search-listbox-${activeTab}` : undefined"
      aria-haspopup="listbox"
      aria-autocomplete="list"
      :aria-activedescendant="activeDescendantId ?? undefined"
      :aria-label="t('header.search.placeholder')"
      @input="handleInput"
      @focus="searchQuery.length >= 2 && (isOpen = true)"
      @keydown="handleKeydown"
      ...existing classes...
    />
    <button
      v-if="searchQuery.length > 0"
      :aria-label="t('header.search.clearAriaLabel')"
      ...
    >✕</button>
    <span v-else aria-hidden="true" ...>/</span>
  </div>

  <!-- Results Dropdown -->
  <div v-if="isExpanded" ...>
    <!-- Tab buttons: plain buttons, no ARIA tab roles -->
    <div class="flex border-b border-silver-20">
      <button @click="activeTab = 'collection'" ...>{{ t('header.search.tabs.collection') }}</button>
      ...
    </div>

    <!-- Active tab listbox -->
    <div
      :id="`search-listbox-${activeTab}`"
      role="listbox"
      :aria-label="t(`header.search.tabNames.${activeTab}`)"
      class="max-h-80 overflow-y-auto"
    >
      <!-- Collection options -->
      <template v-if="activeTab === 'collection'">
        <RouterLink
          v-for="(card, index) in collectionResults"
          :key="card.id"
          :id="`option-collection-${index}`"
          role="option"
          :aria-selected="activeDescendantId === `option-collection-${index}`"
          :to="resolveCollectionRoute(card)"
          @click="isOpen = false; searchQuery = ''"
          class="...existing classes..."
        >
          ...card content...
        </RouterLink>
      </template>
      ...users and scryfall similarly...
    </div>
  </div>
</div>
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| `<button @click="router.push(...)">` for nav items | `<RouterLink :to="...">` | Enables Cmd+click / middle-click to open in new tab |
| No keyboard nav in search dropdown | `aria-activedescendant` combobox | ARCH-10 compliance; JAWS/NVDA/VoiceOver support |
| No live region for search results | `aria-live="polite"` debounced count | AT users know how many results loaded |
| Flat `@keydown.escape` only | Full keyboard nav (arrows + home/end + enter) | Keyboard-only users can use GlobalSearch |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | TalkBack `aria-activedescendant` support is inconsistent on Android Chrome | Q1/Q2 | Could mean mobile users get less benefit than expected; ARIA roles still help |
| A2 | `e.keyCode === 229` needed alongside `e.isComposing` for IME safety | Q6 | IME input might trigger arrow nav on some older mobile browsers |
| A3 | `DecksView.vue:335` `handleEditDeck` is called from a `<button>` inside `DeckCard` child component (not inspected) | Q8 | If it's actually a RouterLink already, no change needed; if it's a row-level click, might be convertible |
| A4 | `@click.prevent` on RouterLink breaks normal navigation due to `defaultPrevented` check | Q3/Architecture | If Vue's event execution order differs from expected, pattern might still work; needs a quick integration test |

---

## Open Questions

1. **DecksView.vue:335 `handleEditDeck` — DeckCard component template not inspected**
   - What we know: `handleEditDeck` is called via `@edit="handleEditDeck"` emit from `DeckCard` component
   - What's unclear: what element inside `DeckCard` triggers the emit — button, div, or an existing RouterLink
   - Recommendation: Planner should include "read DeckCard.vue before implementing" as first step of that task

2. **`@click.prevent` vs `@click` on RouterLink — exact Vue 3 behavior**
   - What we know: `guardEvent` checks `defaultPrevented`; `.prevent` modifier sets it before `guardEvent` runs
   - What's unclear: whether there is a version-specific edge case in Vue Router 4.x that handles this differently
   - Recommendation: Plan A or B should include a 2-line integration smoke test (render RouterLink with `@click="sideEffect"`, verify both nav and side effect work; verify Cmd+click opens new tab)

---

## Project Constraints (from CLAUDE.md)

| Directive | Applies to This Phase |
|-----------|----------------------|
| TDD MANDATORY — write failing tests before implementation | All composable logic: `moveHighlight`, `selectHighlighted`, `resolveCollectionRoute`, `resolveScryfallRoute`, `resolveUserRoute`, `ariaLiveMessage` debounce behavior |
| Anti-loop Rule 6: GlobalSearch.vue and MobileSearchOverlay.vue are parallel siblings — change one = change both in same plan | Plan B must touch both files in same task |
| Anti-loop Rule 3: verify i18n keys in all 3 locale files before use | All new `header.search.*` keys must be added to en.json + es.json + pt.json simultaneously |
| Anti-loop Rule 1: Read full file + trace all callers before modifying | `useGlobalSearch.ts` is imported by 2 components — both must be traced before extending the API |
| No async onMounted with await | `useGlobalSearch.ts` doesn't use onMounted; no risk here |
| `npx vite build` (not `npm run build`) | Build verification after each plan |
| i18n: `common.aria.clearInput` already used in MobileSearchOverlay.vue:129 | New `header.search.clearAriaLabel` replaces it in both components for consistency — old key stays (don't delete it, other components may use it) |

---

## Sources

### Primary (HIGH confidence)
- [WAI-ARIA APG Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) — exact attribute requirements for combobox/listbox/option [VERIFIED]
- [Vue Router RouterLink.ts source](https://github.com/vuejs/router/blob/main/packages/router/src/RouterLink.ts) — `guardEvent` modifier key behavior [VERIFIED from source code]
- `src/composables/useI18n.ts` — custom composable, no pluralization engine [VERIFIED: direct file read]
- `src/locales/en.json` — existing `header.search.*` keys + `itemCount` non-plural status [VERIFIED]
- `src/components/ui/GlobalSearch.vue` — current template structure, data shapes, existing keydown handler [VERIFIED]
- `src/composables/useGlobalSearch.ts` — existing API, router import, debounce pattern [VERIFIED]
- `src/components/ui/MobileSearchOverlay.vue` — parallel mobile structure [VERIFIED]
- All flagged call sites (SearchView, DecksView, CollectionView, DeckView, BinderView, AppHeader, UserPopover, MatchNotificationsDropdown, AddCardModal) — classification verified by direct read [VERIFIED]

### Secondary (MEDIUM confidence)
- Vue Router 4 `guardEvent` behavior with `@click.prevent` — inferred from source code read + Vue event system knowledge [CITED: github.com/vuejs/router source]

### Tertiary (LOW confidence)
- TalkBack `aria-activedescendant` inconsistency on Android Chrome — general AT compatibility knowledge [ASSUMED]
- `e.keyCode === 229` IME safety fallback — common practice, not verified against browser compat tables [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; existing stack verified
- Architecture/ARIA pattern: HIGH — WAI-ARIA APG directly cited
- RouterLink modifier click behavior: HIGH — verified from actual source code
- i18n pluralization: HIGH — custom composable directly read, no pluralization found
- Call-site classification: HIGH (22/22 directly read) with one LOW (DeckCard.vue internals not read)
- TalkBack mobile: LOW — assumed from known AT limitations

**Research date:** 2026-04-17
**Valid until:** 2026-07-17 (stable ARIA spec; Vue Router source may change on minor releases)
