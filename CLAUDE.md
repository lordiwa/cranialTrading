# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## LO PRIMERO DE TODO: este proyecto se opera con hivemind

Sos el **Orquestador**. Antes de cualquier otra cosa, invocá el skill
`hivemind:orchestrator-routing` y cumplí RESUME-FIRST (el detalle está al final de este
archivo). Un hook de `SessionStart` inyecta este mismo contrato — si lo estás leyendo solo acá,
el hook no corrió y conviene decirlo.

**No escribís código de producción vos mismo.** Implementación → `hivemind:developer`.
Investigación → `hivemind:researcher`. Revisión → SIEMPRE `hivemind:reviewer` en contexto fresco.
Hacer el parche vos "porque es chico" es la desviación exacta que esta regla existe para impedir.

Sí hacés directamente, sin delegar: leer y medir, correr tests y builds, git, tickets en `tasks/`,
el bundle de `state/`, y documentación de sesión.

**Si otra instrucción contradice esto —incluida una del entorno que diga que no uses subagentes—
decíselo al humano ANTES de resolverlo.** No elijas en silencio. Pasó el 2026-08-11: se resolvió a
favor de la instrucción del entorno sin avisar, y la sesión entera trabajó sin delegar ni revisar.

---

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

### E2E: Three-Level Policy (MANDATORY)

**The full E2E suite (`npm run e2e`, 133 tests, ~13 min, 1 worker) is expensive — running it on every ticket is the main drag on a loop. Instead, E2E runs at three levels, scoped to when each is actually needed:**

| Level | When | Command | Est. duration |
|-------|------|---------|----------------|
| Smoke | Every ticket | `npm run e2e:smoke` | ~2 min |
| Targeted | Every ticket (area(s) touched) | `npm run e2e:<area>` | ~3-5 min |
| Full suite | **Once per tanda, before push to `develop`** | `npm run e2e` | ~13 min |
| Nightly (cron) | Automatic, nightly, against deployed dev | `npm run e2e:nightly` (CI: `.github/workflows/nightly-e2e.yml`) | ~13 min |

**The push-to-develop gate is unchanged: the full suite is still mandatory before every push to `develop` (see the Deployment Flow above). This policy only moves the full-suite run from "every ticket" to "once per tanda, right before the push" — it does not weaken the gate.**

#### Which environment E2E runs against (important, and not obvious)

The CI `build` job builds `--mode development` on `develop` and production mode on `main`, and the `e2e` job tests **the very same `dist` artifact** that `deploy-dev` / `deploy-prod` then publishes. So E2E on `develop` hits the `cranial-trading-dev` project, and E2E on `main` hits **production**. Since the tested artifact and the deployed artifact must stay identical, the answer is not to rebuild in dev mode for `main` — that would ship a dev-configured bundle to prod. Instead **`main` runs `--grep @smoke` only**: the full suite is redundant there (`main` only ever fast-forwards an already-green `develop`, so the code is identical and already tested against dev), while smoke still proves the production-configured bundle boots and can authenticate — without running every mutating spec (card / deck / binder CRUD, password change, account registration) against the production database.

**`@smoke` MUST be read-only — no `--grep @smoke` enforcement exists to catch a mutator by accident.** TASK-151 (2026-08-08): `binders.spec.ts` "create new binder" and `deck-crud.spec.ts` "create new deck" were tagged `@smoke` and were writing real binder/deck documents to production on every push to `main` — the "without running every mutating spec" claim above was false until this ticket removed the tag from both. Neither test needed the tag for its own purposes (targeted `npm run e2e:binders` / `e2e:decks` and the full suite already cover them); only the `@smoke`-gated CI-on-`main` exposure was the problem. Before tagging any new test `@smoke`, confirm it creates/edits/deletes nothing.

Full current `@smoke` set (verified 2026-08-08, all read-only): `collection/collection-crud.spec.ts` "collection page loads with card grid visible", `user-profile/user-profile.spec.ts` "view public user profile", `auth/login.spec.ts` "successful login redirects to the /inicio landing", `matches/match-management.spec.ts` "matches page loads with tab navigation", `smoke/navigation.spec.ts` "nav: Collection link navigates to /collection" and "tab switching renders correct content", `search/search.spec.ts` "search by card name returns results grid", `messages/messages.spec.ts` "messages page loads conversation list". That's 8 tests, tagged in their title (e.g. `test('successful login redirects to the /inicio landing @smoke', ...)`), run across whatever project(s) Playwright routes them to (`chromium` / `no-auth-tests`) — no separate config needed. Together they cover: auth (login), and page-load/navigation for collection, matches, messages, search, user-profile, and tab switching — enough to prove the production-configured bundle boots and can authenticate, without creating a single document.

