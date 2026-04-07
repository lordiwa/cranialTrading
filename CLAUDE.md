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
- `neon`: #5AC168 (accents)
- `rust`: #8B2E1F (errors)

Font: Open Sans (sans-serif throughout)

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

---

## MANDATORY: Split & Merge Workflow (Parallel Development)

**For features/fixes that span multiple files or logical areas, use the split & merge pattern.**

### Hierarchy: Milestone → Slice → Task

- **Milestone:** The full user request (one milestone per feature/fix)
- **Slice:** A logical group of related tasks that can be verified together
- **Task:** One context window of work. Touches ~4 files max. Tagged as `parallel-safe` or `sequential`.

**Sizing rule:** If a task requires reading 8+ files or changing 4+ files, split it further.

### Agent Workflow

```
1. Planner agent → produces Milestone/Slice/Task plan
2. Orchestrator agent → reads plan, spawns dev agents
   - parallel-safe tasks → separate worktrees (isolation: "worktree")
   - sequential tasks → one dev agent at a time
3. Dev agent (per task) → TDD implementation in worktree
4. Review-code agent → verifies each task
5. Orchestrator → merges task branches to develop
6. Final verification on merged develop
```

### Orchestrator Modes
- **Supervised (default):** Pauses after each slice, waits for user approval
- **Autonomous:** Runs all slices without pausing. Stops on failure.
- User controls mode: "go independent" / "go auto" to switch to autonomous

### Branch Naming
- Task branches: `task/{milestone}-{nn}` (e.g., `task/seo-01`, `task/seo-02`)
- All task branches fork from current `develop` HEAD
- Merge back to `develop` after review passes

### Worktree Rules
- `.worktreeinclude` copies `.env.local`, `.env.development`, `.env.production` to new worktrees
- Dev agent in worktree stays on its `task/*` branch — does NOT switch to `develop`
- Commits use format: `task({milestone}): {description}`
- Worktrees are cleaned up after successful merge

### When to Split vs Stay Sequential
| Scenario | Approach |
|----------|----------|
| 2+ independent file groups (no overlap) | Split into parallel tasks |
| Feature + its tests (same files) | Single task |
| Deck handler + Binder handler (parallel pair) | Same task (atomic) |
| i18n keys (en + es + pt) | Same task (atomic) |
| Bug fix (single file) | Single task, no split needed |
| Large feature (8+ files) | Split into slices |

### Quick Reference
```bash
# Planner produces the plan
# Orchestrator reads it and spawns dev agents:

# Parallel tasks → worktree isolation
Agent(dev, isolation: "worktree")  # Task 1
Agent(dev, isolation: "worktree")  # Task 2 (parallel)

# Sequential tasks → one at a time
Agent(dev)  # Task 3 (depends on Task 1)

# After all tasks done:
# Orchestrator merges task/* branches → develop
# Final review-code run on develop
```

---

## Anti-Loop Rules

**Rules derived from recurring mistakes. These prevent loops where Claude gives bad responses, breaks working code, or makes incomplete changes requiring multiple correction rounds.**

### Rule 1: READ Before Touching — Full Trace Required

- Before modifying ANY function, read the entire file and trace all callers/callees
- If a function has a parallel "sibling" (e.g., `handleDeckGridRemove` / `handleBinderGridRemove`, or `*QuantityUpdate` for deck and binder), identify BOTH and apply the change to both
- If a component is used in multiple views (e.g., BlockedUsersModal in SavedMatchesView AND DashboardView), change ALL usages
- **Never assume "there's only one"** — always search with Grep/Glob for parallel instances

### Rule 2: Do NOT "Improve" Code You Weren't Asked to Change

- If the user asks for X, do ONLY X — don't touch adjacent code that "looks improvable"
- **NEVER** change Vue lifecycle patterns (onMounted, watch, computed) unless explicitly part of the request
- **NEVER** convert synchronous callbacks to async/await "for readability" — it can break timing
- If you see improvable code that isn't part of the request, mention it to the user without touching it

### Rule 3: Verify i18n Keys BEFORE Using Them

- Before using `t('some.key')`, verify with Grep that the key exists in all 3 locale files (en.json, es.json, pt.json)
- If the key doesn't exist, create it in all 3 files in the same step
- **NEVER** assume a key exists because it "sounds logical" — always verify

### Rule 4: One Confirm Modal at a Time — Respect the Resolution Flow

- The confirm store uses `pendingResult` + `onAfterLeave` — the second `show()` MUST wait for the first to finish its animation
- If you need sequential confirms, the second `await confirmStore.show()` already waits correctly thanks to `onAfterLeave`, but never launch two in parallel
- Test manually that sequential confirms work (the second appears after the first disappears)

### Rule 5: When Something Fails, Diagnose BEFORE Changing

- If a change doesn't work as expected, STOP and read the code/error carefully before attempting another fix
- After 2 failed attempts on the same problem, explain to the user what's happening and propose a different approach instead of continuing to patch
- Never do mass `git revert` or undo changes as a "solution" — understand what went wrong first
- If the error is at runtime (production/dev), ask the user for the exact console error before guessing

### Rule 6: Parallel Changes = Atomic Change

- Identify ALL parallel points BEFORE starting to code (list them in the plan)
- Apply the change to ALL points in the same step — never "I'll do the other one later"
- **Parallelism checklist for this project:**
  - Deck handlers ↔ Binder handlers (always come in pairs)
  - SavedMatchesView ↔ DashboardView (BlockedUsersModal)
  - en.json ↔ es.json ↔ pt.json (always all 3)
  - AddCardModal ↔ EditCardModal (shared behavior)

### Rule 7: Build + Tests = Definition of "Done"

- **ALWAYS** run `npm run test:unit` after any logic change
- **ALWAYS** run `npx vite build` before considering work finished
- If either fails, fix it before reporting to the user
- Use `npx vite build` (NOT `npm run build` which includes lint with pre-existing errors)