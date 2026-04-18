---
status: partial
phase: 04-globalsearch-navigation-polish
source:
  - 04-VERIFICATION.md
started: 2026-04-17
updated: 2026-04-17
---

## Current Test

[awaiting human testing on cranial-trading-dev.web.app]

## Tests

### 1. Screen reader announces GlobalSearch as a combobox with state + result count
expected: Focus the GlobalSearch input. Screen reader (ChromeVox / VoiceOver / NVDA) announces "combobox, collapsed" on focus. After typing a 2+ character query and results load, announcement includes "{N} results in collection" (or users/scryfall as active tab). aria-busy transitions announce "Searching…" during load.
result: [pending]

### 2. Cmd+click / Ctrl+click / middle-click opens destination in a new tab
expected: On dev.app (desktop Chrome/Safari), Cmd+click (Mac) or Ctrl+click (Windows) on each RouterLink site opens a NEW TAB with the destination URL, while the originating tab runs its side effect (dropdown closes, query clears). Sites to verify:
- GlobalSearch collection result row → new tab at `/collection?search=<name>`
- GlobalSearch users tab row → new tab at `/@<username>`
- GlobalSearch Scryfall tab row → new tab at `/collection?addCard=<name>`
- GlobalSearch "Advanced Search" → new tab at `/search`
- MobileSearchOverlay equivalents (same 4 sites in the full-screen overlay)
- AppHeader FAQ menu item → new tab at `/faq`
- MatchNotificationsDropdown "See all matches" + per-match rows → new tab at `/saved-matches`
- AddCardModal "Advanced Search" → new tab at `/search`
- CardFilterBar advanced search (in CollectionView, DeckView, BinderView) → new tab at `/search`
Middle-click should behave the same way (open in background tab).
result: [pending]

### 3. MobileSearchOverlay closes on Enter-key selection
expected: In narrow viewport or mobile emulation, open the mobile search overlay, type a query, press ArrowDown to highlight a result, press Enter. The full-screen overlay closes (emit('close') fires) AND the destination route loads.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

[none yet — all 3 tests pending]
