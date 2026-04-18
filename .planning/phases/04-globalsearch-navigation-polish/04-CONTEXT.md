# Phase 4: GlobalSearch & Navigation Polish - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the `GlobalSearch` component a fully accessible ARIA combobox (screen-reader announceable + arrow-key navigable) and convert user-triggered navigation actions across the app from `<button @click="router.push(...)">` to `<RouterLink>` so Cmd+click / middle-click open destinations in a new tab.

**Key insight:** `GlobalSearch.vue` and `MobileSearchOverlay.vue` both consume `useGlobalSearch` — keyboard-nav state and live-region state move into the composable so the ARIA template changes stay thin and parallel (Anti-loop Rule 6). RouterLink is already used 185× in the codebase, so the navigation-conversion is a mechanical sweep of ~15 template sites (per D-07 revised scope; the other originally-listed sites turned out to be imperative post-`await` redirects that stay as `router.push`), not a new pattern.

</domain>

<decisions>
## Implementation Decisions

### Combobox Structure (ARCH-10)
- **D-01 (USER LOCKED):** Keep the 3 tabs visually (`collection` / `users` / `scryfall`). The **active tab's result list IS the combobox's listbox**. Arrow keys move only within the active tab. Tab switching happens via click (existing) or Tab key — arrows do not cross tabs.
- **D-02 (USER LOCKED):** Arrow keys wrap at ends (Down on last → first, Up on first → last). `Home` / `End` jump to first / last item of the active tab. Matches WAI-ARIA Authoring Practices 1.2 combobox pattern.
- **D-03 (USER LOCKED):** `Enter` when input has text but no highlighted option → navigate to `/search?q=<query>` (the existing advanced-search route). `Enter` when an option is highlighted → trigger that option's click action (existing `goToCollection` / `goToUserCard` / `goToScryfall`).
- **D-04 (USER LOCKED):** Clear button (`✕`) gets `aria-label="{header.search.clearAriaLabel}"` (new i18n key, en/es/pt). The `/` visual shortcut hint gets `aria-hidden="true"` — no sr-only equivalent (the slash-to-focus handler is document-level and independent).
- **D-05 (Claude's Discretion):** Use `aria-activedescendant` on the input to reference the highlighted option's ID. Focus stays on the input; options never actually receive focus. This is the correct WAI-ARIA combobox idiom (the alternative — moving focus into the listbox — breaks typing continuity).
- **D-06 (Claude's Discretion):** `role="combobox"` + `aria-expanded` + `aria-controls` + `aria-haspopup="listbox"` on the input wrapper. `role="listbox"` on the active-tab results container. `role="option"` + unique `id` on each result row. `aria-selected="true"` on the highlighted option.

### NICE-11 Navigation Scope
- **D-07 (USER LOCKED — scope narrowed by 04-RESEARCH.md Q8):** Convert to `<RouterLink>` in these 4 categories. Research verified each call site; **actual template-level conversions: ~15**, not 22. Sites that turn out to be imperative post-`await` redirects (e.g., `handleCreateDeck` after `await decksStore.createDeck()`) stay as `router.push` per D-08 — user intent is unchanged, original count was imprecise.
  1. **GlobalSearch result handlers (3 sites)** — `composables/useGlobalSearch.ts` `goToCollection` / `goToUserCard` / `goToScryfall` (lines 162 / 168 / 174). Split pattern: template click → RouterLink; Enter-key path (`selectHighlighted`) stays `router.push`.
  2. **Deck & binder cards in list views** — Classification per RESEARCH Q8:
     - `CollectionView.vue:627/629/659` → imperative (post-await), **stay as `router.push`**
     - `DecksView.vue:331/388/487/552` → imperative (post-create/import), **stay as `router.push`**
     - `DecksView.vue:335` → user-click but emits from `<DeckCard>` child component (button inside DeckCard). **Planner must read `DeckCard.vue` first** to classify definitively.
  3. **Match notifications + text anchors** — `MatchNotificationsDropdown.vue:96/102` (convert with `@click="closeDropdown()"` side effect), `GlobalSearch.vue:107` (advanced search link, convert with `@click="isOpen = false"`), `AddCardModal.vue:424` (convert with `@click="handleClose()"`), `CollectionView.vue:693` (convert), `BinderView.vue:155` (convert), `DeckView.vue:283` (convert). **`SearchView.vue:38`** is a `<BaseButton>` not inline markup → **stay as `router.push`** (button component can't be a link without BaseButton API changes).
  4. **AppHeader menu items + UserPopover** — `AppHeader.vue:46` (FAQ) → convert. `UserPopover.vue:221` → imperative (post-`await logout()`), **stay as `router.push`**.
- **D-08 (USER LOCKED):** Imperative redirects stay as `router.push` — these are NOT user-triggered navigation:
  - Post-auth redirects: `LoginView.vue:50/67`, `RegisterView.vue:59/65`, `ResetPasswordView.vue:40`, `UserProfileView.vue:429/434` (`buildLoginUrl` / `buildRegisterUrl`).
  - Post-action redirects: `SettingsView.vue:339/400`, `WelcomeModal.vue:28/40`, `SearchView.vue:38` if it's the "go to collection" post-search handler.
  - Side-effect navigation bundled with other work: `AppHeader.vue:57` (`restartTour` — closes menus, navigates, starts tour).
  - Modal-open intents: `AppHeader.vue:167/169` (open AddCardModal).
- **D-09 (USER LOCKED — corrected by 04-RESEARCH.md Q3):** Rendering: `<RouterLink :to="..." @click="handler">` for side effects (close dropdown, clear search query). **Do NOT use `.prevent`** — verified from Vue Router source (`RouterLink.ts` `guardEvent`): `.prevent` sets `e.defaultPrevented = true` before `guardEvent` runs, which causes `guardEvent` to skip `router.push` entirely. Normal left-clicks would stop navigating. Correct flow: on normal click → side effect runs, then RouterLink navigates. On Cmd+click / middle-click → side effect runs, RouterLink's `guardEvent` sees `metaKey` / `button !== 0` and defers to browser (new tab). No manual `event.metaKey` checks needed. User intent (side effect + native modifier-click behavior) is preserved — only the mechanism corrected.
- **D-10 (USER LOCKED):** `ME INTERESA` button inside user results stays as a sibling `<button>` **outside** the surrounding `<RouterLink>`. Never nest interactive elements inside `<a>`. Current flex layout already places it as a sibling — just confirm no accidental nesting during the conversion.
- **D-11 (USER LOCKED):** Scryfall result click → `/collection?addCard=<name>` wrapped in `<RouterLink>` so Cmd+click opens the add-card flow in a new tab. The `addCard` query param already triggers the add-card modal on `/collection` mount.

### Live Region for Result Count
- **D-12 (USER LOCKED):** Single `<span aria-live="polite" class="sr-only">` rendered next to the combobox. Content: `{N} results in {tabName}` (i18n keys, pluralized in en/es/pt). Updates debounced ~500ms so fast typing doesn't spam screen readers.
- **D-13 (USER LOCKED):** During `loading === true`: set `aria-busy="true"` on the combobox wrapper and write `t('header.search.searching')` (new i18n key, en/es/pt) to the live region. When loading completes: `aria-busy="false"` and announce the count.
- **D-14 (USER LOCKED):** On tab switch (`activeTab` change): announce the newly-active tab's count via the same live region.
- **D-15 (Claude's Discretion):** The debounce + live-region state lives in `useGlobalSearch` (reactive `ariaLiveMessage` ref). Both `GlobalSearch.vue` and `MobileSearchOverlay.vue` render the same sr-only span bound to that ref — no duplicated debounce logic.

### Mobile Parity
- **D-16 (USER LOCKED):** `MobileSearchOverlay.vue` gets full combobox parity — `role="combobox"` on input, `role="listbox"` on results, `role="option"` rows, `aria-activedescendant`, live region, tab-switch announcements. Parallel edit with `GlobalSearch.vue` (Anti-loop Rule 6). Since keyboard-nav state lives in the shared composable, template changes are the parallel work.
- **D-17 (USER LOCKED):** Keyboard shortcut `/` stays desktop-only. No mobile shortcut added. Document-level `/` listener remains unchanged.
- **D-18 (USER LOCKED):** Autofocus timing on mobile overlay (`setTimeout(() => inputRef.value?.focus(), 100)` after `nextTick`) stays as-is. The 100ms is an iOS focus-after-transition workaround — not ARCH-10 scope.

### i18n Keys (all three locales required — CLAUDE.md)
- **D-19 (Claude's Discretion — corrected by 04-RESEARCH.md Q4):** New i18n keys to add to `en.json`, `es.json`, `pt.json`. **No pluralization engine:** this project uses a custom `useI18n.ts` (not vue-i18n) with `{placeholder}` interpolation only — no `tc()`, no `|` parsing, no ICU `{count, plural, ...}` support. The existing `itemCount` key with `|` is dormant. Use **two separate keys + ternary at call site**:
  - `header.search.clearAriaLabel` — "Clear search" / "Limpiar búsqueda" / "Limpar busca"
  - `header.search.searching` — "Searching…" / "Buscando…" / "Buscando…"
  - `header.search.resultsCount` — plural form: `{count} results in {tabName}` / `{count} resultados en {tabName}` / `{count} resultados em {tabName}`
  - `header.search.resultsCountSingular` — singular form: `{count} result in {tabName}` / `{count} resultado en {tabName}` / `{count} resultado em {tabName}`
  - `header.search.tabNames.collection` / `.users` / `.scryfall` — lowercase accessible names ("collection" / "colección" / "coleção", etc.) — separate from the visible `header.search.tabs.*` keys, which are shouted ALL-CAPS.
  - Call pattern: `const key = count === 1 ? 'header.search.resultsCountSingular' : 'header.search.resultsCount'; t(key, { count, tabName: t(...) })`.

### Composable Changes (Claude's Discretion)
- **D-20:** `useGlobalSearch` grows these fields:
  - `activeDescendantId: Ref<string | null>` — id of the highlighted option, bound to input's `aria-activedescendant`.
  - `moveHighlight(direction: 'up' | 'down' | 'home' | 'end'): void` — handles wrap logic.
  - `selectHighlighted(): void` — invokes the correct `goTo*` handler for the current tab's highlighted item.
  - `ariaLiveMessage: Ref<string>` — debounced message for the live region (updated when results load, tab switches, or loading state changes).
- **D-21 (corrected reference to D-09):** `goToCollection`, `goToUserCard`, `goToScryfall` return their route descriptor object (e.g., `{ path, query }`) via new helpers (`resolveCollectionRoute`, `resolveUserRoute`, `resolveScryfallRoute`) so templates can bind `:to="resolve...(card)"` on RouterLink. The existing navigate-via-side-effect handlers stay for the `Enter`-key path (invoked by `selectHighlighted()`) and call `router.push(resolve...(card))` internally. Template click path uses `<RouterLink :to @click="sideEffect">` (no `.prevent`, per D-09 correction).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope files (MUST modify)
- `src/components/ui/GlobalSearch.vue` (271 lines) — Primary desktop combobox target.
- `src/components/ui/MobileSearchOverlay.vue` (322 lines) — Parallel mobile combobox target (Rule 6).
- `src/composables/useGlobalSearch.ts` (275 lines) — Shared state; keyboard-nav + live-region state moves here.

### Phase scope files (NICE-11 RouterLink conversion sites)
- `src/views/CollectionView.vue` — deck/binder card clicks at :627, :629, :659; advanced-search link at :693.
- `src/views/DecksView.vue` — deck card clicks at :331, :335, :388, :487, :552.
- `src/views/DeckView.vue` — text anchor at :283.
- `src/views/BinderView.vue` — text anchor at :155.
- `src/views/SearchView.vue` — text anchor at :38 (verify if navigation or imperative redirect during planning).
- `src/components/ui/UserPopover.vue` — Login link at :221.
- `src/components/layout/AppHeader.vue` — FAQ link at :46 (restartTour flow at :57 stays as router.push — imperative).
- `src/components/layout/MatchNotificationsDropdown.vue` — match navigation at :96, :102.
- `src/components/collection/AddCardModal.vue` — advanced-search link at :424.

### Phase scope files (i18n — all three required)
- `src/locales/en.json` — `header.search.*` keys.
- `src/locales/es.json` — same keys, Spanish translations.
- `src/locales/pt.json` — same keys, Portuguese translations.

### Reference (do not modify)
- `src/router/index.ts` — existing route definitions; `/search`, `/collection`, `/@:username`, `/decks/:id`, `/binders/:id` already exist.
- `src/composables/useI18n.ts` — i18n API, pluralization syntax.

### External specs (read for ARIA details)
- WAI-ARIA Authoring Practices 1.2 — "Combobox with Listbox Popup" pattern. Pluggable pattern: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`. Research agent should cite the live URL.

### Project rules (MUST honor)
- `CLAUDE.md` — Anti-loop rules (especially Rule 6 parallel siblings, Rule 3 i18n verify), TDD mandate, three-locale update rule, no-async-onMounted, `npx vite build` (not `npm run build`).
- `.planning/PROJECT.md` — Core value: "Every interactive element must be accessible to keyboard-only and screen reader users."
- `.planning/REQUIREMENTS.md` — ARCH-10 and NICE-11 acceptance criteria.
- `.planning/phases/03-collectionview-decomposition/03-CONTEXT.md` — Route structure reference (`/decks/:id?`, `/binders/:id?` now first-class per D-01 of Phase 3).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `<router-link>` is already used 185× across `src/components` and `src/views` — RouterLink is familiar and idiomatic in this codebase.
- `useSwipe.ts` / `useCollectionFilterUrl.ts` — examples of shared composables holding non-trivial state across `GlobalSearch.vue` + `MobileSearchOverlay.vue` pairs. The same pattern works for keyboard-nav state in `useGlobalSearch.ts`.
- vue-i18n pluralization already in use — see existing plural keys (e.g., `{count, plural, ...}` style or vue-i18n's `|` syntax).
- Tailwind `sr-only` utility is available (used elsewhere).
- `focus-visible:ring-2 focus-visible:ring-neon` pattern was adopted app-wide in Phase 1 (Plan C) — reuse for RouterLink focus styling.

### Established Patterns
- Debounce via `setTimeout` + `ReturnType<typeof setTimeout>` — same pattern as `useGlobalSearch.handleInput` (line 50, 300ms debounce). Match that for the live region's 500ms debounce.
- Composable fan-out: `useGlobalSearch` is imported by both `GlobalSearch.vue` and `MobileSearchOverlay.vue` — any state added there propagates automatically. Only the templates diverge.
- `@click.prevent="handler"` + `<RouterLink :to>` — standard Vue Router pattern for side-effects-before-navigate.

### Integration Points
- `GlobalSearch.vue` is mounted in `AppHeader.vue:221` (desktop-only, `hidden md:block`). `MobileSearchOverlay.vue` is mounted separately for mobile.
- Keyboard shortcut `/` to focus search is document-level (not part of this phase's scope — unchanged).
- `ME INTERESA` button inside user result rows is already a flex sibling, not nested — conversion won't introduce nesting.

### Risk Flags
- **Scope size:** ~22 RouterLink conversion sites + 2-file ARIA template rewrite + shared composable expansion. Likely 2-3 plans. Planner may split by category (A: combobox + live region + composable; B: RouterLink conversions; C: mobile parity + i18n closeout). Flag if planner recommends splitting into 04a / 04b.
- **DecksView.vue** has 5 separate `router.push` sites to `/decks/<id>/edit` (lines 331, 335, 388, 487, 552) — likely called from multiple action handlers (open from list, open after create, open after duplicate, etc.). Some may be imperative (after create/duplicate), not user-triggered. Planner must inspect each call site and classify before converting.
- **SearchView.vue:38** — needs inspection: is this a "go to collection" user click, or a post-search imperative redirect?
- **AppHeader.vue :167/169** — `action: 'add'` query param triggers AddCardModal. NOT destination navigation — stays as router.push.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly chose the WAI-ARIA "Combobox with Listbox Popup" pattern (per-tab listbox + aria-activedescendant). This is the mainstream A11y-compliant pattern and matches how VS Code's command palette, GitHub's global nav search, and Linear's cmd menu behave.
- The user explicitly chose Cmd+click → new tab as a first-class interaction across 4 navigation categories. Deck/binder/match workflows in the app are inherently comparative (users toggle between decks), and Cmd+click-to-compare is a classic power-user shortcut.
- The "Advanced search" affordance at the bottom of the GlobalSearch dropdown is the escape hatch when suggestions don't cover the query — bind Enter-on-empty-input to it.

</specifics>

<deferred>
## Deferred Ideas

- **Cmd+K universal search shortcut** — user explicitly deferred. Not in scope.
- **Moving focus after Vue Transition ends (transitionend event)** on mobile overlay — nice-to-have, user chose to leave the 100ms setTimeout workaround.
- **App-wide RouterLink migration** (all 36 router.push sites including imperative redirects) — user narrowed scope to user-triggered navigation only. Post-auth and post-action redirects stay as router.push.
- **Arrow-keys-cross-tabs hybrid pattern** in GlobalSearch — user rejected in favor of simpler per-tab listbox.
- **Auto-select-first-result on Enter** — user rejected in favor of Enter → advanced search.
- **sr-only announcement of `/` keyboard hint** — user chose aria-hidden on the `/` span; no sr-only mnemonic.

</deferred>

---

*Phase: 04-globalsearch-navigation-polish*
*Context gathered: 2026-04-17*
