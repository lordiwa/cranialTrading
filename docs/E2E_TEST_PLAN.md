# Cranial Trading - E2E Test Plan

**Framework:** Playwright (Chromium)
**Total Tests:** 135
**Last Full Run:** 135/135 passed
**Base URL:** `http://localhost:4173` (Vite preview)

---

## 1. Authentication

### 1.1 Login (`e2e/specs/auth/login.spec.ts`) — 4 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Successful login redirects to saved-matches | **UC-AUTH-01**: User authenticates with valid Firebase credentials and is redirected to the main dashboard (saved-matches). |
| 2 | Invalid credentials show error toast | **UC-AUTH-02**: User enters wrong email/password; system displays an error toast notification and remains on the login page. |
| 3 | Empty fields — submit button is disabled | **UC-AUTH-03**: Form validation prevents submission when required fields (email, password) are missing; submit button enables only when both are filled. |
| 4 | "Forgot Password" and "Register" links navigate correctly | **UC-AUTH-04**: Login page provides navigation links to the forgot-password and registration flows. |

### 1.2 Registration (`e2e/specs/auth/register.spec.ts`) — 6 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Successful registration shows email verification screen | **UC-REG-01**: New user registers with unique email, password, username, and location; system creates account and shows email verification screen. |
| 2 | Register button disabled when required fields empty | **UC-REG-02**: Form validation prevents submission with empty required fields (browser native + app validation). |
| 3 | Invalid email format shows validation error | **UC-REG-03**: Email format validation rejects malformed emails and keeps user on the register page. |
| 4 | Duplicate email blocks registration | **UC-REG-04**: System prevents registration with an already-registered email; user stays on the register page. |
| 5 | Duplicate username blocks registration | **UC-REG-05**: System enforces unique usernames; duplicate username shows error or remains on register page. |
| 6 | Back to login link works from register page | **UC-REG-06**: Registration page provides a navigation link back to the login page. |

### 1.3 Forgot / Reset Password (`e2e/specs/auth/forgot-password.spec.ts`) — 5 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Submit email shows confirmation message | **UC-PWD-01**: User requests password reset; system sends reset email and displays confirmation message. |
| 2 | Empty email shows validation error | **UC-PWD-02**: Form validation prevents submission of empty email on forgot-password page. |
| 3 | Back to login link from forgot-password | **UC-PWD-03**: Forgot-password page provides navigation link back to login. |
| 4 | Reset password page rejects mismatched passwords | **UC-PWD-04**: Password reset form validates that new password and confirmation match; shows mismatch error and disables submit. |
| 5 | Reset password with invalid/expired oobCode shows error | **UC-PWD-05**: System handles invalid or expired reset codes gracefully with an error message. |

---

## 2. Navigation

### 2.1 Smoke Tests (`e2e/specs/smoke/navigation.spec.ts`) — 5 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Nav: Collection link navigates to /collection | **UC-NAV-01**: Authenticated user navigates to Collection page via main navigation bar. |
| 2 | Nav: Market link navigates to /market | **UC-NAV-02**: Authenticated user navigates to Market page via main navigation bar. |
| 3 | Nav: Contacts link navigates to /contacts | **UC-NAV-03**: Authenticated user navigates to Contacts page via main navigation bar. |
| 4 | Nav: Matches dropdown navigates to /saved-matches | **UC-NAV-04**: Authenticated user navigates to Saved Matches page via dropdown/link. |
| 5 | Tab switching renders correct content | **UC-NAV-05**: Collection page tab navigation (Collection/Decks/Binders) switches displayed content correctly. |

---

## 3. Collection Management

### 3.1 Collection CRUD (`e2e/specs/collection/collection-crud.spec.ts`) — 7 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Collection page loads with card grid visible | **UC-COL-01**: Authenticated user opens collection page; status filters and card grid render correctly. |
| 2 | Add card: open modal, search, select, save, card appears | **UC-COL-02**: User adds a card via Scryfall search in the Add Card modal; card appears in collection with success toast. |
| 3 | Edit card: open detail modal, edit, save, changes persist | **UC-COL-03**: User clicks a card to open the detail/edit modal, modifies quantity, saves; changes persist with success toast. |
| 4 | Delete card: open detail, delete, confirm, card removed | **UC-COL-04**: User deletes a card from the detail modal with confirmation dialog; card count decreases and success toast appears. |
| 5 | Bulk select, bulk change status to Sale, verify updated | **UC-COL-05**: User enters selection mode, selects cards via checkbox, bulk-changes status to "Sale"; success toast confirms batch update. |
| 6 | Bulk select, bulk delete, confirm, cards removed | **UC-COL-06**: User bulk-selects cards and bulk-deletes them with confirmation; success toast confirms batch deletion. |
| 7 | Cancel deletion from confirm dialog leaves card intact | **UC-COL-07**: User initiates card deletion but cancels from the confirmation dialog; card count remains unchanged. |

