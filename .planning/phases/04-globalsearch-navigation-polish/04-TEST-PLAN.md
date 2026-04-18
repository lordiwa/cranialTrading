# Phase 4 Manual Test Plan — GlobalSearch & Navigation Polish (v1.24.0)

**Environment:** https://cranial-trading-dev.web.app
**Version:** 1.24.0
**Tester:** Rafael
**Duration estimate:** ~15 minutes
**Source:** Generated 2026-04-17, after Phase 4 dev deploy; also feeds the Jira import in upcoming session.

**Labels to apply in Jira:** `phase-4`, `a11y`, `nice-11`, `regression`
**Fix version:** `1.24.0`
**Suggested issue type:** Test (or Task — Jira-project-dependent)

---

## TC-P04-01: Keyboard navigation — desktop GlobalSearch combobox
**Priority:** High
**Component:** GlobalSearch, a11y
**Requirement:** ARCH-10
**Preconditions:** Logged in on desktop (≥md viewport), Chrome or Safari

**Steps:**
1. Press `/` key anywhere on a non-input page
2. Type `bolt`
3. Wait for dropdown to show results
4. Press `ArrowDown`
5. Press `ArrowDown` repeatedly to end of list, then once more
6. Press `ArrowUp` from first item
7. Press `End` — then `Home`
8. Press `Enter` (with highlighted item)
9. Go back. Repeat 1–3. Press `Enter` (no arrow pressed)
10. Type a query. Press `Escape`

**Expected results:**

| Step | Result |
|------|--------|
| 1 | Search input focused, dropdown closed |
| 4 | First result visually highlighted (neon border or bg) |
| 5 | Wraps to first item (position 0) |
| 6 | Wraps to last item |
| 7 | Jumps to last / first |
| 8 | Navigates to destination URL (collection/user/scryfall route), dropdown closes |
| 9 | Navigates to `/search?q=<query>` |
| 10 | Dropdown closes, focus stays in input |

---

## TC-P04-02: Keyboard navigation — mobile search overlay
**Priority:** Medium
**Component:** MobileSearchOverlay
**Requirement:** ARCH-10
**Preconditions:** Narrow viewport (< md) or Chrome DevTools device emulation + hardware keyboard

**Steps:**
1. Tap search icon in mobile header
2. Type `bolt`
3. Press `ArrowDown` → `Enter`
4. Repeat, this time press `Escape` instead

**Expected results:**

| Step | Result |
|------|--------|
| 1 | Full-screen overlay opens, input auto-focused |
| 2 | Results load in collection/users/scryfall tabs |
| 3 | Overlay closes AND route loads |
| 4 | Overlay closes, returns to previous page |

---

## TC-P04-03: Cmd+click / Ctrl+click opens destinations in new tab
**Priority:** High (core NICE-11 acceptance test)
**Component:** RouterLink navigation
**Requirement:** NICE-11
**Preconditions:** Logged in, desktop. Use `Cmd` on Mac, `Ctrl` on Windows

**Steps:** For each site below, Cmd/Ctrl+click it. Expected: **new tab opens at destination URL AND side effect fires on current tab** (no navigation on current tab).

| # | Site | Action to reach it | Destination URL | Side effect on current tab |
|---|------|-------------------|-----------------|----------------------------|
| 3.1 | GlobalSearch collection result | `/` → type query → Cmd+click first row | `/collection?search=<name>` | Dropdown closes, input clears |
| 3.2 | GlobalSearch users result | Switch to Users tab → Cmd+click | `/@<username>` | Dropdown closes |
| 3.3 | GlobalSearch Scryfall result | Switch to Scryfall tab → Cmd+click | `/collection?addCard=<name>` | Dropdown closes |
| 3.4 | GlobalSearch "Advanced Search" | Cmd+click the link at bottom | `/search` | Dropdown closes |
| 3.5 | MobileSearchOverlay (all 4 sites above) | Open mobile overlay → repeat 3.1–3.4 | Same URLs | Overlay closes |
| 3.6 | AppHeader FAQ | Help menu → Cmd+click FAQ | `/faq` | Help menu closes |
| 3.7 | Match notification row | Click bell icon → Cmd+click a match | `/saved-matches?match=<id>` | Notification dropdown closes |
| 3.8 | "See all matches" footer | Bell icon → Cmd+click footer | `/saved-matches` | Dropdown closes |
| 3.9 | AddCardModal Advanced Search | Open Add Card modal → Cmd+click "Advanced Search" | `/search` | Modal closes |
| 3.10 | CardFilterBar — CollectionView | `/collection` → type in filter → Cmd+click "Advanced Search" suggestion | `/search` | Suggestion list closes |
| 3.11 | CardFilterBar — DeckView | Open any deck → repeat 3.10 | `/search` | Suggestion list closes |
| 3.12 | CardFilterBar — BinderView | Open any binder → repeat 3.10 | `/search` | Suggestion list closes |

