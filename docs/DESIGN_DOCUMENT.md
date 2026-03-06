# Cranial Trading - Project Design Document

**Version:** 1.7.4
**Last Updated:** 2026-03-02
**Platform:** Web (SPA)
**Status:** Production

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Feature Requirements & Use Cases](#3-feature-requirements--use-cases)
4. [Data Models](#4-data-models)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [Test Plan](#6-test-plan)
7. [Glossary](#7-glossary)

---

## 1. Project Overview

### 1.1 Purpose

Cranial Trading is a Magic: The Gathering trading platform that enables players to manage their card collections, build decks, discover trading opportunities with other users, and communicate directly to coordinate trades.

### 1.2 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend Framework | Vue 3 (Composition API, `<script setup>`) |
| Language | TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS (custom theme) |
| State Management | Pinia |
| Backend/Auth | Firebase (Auth, Firestore) |
| Card Data API | Scryfall |
| Deck Import | Moxfield (via Cloudflare Worker proxy) |
| Price Data | MTG JSON (IndexedDB storage) |
| Market Data | Firestore `/market_data` (backend-populated) |
| Guided Tour | driver.js |
| i18n | Custom composable (ES/EN/PT) |

### 1.3 Design Theme

- **Background:** #000000 (black)
- **Text:** #EEEEEE (silver)
- **Accents:** #CCFF00 (neon)
- **Errors:** #8B2E1F (rust)
- **Font:** IBM Plex Mono (monospace throughout)

---

## 2. Architecture

### 2.1 Source Structure

```
src/
├── components/         # 58 Vue components across 14 feature directories
│   ├── ui/            # 18 base components (Button, Input, Modal, Toast, etc.)
│   ├── layout/        # 4 components (AppContainer, Header, Footer, Notifications)
│   ├── collection/    # 11 components (grid, cards, modals for CRUD)
│   ├── decks/         # 7 components (editor, card management)
│   ├── search/        # 5 components (search bar, results, filters)
│   ├── matches/       # 4 components (match cards, detail modal)
│   ├── chat/          # 1 component (ChatModal)
│   ├── preferences/   # 4 components (preference CRUD)
│   ├── contacts/      # 1 component (SavedContactCard)
│   ├── binders/       # 1 component (CreateBinderModal)
│   ├── common/        # 1 component (CardGridSearch)
│   ├── user/          # 1 component (UserProfileHoverCard)
│   └── notifications/ # (reserved)
├── views/             # 16 route page components
├── stores/            # 14 Pinia stores
├── services/          # 7 external API clients
├── composables/       # 10 reusable logic hooks
├── types/             # 7 TypeScript type definition files
├── utils/             # 3 utility modules
└── router/            # Route definitions with auth guards
```

### 2.2 Firestore Data Structure

```
/users/{userId}/
  ├── cards/{cardId}                    # Card collection
  ├── decks/{deckId}                    # Deck definitions
  ├── preferences/{prefId}             # Trading preferences
  ├── savedMatches/{matchId}           # Saved match results
  ├── savedContacts/{contactId}        # Saved trader contacts
  ├── binders/{binderId}               # Card binders
  └── price_snapshots/{date}           # Daily portfolio snapshots

/conversations/{conversationId}/
  └── messages/{messageId}             # Chat messages

/public_cards/{docId}                  # Denormalized public card index
/public_preferences/{docId}            # Denormalized public preference index
/shared_matches/{docId}                # Shared interest matches between users
/market_data/                          # Market staples & price movers (backend-populated)
```

### 2.3 Key Architectural Patterns

| Pattern | Description |
|---------|-------------|
| **Client-side filtering** | All cards loaded into memory, filtered/sorted via computed properties (`useCardFilter`) |
| **Denormalized public index** | `public_cards` and `public_preferences` collections enable match discovery without loading all users |
| **Reference-based deck storage** | Decks store `DeckCardAllocation[]` referencing `Card.id` — not duplicated card data |
| **Fire-and-forget async** | Price snapshots and public card syncs run without awaiting to avoid blocking UI |
| **Batch operations with retry** | Bulk edits/deletes use Firestore `writeBatch` with automatic retry logic |
| **Real-time listeners** | Messages and contacts use `onSnapshot` for live updates |
| **Rate-limited API calls** | Scryfall service enforces 200ms between requests with 429 retry/backoff |
| **Multi-layer caching** | Scryfall (5-10min TTL), market data (10min TTL), prices (IndexedDB) |

---

## 3. Feature Requirements & Use Cases

### 3.1 Authentication (FR-AUTH)

**Description:** User registration, login, password management, and session handling.

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AUTH-01 | Users can register with email, password, username, and location | Must |
| FR-AUTH-02 | Users can log in with email/password | Must |
| FR-AUTH-03 | Users can log in with Google OAuth | Must |
| FR-AUTH-04 | Users receive email verification after registration | Must |
| FR-AUTH-05 | Users can request a password reset via email | Must |
| FR-AUTH-06 | Users can reset their password via an emailed link (oobCode) | Must |
| FR-AUTH-07 | Authenticated routes redirect unauthenticated users to `/login` | Must |
| FR-AUTH-08 | Guest-only routes redirect authenticated users to `/saved-matches` | Must |

#### Use Cases

| UC ID | Use Case | Actor | Precondition | Steps | Expected Result |
|-------|----------|-------|--------------|-------|-----------------|
| UC-AUTH-01 | Register new account | Guest | None | 1. Navigate to `/register` 2. Enter email, password, username, location 3. Submit form | Account created, email verification sent, redirected to dashboard |
| UC-AUTH-02 | Login with email | Registered user | Has account | 1. Navigate to `/login` 2. Enter credentials 3. Submit | Authenticated, redirected to `/saved-matches` |
| UC-AUTH-03 | Login with Google | Guest/User | Has Google account | 1. Click Google OAuth button | Authenticated via popup, redirected to dashboard |
| UC-AUTH-04 | Reset password | Registered user | Has account | 1. Click "Forgot password" 2. Enter email 3. Click link in email 4. Enter new password | Password updated, can log in with new password |
| UC-AUTH-05 | Access protected route | Guest | Not authenticated | 1. Navigate to `/collection` | Redirected to `/login` |

---

### 3.2 Card Collection Management (FR-COL)

**Description:** Full CRUD for managing a personal MTG card collection with conditions, pricing, foil tracking, and public visibility.

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-COL-01 | Users can add cards to their collection via Scryfall search | Must |
| FR-COL-02 | Each card stores: name, edition, quantity, condition (M/NM/LP/MP/HP/PO), foil, price, image, status | Must |
| FR-COL-03 | Cards have a status: collection, sale, trade, or wishlist | Must |
| FR-COL-04 | Users can edit card details (condition, foil, price, quantity) | Must |
| FR-COL-05 | Users can delete individual cards | Must |
| FR-COL-06 | Users can bulk-delete multiple selected cards | Should |
| FR-COL-07 | Users can bulk-edit status/condition/foil/public visibility on selected cards | Should |
| FR-COL-08 | Cards marked as sale/trade default to public visibility | Must |
| FR-COL-09 | Users can toggle public visibility per card | Should |
| FR-COL-10 | Collection displays in visual grid, stack (grouped by name), or text list view | Should |
| FR-COL-11 | Cards support split/dual-faced MTG cards with face toggle | Must |
| FR-COL-12 | Collection shows total value with multi-source pricing (TCGPlayer, Card Kingdom) | Should |
| FR-COL-13 | Daily price snapshots are saved for portfolio history tracking | Nice |

#### Use Cases

| UC ID | Use Case | Actor | Precondition | Steps | Expected Result |
|-------|----------|-------|--------------|-------|-----------------|
| UC-COL-01 | Add card to collection | Auth user | Logged in | 1. Click "+" or search in filter bar 2. Search card by name 3. Select card from results 4. Set quantity, condition, foil, status 5. Save | Card appears in collection grid |
| UC-COL-02 | Edit card details | Auth user | Has cards | 1. Click card in grid 2. Modify fields in edit modal 3. Save | Card updated in Firestore and UI |
| UC-COL-03 | Delete a card | Auth user | Has cards | 1. Click delete icon on card 2. Confirm deletion | Card removed from collection |
| UC-COL-04 | Bulk select and delete | Auth user | Has cards | 1. Toggle selection mode 2. Select multiple cards 3. Click bulk delete 4. Confirm | All selected cards removed |
| UC-COL-05 | Change card status | Auth user | Has cards | 1. Click card 2. Open status modal 3. Select new status (sale/trade/collection/wishlist) 4. Save | Status updated, public visibility adjusted |
| UC-COL-06 | Toggle split card face | Auth user | Has split card | 1. Click face-toggle button on a dual-faced card | Image flips to show other face |
| UC-COL-07 | View collection totals | Auth user | Has cards with prices | 1. Open totals panel | See total value by source (TCG retail, CK buylist, etc.) |

---

### 3.3 Search & Filtering (FR-SRCH)

**Description:** Text search, sort, group by, and advanced filters for both the user's own collection and the Scryfall card database.

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SRCH-01 | Users can text-search cards by name or edition | Must |
| FR-SRCH-02 | Users can sort by recent, name, or price | Must |
| FR-SRCH-03 | Users can group cards by type, mana value, or color | Should |
| FR-SRCH-04 | Users can filter by advanced criteria: color, type, rarity, mana value, price range, foil, full art, power/toughness, keywords, format legality, sets | Should |
| FR-SRCH-05 | Scryfall search supports autocomplete suggestions | Should |
| FR-SRCH-06 | Collection search shows local matches (from collection) and Scryfall suggestions | Should |
| FR-SRCH-07 | Advanced filter modal works in both Scryfall mode and local (collection) mode | Must |
| FR-SRCH-08 | Active filter count displayed on filter button | Should |
| FR-SRCH-09 | Price filter logic: if results contain priced cards, show only priced cards; otherwise show all | Must |
| FR-SRCH-10 | Filter bar supports disabling suggestions dropdown (for public profiles) | Should |

#### Use Cases

| UC ID | Use Case | Actor | Precondition | Steps | Expected Result |
|-------|----------|-------|--------------|-------|-----------------|
| UC-SRCH-01 | Search collection by name | Auth user | Has cards | 1. Type card name in filter bar | Grid filters to matching cards in real-time |
| UC-SRCH-02 | Sort collection by price | Auth user | Has cards | 1. Select "Price" from sort dropdown | Cards reorder by price descending |
| UC-SRCH-03 | Group by card type | Auth user | Has cards | 1. Select "Type" from group dropdown | Cards display in sections: Creatures, Instants, Sorceries, etc. |
| UC-SRCH-04 | Apply advanced filters | Auth user | Has cards | 1. Click filter icon 2. Set price range $1-$10 3. Select "Foil only" 4. Close modal | Grid shows only foil cards in $1-$10 range |
| UC-SRCH-05 | Search Scryfall database | Auth user | None | 1. Navigate to `/search` 2. Enter card name 3. Apply filters | Scryfall results displayed with option to add to collection |
| UC-SRCH-06 | Filter public profile cards | Any user | Viewing another user's profile | 1. Type in search bar on profile 2. Apply sort/group/advanced filters | Public cards filtered without suggestions dropdown |

---

### 3.4 Deck Building (FR-DECK)

**Description:** Create and manage Magic decks with mainboard/sideboard, format selection, card allocation from collection, wishlist tracking, and import from external sources.

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-DECK-01 | Users can create decks with name, format (vintage/modern/commander/standard/custom), and description | Must |
| FR-DECK-02 | Users can add collection cards to a deck's mainboard or sideboard | Must |
| FR-DECK-03 | Users can add wishlist items (cards not yet owned) to a deck | Should |
| FR-DECK-04 | Deck stats auto-calculate: total cards, owned, wishlist, avg price, total price, completion % | Must |
| FR-DECK-05 | Deck editor grid supports grouping by type/mana/color with chip filters | Should |
| FR-DECK-06 | Users can import decks from Moxfield URLs | Should |
| FR-DECK-07 | Users can import decks from text deck lists (CSV, MTG format) | Should |
| FR-DECK-08 | Card allocation prevents over-allocation (quantity check across all decks/binders) | Must |
| FR-DECK-09 | Commander format decks support commander designation | Should |
| FR-DECK-10 | Users can delete decks | Must |

#### Use Cases

| UC ID | Use Case | Actor | Precondition | Steps | Expected Result |
|-------|----------|-------|--------------|-------|-----------------|
| UC-DECK-01 | Create a new deck | Auth user | Logged in | 1. Click "New Deck" 2. Enter name, select format 3. Optionally paste deck list 4. Save | Deck created, appears in deck list |
| UC-DECK-02 | Add card from collection to deck | Auth user | Has deck + cards | 1. Open deck editor 2. Click "Add card" 3. Select from collection 4. Set quantity, mainboard/sideboard | Card allocated to deck, allocation count updates |
| UC-DECK-03 | Import from Moxfield | Auth user | Logged in | 1. Open import modal 2. Paste Moxfield URL 3. Confirm | Cards imported; existing cards allocated, missing cards added to wishlist |
| UC-DECK-04 | View deck completion | Auth user | Has deck with cards | 1. Open deck in collection view | See completion percentage, owned vs. wishlist breakdown |
| UC-DECK-05 | Manage card in multiple decks | Auth user | Has card in collection | 1. Click card 2. Open "Manage Decks" modal 3. Allocate to multiple decks | Allocation tracked, available quantity decreases |

---

### 3.5 Binders (FR-BIND)

**Description:** Organize cards into named binders (custom sets/collections).

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-BIND-01 | Users can create binders with name and description | Must |
| FR-BIND-02 | Users can add/remove collection cards to/from binders | Must |
| FR-BIND-03 | Binder stats auto-calculate: total cards, total price | Should |
| FR-BIND-04 | Binder allocations share the same allocation system as decks | Must |
| FR-BIND-05 | Users can delete binders | Must |

#### Use Cases

| UC ID | Use Case | Actor | Precondition | Steps | Expected Result |
|-------|----------|-------|--------------|-------|-----------------|
| UC-BIND-01 | Create a binder | Auth user | Logged in | 1. Click "New Binder" 2. Enter name/description 3. Save | Binder created in collection view |
| UC-BIND-02 | Add cards to binder | Auth user | Has binder + cards | 1. Select cards 2. Allocate to binder | Cards appear in binder, allocation tracked |

---

### 3.6 Trading Preferences (FR-PREF)

**Description:** Declare what cards users want to buy, sell, or trade. These preferences power the match discovery system.

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PREF-01 | Users can create preferences of type BUSCO (want), CAMBIO (trade), or VENDO (sell) | Must |
| FR-PREF-02 | Each preference stores card info, type, quantity, and condition | Must |
| FR-PREF-03 | Preferences sync to the public `public_preferences` index for match discovery | Must |
| FR-PREF-04 | Users can import preferences from Moxfield or text deck lists | Should |
| FR-PREF-05 | Users can edit and delete preferences | Must |

#### Use Cases

| UC ID | Use Case | Actor | Precondition | Steps | Expected Result |
|-------|----------|-------|--------------|-------|-----------------|
| UC-PREF-01 | Create a preference | Auth user | Logged in | 1. Click "New Preference" 2. Search card 3. Select type (BUSCO/CAMBIO/VENDO) 4. Set quantity, condition 5. Save | Preference created, synced to public index |
| UC-PREF-02 | Bulk import preferences | Auth user | Logged in | 1. Open import modal 2. Paste Moxfield URL or deck list 3. Confirm | Multiple preferences created at once |

---

### 3.7 Match Discovery (FR-MATCH)

**Description:** Automatically discover trading opportunities by cross-referencing users' public cards and preferences.

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-MATCH-01 | System calculates matches: "I have what you want" and "You have what I want" | Must |
| FR-MATCH-02 | Matches include compatibility score (0-100%) based on price alignment | Should |
| FR-MATCH-03 | Matches display in tabs: new, sent, saved, deleted | Must |
| FR-MATCH-04 | Matches auto-expire after 15 days | Must |
| FR-MATCH-05 | Users can save, delete, or recover matches | Must |
| FR-MATCH-06 | Users can block other users from appearing in matches | Should |
| FR-MATCH-07 | Match notification dropdown shows count of new matches | Should |
| FR-MATCH-08 | Users can export match data | Nice |
| FR-MATCH-09 | Bidirectional matches (both users have what the other wants) prioritized | Should |

#### Use Cases

| UC ID | Use Case | Actor | Precondition | Steps | Expected Result |
|-------|----------|-------|--------------|-------|-----------------|
| UC-MATCH-01 | Discover matches | Auth user | Has preferences + other users have public cards | 1. Navigate to `/saved-matches` 2. Click "Calculate Matches" | Matches appear organized by tabs |
| UC-MATCH-02 | Save a match | Auth user | Has matches | 1. View match detail 2. Click "Save" | Match moves to Saved tab |
| UC-MATCH-03 | Contact match user | Auth user | Has match | 1. View match 2. Click "Contact" or "Chat" | Chat opens with other user |
| UC-MATCH-04 | Block a user | Auth user | Has matches | 1. Open blocked users 2. Add username | User's cards excluded from future matches |

---

### 3.8 Express Interest (FR-INT)

**Description:** When browsing another user's public profile, express interest in their cards. This creates a shared match visible to both users.

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-INT-01 | Users can express interest in a card on another user's public profile | Must |
| FR-INT-02 | Interest creates a shared match record in `/shared_matches` | Must |
| FR-INT-03 | Duplicate interest on the same card+edition is prevented | Must |
| FR-INT-04 | Interest button is disabled on own profile | Must |
| FR-INT-05 | Shared matches expire after 15 days | Must |

#### Use Cases

| UC ID | Use Case | Actor | Precondition | Steps | Expected Result |
|-------|----------|-------|--------------|-------|-----------------|
| UC-INT-01 | Express interest in a card | Auth user | Viewing another user's profile | 1. Browse user's public cards 2. Click interest button on a card | Toast confirms interest sent, shared match created |
| UC-INT-02 | Attempt duplicate interest | Auth user | Already interested in card | 1. Click interest on same card again | Toast shows "already sent", no duplicate created |

---

### 3.9 Messaging (FR-MSG)

**Description:** Real-time direct messaging between users to coordinate trades.

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-MSG-01 | Users can send text messages to other users | Must |
| FR-MSG-02 | Conversations appear in a sortable list with last message preview | Must |
| FR-MSG-03 | Messages update in real-time via Firestore `onSnapshot` | Must |
| FR-MSG-04 | Unread message count shown per conversation | Should |
| FR-MSG-05 | Users can delete conversations | Should |
| FR-MSG-06 | Chat auto-scrolls to most recent message | Should |
| FR-MSG-07 | Chat can be initiated from matches, profiles, or contacts | Must |

#### Use Cases

| UC ID | Use Case | Actor | Precondition | Steps | Expected Result |
|-------|----------|-------|--------------|-------|-----------------|
| UC-MSG-01 | Send a message | Auth user | Has conversation or initiates from profile/match | 1. Open chat modal 2. Type message 3. Send | Message appears in real-time for both users |
| UC-MSG-02 | View all conversations | Auth user | Has messages | 1. Navigate to `/messages` | List of conversations with last message, sorted by recency |

---

### 3.10 User Profiles (FR-PROF)

**Description:** Public-facing user profiles showing username, location, avatar, and public card collection.

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-PROF-01 | Each user has a public profile at `/@username` | Must |
| FR-PROF-02 | Profile shows username, location, and avatar | Must |
| FR-PROF-03 | Profile displays public cards (sale/trade cards + explicitly public cards) | Must |
| FR-PROF-04 | Visitors can search, sort, group, and filter public cards | Should |
| FR-PROF-05 | Visitors can express interest in cards (see FR-INT) | Must |
| FR-PROF-06 | Visitors can initiate chat with the profile owner | Must |
| FR-PROF-07 | Own profile shows link to wishlist instead of contact button | Should |
| FR-PROF-08 | Suggestions dropdown is hidden when browsing another user's profile | Should |

#### Use Cases

| UC ID | Use Case | Actor | Precondition | Steps | Expected Result |
|-------|----------|-------|--------------|-------|-----------------|
| UC-PROF-01 | View another user's profile | Any user | None | 1. Navigate to `/@username` | See profile info, public cards |
| UC-PROF-02 | Filter public cards | Any user | On another user's profile | 1. Use search bar, sort, group, and advanced filters | Public cards filtered in real-time |
| UC-PROF-03 | Contact profile owner | Auth user | Viewing another user's profile | 1. Click "Contact" button | Chat modal opens |

---

### 3.11 Market Analysis (FR-MKT)

**Description:** Card market data including price movers (winners/losers) and format staples.

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-MKT-01 | Display price movers: biggest winners and losers | Must |
| FR-MKT-02 | Display format staples by category (overall/creatures/spells/lands) | Must |
| FR-MKT-03 | Filter by format: standard, modern, pioneer, legacy, vintage, pauper, commander | Must |
| FR-MKT-04 | Calculate portfolio impact: how price changes affect the user's collection | Should |
| FR-MKT-05 | Market data cached with 10min TTL | Should |
| FR-MKT-06 | Search movers by card name | Should |

#### Use Cases

| UC ID | Use Case | Actor | Precondition | Steps | Expected Result |
|-------|----------|-------|--------------|-------|-----------------|
| UC-MKT-01 | View price movers | Auth user | None | 1. Navigate to `/market` 2. View winners/losers tabs | See cards with biggest price changes |
| UC-MKT-02 | Check portfolio impact | Auth user | Has cards in collection | 1. View movers 2. See portfolio impact section | Cards in collection affected by price changes highlighted |
| UC-MKT-03 | Filter staples by format | Auth user | None | 1. Select format from dropdown | Staples update to show format-specific data |

---

### 3.12 Saved Contacts (FR-CONT)

**Description:** Save trader contacts for future reference and quick access to chat.

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-CONT-01 | Users can save other users as contacts | Must |
| FR-CONT-02 | Contacts display avatar, username, email, and location | Must |
| FR-CONT-03 | Users can initiate chat directly from contacts | Must |
| FR-CONT-04 | Users can delete saved contacts | Must |
| FR-CONT-05 | Contacts update in real-time via `onSnapshot` | Should |

#### Use Cases

| UC ID | Use Case | Actor | Precondition | Steps | Expected Result |
|-------|----------|-------|--------------|-------|-----------------|
| UC-CONT-01 | Save a contact | Auth user | Interacting with another user | 1. Save contact from match or profile | Contact appears in contacts list |
| UC-CONT-02 | Chat from contacts | Auth user | Has saved contacts | 1. Navigate to `/contacts` 2. Click chat icon | Chat modal opens with that contact |

---

### 3.13 Account Settings (FR-SET)

**Description:** Account management including password, username, location, language, and data export.

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SET-01 | Users can change their password | Must |
| FR-SET-02 | Users can change their username (with rate limiting via `lastUsernameChange`) | Should |
| FR-SET-03 | Users can update their location | Should |
| FR-SET-04 | Users can select language: Spanish, English, or Portuguese | Must |
| FR-SET-05 | Users can export their data (cards, decks, preferences) | Should |
| FR-SET-06 | Users can delete their account | Must |
| FR-SET-07 | Users can re-send email verification | Should |
| FR-SET-08 | Users can reset the guided tour | Nice |

#### Use Cases

| UC ID | Use Case | Actor | Precondition | Steps | Expected Result |
|-------|----------|-------|--------------|-------|-----------------|
| UC-SET-01 | Change password | Auth user | Logged in | 1. Navigate to `/settings` 2. Enter new password 3. Save | Password updated |
| UC-SET-02 | Change language | Auth user | Logged in | 1. Select language from dropdown | UI switches to selected language |
| UC-SET-03 | Delete account | Auth user | Logged in | 1. Click "Delete Account" 2. Confirm | Account and all data deleted |

---

### 3.14 Internationalization (FR-I18N)

**Description:** Multi-language support for the entire application.

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-I18N-01 | Support Spanish (es), English (en), and Portuguese (pt) | Must |
| FR-I18N-02 | All user-facing strings use translation keys via `t()` composable | Must |
| FR-I18N-03 | Translation supports nested paths and parameter interpolation | Must |
| FR-I18N-04 | Language preference persists across sessions | Should |

---

### 3.15 Onboarding & Help (FR-HELP)

**Description:** Guided tour for new users and contextual help system.

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-HELP-01 | New authenticated users see a welcome modal | Should |
| FR-HELP-02 | Guided tour walks users through key features | Should |
| FR-HELP-03 | Tour completion tracked per user via localStorage | Should |
| FR-HELP-04 | Help carousel accessible from header menu | Should |
| FR-HELP-05 | FAQ page with expandable questions | Should |

---

### 3.16 Global Search (FR-GSRCH)

**Description:** Application-wide search across collection, users, and Scryfall.

#### Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-GSRCH-01 | Global search accessible from header | Must |
| FR-GSRCH-02 | Three search tabs: Collection, Users, Scryfall | Must |
| FR-GSRCH-03 | Debounced search to avoid excessive API calls | Must |
| FR-GSRCH-04 | Collection tab searches user's own cards | Must |
| FR-GSRCH-05 | Users tab finds other traders by username | Must |
| FR-GSRCH-06 | Scryfall tab searches the full MTG card database | Must |

---

## 4. Data Models

### 4.1 Card

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| scryfallId | string | Scryfall API ID |
| name | string | Card name |
| edition | string | Set name |
| setCode | string? | Set code for price lookups |
| quantity | number | Copies owned |
| condition | CardCondition | M / NM / LP / MP / HP / PO |
| foil | boolean | Foil flag |
| language | string? | Card language |
| price | number | USD price |
| image | string | Card image URL |
| status | CardStatus | collection / sale / trade / wishlist |
| public | boolean? | Visible on public profile |
| cmc | number? | Converted mana cost |
| type_line | string? | Type (e.g., "Creature - Human Wizard") |
| colors | string[]? | Colors (W/U/B/R/G) |
| rarity | string? | common / uncommon / rare / mythic |
| power | string? | Creature power |
| toughness | string? | Creature toughness |
| oracle_text | string? | Rules text |
| keywords | string[]? | Keyword abilities |
| legalities | Record? | Format legality map |
| full_art | boolean? | Full art flag |
| produced_mana | string[]? | Mana colors produced (lands) |
| card_faces | object[]? | Dual-faced card data |
| createdAt | Date? | Creation timestamp |
| updatedAt | Date | Last update timestamp |

### 4.2 Deck

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| userId | string | Owner's user ID |
| name | string | Deck name |
| format | DeckFormat | vintage / modern / commander / standard / custom |
| description | string | Deck description |
| colors | string[] | Deck color identity |
| commander | string? | Commander name (commander format) |
| allocations | DeckCardAllocation[] | Card references from collection |
| wishlist | DeckWishlistItem[] | Cards not yet owned |
| thumbnail | string | Deck thumbnail image |
| stats | DeckStats | Auto-calculated stats |
| isPublic | boolean | Public visibility |
| createdAt | Date | Creation timestamp |
| updatedAt | Date | Last update timestamp |

### 4.3 Preference

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| scryfallId | string | Scryfall card ID |
| name | string | Card name |
| type | PreferenceType | BUSCO / CAMBIO / VENDO |
| quantity | number | Desired quantity |
| condition | CardCondition | Desired condition |
| edition | string | Set name |
| image | string | Card image URL |
| createdAt | Date | Creation timestamp |

### 4.4 User

| Field | Type | Description |
|-------|------|-------------|
| id | string | Firebase UID |
| email | string | Email address |
| username | string | Display username |
| location | string | User location |
| avatarUrl | string? | Custom avatar URL |
| lastUsernameChange | Date? | Rate limit for username changes |
| createdAt | Date | Registration timestamp |

### 4.5 Conversation & Message

| Field | Type | Description |
|-------|------|-------------|
| Conversation.id | string | Sorted participant IDs |
| Conversation.participantIds | string[] | Both user IDs |
| Conversation.participantNames | Record | userId -> username map |
| Conversation.lastMessage | Message? | Most recent message |
| Conversation.unreadCount | number | Unread count |
| Message.id | string | Unique identifier |
| Message.senderId | string | Sender user ID |
| Message.content | string | Message text |
| Message.createdAt | Date | Sent timestamp |
| Message.read | boolean | Read flag |

### 4.6 Binder

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| name | string | Binder name |
| description | string | Binder description |
| allocations | BinderAllocation[] | Card references |
| stats | BinderStats | totalCards, totalPrice |
| isPublic | boolean | Public visibility |
| forSale | boolean | Binder for sale flag |

### 4.7 Contact

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier |
| userId | string | Contact's user ID |
| username | string | Contact's username |
| email | string | Contact's email |
| location | string | Contact's location |
| avatarUrl | string? | Contact's avatar |
| savedAt | Date | When saved |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| ID | Requirement |
|----|-------------|
| NFR-PERF-01 | Scryfall API calls rate-limited to 200ms between requests |
| NFR-PERF-02 | Search suggestions debounced to avoid excessive API calls |
| NFR-PERF-03 | Market data cached with 10min TTL |
| NFR-PERF-04 | Scryfall suggestions cached with 5-10min TTL |
| NFR-PERF-05 | Price data stored in IndexedDB (too large for localStorage) |
| NFR-PERF-06 | Card allocation index built once on deck/binder change, O(1) lookups after |
| NFR-PERF-07 | Fire-and-forget pattern for price snapshots and public card syncs |

### 5.2 Security

| ID | Requirement |
|----|-------------|
| NFR-SEC-01 | Firebase Auth handles authentication; no custom credential storage |
| NFR-SEC-02 | Firestore security rules enforce per-user data isolation |
| NFR-SEC-03 | Cloud Functions used for cross-user writes (match notifications) |
| NFR-SEC-04 | Moxfield API proxied via Cloudflare Worker to avoid CORS issues |
| NFR-SEC-05 | Environment variables store all Firebase config (not committed) |

### 5.3 Usability

| ID | Requirement |
|----|-------------|
| NFR-UX-01 | Edit modals use `closeOnClickOutside=false` to prevent accidental closure |
| NFR-UX-02 | Toast notifications auto-dismiss after 4 seconds |
| NFR-UX-03 | Confirmation dialogs for all destructive actions |
| NFR-UX-04 | Guided tour for new users |
| NFR-UX-05 | Three-language support (ES/EN/PT) |
| NFR-UX-06 | Responsive design (mobile-friendly with FAB for card addition) |

### 5.4 Reliability

| ID | Requirement |
|----|-------------|
| NFR-REL-01 | Batch operations use retry logic for transient Firestore errors |
| NFR-REL-02 | Scryfall 429 responses handled with exponential backoff |
| NFR-REL-03 | Real-time listeners (onSnapshot) reconnect automatically |
| NFR-REL-04 | Daily price snapshot writes gated (max 1/day via localStorage flag) |

---

## 6. Test Plan

> **Current Status:** No automated test framework is configured. All test cases below are designed for **manual verification** and serve as the specification for future automated testing.

### 6.1 Test Coverage Summary

| Feature Area | Use Cases | Manual Test Cases | Automated Tests |
|-------------|-----------|------------------|-----------------|
| Authentication | 5 | 12 | 0 |
| Collection Management | 7 | 18 | 0 |
| Search & Filtering | 6 | 15 | 0 |
| Deck Building | 5 | 13 | 0 |
| Binders | 2 | 5 | 0 |
| Trading Preferences | 2 | 6 | 0 |
| Match Discovery | 4 | 10 | 0 |
| Express Interest | 2 | 5 | 0 |
| Messaging | 2 | 7 | 0 |
| User Profiles | 3 | 8 | 0 |
| Market Analysis | 3 | 7 | 0 |
| Saved Contacts | 2 | 5 | 0 |
| Account Settings | 3 | 8 | 0 |
| **TOTAL** | **46** | **119** | **0** |

### 6.2 Manual Test Cases

#### TC-AUTH: Authentication

| TC ID | Test Case | Steps | Expected Result | Covers |
|-------|-----------|-------|-----------------|--------|
| TC-AUTH-01 | Register with valid data | 1. Go to `/register` 2. Enter valid email, password (6+ chars), username, location 3. Submit | Account created, verification email sent, redirected | UC-AUTH-01 |
| TC-AUTH-02 | Register with duplicate email | 1. Register with an already-used email | Error toast: email already in use | UC-AUTH-01 |
| TC-AUTH-03 | Register with duplicate username | 1. Register with an already-used username | Error toast: username taken | UC-AUTH-01 |
| TC-AUTH-04 | Login with valid credentials | 1. Go to `/login` 2. Enter valid email/password 3. Submit | Authenticated, redirected to `/saved-matches` | UC-AUTH-02 |
| TC-AUTH-05 | Login with wrong password | 1. Enter valid email, wrong password | Error toast: invalid credentials | UC-AUTH-02 |
| TC-AUTH-06 | Login with Google | 1. Click Google button 2. Complete OAuth flow | Authenticated, redirected | UC-AUTH-03 |
| TC-AUTH-07 | Forgot password request | 1. Go to `/forgot-password` 2. Enter email 3. Submit | Success message, reset email sent | UC-AUTH-04 |
| TC-AUTH-08 | Reset password via link | 1. Click link in email 2. Enter new password 3. Submit | Password changed, can login with new password | UC-AUTH-04 |
| TC-AUTH-09 | Access `/collection` while logged out | 1. Clear session 2. Navigate to `/collection` | Redirected to `/login` | UC-AUTH-05 |
| TC-AUTH-10 | Access `/login` while logged in | 1. Log in 2. Navigate to `/login` | Redirected to `/saved-matches` | FR-AUTH-08 |
| TC-AUTH-11 | Session persists on reload | 1. Log in 2. Refresh page | Still authenticated | FR-AUTH-07 |
| TC-AUTH-12 | Logout | 1. Click user avatar 2. Click logout | Session cleared, redirected to `/login` | FR-AUTH-02 |

#### TC-COL: Collection Management

| TC ID | Test Case | Steps | Expected Result | Covers |
|-------|-----------|-------|-----------------|--------|
| TC-COL-01 | Add card via search | 1. Click "+" 2. Search "Lightning Bolt" 3. Select card 4. Set qty=2, NM, non-foil 5. Save | Card appears in grid with qty 2 | UC-COL-01 |
| TC-COL-02 | Add card with foil + condition | 1. Add card 2. Set foil=true, condition=LP | Card shows foil indicator and LP condition | UC-COL-01 |
| TC-COL-03 | Edit card quantity | 1. Click card 2. Change qty to 4 3. Save | Quantity updated to 4 | UC-COL-02 |
| TC-COL-04 | Edit card condition | 1. Click card 2. Change condition to MP 3. Save | Condition updated | UC-COL-02 |
| TC-COL-05 | Delete single card | 1. Click delete on card 2. Confirm | Card removed from grid | UC-COL-03 |
| TC-COL-06 | Bulk select and delete | 1. Enable selection mode 2. Select 3 cards 3. Bulk delete 4. Confirm | All 3 cards removed | UC-COL-04 |
| TC-COL-07 | Bulk edit status | 1. Select cards 2. Bulk edit -> status: sale | Selected cards now status "sale" | FR-COL-07 |
| TC-COL-08 | Change status to sale | 1. Click card 2. Change status to "sale" 3. Save | Status = sale, card visible on public profile | UC-COL-05 |
| TC-COL-09 | Change status to trade | 1. Set status to "trade" | Status = trade, public by default | UC-COL-05 |
| TC-COL-10 | Toggle public visibility | 1. Click card 2. Toggle public off for a sale card 3. Save | Card no longer shown on public profile | FR-COL-09 |
| TC-COL-11 | View in stack mode | 1. Switch to stack view | Cards grouped by name, variants expandable | FR-COL-10 |
| TC-COL-12 | View in text mode | 1. Switch to text view | Cards displayed in compact text list | FR-COL-10 |
| TC-COL-13 | Split card face toggle | 1. Add a dual-faced card (e.g., "Delver of Secrets") 2. Click toggle button | Image flips to other face | UC-COL-06 |
| TC-COL-14 | Collection totals panel | 1. Open totals panel | Shows total value by source (TCG, CK) | UC-COL-07 |
| TC-COL-15 | Add card with status wishlist | 1. Add card 2. Set status "wishlist" | Card appears with wishlist status | FR-COL-03 |
| TC-COL-16 | Card price auto-populates | 1. Add a card with known price | Price field auto-filled from Scryfall | FR-COL-02 |
| TC-COL-17 | Add card to collection status | 1. Add card with "collection" status | Card is not public by default | FR-COL-08 |
| TC-COL-18 | Prevent empty collection state | 1. Delete all cards | Empty state message displayed | — |

#### TC-SRCH: Search & Filtering

| TC ID | Test Case | Steps | Expected Result | Covers |
|-------|-----------|-------|-----------------|--------|
| TC-SRCH-01 | Search by card name | 1. Type "bolt" in filter bar | Only cards with "bolt" in name shown | UC-SRCH-01 |
| TC-SRCH-02 | Search by edition | 1. Type "modern horizons" | Cards from that set shown | UC-SRCH-01 |
| TC-SRCH-03 | Sort by price descending | 1. Select sort: price | Most expensive cards first | UC-SRCH-02 |
| TC-SRCH-04 | Sort by name A-Z | 1. Select sort: name | Cards alphabetically ordered | UC-SRCH-02 |
| TC-SRCH-05 | Sort by recent | 1. Select sort: recent | Most recently added cards first | UC-SRCH-02 |
| TC-SRCH-06 | Group by type | 1. Select group: type | Sections: Creatures, Instants, etc. with headers | UC-SRCH-03 |
| TC-SRCH-07 | Group by mana | 1. Select group: mana | Sections: 0, 1, 2, ... 10+, Lands | UC-SRCH-03 |
| TC-SRCH-08 | Group by color | 1. Select group: color | Sections: White, Blue, Black, Red, Green, Multi, Colorless | UC-SRCH-03 |
| TC-SRCH-09 | Advanced filter: price range | 1. Open filters 2. Set $1-$10 3. Apply | Only cards in price range shown | UC-SRCH-04 |
| TC-SRCH-10 | Advanced filter: foil only | 1. Open filters 2. Toggle foil 3. Apply | Only foil cards shown | UC-SRCH-04 |
| TC-SRCH-11 | Advanced filter: by set | 1. Open filters 2. Select a set 3. Apply | Only cards from selected set | UC-SRCH-04 |
| TC-SRCH-12 | Advanced filter: format legal | 1. Open filters 2. Select "standard" 3. Apply | Only standard-legal cards | UC-SRCH-04 |
| TC-SRCH-13 | Filter count badge | 1. Apply 2 advanced filters | Badge shows "2" on filter button | FR-SRCH-08 |
| TC-SRCH-14 | Reset all filters | 1. Apply filters 2. Click reset in modal | All filters cleared, all cards shown | FR-SRCH-04 |
| TC-SRCH-15 | Scryfall search | 1. Go to `/search` 2. Search "Black Lotus" | Scryfall results with prices and "add" button | UC-SRCH-05 |

#### TC-DECK: Deck Building

| TC ID | Test Case | Steps | Expected Result | Covers |
|-------|-----------|-------|-----------------|--------|
| TC-DECK-01 | Create empty deck | 1. Click "New Deck" 2. Enter name "My Modern Deck", format "modern" 3. Save | Deck appears in deck list | UC-DECK-01 |
| TC-DECK-02 | Create deck with pasted list | 1. Create deck 2. Paste deck list in text area | Cards auto-imported to mainboard | UC-DECK-01 |
| TC-DECK-03 | Add card to mainboard | 1. Open deck 2. Add card from collection to mainboard | Card appears in mainboard section | UC-DECK-02 |
| TC-DECK-04 | Add card to sideboard | 1. Open deck 2. Add card to sideboard | Card in sideboard section | UC-DECK-02 |
| TC-DECK-05 | Add wishlist card | 1. Add card not in collection to deck | Appears as wishlist item, completion % decreases | UC-DECK-02 |
| TC-DECK-06 | Deck stats update | 1. Add/remove cards from deck | Total cards, price, completion % update | FR-DECK-04 |
| TC-DECK-07 | Import from Moxfield | 1. Open import 2. Paste Moxfield URL 3. Confirm | Deck populated with cards from Moxfield | UC-DECK-03 |
| TC-DECK-08 | Over-allocation prevented | 1. Own 2 copies 2. Allocate 2 to Deck A 3. Try allocate 1 to Deck B | Error: insufficient available quantity | FR-DECK-08 |
| TC-DECK-09 | Delete deck | 1. Delete a deck 2. Confirm | Deck removed, card allocations freed | FR-DECK-10 |
| TC-DECK-10 | Commander designation | 1. Create commander deck 2. Designate a creature as commander | Commander card shown with indicator | FR-DECK-09 |
| TC-DECK-11 | Deck editor grouping | 1. Open deck 2. Group by type | Cards grouped in editor by type categories | FR-DECK-05 |
| TC-DECK-12 | Manage card in multiple decks | 1. Own 4 copies 2. Allocate 2 to Deck A, 2 to Deck B | Allocation tracked correctly | UC-DECK-05 |
| TC-DECK-13 | Deck completion percentage | 1. Deck needs 60 cards 2. Own 45 | Completion shows 75% | UC-DECK-04 |

#### TC-BIND: Binders

| TC ID | Test Case | Steps | Expected Result | Covers |
|-------|-----------|-------|-----------------|--------|
| TC-BIND-01 | Create binder | 1. Click "New Binder" 2. Name: "Rare Collection" 3. Save | Binder appears in list | UC-BIND-01 |
| TC-BIND-02 | Add cards to binder | 1. Select cards 2. Allocate to binder | Cards shown in binder | UC-BIND-02 |
| TC-BIND-03 | Binder stats update | 1. Add cards with prices | Total cards and total price update | FR-BIND-03 |
| TC-BIND-04 | Delete binder | 1. Delete binder 2. Confirm | Binder removed, allocations freed | FR-BIND-05 |
| TC-BIND-05 | Binder shares allocation with decks | 1. Allocate 2 of 2 copies to binder 2. Try allocate to deck | Insufficient available quantity | FR-BIND-04 |

#### TC-PREF: Trading Preferences

| TC ID | Test Case | Steps | Expected Result | Covers |
|-------|-----------|-------|-----------------|--------|
| TC-PREF-01 | Create BUSCO preference | 1. New preference 2. Search card 3. Type: BUSCO 4. Save | Preference created, synced to public index | UC-PREF-01 |
| TC-PREF-02 | Create VENDO preference | 1. Same steps, type: VENDO | Preference created as sell listing | UC-PREF-01 |
| TC-PREF-03 | Edit preference quantity | 1. Edit preference 2. Change qty 3. Save | Quantity updated | FR-PREF-05 |
| TC-PREF-04 | Delete preference | 1. Delete preference 2. Confirm | Preference removed from list and public index | FR-PREF-05 |
| TC-PREF-05 | Import from Moxfield | 1. Open import 2. Paste Moxfield URL | Preferences bulk created | UC-PREF-02 |
| TC-PREF-06 | Public sync | 1. Create preference | Verify document exists in `public_preferences` | FR-PREF-03 |

#### TC-MATCH: Match Discovery

| TC ID | Test Case | Steps | Expected Result | Covers |
|-------|-----------|-------|-----------------|--------|
| TC-MATCH-01 | Calculate matches | 1. Have preferences 2. Other user has matching public cards 3. Click "Calculate" | Matches appear in "New" tab | UC-MATCH-01 |
| TC-MATCH-02 | Save a match | 1. View match 2. Click "Save" | Match moves to "Saved" tab | UC-MATCH-02 |
| TC-MATCH-03 | Delete a match | 1. View match 2. Click "Delete" | Match moves to "Deleted" tab | FR-MATCH-05 |
| TC-MATCH-04 | Recover deleted match | 1. Go to "Deleted" tab 2. Click "Recover" | Match returns to previous tab | FR-MATCH-05 |
| TC-MATCH-05 | Contact from match | 1. View match 2. Click "Chat" | Chat opens with match user | UC-MATCH-03 |
| TC-MATCH-06 | Block user | 1. Open blocked users 2. Add username 3. Recalculate | Blocked user's cards excluded | UC-MATCH-04 |
| TC-MATCH-07 | Match expiration | 1. Create match 2. Wait 15+ days | Match no longer active | FR-MATCH-04 |
| TC-MATCH-08 | Bidirectional match priority | 1. Both users want what the other has | Match shows compatibility score | FR-MATCH-09 |
| TC-MATCH-09 | Match compatibility score | 1. View match with price data | Score displayed (0-100%) | FR-MATCH-02 |
| TC-MATCH-10 | Match notifications badge | 1. Receive new match | Badge count increments in header | FR-MATCH-07 |

#### TC-INT: Express Interest

| TC ID | Test Case | Steps | Expected Result | Covers |
|-------|-----------|-------|-----------------|--------|
| TC-INT-01 | Express interest in card | 1. Visit `/@otheruser` 2. Click interest on a sale card | Toast: "Interest sent", shared match created | UC-INT-01 |
| TC-INT-02 | Duplicate interest blocked | 1. Click interest on same card again | Toast: info message, no duplicate | UC-INT-02 |
| TC-INT-03 | Interest on own profile hidden | 1. Visit own profile | No interest buttons visible | FR-INT-04 |
| TC-INT-04 | Interest only for auth users | 1. Visit profile while logged out | No interest buttons visible | FR-INT-01 |
| TC-INT-05 | Shared match data correct | 1. Express interest 2. Check Firestore | `shared_matches` doc has correct sender/receiver/card/expiry | FR-INT-02 |

#### TC-MSG: Messaging

| TC ID | Test Case | Steps | Expected Result | Covers |
|-------|-----------|-------|-----------------|--------|
| TC-MSG-01 | Send message | 1. Open chat 2. Type message 3. Send | Message appears instantly for both users | UC-MSG-01 |
| TC-MSG-02 | Real-time receive | 1. Open chat in two browser sessions 2. Send from one | Message appears in other session immediately | FR-MSG-03 |
| TC-MSG-03 | Conversation list | 1. Go to `/messages` | All conversations listed with last message | UC-MSG-02 |
| TC-MSG-04 | Unread count | 1. Receive message 2. Don't open chat | Conversation shows unread badge | FR-MSG-04 |
| TC-MSG-05 | Chat from profile | 1. Visit `/@user` 2. Click "Contact" | Chat modal opens | FR-MSG-07 |
| TC-MSG-06 | Chat from match | 1. View match 2. Click "Chat" | Chat modal opens with match user | FR-MSG-07 |
| TC-MSG-07 | Auto-scroll | 1. Open chat with many messages | Scrolls to most recent | FR-MSG-06 |

#### TC-PROF: User Profiles

| TC ID | Test Case | Steps | Expected Result | Covers |
|-------|-----------|-------|-----------------|--------|
| TC-PROF-01 | View public profile | 1. Navigate to `/@existinguser` | See username, location, avatar, public cards | UC-PROF-01 |
| TC-PROF-02 | User not found | 1. Navigate to `/@nonexistent` | "User not found" error state | — |
| TC-PROF-03 | Search public cards | 1. Type in search bar on profile | Cards filter by name/edition | UC-PROF-02 |
| TC-PROF-04 | Sort public cards | 1. Change sort dropdown | Cards reorder | UC-PROF-02 |
| TC-PROF-05 | Group public cards | 1. Select group by type | Cards grouped with headers | UC-PROF-02 |
| TC-PROF-06 | Advanced filters on profile | 1. Click filter icon 2. Apply filters | Cards filtered by advanced criteria | UC-PROF-02 |
| TC-PROF-07 | No suggestions dropdown | 1. Type in search bar on other user's profile | No local/Scryfall suggestion dropdown | FR-PROF-08 |
| TC-PROF-08 | Own profile shows wishlist link | 1. Visit own profile | "View Wishlist" button instead of "Contact" | FR-PROF-07 |

#### TC-MKT: Market Analysis

| TC ID | Test Case | Steps | Expected Result | Covers |
|-------|-----------|-------|-----------------|--------|
| TC-MKT-01 | View winners | 1. Go to `/market` 2. Select "Winners" | Cards with biggest price increases | UC-MKT-01 |
| TC-MKT-02 | View losers | 1. Select "Losers" | Cards with biggest price decreases | UC-MKT-01 |
| TC-MKT-03 | Filter by format | 1. Select "Modern" from format dropdown | Staples filtered to Modern format | UC-MKT-03 |
| TC-MKT-04 | View staples categories | 1. Switch between overall/creatures/spells/lands | Category-specific staples shown | FR-MKT-02 |
| TC-MKT-05 | Portfolio impact | 1. View movers with cards in collection | Impact column shows $ change for owned cards | UC-MKT-02 |
| TC-MKT-06 | Search movers | 1. Type card name in search | Movers filtered by name | FR-MKT-06 |
| TC-MKT-07 | Cache behavior | 1. Load market 2. Navigate away 3. Return within 10min | Data loads from cache (no spinner) | FR-MKT-05 |

#### TC-CONT: Saved Contacts

| TC ID | Test Case | Steps | Expected Result | Covers |
|-------|-----------|-------|-----------------|--------|
| TC-CONT-01 | Save contact from match | 1. View match 2. Save contact | Contact appears in `/contacts` | UC-CONT-01 |
| TC-CONT-02 | Chat from contact | 1. Go to `/contacts` 2. Click chat icon | Chat modal opens | UC-CONT-02 |
| TC-CONT-03 | Delete contact | 1. Click delete on contact 2. Confirm | Contact removed | FR-CONT-04 |
| TC-CONT-04 | Contact info displayed | 1. View contacts list | Avatar, username, email, location shown | FR-CONT-02 |
| TC-CONT-05 | Empty state | 1. Delete all contacts | Empty state message shown | — |

#### TC-SET: Account Settings

| TC ID | Test Case | Steps | Expected Result | Covers |
|-------|-----------|-------|-----------------|--------|
| TC-SET-01 | Change password | 1. Go to `/settings` 2. Enter new password 3. Save | Password updated successfully | UC-SET-01 |
| TC-SET-02 | Change username | 1. Enter new username 2. Save | Username updated if not rate-limited | FR-SET-02 |
| TC-SET-03 | Update location | 1. Enter new location 2. Save | Location updated | FR-SET-03 |
| TC-SET-04 | Change language to English | 1. Select "English" | UI switches to English | UC-SET-02 |
| TC-SET-05 | Change language to Portuguese | 1. Select "Português" | UI switches to Portuguese | UC-SET-02 |
| TC-SET-06 | Export data | 1. Click export | Data file downloaded | FR-SET-05 |
| TC-SET-07 | Delete account | 1. Click delete 2. Confirm | Account and all data deleted | UC-SET-03 |
| TC-SET-08 | Resend verification email | 1. Click "Resend verification" | Email sent | FR-SET-07 |

### 6.3 Recommended Test Automation Strategy

When a test framework is introduced, prioritize automation in this order:

| Priority | Area | Approach | Rationale |
|----------|------|----------|-----------|
| 1 | **Composables** (`useCardFilter`, `useCardAllocation`, `useCollectionTotals`) | Unit tests (Vitest) | Pure logic, no DOM, high reuse — highest ROI |
| 2 | **Services** (`scryfall`, `moxfield`, `publicCards`, `market`) | Unit tests with mocked HTTP | API integration logic, error handling, caching |
| 3 | **Stores** (`collection`, `decks`, `matches`, `messages`) | Unit tests with mocked Firestore | State mutations and business logic |
| 4 | **Utility functions** (`cardHelpers`, `avatar`, `filterKeywords`) | Unit tests | Pure functions, easy to test |
| 5 | **Components** (modals, grids, filter bar) | Component tests (Vue Test Utils) | UI interactions and prop handling |
| 6 | **E2E flows** (auth, add card, match discovery) | E2E tests (Playwright/Cypress) | Critical user paths end-to-end |

---

## 7. Glossary

| Term | Definition |
|------|-----------|
| **Allocation** | A reference linking a collection card to a deck or binder (quantity-tracked) |
| **BUSCO** | Preference type meaning "I want to buy this card" |
| **CAMBIO** | Preference type meaning "I want to trade this card" |
| **CMC** | Converted Mana Cost (now called Mana Value) — total mana to cast a card |
| **Condition** | Card physical condition: M (Mint), NM (Near Mint), LP (Lightly Played), MP (Moderately Played), HP (Heavily Played), PO (Poor) |
| **Denormalization** | Storing duplicate data (e.g., `public_cards`) for faster queries |
| **Dual-faced / Split card** | MTG card with two faces (e.g., transform cards) stored with `card_faces` array |
| **Fire-and-forget** | Async operation that runs without awaiting its result |
| **Hydrated** | A deck card reference enriched with full card data from the collection for display |
| **Match** | A discovered trading opportunity between two users based on their cards and preferences |
| **Moxfield** | Popular external deck-building tool from which decks can be imported |
| **oobCode** | Firebase "out-of-band" code sent via email for password reset verification |
| **Public card** | A card visible on a user's public profile (sale/trade default to public) |
| **Scryfall** | The MTG card database API used for card search, images, and metadata |
| **Shared match** | An interest expression stored in `/shared_matches`, visible to both sender and receiver |
| **Staple** | A card commonly played in a particular format |
| **VENDO** | Preference type meaning "I am selling this card" |
| **Wishlist (deck)** | Cards needed for a deck that the user doesn't own yet |
| **Wishlist (status)** | Collection status for cards the user wants to acquire |