### 3.2 Collection Filters (`e2e/specs/collection/collection-filters.spec.ts`) — 4 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Status filter: click "AVAILABLE" filters cards | **UC-FIL-01**: User filters collection by "Available" status; grid updates to show only matching cards. |
| 2 | Status filter: click "ALL" resets to full collection | **UC-FIL-02**: User resets status filter to "All"; grid shows the complete unfiltered collection. |
| 3 | Search bar filters collection by card name | **UC-FIL-03**: User types a card name in the search bar; collection filters in real-time by name. |
| 4 | Sort dropdown changes card order | **UC-FIL-04**: User selects a sort option from the dropdown; card grid reorders accordingly. |

### 3.3 Collection View Modes (`e2e/specs/collection/collection-views.spec.ts`) — 5 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Visual grid renders card images | **UC-VIEW-01**: User switches to "Visual" view mode; card images render in a grid layout. |
| 2 | Stack groups cards by name | **UC-VIEW-02**: User switches to "Stack" view mode; cards are grouped by name. |
| 3 | Text view shows list with card data columns | **UC-VIEW-03**: User switches to "Text" view mode; cards display in a tabular list format. |
| 4 | Dual-faced card shows toggle button | **UC-VIEW-04**: Dual-faced MTG cards (e.g., Delver of Secrets) display a face-toggle button in the grid. |
| 5 | Clicking toggle switches between card faces | **UC-VIEW-05**: User clicks the toggle button on a dual-faced card; the displayed image switches to the other face. |

---

## 4. Search (Scryfall)

### 4.1 Card Search (`e2e/specs/search/search.spec.ts`) — 8 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Search by card name returns results grid | **UC-SRC-01**: User searches for a card by name (e.g., "Lightning Bolt"); Scryfall API returns results displayed in a grid. |
| 2 | Autocomplete suggestions appear while typing | **UC-SRC-02**: As user types in the search box, autocomplete suggestions populate from the Scryfall API. |
| 3 | Selecting autocomplete suggestion populates search and shows results | **UC-SRC-03**: User selects an autocomplete suggestion; search field populates and results display. |
| 4 | Press Enter submits search and shows results | **UC-SRC-04**: User types a query and presses Enter; search executes and results render. |
| 5 | Advanced filters narrow results | **UC-SRC-05**: User opens the Advanced Filters modal (color, type, rarity, CMC, format); filters are applied to narrow search results. |
| 6 | Click result card opens add-to-collection modal | **UC-SRC-06**: User clicks a search result card; the Add Card modal opens for adding to collection. |
| 7 | Owned-count badge visible for cards already in collection | **UC-SRC-07**: Search results display an owned-count badge (bg-neon) for cards the user already owns. |
| 8 | No-results shows empty state message | **UC-SRC-08**: A search query with no matches (e.g., gibberish) shows a "no cards found" empty state. |

---

## 5. Decks

### 5.1 Deck CRUD (`e2e/specs/decks/deck-crud.spec.ts`) — 5 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Create new deck appears in deck list | **UC-DK-01**: User creates a new deck with name and format; deck appears in the list with success toast. |
| 2 | Create deck validation: empty name prevents saving | **UC-DK-02**: Deck creation form requires a name; submit is disabled or shows error when name is empty. |
| 3 | Delete deck with confirmation disappears from list | **UC-DK-03**: User deletes a deck via confirmation dialog; deck is removed from the list with success toast. |
| 4 | Open existing deck in editor: editor loads with stats | **UC-DK-04**: User opens an existing deck via the Edit button; deck editor loads with stats panel. |
| 5 | Deck tab in collection view shows deck list | **UC-DK-05**: The Decks tab in the collection view displays the list of user's decks with the "New Deck" button. |

