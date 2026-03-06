# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cranial Trading is a Magic: The Gathering trading platform built with Vue 3 (Composition API), TypeScript, Vite, and Firebase. Users can manage card collections, create decks, find trading matches, and message other traders.

## Development Commands

```bash
npm run dev         # Start Vite dev server with hot reload
npm run build       # Build production bundle
npm run preview     # Preview production build locally
npm run type-check  # Verify TypeScript types
```

## Testing

```bash
npm run test:unit          # Run unit tests (fast, no Firebase)
npm run test:unit:watch    # Watch mode for TDD
npm run test:unit:coverage # Unit tests with coverage report
npm run test:integration   # Integration tests (requires .env.local)
npm run e2e                # Playwright E2E tests
```

### Test Conventions
- Unit tests in `tests/unit/`, integration in `tests/integration/`, E2E in `e2e/`
- Use Vitest globals (describe/it/expect) — do not import them
- Use test fixtures from `tests/unit/helpers/fixtures.ts`
- Never import real Firebase in unit tests — mock it
- New pure functions should be TDD'd: write failing test first
- Run `npm run test:unit` before committing

## Architecture

### Tech Stack
- **Frontend:** Vue 3 + TypeScript + Vite
- **Styling:** Tailwind CSS with custom theme (black bg, silver text, neon accents)
- **State:** Pinia stores
- **Backend:** Firebase (Auth, Firestore)
- **External APIs:** Scryfall (card data), Moxfield (deck importing)

### Source Structure
```
src/
├── components/     # Feature-organized Vue components
│   ├── ui/        # Base components (Button, Input, Modal, Toast)
│   └── [feature]/ # chat, collection, decks, matches, etc.
├── views/         # Route page components
├── stores/        # Pinia state (auth, collection, decks, matches, messages, etc.)
├── services/      # External API clients (firebase, scryfall, moxfield)
├── types/         # TypeScript interfaces (card, deck, match, user)
└── utils/         # Utility functions
```

### Firestore Structure
```
/users/{userId}/
  ├── cards/{cardId}
  ├── decks/{deckId}
  ├── preferences/{prefId}
  ├── savedMatches/{matchId}
  └── savedContacts/{contactId}
```

### Key Patterns
- Vue 3 Composition API with `<script setup>`
- Pinia composable-style stores
- Services layer abstracts external API calls
- Feature-based component organization
- Firebase SDK v9 modular imports

## Core Data Types

- **Card:** scryfallId, name, edition, quantity, condition (M/NM/LP/MP/HP/PO), foil, price, status (collection|sale|trade|wishlist)
- **Deck:** name, format (vintage|modern|commander|standard|custom), mainboard/sideboard DeckCard arrays, auto-calculated stats
- **Match:** type (VENDO|BUSCO), myCard/otherCard pairing, status (nuevo|visto|activo|eliminado)

## Environment Variables

Required in `.env.local`:
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
```

## Styling Theme

Tailwind custom palette:
- `primary`: #000000 (black)
- `silver`: #EEEEEE (text)
- `neon`: #CCFF00 (accents)
- `rust`: #8B2E1F (errors)

Font: IBM Plex Mono (monospace throughout)

## Implementation Rules

### Split Cards (Dual-Faced MTG Cards)
MTG has cards with 2 faces. Detection and handling:
```ts
const isSplitCard = (card) => card.card_faces && card.card_faces.length > 1
```
- Store in Firestore as JSON with `card_faces` array containing `image_uris` and `name` for each side
- Use toggle button (↔️) to switch between faces
- `CardGridSearch.vue` uses `.small` images, `CollectionGrid.vue` uses `.normal` images
- Maintain `cardFaceIndex` ref to track which face is displayed per card

### Modal Behavior
- `AddCardModal`, `EditCardModal`, `CardStatusModal`: Always use `closeOnClickOutside="false"`
- Prevents accidental closure during editing - only close via CANCEL/SAVE buttons

### Status Name Conventions
Internal status values (use these in code):
- `collection` (not "colección")
- `sale` (not "venta")
- `trade` (not "cambio")
- `wishlist` (not "deseado")

For UI display, use `getStatusLabel()` in `CollectionView.vue` to translate.

### Price Filter Logic (CardGridSearch)
- If results contain cards with `prices.usd > 0`: show ONLY priced cards
- If NO cards have prices: show all results (including N/A)
- Prevents spam of unpriced results

### Toast Notifications
```ts
toastStore.showToast(message, type)  // type: 'success' | 'error' | 'info'
```
Auto-dismiss after 4 seconds.

## Files Often Modified Together
- `CollectionView.vue` ↔ `CollectionGrid.vue`
- `AddCardModal.vue` ↔ `EditCardModal.vue`
- `CardGridSearch.vue` ↔ Scryfall service + AddCardModal