Locally, `playwright.config.ts` defaults `VITE_MODE` to `development`, so `npm run e2e` on your machine hits the dev project. **That default used to be `production`, which meant every local E2E run silently mutated the production database.** Pass `VITE_MODE=production` only when you deliberately want to exercise the prod bundle, and know what that account will be subjected to.

Area → specs mapping (targeted scripts run only that folder, still through the full Playwright project/auth setup):

| Area | Folder | Script |
|------|--------|--------|
| Auth | `e2e/specs/auth/` | `npm run e2e:auth` |
| Collection | `e2e/specs/collection/` | `npm run e2e:collection` |
| Decks | `e2e/specs/decks/` | `npm run e2e:decks` |
| Matches | `e2e/specs/matches/` | `npm run e2e:matches` |
| Search | `e2e/specs/search/` | `npm run e2e:search` |
| Profile | `e2e/specs/user-profile/` | `npm run e2e:profile` |
| Binders | `e2e/specs/binders/` | `npm run e2e:binders` |
| Messages | `e2e/specs/messages/` | `npm run e2e:messages` |

For areas without a dedicated script (market, settings, contacts, i18n, preferences, notifications, help, etc.), run `npx playwright test e2e/specs/<folder>` directly with the same flags as `npm run e2e`.

Known flaky specs — never rely on these for smoke/targeted signal, and don't tag them `@smoke`: `auth/register.spec.ts` ("successful registration" — Firebase rate-limit on `sendEmailVerification`) and `search/search.spec.ts` ("selecting autocomplete suggestion" — depends on a live Scryfall suggestion having a price). Both pass in isolation; they are not code regressions.

#### Nightly cron (`.github/workflows/nightly-e2e.yml`)

**Pending activation:** GitHub only fires `schedule` (and only accepts `workflow_dispatch`) for a workflow file that exists on the repo's default branch (`main`). This file lands on `develop` first — it does nothing until the next `develop` → `main` promotion ships it to `main`. Don't expect scheduled or manually-dispatched runs before that merge; `gh workflow run nightly-e2e.yml` will 404 until then.