### 5.2 Deck Editor (`e2e/specs/decks/deck-editor.spec.ts`) — 5 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Add card from collection to mainboard: allocation + stats update | **UC-DE-01**: User creates a deck and opens it in the editor; adding cards from collection updates allocation and stats. |
| 2 | Add card to sideboard: move between mainboard and sideboard | **UC-DE-02**: User can move cards between mainboard and sideboard sections in the deck editor. |
| 3 | Adjust card quantity in deck: quantity display updates | **UC-DE-03**: User adjusts card quantity in the deck editor; display updates in real-time. |
| 4 | Over-allocation validation: allocate more than available shows error | **UC-DE-04**: System prevents allocating more copies of a card to a deck than the user owns; shows validation error. |
| 5 | Deck stats panel shows mana curve / type distribution | **UC-DE-05**: The deck editor displays a stats panel with mana curve and card type distribution charts. |

### 5.3 Deck Import (`e2e/specs/decks/deck-import.spec.ts`) — 3 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Import from Moxfield URL: progress then imported content appears | **UC-DI-01**: User imports a deck via Moxfield URL; system shows import progress and imported cards appear. |
| 2 | Import with invalid Moxfield URL shows error | **UC-DI-02**: Invalid or malformed Moxfield URL displays an error message in the modal or via toast. |
| 3 | Import using deck ID only succeeds | **UC-DI-03**: User can import a deck using just the Moxfield deck ID (without full URL). |

---

## 6. Binders

### 6.1 Binder Management (`e2e/specs/binders/binders.spec.ts`) — 4 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Create new binder appears in binder list | **UC-BN-01**: User creates a new binder with name and optional description; binder appears in the sub-tab list. |
| 2 | Create binder validation: empty name prevents saving | **UC-BN-02**: Binder creation requires a name; submit is disabled or shows error when name is empty. |
| 3 | Cancel binder creation from modal | **UC-BN-03**: User opens the create binder modal, fills in a name, then cancels; no binder is created. |
| 4 | Delete binder with confirmation | **UC-BN-04**: User creates a binder then deletes it via the Delete button with confirmation dialog. |

---

## 7. Preferences (Wishlist)

### 7.1 Preferences CRUD (`e2e/specs/preferences/preferences-crud.spec.ts`) — 6 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | WANTED filter shows wishlist cards section | **UC-PF-01**: User navigates to collection with WANTED filter active; wishlist cards section is visible. |
| 2 | Add wishlist card via add card modal appears in WANTED | **UC-PF-02**: User adds a card with "wishlist" status via the Add Card modal; card appears in the WANTED filter view. |
| 3 | Delete a wishlist card from the collection | **UC-PF-03**: User deletes a wishlist card from the detail modal with confirmation; success toast confirms deletion. |
| 4 | Cancel add card modal without saving | **UC-PF-04**: User opens the Add Card modal but cancels without saving; no card is added. |
| 5 | Status filter shows only wishlist cards | **UC-PF-05**: The WANTED status filter correctly filters to display only wishlist-status cards. |
| 6 | Import button is visible on collection page | **UC-PF-06**: The Import button for bulk-importing preferences is visible on the collection page. |

### 7.2 Preferences Import (`e2e/specs/preferences/preferences-import.spec.ts`) — 2 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Import button opens import modal | **UC-PI-01**: Clicking the Import button opens the import modal/dialog for bulk wishlist import. |
| 2 | Import with invalid URL shows feedback | **UC-PI-02**: Entering an invalid URL in the import modal and clicking Analyze shows error feedback. |

---

## 8. Matches

### 8.1 Match Calculation (`e2e/specs/matches/match-calculation.spec.ts`) — 3 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Calculate matches button triggers scanning with progress | **UC-MC-01**: User clicks "Calculate Matches"; system scans for compatible traders and shows progress indicator. |
| 2 | Calculated matches appear on "New" tab | **UC-MC-02**: After calculation, new matches appear on the "New" tab with match cards or a no-matches message. |
| 3 | No matches found shows guidance message | **UC-MC-03**: When no matches exist, the New tab displays a guidance message explaining how to get matches. |

