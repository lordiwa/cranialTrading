# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cranial Trading is a Magic: The Gathering trading platform built with Vue 3 (Composition API), TypeScript, Vite, and Firebase. Users can manage card collections, create decks, find trading matches, and message other traders.

## MANDATORY: TDD Development Workflow

**Every feature, fix, change, or refactor MUST follow this process. No exceptions.**

### 1. Plan
- Understand the request and identify affected files
- Break down the work into testable units (pure functions, store logic, component behavior)
- Identify which test types are needed (unit, integration, E2E)
- Present the plan to the user before writing any code

### 2. Write Tests First (RED)
- Write failing unit tests for all new/changed business logic BEFORE implementation
- For bug fixes: write a regression test that reproduces the bug first
- For pure functions and store logic: unit tests in `tests/unit/`
- For Firebase operations: integration tests in `tests/integration/`
- Run `npm run test:unit` to confirm tests fail (RED phase)

### 3. Implement (GREEN)
- Write the minimum code to make all tests pass
- Run `npm run test:unit` after each meaningful change
- Do not move on until all tests are green

### 4. Refactor
- Clean up the implementation while keeping tests green
- Extract helpers, improve naming, simplify logic
- Run `npm run test:unit` to confirm nothing broke

### 5. QA Against Plan
- Review the original plan and verify every requirement is met
- Run `npm run test:unit:coverage` to check coverage on changed files
- Changed business logic files should have 85%+ coverage
- Run `npx vite build` to verify the build still succeeds

### 6. Done
- All tests pass, coverage is adequate, build succeeds
- Summarize what was done and what was tested

### When to Skip TDD
- Pure UI/styling changes with no logic (CSS, template-only edits)
- Config file changes (tailwind, vite, eslint)
- Documentation-only changes

### Quick Reference
| Change type | Test first? | Test type |
|-------------|------------|-----------|
| New pure function | Always | Unit |
| Bug fix | Always (regression test) | Unit |
| Store algorithm | Always | Unit |
| Firebase CRUD | Yes | Integration |
| New Vue component | No | E2E only |
| Refactor | Write characterization tests first | Unit |
| UI/styling only | No | None |

---

## MANDATORY: Branching, Versioning & Deployment

**Every change MUST follow this process. No exceptions.**

### 1. Dev-First Development (MANDATORY)

**All work MUST happen on `develop` branch and be verified on the dev environment before production. No exceptions.**

- **Always check you are on `develop`** before starting any work. If on `main`, switch to `develop` first.
- All features, fixes, refactors, and config changes go to `develop` first
- **Never commit directly to `main`** — `main` only receives merges from `develop`
- Feature branches (optional): branch off `develop`, PR back into `develop`
- After pushing to `develop`, CI auto-deploys to `cranial-trading-dev.web.app` (if all tests pass)
- **Verify changes work on the dev environment** (`cranial-trading-dev.web.app`) before considering production

### 2. Semantic Versioning (MANDATORY)

- Version lives in `package.json` `"version"` field
- **Bump version with every meaningful change** — in the same commit or PR
- Follow semver strictly:
  - **patch** (x.y.Z): bug fixes, minor tweaks, dependency updates
  - **minor** (x.Y.0): new features, new UI screens, new API integrations
  - **major** (X.0.0): breaking changes, major redesigns, data migration required
- When unsure which bump, **ask the user**
- Command: `npm version patch|minor|major --no-git-tag-version`

### 3. Deployment Flow

```
develop  ──push──▶  CI tests  ──pass──▶  auto-deploy to cranial-trading-dev
                                              │
                                         verify on dev
                                              │
                                    user approves production
                                              │
develop ──merge──▶ main ──push──▶ CI tests ──pass──▶ auto-deploy to cranial-trading (PROD)
```

- `develop` push → auto-deploys to **dev** (`cranial-trading-dev.web.app`)
- `main` push → auto-deploys to **production** (`cranial-trading.web.app`)
- The dev environment uses Firebase project `cranial-trading-dev`
- Production uses Firebase project `cranial-trading`

### 4. Production Deploy Checklist (before merging develop → main)

**All items must be true. Claude Code must NOT merge to main without explicit user approval.**

1. All unit tests pass (`npm run test:unit`)
2. Build succeeds (`npx vite build`)
3. Version bumped appropriately in `package.json`
4. Changes pushed to `develop` and deployed to dev environment
5. Feature/fix verified working on `cranial-trading-dev.web.app`
6. **User explicitly says to deploy to production**

### Quick Reference

| Action | Branch | Deploys to |
|--------|--------|------------|
| Day-to-day development | `develop` | cranial-trading-dev (auto) |
| Verify before prod | — | cranial-trading-dev.web.app |
| Production release | merge `develop` → `main` | cranial-trading (auto) |
| Hotfix | `develop` first, then merge to `main` | Both |

---

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