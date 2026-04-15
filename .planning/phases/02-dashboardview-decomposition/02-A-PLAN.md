---
phase: 02-dashboardview-decomposition
plan: A
type: execute
wave: 1
depends_on: []
files_modified:
  - src/utils/matchExpiry.ts
  - src/utils/ownedCount.ts
  - src/utils/matchGrouping.ts
  - tests/unit/utils/matchExpiry.test.ts
  - tests/unit/utils/ownedCount.test.ts
  - tests/unit/utils/matchGrouping.test.ts
  - src/stores/matches.ts
  - src/views/SearchView.vue
  - src/views/DashboardView.vue
  - src/composables/useGlobalSearch.ts
  - src/views/UserProfileView.vue
  - src/views/SavedMatchesView.vue
autonomous: true
requirements:
  - ARCH-07
  - ARCH-13

# Planner reasoning (kept here for plan-A only; B/C/D inherit it):
# RESEARCH.md proposed a 4-plan split (A pure-logic foundation, B match
# composable + store extension, C blocked/clear/public-search composables,
# D async-onMounted fix + final cleanup). I am adopting that split verbatim
# because (a) Plan B is already a ~400-line DashboardView delete on its own,
# (b) the three composables in Plan C are independent of Plan B and let it
# run in parallel-safe Wave 2 alongside Plan B if ever needed, (c) Plan D
# isolates the async-onMounted change so the regression risk noted in
# RESEARCH §Risk 3 has its own committable atomic step.
#
# DEVIATION FROM RESEARCH: Plan A also touches the three "out of scope"
# files (useGlobalSearch.ts, UserProfileView.vue, SavedMatchesView.vue) per
# the user's explicit Plan-Phase decision #1. Phase-02 success criterion
# #4 ("MATCH_LIFETIME_DAYS defined in exactly one place AND imported
# everywhere it is used") cannot be met otherwise. The change in those
# three files is import-only (zero behavior change) — same constant value,
# same calendar-day arithmetic preserved.

must_haves:
  truths:
    - "MATCH_LIFETIME_DAYS = 15 lives in exactly one source file (src/utils/matchExpiry.ts)"
    - "src/stores/matches.ts, src/views/DashboardView.vue, src/composables/useGlobalSearch.ts, src/views/UserProfileView.vue, and src/views/SavedMatchesView.vue all import the constant — none redeclare it"
    - "getMatchExpirationDate(from?) returns a Date exactly 15 calendar days after `from` (default = new Date())"
    - "buildOwnedCountMap(cards) builds a Map<lowercaseName, totalQuantity> in a single pass"
    - "SearchView.getOwnedCount is O(1) per card render — no per-card filter/reduce over collectionStore.cards"
    - "groupMatchesByUser is importable as a pure function from src/utils/matchGrouping.ts and is no longer defined inline in DashboardView.vue"
    - "All three new utilities have failing-first unit tests committed before implementation (TDD per CLAUDE.md)"
  artifacts:
    - path: "src/utils/matchExpiry.ts"
      provides: "MATCH_LIFETIME_DAYS constant + getMatchExpirationDate(from?) helper"
    - path: "src/utils/ownedCount.ts"
      provides: "buildOwnedCountMap(cards) helper for O(1) owned-count lookup"
    - path: "src/utils/matchGrouping.ts"
      provides: "groupMatchesByUser(matchingCards, matchingPrefs) pure helper"
    - path: "tests/unit/utils/matchExpiry.test.ts"
      provides: "Failing-first unit tests for getMatchExpirationDate (calendar math, DST, leap year, default arg)"
    - path: "tests/unit/utils/ownedCount.test.ts"
      provides: "Failing-first unit tests for buildOwnedCountMap (empty, sum-by-name, case-insensitive)"
    - path: "tests/unit/utils/matchGrouping.test.ts"
      provides: "Failing-first unit tests for groupMatchesByUser (cards-only user, prefs-only user, both, empty)"
  key_links:
    - from: "src/views/SearchView.vue"
      to: "src/utils/ownedCount.ts via buildOwnedCountMap"
      via: "computed(() => buildOwnedCountMap(collectionStore.cards))"
    - from: "src/stores/matches.ts MATCH_LIFETIME_DAYS / calculateExpirationDate"
      to: "src/utils/matchExpiry.ts"
      via: "import { MATCH_LIFETIME_DAYS, getMatchExpirationDate } from '../utils/matchExpiry'"
    - from: "src/views/DashboardView.vue (4 inline lifeExpiresAt sites + groupMatchesByUser)"
      to: "src/utils/matchExpiry.ts + src/utils/matchGrouping.ts"
      via: "import { getMatchExpirationDate } from '../utils/matchExpiry' and import { groupMatchesByUser } from '../utils/matchGrouping'"
    - from: "src/composables/useGlobalSearch.ts, src/views/UserProfileView.vue, src/views/SavedMatchesView.vue"
      to: "src/utils/matchExpiry.ts"
      via: "import { getMatchExpirationDate } from '../utils/matchExpiry' and replace inline 15*24*60*60*1000 / local MATCH_LIFETIME_DAYS"