### 8.2 Match Management (`e2e/specs/matches/match-management.spec.ts`) — 7 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Matches page loads with tab navigation | **UC-MM-01**: Matches page loads with all four tabs visible: New, Sent, Saved, Deleted. |
| 2 | Open match detail modal: card comparison + user info | **UC-MM-02**: User opens a match detail modal; displays card comparison and other user's information. |
| 3 | Save match (ME INTERESA) moves to Saved tab | **UC-MM-03**: User expresses interest in a match ("ME INTERESA"); match moves from New to Saved tab. |
| 4 | Discard match moves to Deleted tab | **UC-MM-04**: User discards a match; it moves from New to Deleted tab. |
| 5 | Share a match: toast confirmation | **UC-MM-05**: User shares a saved match; success toast confirms the share action. |
| 6 | Block user from match card appears in blocked users list | **UC-MM-06**: User blocks another trader from a match card; blocked user is excluded from future matches. |
| 7 | Switch between match tabs: each renders its content | **UC-MM-07**: User switches between New/Sent/Saved/Deleted tabs; each tab renders its respective content. |

---

## 9. Messages

### 9.1 Messaging (`e2e/specs/messages/messages.spec.ts`) — 6 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Messages page loads conversation list | **UC-MSG-01**: Authenticated user opens Messages page; conversation list or empty state renders. |
| 2 | Open conversation, send message, message appears | **UC-MSG-02**: User opens an existing conversation, types and sends a message; sent message appears in the thread. |
| 3 | Conversation list shows last message preview + timestamp | **UC-MSG-03**: Each conversation in the list displays a preview of the last message and a timestamp. |
| 4 | Filter conversations by username | **UC-MSG-04**: User types in the search/filter input; conversation list filters by matching username. |
| 5 | Close chat modal returns to conversation list | **UC-MSG-05**: User opens a chat then closes it; returns to the conversation list view. |
| 6 | Empty state when no conversations match filter | **UC-MSG-06**: Filtering with a non-existent username shows zero or empty-state results. |

---

## 10. Contacts

### 10.1 Saved Contacts (`e2e/specs/contacts/contacts.spec.ts`) — 6 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Contacts page loads contact list | **UC-CON-01**: Authenticated user opens Contacts page; contact list or empty state renders. |
| 2 | Open chat modal from contact card | **UC-CON-02**: User clicks the chat icon on a contact card; chat modal opens for direct messaging. |
| 3 | Visit contact public profile link | **UC-CON-03**: User clicks a contact's profile link; navigates to the public profile page (/@username). |
| 4 | Delete contact with confirmation removed from list | **UC-CON-04**: User deletes a saved contact with confirmation dialog; contact is removed with success toast. |
| 5 | Cancel deletion leaves contact intact | **UC-CON-05**: User initiates contact deletion but cancels; contact count remains unchanged. |
| 6 | Empty state shown when no contacts saved | **UC-CON-06**: When no contacts exist, an empty state message is displayed. |

---

## 11. Market

### 11.1 Price Movers (`e2e/specs/market/price-movers.spec.ts`) — 5 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Price movers tab loads winners list | **UC-MKT-01**: User opens the Price Movers tab; winners list loads with price data from the market database. |
| 2 | Switch between Winners/Losers tabs | **UC-MKT-02**: User toggles between Winners and Losers sub-tabs; each displays its respective movers table. |
| 3 | Filter by format changes displayed movers | **UC-MKT-03**: User selects a format filter (Modern, Standard, etc.); movers list updates to show format-specific data. |
| 4 | Filter by price type updates movers context | **UC-MKT-04**: User changes price type filter (USD, EUR, etc.); movers recalculate based on selected price type. |
| 5 | Search by card name using autocomplete | **UC-MKT-05**: User types a card name in the movers search; autocomplete suggestions appear for card lookup. |

### 11.2 Format Staples (`e2e/specs/market/format-staples.spec.ts`) — 3 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Format staples tab loads with staples list | **UC-STP-01**: User opens the Format Staples tab; staples table renders with card data. |
| 2 | Switch format selector changes displayed staples | **UC-STP-02**: User selects a different format; staples list updates to show that format's staple cards. |
| 3 | Switch category filters staples | **UC-STP-03**: User clicks a category button (Creatures, Spells, Lands, Overall); staples filter by card type. |

