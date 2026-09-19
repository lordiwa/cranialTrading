# Testing Guide

## Quick Commands

| Command                      | Description                          |
|------------------------------|--------------------------------------|
| `npm run test:unit`          | Run unit tests (fast, no Firebase)   |
| `npm run test:unit:watch`    | Watch mode                           |
| `npm run test:unit:coverage` | Unit tests with coverage report      |
| `npm run test:integration`   | Integration tests (requires .env.local) |
| `npm run e2e`                | Playwright E2E tests                 |

## Tests-After Workflow (TDD is eliminated)

**There is no Red-Green-Refactor cycle in this project anymore.** The TDD section that lived
here was removed: the gate measured compliance with a ritual instead of measuring the
product, and it manufactured a large volume of tests that did not work.

The order is now:

1. **Use cases first** -- define every path (happy, alternative, exception) with its declared
   postcondition, and get them approved by Mato. This is the only gate before code.
2. **Implement freely** -- build it the way the problem calls for. No mandated test ordering.
3. **Tests after** -- once the behavior exists and matches the approved use cases, write the
   unit/integration tests that lock it down, against what the code actually does.
4. **Wargaming** -- the Wrecker attacks the approved use cases at the end, from outside the
   author's context.
5. **E2E after the wargaming** -- E2E specs are tests-after too, and they wait until the
   attack has run, so they lock what the attack found rather than what the author imagined.
   UAT with Mato closes the loop when it is requested.

For a bug fix the regression test is still mandatory, but it is written against the
**reproduced** defect -- never imagined before reproducing it.

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
