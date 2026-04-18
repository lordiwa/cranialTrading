---
plan: 04-03
name: RouterLink conversions + i18n + D-07 parent cleanup + E2E gate
phase: 04-globalsearch-navigation-polish
status: complete
autonomous: false
completed: 2026-04-17
commits:
  - aae6dab i18n(04-03) add header.search ARIA keys to en/es/pt
  - 0a3eaf0 feat(04-03) convert GlobalSearch and MobileSearchOverlay results to RouterLink
  - 25cf1e7 feat(04-03) convert FAQ, match notifications, AddCardModal, CardFilterBar to RouterLink + clean up parent handlers (D-07)
requirements_addressed:
  - NICE-11
  - ARCH-10
key_files:
  modified:
    - src/locales/en.json
    - src/locales/es.json
    - src/locales/pt.json
    - src/components/ui/GlobalSearch.vue
    - src/components/ui/MobileSearchOverlay.vue
    - src/components/ui/CardFilterBar.vue
    - src/components/layout/AppHeader.vue
    - src/components/layout/MatchNotificationsDropdown.vue
    - src/components/collection/AddCardModal.vue
    - src/views/CollectionView.vue
    - src/views/DeckView.vue
    - src/views/BinderView.vue
must_haves_verified:
  - 15 template-level RouterLink conversions across 8 files
  - 7 new i18n keys added to all 3 locales (Rule 3)
  - Dead handlers removed from CardFilterBar, AppHeader, MatchNotificationsDropdown, MobileSearchOverlay, CollectionView, DeckView, BinderView
  - Zero @click.prevent on any RouterLink element (D-09 correction)
  - Imperative redirects preserved per D-08 (LoginView, RegisterView, SettingsView, WelcomeModal, UserProfileView, DecksView post-create sites, UserPopover post-logout, AppHeader restartTour, AppHeader handleMobileAdd, SearchView:38, AppHeader:167/169)
  - ME INTERESA remains flex sibling (not nested) per D-10
  - npm run test:unit passes (716 tests, 49 files)
  - npx vite build exits 0
  - npm run e2e passes (126 tests, 8 skipped, 0 failed)
---

# Plan 04-03 Summary: RouterLink Conversions + i18n Closeout + D-07 Cleanup + E2E Gate

## What Was Built

### 1. i18n keys added (Rule 3 — all 3 locales in same commit `aae6dab`)

Added to `src/locales/en.json`, `es.json`, `pt.json`:
- `header.search.clearAriaLabel` — "Clear search" / "Limpiar búsqueda" / "Limpar busca"
- `header.search.searching` — "Searching…"
- `header.search.resultsCount` — plural "{count} results in {tabName}" (+ es/pt equivalents)
- `header.search.resultsCountSingular` — singular "{count} result in {tabName}"
- `header.search.tabNames.collection` / `.users` / `.scryfall` — accessible lowercase names (distinct from the shouted visual `tabs.*` keys)

Two-key ternary pattern per D-19 corrected (custom `useI18n.ts` has no pluralization engine). Used at call site: `const key = count === 1 ? 'resultsCountSingular' : 'resultsCount'; t(key, { count, tabName })`.

### 2. RouterLink conversions (commits `0a3eaf0` + `25cf1e7`)

15 template-level user-triggered navigation sites converted to `<RouterLink :to="..." @click="handler">` (NO `.prevent` per D-09 — verified):

**GlobalSearch.vue + MobileSearchOverlay.vue (Rule 6 atomic, commit `0a3eaf0`):**
- Collection result rows → `<RouterLink :to="resolveCollectionRoute(card)">` with `@click="isOpen = false; searchQuery = ''"`
- User result rows → `<RouterLink :to="resolveUserRoute(card)">` wrapping MAIN area only; ME INTERESA stays as flex sibling (D-10)
- Scryfall result rows → `<RouterLink :to="resolveScryfallRoute(card)">` (D-11 — `/collection?addCard=<name>`)
- "Advanced Search" bottom link → `<RouterLink to="/search">` with `@click="isOpen = false"`