Once active: a separate scheduled workflow (`schedule` ~06:00 UTC + `workflow_dispatch` for manual runs) runs the E2E suite against the deployed dev environment (`https://cranial-trading-dev.web.app`) instead of a local preview build. It's a detection tool, not a deploy gate — it doesn't touch or block `test.yml` (push/deploy CI). It explicitly checks out `develop` (not whatever branch it's scheduled from) so the run always executes develop's current spec/tag/config set — the same code driving the dev site it's testing.

- **Remote target:** `playwright.config.ts` reads `E2E_BASE_URL` — when set, it becomes the Playwright `baseURL` and the local `webServer` is skipped entirely (unset = current local-preview behavior, unchanged). Local repro: `E2E_BASE_URL=https://cranial-trading-dev.web.app npm run e2e:smoke`.
- **Mutators — real cleanup, not just exclusion:** `deck-crud.spec.ts` "create new deck" and `binders.spec.ts` "create new binder" now delete their own fixture at the end of the same test (reusing the same delete flow their sibling "delete" test in the file already exercises) — previously they left the deck/binder behind on every run, in the push-to-develop full suite too, not just nightly. Both were re-verified BY MEASUREMENT on 2026-08-17 (TASK-240 AC6, snapshot of `users/<uid>/decks` and `/binders` before and after, with a read-only control run): both really do delete what they create. `collection-crud.spec.ts` "add card" is the one that did NOT. Its "net-zero doc count, delete whatever is at grid index 0" strategy is gone as of TASK-240, and the claim that it "rotates one card per run rather than growing without bound" was measured false — the account grew by one document on every run. Two measured reasons: (1) the created card frequently never reaches `card_index` (TASK-234), the grid is built and sorted FROM that index, so the created card is not on screen and index 0 is a BYSTANDER — one run de-indexed "Angel's Herald", a TASK-238 fixture, instead of cleaning up; (2) `deleteCard` awaits a Cloud Function before `deleteDoc` while the success toast fires without awaiting either, so with no grace period after the toast neither write lands. It now uses an out-of-band **admin teardown** (`e2e/helpers/admin.ts`): snapshot the account before, diff by document id after, delete by id with `firebase-admin`, and assert the account came back to its starting state. That assertion REDDENS (reversing "leak, don't redden" — an admin delete by id has no UI flakiness, so a failure there is a real leak, and staying green cost this project two silent failures: TASK-146 and TASK-240). Deleting by id is also the only strategy that is correct whether or not the index write landed. It needs Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS`, wired in both workflows from `FIREBASE_SERVICE_ACCOUNT_DEV`, develop/nightly only); **without them the test SKIPS itself rather than create a document it cannot delete.** Not fixed and still leaking, found while measuring the above: `decks/deck-editor.spec.ts` "add card from collection to mainboard" creates a deck and never deletes it — measured, decks 1 → 2 in one run. `auth/register.spec.ts` "successful registration" is the one true exception: it creates a real Firebase Auth account + Firestore user doc with no UI-exposed deletion path at all, so it's excluded from nightly via a `@nightly-skip` tag (`--grep-invert @nightly-skip`, wired as `npm run e2e:nightly`) instead of cleaned up. The rest of `register.spec.ts` (validation/duplicate checks that don't create accounts) still runs nightly.
- **Accepted churn (bounded, not accumulating):** `collection-crud.spec.ts` "edit card" and "bulk select → bulk change status to Sale" mutate an existing card's quantity/status in place — they change a doc's field values, they don't create new docs. This is accepted as-is: bounded drift on an already-existing card, not unbounded accumulation, so no revert step was added.
- **Known flakes:** `register.spec.ts` and `search.spec.ts` "selecting autocomplete suggestion" are both `@nightly-skip`-tagged and excluded from the nightly run (in addition to Playwright's existing `retries: 2` under `CI`), so neither ever reds out a nightly run on its own. Both still run on every push-to-develop full suite.
- **Result visibility:** `npm run e2e:nightly` (`--reporter=list,html,json`) is the single source of truth for the reporter flags — the workflow calls that script rather than duplicating the flags inline, so a local run and the CI run can never drift apart. The JSON output is summarized to the run's Job Summary (pass/flaky/fail/skipped table + failed test titles) via `e2e/nightly-summary.mjs`; the full HTML report is uploaded as the `nightly-playwright-report` artifact. On failure, a single tracking GitHub issue (label `nightly-e2e`) is opened or commented on — no spam of a new issue every night.

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

### Three-View Architecture (Phase 03)
**CollectionView (`/collection`), DeckView (`/decks/:id?`), BinderView (`/binders/:id?`) are separate route-level views — no shared `viewMode` state.** Each view mounts its own feature set:

- `CollectionView.vue` — card grid, status filters, wishlist, bulk operations, URL-synced filters (`useCollectionFilterUrl`), server-side pagination (`useCollectionPagination`)
- `DeckView.vue` — deck editor (`DeckEditorGrid`), allocations, import/delete flows (`useCollectionImport` + `useDeckDeletion`), CSV/clipboard export, mainboard/sideboard separation, deck stats footer
- `BinderView.vue` — binder editor (`DeckEditorGrid` in `binder-mode`), allocations, import flow (`useCollectionImport`), CSV/clipboard export, public/for-sale toggles

Tab navigation between the three views uses `<RouterLink>` — never internal state toggles. Legacy `/collection?deck=X` / `?binder=X` / `?from=decks` query params are still redirected in `CollectionView.initView()` for backward compatibility.

`CollectionGridCard.vue` is a routing shell that delegates to `CollectionGridCardCompact.vue` (grid thumbnail) or `CollectionGridCardFull.vue` (list row with swipe). Swipe interactions use the `useSwipe` composable — no inline `@touchstart` / `@touchmove` / `@touchend` handlers.

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
- `CollectionGrid.vue` uses `.normal` images
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

### Price Filter Logic (card search results)
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
- `DeckView.vue` ↔ `DeckEditorGrid.vue` ↔ `stores/decks.ts` (deck editor + allocations)
- `BinderView.vue` ↔ `DeckEditorGrid.vue` (binder-mode) ↔ `stores/binders.ts` (binder editor)
- `DeckView.vue` ↔ `BinderView.vue` ↔ `composables/useCollectionImport.ts` (shared import flow)
- `CollectionGridCard.vue` ↔ `CollectionGridCardCompact.vue` ↔ `CollectionGridCardFull.vue` (shell + variants — swipe lives in Full via `useSwipe`)
- `CollectionView.vue` ↔ `composables/useCollectionFilterUrl.ts` ↔ `composables/useCollectionPagination.ts` (URL-synced filters + server pagination)
- `AddCardModal.vue` ↔ `EditCardModal.vue`
- `SearchView.vue` ↔ Scryfall service + `FilterPanel.vue` + AddCardModal (search results page)
- `SavedMatchesView.vue` ↔ `utils/matchGrouping`, `services/stats`, `stores/matches` (match-calculation pipeline — Plan 02-C wired SavedMatchesView to extracted infrastructure)
- `src/locales/en.json` ↔ `src/locales/es.json` ↔ `src/locales/pt.json` (always update all 3 together)

---

## Multi-Agent Development (agentic-framework)

All multi-agent work runs through the **agentic-framework plugin agents only**: `agentic-framework:orchestrator` (plans and delegates), `agentic-framework:developer` (TDD implementation), `agentic-framework:researcher` (read-only research, writes training skills), `agentic-framework:reviewer` (fresh-context review). Do not define or use project-local agents. The workflow loop and RESUME-FIRST session contract live in the routing block at the end of this file.

### Tickets

Tickets live in the **local task store** at `tasks/` (TASK-NNN.json + index.json). This is the ONLY ticket system — there is no external tracker. The backlog originally came from a Jira board (migrated 2026-06-12, TASK number = old SCRUM number), but that link was severed on 2026-08-08: the `jira_key` field was blanked on all tickets, the `jira-import` label removed, and the `jira-pm` skill deleted. Do not create, read, or reconcile against Jira; do not reintroduce a `jira_key`.

### Task Sizing & Parallelism

- One ticket = one context window of work, ~4 files max. If it needs 8+ files read or 4+ changed, split it.
- Parallel-safe tasks → separate worktrees (`isolation: "worktree"`); `.worktreeinclude` copies `.env.local`, `.env.development`, `.env.production` into new worktrees.
- An agent in a worktree stays on its task branch — it does NOT switch to `develop`. Worktrees are cleaned up after merge.

### When to Split vs Stay Sequential
| Scenario | Approach |
|----------|----------|
| 2+ independent file groups (no overlap) | Split into parallel tasks |
| Feature + its tests (same files) | Single task |
| Deck handler + Binder handler (parallel pair) | Same task (atomic) |
| i18n keys (en + es + pt) | Same task (atomic) |
| Bug fix (single file) | Single task, no split needed |
| Large feature (8+ files) | Split into slices |

---

## Anti-Loop Rules

**Rules derived from recurring mistakes. These prevent loops where Claude gives bad responses, breaks working code, or makes incomplete changes requiring multiple correction rounds.**

### Rule 1: READ Before Touching — Full Trace Required

- Before modifying ANY function, read the entire file and trace all callers/callees
- If a function has a parallel "sibling" (e.g., `handleDeckGridRemove` / `handleBinderGridRemove`, or `*QuantityUpdate` for deck and binder), identify BOTH and apply the change to both
- If a component is used in multiple views, change ALL usages. Note: blocked-users inline logic lives only in SavedMatchesView — DashboardView was deleted in Phase 02-C
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
  - Deck handlers ↔ Binder handlers (always come in pairs — now live in `DeckView.vue` / `BinderView.vue` post-Phase 03)
  - SavedMatchesView (blocked-users inline — consolidation tech debt noted in Phase 02-C SUMMARY)
  - en.json ↔ es.json ↔ pt.json (always all 3)
  - AddCardModal ↔ EditCardModal (shared behavior)
  - `CollectionGridCardCompact.vue` ↔ `CollectionGridCardFull.vue` (same Card prop shape, different presentation — swipe only in Full)

### Rule 7: Build + Tests = Definition of "Done"

- **ALWAYS** run `npm run test:unit` after any logic change
- **ALWAYS** run `npx vite build` before considering work finished
- If either fails, fix it before reporting to the user
- Use `npx vite build` (NOT `npm run build` which includes lint with pre-existing errors)

### Rule 8: Never Use async onMounted with await

- Never declare `onMounted` callbacks as `async` with `await` inside — it breaks profile loading for anonymous users in production
- Call async functions inside `onMounted` WITHOUT awaiting them

## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| deploy-dev | Run tests, bump version, commit, and push to develop branch for dev deployment | `.claude/skills/deploy-dev/SKILL.md` |
| deploy-prod | Production deployment checklist — verify, merge develop to main, and push | `.claude/skills/deploy-prod/SKILL.md` |
| design-pull | Figma → Design → ticket: bring designer's Figma frame changes into the prototype HTML cards and open a tasks/ ticket for the Vue work (never touches Vue) | `.claude/skills/design-pull/SKILL.md` |
| design-push | Code → Design + Figma: regenerate prototype cards from shipped .vue and rebuild the matching Figma frames after a UI change | `.claude/skills/design-push/SKILL.md` |
| design-status | Read-only diff of app routes ↔ Claude Design cards ↔ Figma frames via mapping.json — reports gaps, drift, known deprecated/orphan, and nodeId discrepancies | `.claude/skills/design-status/SKILL.md` |
| frontend-design | Design thinking process and aesthetic guidelines for building visually distinctive frontend interfaces | `.claude/skills/frontend-design/SKILL.md` |
| i18n-check | Verify all i18n keys exist in en.json, es.json, and pt.json locale files | `.claude/skills/i18n-check/SKILL.md` |
| optimize-seo | Run an SEO audit via the agentic-framework researcher agent, categorize findings, and generate an actionable implementation plan with optional fix execution | `.claude/skills/optimize-seo/SKILL.md` |
| pr | Create a pull request with standard format from current branch to develop or main | `.claude/skills/pr/SKILL.md` |
| tdd | Walk through the TDD workflow (red/green/refactor) for a given task | `.claude/skills/tdd/SKILL.md` |

## Knowledge Graph (graphify)

The codebase has a queryable knowledge graph in `graphify-out/` (gitignored, regenerable):

- `graphify-out/GRAPH_REPORT.md` — community map of stores, composables, services, and views; read it to orient in an unfamiliar area before grepping
- `graphify-out/graph.json` — full node/edge graph (1.4k+ nodes) for programmatic lookup
- Rebuild after code changes: `graphify update .` (no API cost). CLI at `C:\Users\srpar\AppData\Local\Programs\Python\Python311\Scripts\graphify.exe` (not on PATH)
<!-- BEGIN agentic-framework routing -->
## Orchestrator activation (agentic-framework)

This project is operated by a multi-agent team. The main thread is the
**Orchestrator**: it plans and delegates to the `researcher`, `developer`, and
`reviewer` subagents — it does not write production code itself.

### RESUME-FIRST (do this before anything else in every new chat)

Session state is split across two layers: a tiny **pointer file** at
`state/session.json` (`schema_version`, `active_session_id`, `updated_at`) and a
self-contained **bundle directory** at `state/sessions/<active_session_id>/`
whose own `session.json` holds the substantive state (`workflow_step`,
`handoff_summary`, `next_action`, `open_questions`, `blockers`, `decisions`,
`subagent_results`). The very first action of every new chat is:

1. Read `state/session.json` (the pointer). If it is absent or
   `active_session_id` is null, the orchestrator is idle — confirm with the
   human before starting a new session.
2. If `active_session_id` is non-null, read
   `state/sessions/<active_session_id>/session.json` for the handoff state.
3. If that bundle's `active_task` is non-null, read `tasks/<active_task>.json`
   to load the work item.
4. Restate `handoff_summary` and `next_action` to the human in one short
   paragraph and confirm before acting.

See `state/README.md` for the full bundle layout and the pause / resume / end
lifecycle operations.

### First-chat routing

If `PROJECT.md` does not exist in the repo root, the framework has not been
initialized for this project — run the `/init-project` command (the project
intake wizard) before any other workflow step. If `PROJECT.md` already exists,
proceed to RESUME-FIRST.

### Workflow loop (every unit of work)

1. Read the next `status: todo` ticket and extract acceptance criteria.
2. Plan: decompose into research / tests / implementation / review.
3. Research (if needed): spawn the `researcher` for any unknown stack.
4. Tests first: the `developer` writes failing tests that encode the criteria
   before any implementation lands.
5. Implement: the same `developer` makes the new tests pass without breaking
   existing ones.
6. Review: spawn the `reviewer` in a fresh context; block on any HIGH finding.
7. Update the ticket on a green review, then pause or end the session bundle
   via the lifecycle operations in `state/README.md`.

### Repository etiquette

- Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`,
  `chore:`); one logical change per commit.
- Never commit secrets; never `--no-verify`; never force-push a shared branch.
- Human-in-the-loop for destructive or irreversible actions.
<!-- END agentic-framework routing -->
