# Phase 4: GlobalSearch & Navigation Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `04-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 04-globalsearch-navigation-polish
**Areas discussed:** Combobox shape & arrow nav, NICE-11 scope boundary, Live region for result count, Mobile overlay parity

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Combobox shape & arrow nav | Flat listbox vs. tabs, arrow behavior, Enter semantics, sr hints | ✓ |
| NICE-11 scope boundary | Which nav actions convert to RouterLink | ✓ |
| Live region for result count | Screen reader announcement strategy | ✓ |
| Mobile overlay parity | Apply combobox pattern to MobileSearchOverlay too | ✓ |

**User's choice:** All four areas.

---

## Combobox shape & arrow nav

### Q1: Listbox structure

| Option | Description | Selected |
|--------|-------------|----------|
| Per-tab listbox | Keep 3 tabs; active tab = listbox; arrows stay within active tab | ✓ |
| Flat unified listbox with groups | Merge all 3 tabs; arrows flow continuously; SR announces "24 results" | |
| Per-tab + arrow-across-tabs | Hybrid where arrow-off-end jumps to next tab | |

**User's choice:** Per-tab listbox (Recommended).

### Q2: Wrap at ends

| Option | Description | Selected |
|--------|-------------|----------|
| Wrap | Down on last → first; Up on first → last; Home/End jump | ✓ |
| Stop at ends | Down on last stays; Up on first moves focus back to input | |

**User's choice:** Wrap (Recommended).

### Q3: Enter on input with no highlight

| Option | Description | Selected |
|--------|-------------|----------|
| Go to advanced search | Enter on bare input → /search?q=<query> | ✓ |
| Auto-select first result | Enter picks first suggestion from active tab | |
| Do nothing | Require Arrow Down first | |

**User's choice:** Go to advanced search (Recommended).

### Q4: Clear button and `/` hint

| Option | Description | Selected |
|--------|-------------|----------|
| aria-label on clear, aria-hidden on '/' | Clear gets i18n'd aria-label; '/' span is decorative | ✓ |
| Add sr-only for '/' hint too | Expose the '/' mnemonic to screen readers | |

**User's choice:** aria-label on clear, aria-hidden on '/' (Recommended).

---

## NICE-11 scope boundary

### Q1: Which nav actions convert to Cmd+click-capable elements?

| Option | Description | Selected |
|--------|-------------|----------|
| GlobalSearch results only (3 sites) | Just the 3 result handlers in GlobalSearch.vue | |
| GlobalSearch + MobileSearchOverlay | Both search surfaces (shared composable) | |
| App-wide sweep | Every button+router.push that navigates | ✓ |

**User's choice:** App-wide sweep. Narrowed in follow-up Q1b below.

### Q1b: App-wide sweep — narrow to categories (follow-up, 36 sites too broad)

Orchestrator grepped all 36 `router.push` sites and flagged that many are imperative (post-login, post-action redirects) and should NOT become anchors. Presented 4 categories for multi-select:

| Category | Description | Selected |
|----------|-------------|----------|
| GlobalSearch results (3 sites) | composables/useGlobalSearch.ts goTo* handlers | ✓ |
| Deck & binder cards in list views | CollectionView:627/629/659, DecksView:331/335/388/487/552 | ✓ |
| Match notifications + text anchors | MatchNotificationsDropdown, Advanced-search links in 6 views | ✓ |
| AppHeader menu items & UserPopover | AppHeader:46 (FAQ), UserPopover:221 (Login) | ✓ |

**User's choice:** All four categories (~22 sites total). Imperative redirects (post-auth, post-action) stay as router.push.

### Q2: Rendering approach

| Option | Description | Selected |
|--------|-------------|----------|
| `<RouterLink>` with `@click.prevent` for side effects | Native Cmd+click, side effects on plain click | ✓ |
| Native `<a href>` | Use router.resolve() to compute href; max browser-native | |
| Keep `<button>`, add manual modifier handlers | Intercept mouseup/auxclick, check metaKey | |

**User's choice:** RouterLink + @click.prevent (Recommended).

### Q3: ME INTERESA button nested in user result

| Option | Description | Selected |
|--------|-------------|----------|
| Keep ME INTERESA as separate sibling button | Don't nest interactives inside `<a>` | ✓ |
| Wrap only content inside link, keep flex sibling | Minimal template change | |

**User's choice:** Keep as sibling (Recommended). Current flex layout already has it as sibling — just confirm during implementation.

### Q4: Scryfall result Cmd+click behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — Cmd+click opens /collection?addCard=<name> in new tab | Consistent with other results | ✓ |
| Scryfall results stay as plain `<button>` | Not "navigation to destination" — exempt | |

**User's choice:** Yes, preserve Cmd+click (Recommended).

---

## Live region for result count

### Q1: Announcement mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Single sr-only polite live region with debounced count | Debounced ~500ms to avoid spam | ✓ |
| aria-live on the listbox itself | Simpler markup, verbose announcements | |
| No live region — rely on combobox role | Minimum viable, brittle across SRs | |

**User's choice:** sr-only polite + debounce (Recommended).

### Q2: Loading state

| Option | Description | Selected |
|--------|-------------|----------|
| aria-busy + 'Searching…' in live region | Clear signal on load, then count | ✓ |
| aria-busy only, no 'Searching…' text | Less chatty, relies on SR behavior | |

**User's choice:** aria-busy + 'Searching…' (Recommended).

### Q3: Tab switching announcements

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — announce new tab count | Same live region, on activeTab change | ✓ |
| Only on search-input changes | Less chatter, assume tab switch is visual | |

**User's choice:** Yes, announce on tab switch (Recommended).

---

## Mobile overlay parity

### Q1: MobileSearchOverlay combobox treatment

| Option | Description | Selected |
|--------|-------------|----------|
| Full parity — same combobox pattern in both | Shared composable carries logic; templates both get ARIA | ✓ |
| Shared composable, lighter mobile ARIA | Skip arrow-key handling on mobile | |
| Desktop only — defer mobile | Creates debt for a future phase | |

**User's choice:** Full parity (Recommended).

### Q2: Keyboard shortcut for mobile

| Option | Description | Selected |
|--------|-------------|----------|
| Desktop '/' only, no mobile shortcut | Mobile has no hardware keyboard most of the time | ✓ |
| Add Cmd+K universally | Scope creep; some users dock mobile to keyboards | |

**User's choice:** Desktop '/' only (Recommended).

### Q3: Autofocus timing on mobile

| Option | Description | Selected |
|--------|-------------|----------|
| Leave as-is (setTimeout 100ms iOS workaround) | Not ARCH-10 scope; SR still announces on mount | ✓ |
| Move focus after Vue Transition ends | More correct but bigger change for marginal gain | |

**User's choice:** Leave as-is (Recommended).

---

## Claude's Discretion

Areas explicitly marked as Claude's call (captured in CONTEXT.md as D-05, D-06, D-15, D-19, D-20, D-21):
- ARIA role attribute strategy (`aria-activedescendant` vs. focus-moving)
- Specific role/aria-* attributes on combobox/listbox/option markup
- Debounce timing (chose 500ms to match existing 300ms input debounce + settle time)
- i18n key naming and pluralization syntax
- Composable API shape for `moveHighlight`, `selectHighlighted`, `ariaLiveMessage`, route resolvers

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section:
- Cmd+K universal shortcut
- transitionend-based autofocus replacement
- App-wide RouterLink migration beyond the 4 categories (imperative redirects)
- Arrow-keys-cross-tabs hybrid
- Auto-select-first-result on Enter
- sr-only `/` hint mnemonic
