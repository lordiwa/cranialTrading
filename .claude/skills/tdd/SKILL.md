---
name: tdd
description: Walk through the TDD workflow (red/green/refactor) for a given task
user-invocable: true
disable-model-invocation: true
---

# TDD Workflow

You are guiding the user through the mandatory TDD process defined in CLAUDE.md. The user will describe a task — you drive the red/green/refactor cycle.

## Step 1: Understand the Task

Read the user's request. Identify:
- Which files will be affected (read them)
- What type of change it is (new feature, bug fix, refactor)
- What testable units exist (pure functions, store logic, component behavior)

Present a brief plan:
```
Task: <summary>
Files to change: <list>
Tests needed: <unit | integration | both>
Test files: <paths>
```

Ask the user to confirm before proceeding.

## Step 2: RED — Write Failing Tests

Based on the change type:

| Change type | Test approach |
|-------------|--------------|
| New pure function | Test expected inputs/outputs |
| Bug fix | Write regression test that reproduces the bug |
| Store algorithm | Test state transitions and computed values |
| Refactor | Write characterization tests capturing current behavior |
| Firebase CRUD | Integration test with real Firebase |

- Create or update test files in `tests/unit/` (or `tests/integration/` for Firebase)
- Use Vitest globals (`describe`, `it`, `expect`) — do NOT import them
- Use fixtures from `tests/unit/helpers/fixtures.ts` when available
- **Never import real Firebase in unit tests** — mock it
- Run `npm run test:unit` to confirm tests **FAIL** (red phase)

If tests pass immediately, the tests aren't testing the new behavior. Revisit them.

Report: "RED phase complete — X tests failing as expected."

## Step 3: GREEN — Implement

- Write the **minimum** code to make all tests pass
- Run `npm run test:unit` after each meaningful change
- Do NOT move on until all tests are green
- Do NOT add features beyond what the tests require

Report: "GREEN phase complete — all X tests passing."

## Step 4: REFACTOR

- Clean up the implementation while keeping tests green
- Extract helpers, improve naming, simplify logic
- Run `npm run test:unit` to confirm nothing broke
- Check for parallel implementations (Rule 1 & Rule 6 from CLAUDE.md):
  - Deck ↔ Binder handlers
  - AddCardModal ↔ EditCardModal
  - en.json ↔ es.json ↔ pt.json

Report: "REFACTOR phase complete — tests still green."

## Step 5: QA

Run the full verification:

1. `npm run test:unit` — all tests pass
2. `npm run test:unit:coverage` — check coverage on changed files (target: 85%+ for business logic)
3. `npx vite build` — build succeeds

Report coverage for the changed files. If below 85% for business logic, suggest additional tests.

## Step 6: Done

Summarize:
- What was implemented
- What was tested (number of tests, coverage %)
- Any parallel changes made
- Build status