### 11.3 Portfolio Impact (`e2e/specs/market/portfolio-impact.spec.ts`) — 3 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Portfolio impact section renders with total delta | **UC-PORT-01**: User opens Portfolio Impact tab; total portfolio value delta is displayed. |
| 2 | Sort by impact vs percentage changes order | **UC-PORT-02**: User clicks sort buttons to toggle between dollar-impact and percentage sorting. |
| 3 | Owned cards highlighted with dollar change amount | **UC-PORT-03**: Cards the user owns are displayed in the portfolio table with their dollar-value change. |

---

## 12. Settings

### 12.1 Profile Settings (`e2e/specs/settings/settings-profile.spec.ts`) — 6 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Change password section is visible with CHANGE button | **UC-SET-01**: Settings page displays the Change Password section with a toggle/expand button. |
| 2 | Change password: fill current + new + confirm, success | **UC-SET-02**: User changes password by entering current password, new password, and confirmation; operation succeeds. |
| 3 | Change password: mismatched confirmation shows validation error | **UC-SET-03**: Password change form validates that new password and confirmation match; shows error or disables submit on mismatch. |
| 4 | Username section is visible | **UC-SET-04**: Settings page displays the Username section for viewing/editing username. |
| 5 | Location section is visible | **UC-SET-05**: Settings page displays the Location section for viewing/editing location. |
| 6 | Data management section has action buttons | **UC-SET-06**: Settings page includes data management actions (Restart Tour, Clear Data) at the bottom. |

### 12.2 Data Management (`e2e/specs/settings/settings-data.spec.ts`) — 4 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Export collection as Moxfield CSV | **UC-DATA-01**: User exports their collection as a Moxfield-compatible CSV file download. |
| 2 | Export collection as Manabox CSV | **UC-DATA-02**: User exports their collection as a Manabox-compatible CSV file download. |
| 3 | Resend verification email: confirmation toast | **UC-DATA-03**: User requests a re-send of the email verification; confirmation feedback is shown. |
| 4 | Restart guided tour from settings | **UC-DATA-04**: User restarts the onboarding guided tour from the settings page. |

---

## 13. User Profile

### 13.1 Public Profile (`e2e/specs/user-profile/user-profile.spec.ts`) — 5 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | View public user profile: username, location, avatar visible | **UC-UP-01**: Visiting /@username renders the public profile with username, location, and avatar. |
| 2 | Browse public cards on profile with text search filter | **UC-UP-02**: Public profile displays the user's public cards; visitor can filter them with a text search. |
| 3 | Logged-out visitor does NOT see interest/contact buttons | **UC-UP-03**: Unauthenticated visitors cannot see "Contact" or "Interest" action buttons on public profiles. |
| 4 | Non-existent username shows user-not-found state | **UC-UP-04**: Navigating to a non-existent /@username shows a "user not found" error state. |
| 5 | Logged-in user viewing own profile sees different UI | **UC-UP-05**: Authenticated user viewing their own profile sees owner-specific UI (no contact button, wishlist link, etc.). |

---

## 14. Internationalization (i18n)

### 14.1 Language Switching (`e2e/specs/i18n/i18n.spec.ts`) — 5 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Default language is Spanish on login page | **UC-I18N-01**: Application defaults to Spanish; login page shows "INICIAR SESION". |
| 2 | Switch language to English: UI updates immediately | **UC-I18N-02**: User clicks "EN" button; all UI text switches to English without page reload. |
| 3 | Switch language to Portuguese: UI updates immediately | **UC-I18N-03**: User clicks "PT" button; all UI text switches to Portuguese without page reload. |
| 4 | Language persists after page reload | **UC-I18N-04**: After switching to English and reloading, the language preference is preserved via localStorage. |
| 5 | Language persists after login into authenticated pages | **UC-I18N-05**: Language selection made on the login page carries over into authenticated pages after login. |

---

## 15. Notifications