**Pass criteria:** all 12 sub-tests show new-tab + current-tab-side-effect.
**Fail criteria:** any site navigates in current tab on Cmd+click.

---

## TC-P04-04: Middle-click opens in background tab
**Priority:** Medium
**Component:** RouterLink (browser modifier behavior)
**Requirement:** NICE-11

**Steps:** Middle-click (mouse wheel button) on 3 representative sites:
1. GlobalSearch collection result
2. AppHeader FAQ
3. MatchNotificationsDropdown "See all matches"

**Expected:** Each opens a **background tab** (focus stays on current tab), side effect fires on current tab. Current tab does NOT navigate.

---

## TC-P04-05: Normal left-click regression
**Priority:** High (ensures Cmd+click work didn't break standard navigation)
**Component:** All converted RouterLinks
**Requirement:** NICE-11 regression

**Steps:** For sites 3.1, 3.6, 3.7, 3.9, 3.10 from TC-03, plain left-click each.

**Expected:** Each navigates in the **current tab** AND fires its side effect (dropdown/modal closes). Destination page loads correctly.

---

## TC-P04-06: Imperative redirect regression
**Priority:** High (D-08 preserved imperative flows must still work)
**Component:** router.push flows
**Requirement:** Phase 4 regression (D-08 scope)

**Steps:**
1. Log out → verify lands on `/login` (post-logout redirect, UserPopover:221)
2. Log back in → verify lands on `/dashboard` (post-auth redirect, LoginView:50)
3. `/decks` → create a new deck → verify lands on `/decks/<new-id>/edit` (post-create redirect, DecksView:331)
4. AppHeader menu → "Add card" → verify AddCardModal opens (NOT new tab, AppHeader:167/169)
5. Header menu → "Restart tour" → verify redirects to `/collection` and starts tour (AppHeader:57)

**Expected:** All 5 flows work in **current tab** (no new tabs, no dropdown closes on navigate). These are imperative redirects and should NOT behave like RouterLinks.

---

## TC-P04-07: i18n verification across 3 locales
**Priority:** Medium
**Component:** Locales en/es/pt
**Requirement:** ARCH-10 i18n closeout, Rule 3

**Steps:** Open browser DevTools accessibility tab. For each language (Settings → Language: English / Español / Português):
1. Focus the `/` clear button (after typing something) → inspect its `aria-label`
2. Type `bolt` to get results → wait ~800ms → inspect the `aria-live` span content

**Expected results:**

| Language | Clear button aria-label | Live region text (plural) |
|----------|-------------------------|---------------------------|
| English | `Clear search` | `{N} results in collection` |
| Español | `Limpiar búsqueda` | `{N} resultados en colección` |
| Português | `Limpar busca` | `{N} resultados em coleção` |

**Fail criteria:** live region shows literal key like `header.search.resultsCount` → i18n keys are missing or mis-wired.

---

## TC-P04-08: Screen reader smoke test (optional)
**Priority:** Medium
**Component:** SR announcements
**Requirement:** ARCH-10 SR compliance
**Preconditions:** VoiceOver (Mac, `Cmd+F5`), ChromeVox (Chrome extension), or NVDA (Windows)

**Steps:**
1. Enable SR
2. Tab to GlobalSearch input
3. Type `bolt` → wait for results
4. Press `ArrowDown`

**Expected:**
- Step 2: SR announces `"combobox, collapsed"` (or equivalent phrasing)
- Step 3: ~800ms after results, SR announces the `aria-live` text ("{N} results in collection")
- Step 4: SR announces the highlighted option's content (card name + edition)

---

## Test plan summary

| TC | Priority | Est. time | Pass/Fail |
|----|----------|-----------|-----------|
| P04-01 | High | 2 min | [ ] |
| P04-02 | Medium | 1 min | [ ] |
| P04-03 | High | 5 min | [ ] |
| P04-04 | Medium | 1 min | [ ] |
| P04-05 | High | 2 min | [ ] |
| P04-06 | High | 2 min | [ ] |
| P04-07 | Medium | 2 min | [ ] |
| P04-08 | Medium | 2 min | [ ] |

**Total:** ~15 min. If TC-01, TC-03, TC-05, TC-06 all pass → phase is safe for prod deploy. TC-07 / TC-08 are polish checks that can surface post-deploy without blocking merge.

---

## Jira import mapping (for MCP-driven creation)

| Jira Field | Value source |
|------------|--------------|
| Project | {user-provided key, e.g., CRANIAL} |
| Issue Type | Test (or Task — per project config) |
| Summary | TC title line |
| Description | Preconditions + Steps + Expected (markdown → ADF conversion by MCP) |
| Priority | TC Priority field |
| Labels | `phase-4`, `a11y` (if component=a11y), `nice-11` (if requirement=NICE-11), `regression` (TC-05, TC-06) |
| Fix Version | 1.24.0 |
| Component | `GlobalSearch` / `MobileSearchOverlay` / `RouterLink` (per TC component field) |