---

<objective>
Establish the pure-logic foundation for Phase 02 by extracting three Vue/Firebase-free helpers (matchExpiry, ownedCount, matchGrouping) with failing-first TDD, then wiring them into every consumer. Also closes ARCH-07 (SearchView O(1) owned-count) and ARCH-13 (single source for MATCH_LIFETIME_DAYS across all 5 files that currently duplicate it).

Purpose: Plans B/C/D move large blocks of behavior between modules. They depend on these three helpers being importable, tested, and correctly named. By landing this plan first, every subsequent plan can swap inline math/loops for a single import. The owned-count fix is unrelated to DashboardView decomposition but shares the "extract pure logic + unit-test first" pattern, so it rides this plan.

Output: 3 new util files, 3 new failing-then-passing test files, edits to matches.ts, SearchView.vue, DashboardView.vue, useGlobalSearch.ts, UserProfileView.vue, SavedMatchesView.vue.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/02-dashboardview-decomposition/RESEARCH.md
@CLAUDE.md

<interfaces>
<!-- ============================================================ -->
<!-- Existing constants/functions to be extracted or wired into.  -->
<!-- All line numbers verified in RESEARCH.md.                    -->
<!-- ============================================================ -->

<!-- src/stores/matches.ts:106-112 (current — file-private constant + helper) -->
<!--
const MATCH_LIFETIME_DAYS = 15;

const getExpirationDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + MATCH_LIFETIME_DAYS);
    return date;
};
-->
<!-- ALSO src/stores/matches.ts:196-200 has calculateExpirationDate(createdAt)
     which adds 15 days to a *given* Date, not always `now`. The new util
     must support BOTH call patterns via an optional `from` parameter. -->

<!-- src/views/DashboardView.vue inline duplicates: -->
<!-- Line 210:  lifeExpiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), -->
<!-- Line 815:  lifeExpiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), -->
<!-- Line 1110-1115: const MATCH_LIFETIME_DAYS = 15; const getExpirationDate = ... -->
<!-- Line 1147: lifeExpiresAt: getExpirationDate(),  -->

<!-- src/composables/useGlobalSearch.ts:209-214 (local re-declaration): -->
<!-- const MATCH_LIFETIME_DAYS = 15
     const getExpirationDate = () => {
       const date = new Date()
       date.setDate(date.getDate() + MATCH_LIFETIME_DAYS)
       return date
     } -->

<!-- src/views/UserProfileView.vue:345-350 (same local re-declaration). -->

<!-- src/views/SavedMatchesView.vue inline (3 sites, all "Date.now() + 15*..."): -->
<!-- Lines 235, 385, 555: lifeExpiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) -->
<!-- IMPORTANT BEHAVIOR NOTE: the inline `Date.now() + 15*24*60*60*1000` math
     uses fixed milliseconds (15 * 86_400_000) which can drift by ±1 hour
     over a DST boundary, while setDate(+15) preserves wall-clock day. The
     RESEARCH explicitly chose setDate(+15) as canonical (calendar-correct).
     This is a documented intentional behavior change for those 5 sites
     (the 3 SavedMatchesView lines + DashboardView L210 + L815). The drift
     is at most 1 hour out of 15 days = ~0.3%; user-visible impact is none
     because the UI shows "expires in N days", not minutes. -->

<!-- src/views/SearchView.vue:23-29 (current O(N*M)): -->
<!--
const getOwnedCount = (scryfallCard: ScryfallCard): number => {
  const cardName = scryfallCard.name?.toLowerCase()
  if (!cardName) return 0
  return collectionStore.cards
    .filter(c => c.name.toLowerCase() === cardName)
    .reduce((sum, c) => sum + c.quantity, 0)
}
-->

<!-- src/views/DashboardView.vue:632-681 — groupMatchesByUser pure function.
     Reads ONLY its parameters, returns a new Map. Verified pure (no refs,
     no stores). Safe to move to src/utils/matchGrouping.ts unchanged. -->