### 15.1 Toast Notifications (`e2e/specs/notifications/toasts-and-notifications.spec.ts`) — 4 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Success toast appears and auto-dismisses after ~4s | **UC-TOAST-01**: Success actions trigger a green success toast that auto-dismisses after approximately 4 seconds. |
| 2 | Error toast appears on failed action (wrong password) | **UC-TOAST-02**: Failed actions (e.g., wrong credentials) trigger a red error toast that auto-dismisses. |
| 3 | Multiple sequential toasts: latest is visible | **UC-TOAST-03**: When multiple toasts are triggered in sequence, at least the latest toast remains visible. |
| 4 | Toast remains visible briefly (does not flash-dismiss) | **UC-TOAST-04**: Toasts remain visible for a perceptible duration (>500ms) and do not flash-dismiss instantly. |

### 15.2 Match Notifications (`e2e/specs/notifications/toasts-and-notifications.spec.ts`) — 4 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | Notification dropdown opens/closes from header bell icon | **UC-NOTIF-01**: User clicks the bell icon in the header; notification dropdown opens and can be closed. |
| 2 | Notification badge reflects unread count | **UC-NOTIF-02**: The bell icon displays a badge with the count of unread notifications. |
| 3 | Clicking outside dropdown dismisses it | **UC-NOTIF-03**: Clicking outside the notification dropdown closes it (click-away behavior). |
| 4 | Mark notification as read updates badge | **UC-NOTIF-04**: Interacting with notifications updates the unread badge count. |

---

## 16. Help & Legal

### 16.1 Static Pages (`e2e/specs/help/help-legal.spec.ts`) — 5 tests

| # | Test Case | Use Case Validated |
|---|---|---|
| 1 | FAQ page loads: expand/collapse a question | **UC-HELP-01**: FAQ page renders with collapsible question/answer sections that can be expanded by clicking. |
| 2 | Terms of Service page loads and is readable | **UC-HELP-02**: Terms of Service page loads at /terms and displays legal content. |
| 3 | Privacy Policy page loads | **UC-HELP-03**: Privacy Policy page loads at /privacy and displays policy content. |
| 4 | Cookies page loads | **UC-HELP-04**: Cookies page loads at /cookies and displays cookie policy content. |
| 5 | FAQ: return to login by clicking logo | **UC-HELP-05**: Clicking the Cranial Trading logo from the FAQ page navigates back to the login/home page. |

---

## Test Infrastructure

### Page Objects (`e2e/pages/`)

| Page Object | Scope |
|---|---|
| `login.page.ts` | Login form, submit, error states |
| `register.page.ts` | Registration form, validation, verification screen |
| `forgot-password.page.ts` | Forgot password form, success message |
| `reset-password.page.ts` | Reset password form, mismatch validation |
| `collection.page.ts` | Card grid, add/edit/delete modals, filters, view modes |
| `search.page.ts` | Scryfall search, autocomplete, result grid, advanced filters |
| `decks.page.ts` | Deck list, create/import modals, editor |
| `binders.page.ts` | Binder tabs, create modal |
| `preferences.page.ts` | Wishlist/WANTED filter, add/import modals |
| `matches.page.ts` | Match tabs, calculate, save/discard/share actions |
| `messages.page.ts` | Conversation list, chat panel, send/filter |
| `contacts.page.ts` | Contact list, chat/profile/delete actions |
| `market.page.ts` | Movers, staples, portfolio tabs + filters |
| `settings.page.ts` | Password, username, location, data management |
| `user-profile.page.ts` | Public profile, search filter, not-found state |
| `navigation.page.ts` | Nav bar links, notification bell/dropdown |
| `common.page.ts` | Toast notifications, confirm/cancel dialogs |

### Helpers

| File | Purpose |
|---|---|
| `helpers/auth.ts` | `ensureLoggedIn()` — handles Firebase auth per test context (indexedDB not captured by storageState) |
| `helpers/test-data.ts` | Shared constants: routes, search terms, conditions, statuses, formats, timeouts |
| `fixtures/test.ts` | Custom Playwright fixtures wiring page objects to test contexts |

### Configuration (`playwright.config.ts`)

| Setting | Value |
|---|---|
| Test directory | `./e2e/specs` |
| Workers | 1 (sequential) |
| Timeout | 60s per test |
| Action timeout | 15s |
| Navigation timeout | 30s |
| Auth login timeout | 30s |
| Reporter | HTML + list |
| Web server | `npx vite build && npx vite preview --port 4173` |
| Projects | `chromium` (all non-auth), `auth-tests` (auth specs only) |