**AppHeader.vue / MatchNotificationsDropdown.vue / AddCardModal.vue / CardFilterBar.vue (commit `25cf1e7`):**
- AppHeader FAQ menu item → `<RouterLink to="/faq">`
- MatchNotificationsDropdown "See all matches" → `<RouterLink to="/saved-matches">` with `@click="closeDropdown"`
- MatchNotificationsDropdown per-match row → `<RouterLink :to="...">` with `@click="closeDropdown"`
- AddCardModal "Advanced Search" → `<RouterLink to="/search">` with `@click="handleClose"`
- CardFilterBar advanced-search button → `<RouterLink to="/search">` directly (replaces `$emit('open-advanced-search')` pattern)

### 3. D-07 parent-view dead handler cleanup (commit `25cf1e7`)

After CardFilterBar's direct RouterLink replaced the emit pattern, the parent handlers became dead code:
- `handleOpenAdvancedSearch()` removed from `CollectionView.vue:693`, `DeckView.vue:283`, `BinderView.vue:155`
- `@open-advanced-search="handleOpenAdvancedSearch"` attribute removed from `<CardFilterBar>` usages
- `'open-advanced-search'` removed from `CardFilterBar.vue` defineEmits
- `goToFaq()` removed from AppHeader.vue
- `goToMatches()` / `goToMatch()` removed from MatchNotificationsDropdown.vue
- `goToCollection()` / `goToUserCard()` / `goToScryfall()` / `goToAdvancedSearch()` wrappers removed from MobileSearchOverlay.vue (composable's versions are invoked directly via `selectHighlighted()` on Enter key)

Verified: `grep "handleOpenAdvancedSearch" src/views/CollectionView.vue src/views/DeckView.vue src/views/BinderView.vue` returns 0 matches; `grep "@open-advanced-search\|'open-advanced-search'" src/` returns 0.

### 4. D-08 imperative redirects preserved

Verified NOT converted (stay as `router.push`):
- `LoginView.vue:50/67`, `RegisterView.vue:59/65`, `ResetPasswordView.vue:40` — post-auth redirects
- `SettingsView.vue:339/400`, `WelcomeModal.vue:28/40`, `UserProfileView.vue:429/434` — post-action redirects
- `DecksView.vue:331/388/487/552` — post-create/import redirects
- `CollectionView.vue:627/629/659` — post-create/allocation redirects
- `UserPopover.vue:221` — post-logout redirect
- `SearchView.vue:38` — uses BaseButton (component-level, can't be RouterLink without BaseButton API change)
- `AppHeader.vue:57` (restartTour), `AppHeader.vue:167/169` (open AddCardModal) — imperative side-effect flows

## Verification (automated, before checkpoint)

- `npm run test:unit` — **PASS** (716 tests, 49 files)
- `npx vite build` — **PASS** (exits 0)
- `npm run e2e` — **PASS** (126 passed, 8 skipped, 0 failed) — REQUIRED per MEMORY.md `feedback_e2e_before_push.md` rule
- D-07 greps: **PASS** — dead handlers gone
- D-09 greps: **PASS** — no `@click.prevent` on any RouterLink
- Rule 3: all 3 locale files have the 7 new keys in the same commit
- Rule 6: GlobalSearch.vue and MobileSearchOverlay.vue RouterLink changes in the same commit

## Checkpoint Approval

User approved via "finish" directive after Plan 02 checkpoint; automated verification covers all acceptance criteria. Manual Cmd+click browser verification deferred to user's dev-environment testing after dev deploy.

## Requirements Addressed

- **NICE-11** — template anchor conversions enable Cmd+click / Ctrl+click / middle-click across all user-triggered navigation per D-07 scope
- **ARCH-10** — i18n keys close the loop started by Plan 02 (clear button aria-label, live region count, tab names, searching state)

## Related Plans

- Depends on: `04-01-PLAN.md` (route resolvers `resolveCollectionRoute` / `resolveUserRoute` / `resolveScryfallRoute`)
- Depends on: `04-02-PLAN.md` (ARIA combobox attributes reference `header.search.*` keys that this plan adds)

## Known Gap (flagged to user)

**Manual browser verification of Cmd+click behavior was NOT performed** — only automated verification (unit + build + E2E). Cmd+click / middle-click open-in-new-tab behavior should work per Vue Router's `guardEvent` source (verified in research Q3) but has not been smoke-tested in a live browser. User expected to verify on dev environment (`cranial-trading-dev.web.app`) after auto-deploy.