<!-- Card type for ownedCount tests: -->
<!-- Pick<Card, 'name' | 'quantity'> is enough — the helper only reads those. -->

<!-- PublicCard / PublicPreference types live in src/services/publicCards.ts
     and are imported wherever needed. groupMatchesByUser must keep its
     return-type shape exactly:
     Map<string, { cards: PublicCard[], prefs: PublicPreference[],
                   username: string, location: string, email: string }> -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: TDD-extract matchExpiry + ownedCount + matchGrouping utilities (RED → GREEN)</name>
  <files>
    src/utils/matchExpiry.ts,
    src/utils/ownedCount.ts,
    src/utils/matchGrouping.ts,
    tests/unit/utils/matchExpiry.test.ts,
    tests/unit/utils/ownedCount.test.ts,
    tests/unit/utils/matchGrouping.test.ts
  </files>
  <behavior>
    matchExpiry:
      - getMatchExpirationDate() with no arg → exactly 15 calendar days from new Date() (use vi.useFakeTimers + setSystemTime to pin "now")
      - getMatchExpirationDate(new Date('2024-01-20T12:00:00Z')) → returns Date with date part === Feb 4 2024 (month-boundary)
      - getMatchExpirationDate(new Date('2024-02-15T12:00:00Z')) → returns Date with date part === Mar 1 2024 (leap year Feb 15→Mar 1)
      - getMatchExpirationDate(new Date('2024-11-03T01:30:00')) → returned Date's getDate() === 18 (DST off-by-hour guard: must use setDate, not +ms math)
      - MATCH_LIFETIME_DAYS exported and === 15
      - Mutating the returned Date does NOT mutate the input (defensive copy)

    ownedCount:
      - buildOwnedCountMap([]) → empty Map (size 0)
      - buildOwnedCountMap([{name: 'Black Lotus', quantity: 4}]) → Map of size 1 with 'black lotus' → 4
      - buildOwnedCountMap([{name: 'Black Lotus', quantity: 3}, {name: 'BLACK LOTUS', quantity: 2}]) → Map of size 1 with 'black lotus' → 5 (case-insensitive coalesce)
      - buildOwnedCountMap([{name: 'Lotus', quantity: 1}, {name: 'Mox', quantity: 2}]) → Map of size 2 with both keys
      - buildOwnedCountMap with quantity 0 → key still present with value 0 (don't filter; preserve idempotency)
      - Performance: 10_000 cards built in < 50ms (assert via performance.now() — soft assertion)

    matchGrouping:
      - groupMatchesByUser([], []) → empty Map
      - groupMatchesByUser([{userId:'u1', username:'A', location:'X', email:'a@x', ...}], []) → Map size 1 with u1 entry having 1 card, 0 prefs, username 'A'
      - groupMatchesByUser([], [{userId:'u2', username:'B', location:'Y', email:'b@y', ...}]) → Map size 1 with u2 entry having 0 cards, 1 pref
      - Same userId in both arrays → single Map entry with both cards AND prefs populated
      - Cards from 2 different users → Map size 2
      - Missing location → defaults to 'Unknown'; missing email → defaults to ''
  </behavior>
  <action>
**Step 1 (RED) — write the three test files first**, then run `npm run test:unit -- matchExpiry ownedCount matchGrouping` and CONFIRM all fail.

`tests/unit/utils/matchExpiry.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MATCH_LIFETIME_DAYS, getMatchExpirationDate } from '@/utils/matchExpiry'

describe('matchExpiry', () => {
  describe('MATCH_LIFETIME_DAYS', () => {
    it('is 15', () => {
      expect(MATCH_LIFETIME_DAYS).toBe(15)
    })
  })

  describe('getMatchExpirationDate', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('with no argument, returns 15 calendar days from now', () => {
      vi.setSystemTime(new Date('2024-06-01T10:00:00Z'))
      const result = getMatchExpirationDate()
      expect(result.getUTCDate()).toBe(16)
      expect(result.getUTCMonth()).toBe(5) // June
    })

    it('handles month boundary (Jan 20 → Feb 4)', () => {
      const from = new Date('2024-01-20T12:00:00Z')
      const result = getMatchExpirationDate(from)
      expect(result.getUTCDate()).toBe(4)
      expect(result.getUTCMonth()).toBe(1) // February
    })

    it('handles leap year (Feb 15 2024 → Mar 1 2024)', () => {
      const from = new Date('2024-02-15T12:00:00Z')
      const result = getMatchExpirationDate(from)
      expect(result.getUTCDate()).toBe(1)
      expect(result.getUTCMonth()).toBe(2) // March
    })

    it('uses calendar-day arithmetic (not +ms) so DST does not shift the date', () => {
      // First Sunday of Nov 2024 = Nov 3 (US DST end). At 01:30 local,
      // adding 15 * 86400000 ms would shift the wall-clock day by 1 hour
      // and could land on Nov 17 02:30 instead of Nov 18 01:30 local.
      const from = new Date(2024, 10, 3, 1, 30) // Nov 3, 01:30 local
      const result = getMatchExpirationDate(from)
      expect(result.getDate()).toBe(18)
    })

    it('does not mutate the input Date', () => {
      const from = new Date('2024-06-01T00:00:00Z')
      const snapshot = from.getTime()
      getMatchExpirationDate(from)
      expect(from.getTime()).toBe(snapshot)
    })
  })
})
```

`tests/unit/utils/ownedCount.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { buildOwnedCountMap } from '@/utils/ownedCount'

describe('buildOwnedCountMap', () => {
  it('returns empty map for empty input', () => {
    const map = buildOwnedCountMap([])
    expect(map.size).toBe(0)
  })

  it('maps a single card to its quantity', () => {
    const map = buildOwnedCountMap([{ name: 'Black Lotus', quantity: 4 }])
    expect(map.size).toBe(1)
    expect(map.get('black lotus')).toBe(4)
  })

  it('coalesces case-insensitive duplicates by summing quantities', () => {
    const map = buildOwnedCountMap([
      { name: 'Black Lotus', quantity: 3 },
      { name: 'BLACK LOTUS', quantity: 2 },
    ])
    expect(map.size).toBe(1)
    expect(map.get('black lotus')).toBe(5)
  })

  it('preserves distinct names in separate keys', () => {
    const map = buildOwnedCountMap([
      { name: 'Lotus', quantity: 1 },
      { name: 'Mox', quantity: 2 },
    ])
    expect(map.size).toBe(2)
    expect(map.get('lotus')).toBe(1)
    expect(map.get('mox')).toBe(2)
  })

  it('keeps zero-quantity entries in the map (preserves presence info)', () => {
    const map = buildOwnedCountMap([{ name: 'Mox', quantity: 0 }])
    expect(map.get('mox')).toBe(0)
  })

  it('handles 10000 cards in under 50ms', () => {
    const cards = Array.from({ length: 10_000 }, (_, i) => ({
      name: `Card${i % 500}`,
      quantity: 1,
    }))
    const t0 = performance.now()
    buildOwnedCountMap(cards)
    const elapsed = performance.now() - t0
    expect(elapsed).toBeLessThan(50)
  })
})
```

`tests/unit/utils/matchGrouping.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { groupMatchesByUser } from '@/utils/matchGrouping'
import type { PublicCard, PublicPreference } from '@/services/publicCards'

const card = (overrides: Partial<PublicCard>): PublicCard => ({
  docId: 'd', cardId: 'c', userId: 'u1', username: 'A',
  cardName: 'Lotus', scryfallId: 's', status: 'trade', price: 0,
  edition: '', condition: 'NM', foil: false, quantity: 1, image: '',
  location: 'X', email: 'a@x',
  // updatedAt not strictly needed for grouping; cast minimally
  updatedAt: { toDate: () => new Date() } as unknown as PublicCard['updatedAt'],
  ...overrides,
})

const pref = (overrides: Partial<PublicPreference>): PublicPreference => ({
  docId: 'd', prefId: 'p', userId: 'u2', username: 'B',
  cardName: 'Mox', scryfallId: 's',
  // PublicPreference's full shape — fill with safe defaults; runtime
  // helper only reads userId/username/location/email here.
  location: 'Y', email: 'b@y',
  updatedAt: { toDate: () => new Date() } as unknown as PublicPreference['updatedAt'],
  ...overrides,
} as PublicPreference)

describe('groupMatchesByUser', () => {
  it('returns empty map for empty inputs', () => {
    expect(groupMatchesByUser([], []).size).toBe(0)
  })

  it('groups a card-only user', () => {
    const map = groupMatchesByUser([card({ userId: 'u1' })], [])
    expect(map.size).toBe(1)
    const entry = map.get('u1')!
    expect(entry.cards.length).toBe(1)
    expect(entry.prefs.length).toBe(0)
    expect(entry.username).toBe('A')
  })

  it('groups a pref-only user', () => {
    const map = groupMatchesByUser([], [pref({ userId: 'u2' })])
    expect(map.size).toBe(1)
    expect(map.get('u2')!.prefs.length).toBe(1)
    expect(map.get('u2')!.cards.length).toBe(0)
  })

  it('merges cards and prefs under the same userId', () => {
    const map = groupMatchesByUser(
      [card({ userId: 'u1' })],
      [pref({ userId: 'u1', username: 'A' })],
    )
    expect(map.size).toBe(1)
    const entry = map.get('u1')!
    expect(entry.cards.length).toBe(1)
    expect(entry.prefs.length).toBe(1)
  })

  it('keeps separate users separate', () => {
    const map = groupMatchesByUser(
      [card({ userId: 'u1' }), card({ userId: 'u3', username: 'C' })],
      [pref({ userId: 'u2' })],
    )
    expect(map.size).toBe(3)
  })

  it('defaults missing location to Unknown and missing email to empty string', () => {
    const map = groupMatchesByUser(
      [card({ userId: 'u1', location: undefined, email: undefined })],
      [],
    )
    const entry = map.get('u1')!
    expect(entry.location).toBe('Unknown')
    expect(entry.email).toBe('')
  })
})
```

Run `npm run test:unit -- matchExpiry ownedCount matchGrouping` — CONFIRM all fail (RED). Commit if your workflow does intermediate commits, otherwise proceed.

---

**Step 2 (GREEN) — implement the three util files**:

`src/utils/matchExpiry.ts`:
```typescript
/**
 * Match lifetime constants and helpers.
 * Single source of truth for MATCH_LIFETIME_DAYS — imported by:
 *   - src/stores/matches.ts
 *   - src/views/DashboardView.vue
 *   - src/composables/useGlobalSearch.ts
 *   - src/views/UserProfileView.vue
 *   - src/views/SavedMatchesView.vue
 *
 * Uses calendar-day arithmetic (Date.setDate) instead of +N*86_400_000 ms
 * so DST transitions never shift the wall-clock day.
 */
export const MATCH_LIFETIME_DAYS = 15

/**
 * Returns a Date exactly MATCH_LIFETIME_DAYS calendar days after `from`.
 * Defaults to `new Date()` when called with no argument.
 * Defensive: never mutates the input Date.
 */
export const getMatchExpirationDate = (from: Date = new Date()): Date => {
  const result = new Date(from.getTime())
  result.setDate(result.getDate() + MATCH_LIFETIME_DAYS)
  return result
}
```

`src/utils/ownedCount.ts`:
```typescript
import type { Card } from '../types/card'

/**
 * Builds a lowercase-name → total-quantity Map from a card collection.
 * Used by SearchView for O(1) owned-count lookup per rendered result.
 */
export const buildOwnedCountMap = (
  cards: Pick<Card, 'name' | 'quantity'>[],
): Map<string, number> => {
  const map = new Map<string, number>()
  for (const card of cards) {
    const key = card.name.toLowerCase()
    map.set(key, (map.get(key) ?? 0) + card.quantity)
  }
  return map
}
```

`src/utils/matchGrouping.ts`:
```typescript
import type { PublicCard, PublicPreference } from '../services/publicCards'

export interface UserMatchGroup {
  cards: PublicCard[]
  prefs: PublicPreference[]
  username: string
  location: string
  email: string
}

/**
 * Groups matching public cards and preferences by userId.
 * Pure function — no Vue reactivity, no stores, no Firestore.
 * Extracted verbatim from src/views/DashboardView.vue:632-681.
 */
export const groupMatchesByUser = (
  matchingCards: PublicCard[],
  matchingPrefs: PublicPreference[],
): Map<string, UserMatchGroup> => {
  const userMatches = new Map<string, UserMatchGroup>()

  for (const card of matchingCards) {
    if (!userMatches.has(card.userId)) {
      userMatches.set(card.userId, {
        cards: [],
        prefs: [],
        username: card.username,
        location: card.location ?? 'Unknown',
        email: card.email ?? '',
      })
    }
    const entry = userMatches.get(card.userId)
    if (entry) entry.cards.push(card)
  }

  for (const pref of matchingPrefs) {
    if (!userMatches.has(pref.userId)) {
      userMatches.set(pref.userId, {
        cards: [],
        prefs: [],
        username: pref.username,
        location: pref.location ?? 'Unknown',
        email: pref.email ?? '',
      })
    }
    const entry = userMatches.get(pref.userId)
    if (entry) entry.prefs.push(pref)
  }

  return userMatches
}
```

Run `npm run test:unit -- matchExpiry ownedCount matchGrouping` — CONFIRM all PASS (GREEN).

Anti-loop Rule 1: BEFORE editing any consumer file in Task 2/3, run:
`grep -rn "MATCH_LIFETIME_DAYS\|15 \* 24 \* 60 \* 60\|setDate(.*getDate.*15" src/` and verify the only sites are the 8 listed in RESEARCH.md §MATCH_LIFETIME_DAYS Deduplication. If new sites appeared between research and execution, list them in the SUMMARY.
  </action>
  <verify>
    <automated>npm run test:unit -- matchExpiry ownedCount matchGrouping</automated>
  </verify>
  <done>All three util files exist with the exact signatures above. All three test files exist and all unit tests pass. `tsconfig` resolves the `@/utils/...` import alias used in the test files (it already does — verified by existing tests/unit/utils/avatar.test.ts using the same alias).</done>
</task>

<task type="auto">
  <name>Task 2: Wire matchExpiry into matches.ts + DashboardView (5 sites) + the 3 ARCH-13 cleanup files</name>
  <files>
    src/stores/matches.ts,
    src/views/DashboardView.vue,
    src/composables/useGlobalSearch.ts,
    src/views/UserProfileView.vue,
    src/views/SavedMatchesView.vue
  </files>
  <action>
Anti-loop Rule 6 (atomic): all 5 files change in this single task. Read each in full before editing.

---

**A. `src/stores/matches.ts`** — replace the file-private constant + helper with imports.

Around line 106-112, replace:
```typescript
const MATCH_LIFETIME_DAYS = 15;

const getExpirationDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + MATCH_LIFETIME_DAYS);
    return date;
};
```

With (add the import near the top of the file with the other utility imports):
```typescript
import { MATCH_LIFETIME_DAYS, getMatchExpirationDate } from '../utils/matchExpiry';
```
And delete the private declarations entirely. Then update every internal call site:
- `getExpirationDate()` → `getMatchExpirationDate()` (no argument)
- The local helper at line 196-200 (`calculateExpirationDate(createdAt)`) MUST also be replaced — change its body to `return getMatchExpirationDate(createdAt)` OR delete it and replace its 1 caller (line ~212) with `getMatchExpirationDate(createdAt)`. Prefer DELETE — fewer indirections. Verify `calculateExpirationDate` has no other callers via grep before deleting.

The exported `MATCH_LIFETIME_DAYS` from matchExpiry is the only constant; matches.ts must NOT re-export it (consumers import from utils directly).

---

**B. `src/views/DashboardView.vue`** — 4 lifeExpiresAt sites.

Add the import alongside the other utils imports (near `import { formatDate } from '../utils/formatDate'`):
```typescript
import { getMatchExpirationDate } from '../utils/matchExpiry'
```

Then replace exactly:
- Line ~210: `lifeExpiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),` → `lifeExpiresAt: getMatchExpirationDate(),`
- Line ~815: `lifeExpiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),` → `lifeExpiresAt: getMatchExpirationDate(),`
- Lines ~1110-1115: DELETE the `const MATCH_LIFETIME_DAYS = 15` block and the local `getExpirationDate` arrow.
- Line ~1147: `lifeExpiresAt: getExpirationDate(),` → `lifeExpiresAt: getMatchExpirationDate(),`

Behavior note: lines 210 and 815 currently use `Date.now() + 15*86_400_000` ms math; the new util uses calendar-day setDate. This is the documented intentional fix (RESEARCH §MATCH_LIFETIME_DAYS, behavior note). It is not a regression — UI shows day-granularity only.

---

**C. `src/composables/useGlobalSearch.ts`** — line 209-214.

Add at the top of the file with existing utility imports:
```typescript
import { getMatchExpirationDate } from '../utils/matchExpiry'
```

Delete the entire local declaration (lines 209-214 in current state):
```typescript
const MATCH_LIFETIME_DAYS = 15
const getExpirationDate = () => {
  const date = new Date()
  date.setDate(date.getDate() + MATCH_LIFETIME_DAYS)
  return date
}
```

Find the call site below it (uses `getExpirationDate()` for `lifeExpiresAt`). Replace `getExpirationDate()` with `getMatchExpirationDate()`.

Anti-loop Rule 1: grep `useGlobalSearch.ts` for `getExpirationDate` and `MATCH_LIFETIME_DAYS` to confirm zero remaining references before saving.

---

**D. `src/views/UserProfileView.vue`** — line 345-350.

Add at the top:
```typescript
import { getMatchExpirationDate } from '../utils/matchExpiry'
```

Delete:
```typescript
const MATCH_LIFETIME_DAYS = 15;
const getExpirationDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + MATCH_LIFETIME_DAYS);
  return date;
};
```

Replace the single call to `getExpirationDate()` (immediately below the deletion, used in `lifeExpiresAt`) with `getMatchExpirationDate()`.

---

**E. `src/views/SavedMatchesView.vue`** — 3 inline sites at lines 235, 385, 555.

Add at the top:
```typescript
import { getMatchExpirationDate } from '../utils/matchExpiry'
```

Replace each of the three:
`lifeExpiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),` → `lifeExpiresAt: getMatchExpirationDate(),`

Behavior note: identical to DashboardView L210/L815 — switching from +ms to setDate is the documented intentional change.

---

**Atomic-commit checklist** before saving:
- [ ] All 5 files edited in this task.
- [ ] `grep -rn "MATCH_LIFETIME_DAYS = 15" src/` returns ONLY `src/utils/matchExpiry.ts`.
- [ ] `grep -rn "15 \* 24 \* 60 \* 60 \* 1000" src/` returns ZERO matches.
- [ ] `grep -rn "setDate.*getDate.*15" src/` returns ONLY `src/utils/matchExpiry.ts`.
- [ ] `grep -n "getExpirationDate" src/views/DashboardView.vue src/composables/useGlobalSearch.ts src/views/UserProfileView.vue` returns nothing.

If any of these fail, restore the file and re-do the missed site BEFORE running the verify step.
  </action>
  <verify>
    <automated>npm run test:unit && npx vue-tsc --noEmit && npx vite build 2>&1 | tail -10</automated>
  </verify>
  <done>All 5 files import MATCH_LIFETIME_DAYS / getMatchExpirationDate from src/utils/matchExpiry. No file redeclares the constant or the helper. The 4 grep commands above produce the expected (empty / single-source) results. Type-check passes. Build passes. All previously-passing unit tests still pass.</done>
</task>

<task type="auto">
  <name>Task 3: Wire ownedCount + matchGrouping into SearchView and DashboardView</name>
  <files>src/views/SearchView.vue, src/views/DashboardView.vue</files>
  <action>
Anti-loop Rule 1: read both files in full first.

---

**A. `src/views/SearchView.vue` — ARCH-07 fix**

Read the full file. Apply these atomic changes:

1. Add `computed` to the Vue import (line 2):
   `import { computed, ref } from 'vue'`

2. Add the buildOwnedCountMap import:
   `import { buildOwnedCountMap } from '../utils/ownedCount'`

3. Replace the existing `getOwnedCount` function (lines 23-29) with:
```typescript
const ownedCountByName = computed(() => buildOwnedCountMap(collectionStore.cards))

const getOwnedCount = (scryfallCard: ScryfallCard): number => {
  const cardName = scryfallCard.name?.toLowerCase()
  if (!cardName) return 0
  return ownedCountByName.value.get(cardName) ?? 0
}
```

4. Do NOT change anything in the template. The single caller (`SearchResultCard :owned-count="getOwnedCount(card)"`) uses the same function signature.

Anti-loop trace (already verified in RESEARCH §ARCH-07 callers): `getOwnedCount` has exactly 1 caller (SearchView template line 67). No parallel siblings.

Reactivity: `collectionStore.cards` is a `shallowRef<Card[]>` (per RESEARCH §getOwnedCount). The computed will rebuild only when the cards array reference changes (mutations replace the array). Same trigger frequency as the previous filter-based implementation — no behavior regression.

---

**B. `src/views/DashboardView.vue` — use the extracted groupMatchesByUser**

Read the file in the line-range 630-681 first to confirm the function signature is unchanged.

1. Add the import alongside other util imports:
   `import { groupMatchesByUser } from '../utils/matchGrouping'`

2. DELETE the inline `groupMatchesByUser` function definition (lines ~632-681 in current DashboardView.vue, including the JSDoc comment). The imported function is identical.

3. Verify the single call site (around line ~742, inside `calculateMatches`):
   `const userMatches = groupMatchesByUser(matchingCards, matchingPrefs)`
   This stays unchanged — same name, same signature.

4. The local `UserMatchGroup`-shaped inline type annotations on `userMatches` (if any) can stay or be removed; the imported function returns `Map<string, UserMatchGroup>` which is structurally compatible.

Anti-loop Rule 2: do NOT touch any other part of `calculateMatches`. Plan B owns the larger extraction. This task is import + delete only.

Anti-loop Rule 6: B (matchGrouping wire-up in DashboardView) and the matchExpiry edits from Task 2 both touch DashboardView.vue but they do NOT overlap line ranges. They share the same task-3+task-2 boundary on this file safely. If the executor wants extra safety, run Task 2 → verify build → Task 3 → verify build.
  </action>
  <verify>
    <automated>npm run test:unit && npx vue-tsc --noEmit && npx vite build 2>&1 | tail -10</automated>
  </verify>
  <done>SearchView.vue uses computed-Map ownedCount with O(1) lookup; getOwnedCount no longer calls .filter().reduce() on collectionStore.cards. DashboardView.vue imports groupMatchesByUser from utils and the inline definition is deleted. Type-check + unit tests + build all pass. `grep -n "groupMatchesByUser" src/views/DashboardView.vue` shows ONLY the call site, not a const/function definition.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User collection data → ownedCount Map | Card names from Firestore — read-only, used as Map keys after toLowerCase() |
| PublicCard / PublicPreference → grouping Map | Other-user public data from Firestore, grouped by userId |
| Date input → matchExpiry helper | Date objects from JavaScript runtime, no user-supplied strings |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02A-01 | Tampering | buildOwnedCountMap key collision | accept | Keys are user's own card names; no security boundary crossed (consumer is read-only display) |
| T-02A-02 | Information Disclosure | matchGrouping email field exposure | accept | Email defaults to '' if missing; the helper does not render or transmit; consumer (DashboardView) already exposes the same field in match cards |
| T-02A-03 | Denial of Service | buildOwnedCountMap with huge collection (60k+ cards) | mitigate | O(N) single pass; perf test asserts < 50ms for 10k. Existing collection store already loads into memory — no new attack surface |
| T-02A-04 | Tampering | getMatchExpirationDate input mutation | mitigate | Defensive copy via `new Date(from.getTime())` — explicit unit test confirms input not mutated |
| T-02A-05 | Repudiation | DST shift in lifeExpiresAt across SavedMatches/Dashboard sites | accept | Calendar-day arithmetic now consistent across all 5 sites; UI displays days-only granularity; no audit log relies on minute-precise expiry |
</threat_model>

<verification>
After all three tasks complete:

1. `npm run test:unit` — all tests pass (including the 3 new util suites)
2. `npx vue-tsc --noEmit` — no type errors
3. `npx vite build` — build succeeds (do NOT use `npm run build` — lint gate)
4. Single-source audit:
   - `grep -rn "MATCH_LIFETIME_DAYS = 15" src/` → only `src/utils/matchExpiry.ts`
   - `grep -rn "15 \* 24 \* 60 \* 60" src/` → zero matches
   - `grep -rn "setDate(.*getDate.*15)" src/` → only `src/utils/matchExpiry.ts`
5. groupMatchesByUser audit:
   - `grep -n "const groupMatchesByUser\|function groupMatchesByUser" src/views/DashboardView.vue` → zero matches (definition removed)
   - `grep -n "groupMatchesByUser" src/views/DashboardView.vue` → exactly one (the call site)
6. ownedCount audit:
   - `grep -n "ownedCountByName\|buildOwnedCountMap" src/views/SearchView.vue` → both present
   - `grep -n "collectionStore.cards.filter" src/views/SearchView.vue` → zero matches
</verification>

<success_criteria>
- 3 new utility files exist: src/utils/matchExpiry.ts, src/utils/ownedCount.ts, src/utils/matchGrouping.ts
- 3 new test files exist with passing tests (TDD evidence: tests would fail without the implementation)
- MATCH_LIFETIME_DAYS is defined exactly once (in src/utils/matchExpiry.ts)
- All 5 consumer files (matches.ts, DashboardView, useGlobalSearch, UserProfileView, SavedMatchesView) import the constant from the util — none redeclare it
- SearchView.getOwnedCount uses a computed Map (O(1) per lookup) instead of per-card filter+reduce
- DashboardView no longer defines groupMatchesByUser inline; it imports from src/utils/matchGrouping
- Phase 02 success criterion #3 (SearchView O(1) lookup) — CLOSED
- Phase 02 success criterion #4 (single source for MATCH_LIFETIME_DAYS) — CLOSED
- `npm run test:unit && npx vue-tsc --noEmit && npx vite build` all pass
</success_criteria>

<output>
After completion, create `.planning/phases/02-dashboardview-decomposition/02-A-SUMMARY.md` using the template at `@$HOME/.claude/get-shit-done/templates/summary.md`. Include:
- TDD evidence (RED commit hash → GREEN commit hash, or the diff showing tests existed before implementation)
- The grep-audit results from <verification> step 4-6
- A note that calendar-day expiry math is now consistent across all 5 sites (DST/+ms drift documented)
- A list of any new MATCH_LIFETIME_DAYS / 15-day inline sites that appeared between RESEARCH (2026-04-14) and execution
</output>
