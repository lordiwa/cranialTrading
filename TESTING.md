# Testing Guide

## Quick Commands

| Command                      | Description                          |
|------------------------------|--------------------------------------|
| `npm run test:unit`          | Run unit tests (fast, no Firebase)   |
| `npm run test:unit:watch`    | Watch mode for TDD                   |
| `npm run test:unit:coverage` | Unit tests with coverage report      |
| `npm run test:integration`   | Integration tests (requires .env.local) |
| `npm run e2e`                | Playwright E2E tests                 |

## TDD Workflow

Follow the **Red - Green - Refactor** cycle:

1. **Red** -- Write a failing test that describes the behavior you want. Run it and confirm it fails.
2. **Green** -- Write the minimum code needed to make the test pass. No more, no less.
3. **Refactor** -- Clean up the implementation while keeping the test green. Remove duplication, improve naming, simplify logic.

Repeat for each small unit of behavior. Commit after each green + refactor step.

## When to Write Which Test Type

| Scenario                         | Test Type     | Location              |
|----------------------------------|---------------|-----------------------|
| Pure function / utility logic    | Unit          | `tests/unit/`         |
| Pinia store logic (mocked deps) | Unit          | `tests/unit/`         |
| Firebase CRUD operations         | Integration   | `tests/integration/`  |
| Full user flow / multi-page      | E2E           | `e2e/`                |

**Rule of thumb:** If it has no side effects and takes no network calls, it is a unit test. If it touches Firebase, it is an integration test. If it simulates a real user clicking through the app, it is an E2E test.

## Directory Structure

```
tests/
  unit/
    helpers/
      fixtures.ts       # Shared test data factories
    utils/               # Tests for src/utils/
    stores/              # Tests for Pinia stores
    components/          # Tests for Vue components
  integration/
    services/            # Tests for Firebase service layer
e2e/
    *.spec.ts            # Playwright end-to-end tests
```

## Test Fixtures

Shared factory functions live in `tests/unit/helpers/fixtures.ts`. Use them to create consistent test data:

- **`makeCard(overrides?)`** -- Creates a Card object with sensible defaults. Pass an object to override specific fields.
- **`makePreference(overrides?)`** -- Creates a Preference (BUSCO/VENDO) object.
- **`makeFilterableCard(overrides?)`** -- Creates a card with all filterable fields populated (colors, type, rarity, CMC).
- **`makeCsvCard(overrides?)`** -- Creates a card shaped for CSV export testing.
- **`makeMoxfieldDeck(overrides?)`** -- Creates a Moxfield deck import response object.

Example:

```ts
import { makeCard, makePreference } from '../helpers/fixtures'

const card = makeCard({ name: 'Lightning Bolt', quantity: 4 })
const pref = makePreference({ type: 'BUSCO', condition: 'NM' })
```

## Mocking Rules

- **Never import real Firebase in unit tests.** Mock all Firebase service functions using `vi.mock()`.
- Pinia stores should be tested with `createTestingPinia()` or by mocking their dependencies.
- Scryfall API calls should be mocked in unit tests; only integration tests may hit real endpoints.
- Use `vi.fn()` for callback/event handler spies.

Example mock:

```ts
vi.mock('@/services/firebase', () => ({
  addCard: vi.fn().mockResolvedValue({ id: 'abc123' }),
  getCards: vi.fn().mockResolvedValue([]),
}))
```

## Coverage Targets

Critical business logic files should maintain **85%+ line coverage**:

- `src/utils/` -- all utility/helper functions
- `src/stores/` -- Pinia store actions and getters
- Price calculation, match scoring, and deck validation logic

Run `npm run test:unit:coverage` to generate a coverage report in the `coverage/` directory. The CI pipeline uploads this as an artifact on every run.
