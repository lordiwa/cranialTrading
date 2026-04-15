---
phase: 02-dashboardview-decomposition
plan: B
type: execute
wave: 2
depends_on:
  - A
files_modified:
  - src/stores/matches.ts
  - src/services/publicCards.ts
  - src/services/stats.ts
  - src/composables/useDashboardMatches.ts
  - tests/unit/composables/useDashboardMatches.test.ts
  - tests/unit/stores/matches.persistCalculated.test.ts
  - src/views/DashboardView.vue
autonomous: true
requirements:
  - ARCH-01
  - ARCH-04

must_haves:
  truths:
    - "useMatchesStore exposes loadDiscardedUserIds(): Promise<Set<string>>, persistCalculatedMatches(matches: CalculatedMatch[]): Promise<void>, and discardCalculatedMatch(match: CalculatedMatch): Promise<void>"
    - "discardCalculatedMatch atomically writes to matches_eliminados AND removes any matching docs from matches_nuevos in the same call (preserves DashboardView lines 193-228 behavior)"
    - "persistCalculatedMatches writes to matches_nuevos AND triggers notifyMatchUser cloud-function call (preserves DashboardView saveMatchesToFirebase behavior)"
    - "src/services/publicCards.ts exports searchPublicCards(term, excludeUserId): Promise<PublicCardSearchResult[]>"
    - "src/services/stats.ts exports getTotalUserCount(): Promise<number> (uses getCountFromServer if firebase >= 9.12 else falls back to getDocs(collection))"
    - "useDashboardMatches composable owns calculatedMatches, loading, progressCurrent, progressTotal, totalUsers refs and exposes calculateMatches(), recalculateMatches(), handleSaveMatch(), handleDiscardMatch(), initMatchData(), discardedMatchIds (read-only)"
    - "DashboardView.vue NO LONGER defines calculateMatches, saveMatchesToFirebase, loadDiscardedMatches, discardMatchToFirestore, handleSaveMatch, handleDiscardMatch, recalculateMatches, totalUsers ref, calculatedMatches ref, progressCurrent ref, progressTotal ref"
    - "DashboardView.vue NO LONGER imports findCardsMatchingPreferences, findPreferencesMatchingCards, notifyMatchUser, PublicCard, PublicPreference (those are consumed inside the composable / store now)"
    - "DashboardView.vue still imports CalculatedMatch type — re-exported from useDashboardMatches"
  artifacts:
    - path: "src/composables/useDashboardMatches.ts"
      provides: "Match calculation orchestration (refs + actions); single source for CalculatedMatch interface"
    - path: "src/stores/matches.ts"
      provides: "loadDiscardedUserIds, persistCalculatedMatches, discardCalculatedMatch methods"
    - path: "src/services/publicCards.ts"
      provides: "searchPublicCards(term, excludeUserId) function"
    - path: "src/services/stats.ts"
      provides: "getTotalUserCount() function (single home for the user-count Firestore call)"
    - path: "tests/unit/composables/useDashboardMatches.test.ts"
      provides: "Tests for buildMatchFromUserGroup pure logic (mocked priceMatching)"
    - path: "tests/unit/stores/matches.persistCalculated.test.ts"
      provides: "Tests for the new store methods with mocked firebase"
  key_links:
    - from: "src/views/DashboardView.vue"
      to: "src/composables/useDashboardMatches.ts"
      via: "const { calculatedMatches, loading, totalUsers, progressCurrent, progressTotal, calculateMatches, recalculateMatches, handleSaveMatch, handleDiscardMatch, initMatchData } = useDashboardMatches()"
    - from: "src/composables/useDashboardMatches.ts"
      to: "src/stores/matches.ts loadDiscardedUserIds + persistCalculatedMatches + discardCalculatedMatch"
      via: "matchesStore.loadDiscardedUserIds() / matchesStore.persistCalculatedMatches(found) / matchesStore.discardCalculatedMatch(m)"
    - from: "src/composables/useDashboardMatches.ts"
      to: "src/services/publicCards.ts findCardsMatchingPreferences + findPreferencesMatchingCards"
      via: "direct imports — DashboardView no longer touches publicCards"
    - from: "src/services/stats.ts getTotalUserCount"
      to: "Firestore /users collection count"
      via: "getCountFromServer(collection(db, 'users')) — fallback to getDocs(...).docs.length if SDK feature unavailable"
---

<objective>
Move the entire match-calculation pipeline out of DashboardView.vue. Match-related Firestore operations move into `useMatchesStore` (new methods). The orchestration logic (refs, progress tracking, calculate/save/discard handlers) moves into a new `useDashboardMatches` composable. The `searchPublicCards` Firestore-only call and `getTotalUserCount` aggregation move to the services layer. After this plan, DashboardView's match section is a thin destructure of composable returns.

Purpose: This is the single largest delete from DashboardView.vue (~400 lines). Required by ARCH-01 (composable extraction) and ARCH-04 (no inline Firestore calls). Behavior MUST be preserved exactly — the same matches must be calculated, persisted, and discarded with the same Cloud Function notifications, the same matches_nuevos cleanup on discard, and the same loading/progress reactivity.

Output: 1 new composable, 2 new test files, 2 modified service files (publicCards.ts + new stats.ts), modified matches.ts, ~400-line delete from DashboardView.vue.
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
@.planning/phases/02-dashboardview-decomposition/02-A-PLAN.md
@CLAUDE.md

<interfaces>
<!-- ============================================================ -->
<!-- All interface line numbers verified against codebase as of   -->
<!-- 2026-04-14 RESEARCH.md.                                      -->
<!-- ============================================================ -->

<!-- src/stores/matches.ts public surface (current — 606 lines).
     The store is a defineStore('matches', () => { ... }) factory.
     Existing methods include:
       saveMatch, discardMatch, loadAllMatches, cleanExpiredMatches,
       notifyOtherUser, deleteAllMatches, parseFirestoreMatch,
       calculateExpirationDate (private, removed by Plan A)
     This plan ADDS three new methods. Naming guard: do not collide. -->

<!-- src/services/publicCards.ts existing exports:
     - findCardsMatchingPreferences(myCards, myUserId) → PublicCard[]
     - findPreferencesMatchingCards(myCards, myUserId) → PublicPreference[]
     This plan ADDS searchPublicCards. Naming guard: keep the verb
     `search` distinct from `find` (which already exists for matching). -->

<!-- DashboardView.vue current match-related script lines being moved:
     Line 33-49: CalculatedMatch interface (move to composable, RE-EXPORT
                 so DashboardView still imports it via useDashboardMatches)
     Line 81-86: refs (loading, calculatedMatches, progressCurrent,
                 progressTotal, totalUsers) — all move into composable
     Line 146-147: discardedMatchIds ref (Set<string>) — moves into composable
                   (or the store; planner choice — using composable here)
     Line 171-191: loadDiscardedMatches function — moves into composable as
                   a thin caller of matchesStore.loadDiscardedUserIds()
     Line 193-228: discardMatchToFirestore — moves into store as
                   discardCalculatedMatch (atomic two-step)
     Line 632-681: groupMatchesByUser — already moved by Plan A
     Line 687-843: calculateMatches — moves into composable
     Line 845-914: saveMatchesToFirebase — moves into store as
                   persistCalculatedMatches (also calls notifyMatchUser)
     Line 916-957: handleSaveMatch, handleDiscardMatch, recalculateMatches
                   — move into composable as thin wrappers
     Line 459-460 (inside onMounted): getDocs(collection(db,'users')) for
                  totalUsers — moves to src/services/stats.ts as
                  getTotalUserCount(). The CALL itself stays in
                  DashboardView's onMounted for now (Plan D handles the
                  init refactor); this plan only moves the FUNCTION. -->

<!-- DashboardView.vue lines 1015-1077 (searchPublicCards inline + Scryfall
     fallback + addToWishlist) is NOT touched by Plan B. Plan C owns it
     via useDashboardPublicSearch. The new searchPublicCards SERVICE
     function is created here so Plan C can simply import it. -->

<!-- CalculatedMatch interface (current shape from DashboardView line 33-49):
interface CalculatedMatch {
  id: string
  otherUserId: string
  otherUsername: string
  otherLocation: string
  otherEmail: string
  myCards: unknown[]
  otherCards: unknown[]
  myTotalValue: number
  theirTotalValue: number
  valueDifference: number
  compatibility: number
  type: 'VENDO' | 'BUSCO' | 'BIDIRECTIONAL' | 'UNIDIRECTIONAL'
  createdAt: Date
  lifeExpiresAt: Date
}
-->

<!-- PublicCardSearchResult interface (current shape from DashboardView
     line 51-68) — needed by Plan C's searchPublicCards service signature.
     Place this in src/services/publicCards.ts so both Plan B (service) and
     Plan C (composable) can import it without DashboardView indirection. -->

<!-- notifyMatchUser current signature (src/services/cloudFunctions.ts):
     called from DashboardView line ~880-905. Moves untouched into
     persistCalculatedMatches inside the store. -->

<!-- Firebase SDK version: ^11.0.0 (verified package.json). getCountFromServer
     is available since v9.12 — definitely available in v11. Safe to use
     without fallback, BUT include a try/catch fallback to getDocs for
     defensive programming (some Firestore rule configurations block
     aggregation queries). -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend matches.ts store with 3 new methods + create stats.ts service + extend publicCards.ts service</name>
  <files>src/stores/matches.ts, src/services/stats.ts, src/services/publicCards.ts</files>
  <action>
Anti-loop Rule 1: read all 3 files in full before editing.

---

**A. `src/services/stats.ts` — NEW FILE**

```typescript
/**
 * Lightweight stats service. Uses Firestore aggregation queries when
 * available (cheap, server-side count) with a defensive fallback to
 * full-collection reads.
 */
import { collection, getCountFromServer, getDocs } from 'firebase/firestore'
import { db } from './firebase'

/**
 * Returns the total number of registered users (excluding the calling
 * user is the caller's responsibility — this returns the raw count).
 *
 * Prefers getCountFromServer (Firestore v9.12+; we run firebase ^11.0.0
 * so this is always available). Falls back to a full-collection getDocs
 * if the aggregation query is rejected (e.g. by Firestore Security Rules
 * that don't allow aggregation).
 */
export const getTotalUserCount = async (): Promise<number> => {
  const usersRef = collection(db, 'users')
  try {
    const snapshot = await getCountFromServer(usersRef)
    return snapshot.data().count
  } catch (err) {
    console.warn('[stats] getCountFromServer failed, falling back to getDocs:', err)
    const docsSnap = await getDocs(usersRef)
    return docsSnap.docs.length
  }
}
```

---

**B. `src/services/publicCards.ts` — ADD `searchPublicCards` and the result type**

Read the existing exports first. Append at the end of the file (do not modify existing exports — they're consumed by useDashboardMatches and stay stable):

```typescript
/**
 * Shape of a public_cards search result — matches the inline interface
 * formerly defined in src/views/DashboardView.vue.
 */
export interface PublicCardSearchResult {
  id: string
  cardName?: string
  userId?: string
  edition?: string
  condition?: string
  price?: number
  image?: string
  username?: string
  avatarUrl?: string
  status?: string
  scryfallId?: string
  cardId?: string
  quantity?: number
  foil?: boolean
  location?: string
}

/**
 * Search the denormalized public_cards collection for a card name.
 * Excludes the caller's own cards. Currently does a full-collection
 * scan + client-side substring match (matches DashboardView's prior
 * behavior verbatim — to be optimized in a future phase if scale demands).
 *
 * @param term Search term, case-insensitive substring match on cardName
 * @param excludeUserId Caller's userId — results owned by this user are filtered out
 */
export const searchPublicCards = async (
  term: string,
  excludeUserId: string,
): Promise<PublicCardSearchResult[]> => {
  const trimmed = term.trim()
  if (!trimmed) return []
  const normalised = trimmed.toLowerCase()

  const cardsRef = collection(db, 'public_cards')
  const snapshot = await getDocs(cardsRef)

  const results: PublicCardSearchResult[] = []
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() as PublicCardSearchResult
    if (data.userId === excludeUserId) continue
    const name = (data.cardName ?? '').toLowerCase()
    if (!name.includes(normalised)) continue
    results.push({ ...data, id: docSnap.id })
  }
  return results
}
```

NOTE: this verbatim copy of DashboardView's inline behavior is intentional — Plan C wires it up; behavior parity is the priority. Future scaling (use Firestore where('cardName_lower', '==', x) once a denormalized lower field exists) is out of scope.

---

**C. `src/stores/matches.ts` — ADD 3 methods inside the defineStore factory**

Read the file. Locate the `defineStore('matches', () => { ... })` factory. Inside its body (after existing methods, before the final `return { ... }`), add:

```typescript
/**
 * Load the set of otherUserIds the current user has discarded.
 * Used by useDashboardMatches to filter out previously-discarded matches.
 */
const loadDiscardedUserIds = async (): Promise<Set<string>> => {
  if (!authStore.user) return new Set()
  const discardedRef = collection(db, 'users', authStore.user.id, 'matches_eliminados')
  const snapshot = await getDocs(discardedRef)
  const ids = new Set<string>()
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data()
    if (data.otherUserId) ids.add(data.otherUserId as string)
  }
  return ids
}

/**
 * Atomic discard: write to matches_eliminados AND clean any matching
 * docs from matches_nuevos. Preserves the two-step behavior previously
 * inlined at src/views/DashboardView.vue lines 193-228.
 *
 * NOTE: parameter type is intentionally generic (the calculated-match
 * shape from useDashboardMatches). We accept any object with id +
 * otherUserId + otherUsername + the card arrays; the Firestore write
 * shape is preserved verbatim.
 */
const discardCalculatedMatch = async (match: {
  id: string
  otherUserId: string
  otherUsername: string
  otherLocation: string
  myCards: unknown[]
  otherCards: unknown[]
}): Promise<void> => {
  if (!authStore.user) return

  const discardedRef = collection(db, 'users', authStore.user.id, 'matches_eliminados')
  await addDoc(discardedRef, {
    id: match.id,
    otherUserId: match.otherUserId,
    otherUsername: match.otherUsername,
    otherLocation: match.otherLocation,
    myCards: match.myCards ?? [],
    otherCards: match.otherCards ?? [],
    status: 'eliminado',
    eliminatedAt: new Date(),
    lifeExpiresAt: getMatchExpirationDate(),
  })

  const nuevosRef = collection(db, 'users', authStore.user.id, 'matches_nuevos')
  const nuevosSnapshot = await getDocs(nuevosRef)
  for (const docSnap of nuevosSnapshot.docs) {
    const data = docSnap.data()
    if (data.id === match.id || data.otherUserId === match.otherUserId) {
      await deleteDoc(docSnap.ref)
    }
  }
}

/**
 * Persist a freshly-calculated batch of matches into matches_nuevos.
 * Cleans existing matches_nuevos first (mirrors prior DashboardView
 * saveMatchesToFirebase behavior). Triggers notifyMatchUser cloud
 * function for each persisted match so the recipient gets notified.
 */
const persistCalculatedMatches = async (matches: Array<{
  id: string
  otherUserId: string
  otherUsername: string
  otherLocation: string
  otherEmail?: string
  myCards: unknown[]
  otherCards: unknown[]
  myTotalValue: number
  theirTotalValue: number
  valueDifference: number
  compatibility: number
  type: 'VENDO' | 'BUSCO' | 'BIDIRECTIONAL' | 'UNIDIRECTIONAL'
  createdAt: Date
  lifeExpiresAt: Date
}>): Promise<void> => {
  // BEHAVIOR-PRESERVING PORT of src/views/DashboardView.vue:845-914.
  // Read the original implementation in DashboardView.vue (current line
  // range) and copy the body here verbatim, replacing every `authStore`
  // / `notifyMatchUser` reference with the same names already in scope
  // here in matches.ts.
  // After this method is in place, delete the original from DashboardView.
  // DO NOT rewrite or "improve" the algorithm — Anti-loop Rule 2.
  // Keep the same console.info log lines so existing E2E expectations
  // around log output (if any) still match.
}
```

IMPORTANT: the `persistCalculatedMatches` body above is a stub. Read DashboardView.vue lines 845-914 in full and port the body verbatim into the store. Required imports (already present in matches.ts or to be added):
- `addDoc, collection, deleteDoc, getDocs` from 'firebase/firestore' (already imported — verify)
- `notifyMatchUser` from '../services/cloudFunctions' (ADD if not present)
- `getMatchExpirationDate` from '../utils/matchExpiry' (already added by Plan A)

Inside `persistCalculatedMatches`, all references to `authStore.user` resolve correctly because the store factory already calls `useAuthStore()` at the top.

Add the 3 new methods to the `return { ... }` object so they're publicly callable:
```typescript
return {
  // ... existing exports ...
  loadDiscardedUserIds,
  discardCalculatedMatch,
  persistCalculatedMatches,
}
```

Anti-loop Rule 1: grep `useMatchesStore` for existing method names to confirm no collision — search for `loadDiscardedUserIds`, `discardCalculatedMatch`, `persistCalculatedMatches`. Should be zero hits before this task.
  </action>
  <verify>
    <automated>
# Strict-diff discipline (PORT-verbatim guard for persistCalculatedMatches):
# After the port commit, assert the new body is byte-equivalent to the original
# DashboardView.vue saveMatchesToFirebase (lines 845-914), modulo identifier
# renames into the store scope (e.g. inline references to local-scope refs
# become the same names in the store factory; notifyMatchUser import stays).
# The gsd-executor commits the pre-port state first, so HEAD~1 has the original.
#
# Reviewer (and the executor before commit) MUST run:
git show HEAD~1:src/views/DashboardView.vue | sed -n '<START>,<END>p' > /tmp/port-before-persist.txt
cat src/stores/matches.ts | sed -n '<NEW_START>,<NEW_END>p' > /tmp/port-after-persist.txt
diff -u /tmp/port-before-persist.txt /tmp/port-after-persist.txt | head -120
# <START>/<END> = original line range of saveMatchesToFirebase in DashboardView.vue
#                  (per RESEARCH §DashboardView Inventory: 845-914 — verify before running).
# <NEW_START>/<NEW_END> = new line range of persistCalculatedMatches inside matches.ts.
#
# DO NOT skip this check. If diff shows wholesale rewrite (new control flow,
# removed toast()/notifyMatchUser()/getDocs() calls, reordered loops), REVERT
# the port commit and re-port verbatim. Acceptable diffs: identifier renames
# only (e.g. `authStore` already in scope vs. props), import path adjustments,
# whitespace at function boundaries.
#
# Then run the standard build/test gate:
npm run test:unit && npx vue-tsc --noEmit && npx vite build 2>&1 | tail -10
    </automated>
  </verify>
  <done>src/services/stats.ts exists with getTotalUserCount. src/services/publicCards.ts exports PublicCardSearchResult interface and searchPublicCards function. src/stores/matches.ts exports the 3 new methods via the store's return object, and the persistCalculatedMatches body is the verbatim port from DashboardView. Type-check passes. Build passes. No new unit tests yet (Task 2 adds them). STRICT-DIFF DISCIPLINE: the strict-diff between HEAD~1 DashboardView.vue saveMatchesToFirebase (lines 845-914) and the new persistCalculatedMatches in matches.ts was run; reviewer confirmed only identifier renames differ (no logic changes); no toast(), confirm(), or notifyMatchUser() call from the original was dropped.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create useDashboardMatches composable + write tests for the pure logic + the new store methods</name>
  <files>
    src/composables/useDashboardMatches.ts,
    tests/unit/composables/useDashboardMatches.test.ts,
    tests/unit/stores/matches.persistCalculated.test.ts
  </files>
  <behavior>
    useDashboardMatches.test.ts (focuses on the PURE buildMatchFromUserGroup helper extracted from calculateMatches; the full async pipeline is covered by E2E in Plan D):
      - buildMatchFromUserGroup with a valid bidirectional match → returns CalculatedMatch with type 'BIDIRECTIONAL', correct compatibility, correct lifeExpiresAt date (15 days out)
      - buildMatchFromUserGroup with a valid unidirectional match (bi returns null) → returns CalculatedMatch with type 'UNIDIRECTIONAL'
      - buildMatchFromUserGroup with neither bi nor uni valid → returns null
      - buildMatchFromUserGroup with priceMatching returning isValid=false → returns null
      - The returned CalculatedMatch has stable shape (id, otherUserId, otherUsername, otherLocation, otherEmail, myCards, otherCards, myTotalValue, theirTotalValue, valueDifference, compatibility, type, createdAt, lifeExpiresAt)
      - Mock priceMatching with vi.fn() — no real store usage in the unit test

    matches.persistCalculated.test.ts:
      - loadDiscardedUserIds with no auth user → returns empty Set (no firestore call)
      - loadDiscardedUserIds with auth user → returns Set of otherUserIds from getDocs result
      - discardCalculatedMatch with no auth user → no-op (no firestore writes)
      - discardCalculatedMatch with auth user → addDoc called once on matches_eliminados, and deleteDoc called for each matching doc in matches_nuevos
      - persistCalculatedMatches with empty array → cleans matches_nuevos but does not addDoc
      - persistCalculatedMatches with N matches → cleans matches_nuevos and writes N docs and calls notifyMatchUser N times
      - All firebase functions mocked via vi.mock('firebase/firestore') — no real Firebase
  </behavior>
  <action>
**Step 1 (RED) — write the two test files first**, then run `npm run test:unit -- useDashboardMatches matches.persistCalculated` and CONFIRM all fail.

`tests/unit/composables/useDashboardMatches.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildMatchFromUserGroup } from '@/composables/useDashboardMatches'
import type { UserMatchGroup } from '@/utils/matchGrouping'

const baseGroup: UserMatchGroup = {
  cards: [],
  prefs: [],
  username: 'Other',
  location: 'Loc',
  email: 'other@test',
}

const baseMyCards: any[] = []
const baseMyPreferences: any[] = []

describe('buildMatchFromUserGroup', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2024-06-01T00:00:00Z')) })
  afterEach(() => { vi.useRealTimers() })

  it('returns a BIDIRECTIONAL CalculatedMatch when bidirectional matcher returns valid result', () => {
    const priceMatching = {
      calculateBidirectionalMatch: vi.fn().mockReturnValue({
        isValid: true, compatibility: 90,
        myTotalValue: 100, theirTotalValue: 110, valueDifference: 10,
        myCardsInfo: [{ id: 'mc' }], theirCardsInfo: [{ id: 'tc' }],
        matchType: 'bidirectional',
      }),
      calculateUnidirectionalMatch: vi.fn(),
    }
    const result = buildMatchFromUserGroup(
      'me', 'u1', baseGroup, baseMyCards, baseMyPreferences, priceMatching,
    )
    expect(result).not.toBeNull()
    expect(result!.type).toBe('BIDIRECTIONAL')
    expect(result!.compatibility).toBe(90)
    expect(priceMatching.calculateUnidirectionalMatch).not.toHaveBeenCalled()
  })

  it('falls back to UNIDIRECTIONAL when bidirectional returns null', () => {
    const priceMatching = {
      calculateBidirectionalMatch: vi.fn().mockReturnValue(null),
      calculateUnidirectionalMatch: vi.fn().mockReturnValue({
        isValid: true, compatibility: 70,
        myTotalValue: 50, theirTotalValue: 60, valueDifference: 10,
        myCardsInfo: [], theirCardsInfo: [],
        matchType: 'unidirectional',
      }),
    }
    const result = buildMatchFromUserGroup(
      'me', 'u1', baseGroup, baseMyCards, baseMyPreferences, priceMatching,
    )
    expect(result!.type).toBe('UNIDIRECTIONAL')
  })

  it('returns null when both matchers return null', () => {
    const priceMatching = {
      calculateBidirectionalMatch: vi.fn().mockReturnValue(null),
      calculateUnidirectionalMatch: vi.fn().mockReturnValue(null),
    }
    expect(buildMatchFromUserGroup('me', 'u1', baseGroup, baseMyCards, baseMyPreferences, priceMatching)).toBeNull()
  })

  it('returns null when matcher returns isValid:false', () => {
    const priceMatching = {
      calculateBidirectionalMatch: vi.fn().mockReturnValue({ isValid: false, compatibility: 0 }),
      calculateUnidirectionalMatch: vi.fn().mockReturnValue({ isValid: false, compatibility: 0 }),
    }
    expect(buildMatchFromUserGroup('me', 'u1', baseGroup, baseMyCards, baseMyPreferences, priceMatching)).toBeNull()
  })

  it('sets lifeExpiresAt 15 calendar days after createdAt', () => {
    const priceMatching = {
      calculateBidirectionalMatch: vi.fn().mockReturnValue({
        isValid: true, compatibility: 50,
        myTotalValue: 0, theirTotalValue: 0, valueDifference: 0,
        myCardsInfo: [], theirCardsInfo: [],
        matchType: 'bidirectional',
      }),
      calculateUnidirectionalMatch: vi.fn(),
    }
    const result = buildMatchFromUserGroup('me', 'u1', baseGroup, baseMyCards, baseMyPreferences, priceMatching)!
    const diffDays = (result.lifeExpiresAt.getTime() - result.createdAt.getTime()) / 86_400_000
    // calendar-day setDate may give 14.95-15.05 over DST; 14 < diffDays <= 15 is acceptable
    expect(diffDays).toBeGreaterThan(14)
    expect(diffDays).toBeLessThanOrEqual(15.05)
  })
})
```

`tests/unit/stores/matches.persistCalculated.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(() => ({})),
  query: vi.fn(),
  where: vi.fn(),
  Timestamp: { fromDate: (d: Date) => d, now: () => new Date() },
}))
vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('@/services/cloudFunctions', () => ({
  notifyMatchUser: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'me-id', username: 'me' } }),
}))
vi.mock('@/stores/toast', () => ({
  useToastStore: () => ({ show: vi.fn() }),
}))

import { useMatchesStore } from '@/stores/matches'
import { addDoc, deleteDoc, getDocs } from 'firebase/firestore'
import { notifyMatchUser } from '@/services/cloudFunctions'

describe('useMatchesStore — new persistCalculated/discardCalculated/loadDiscarded methods', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loadDiscardedUserIds returns Set of otherUserIds from snapshot', async () => {
    ;(getDocs as any).mockResolvedValue({
      docs: [
        { data: () => ({ otherUserId: 'u1' }) },
        { data: () => ({ otherUserId: 'u2' }) },
        { data: () => ({}) }, // missing — skipped
      ],
    })
    const store = useMatchesStore()
    const ids = await store.loadDiscardedUserIds()
    expect(ids.size).toBe(2)
    expect(ids.has('u1')).toBe(true)
    expect(ids.has('u2')).toBe(true)
  })

  it('discardCalculatedMatch writes to matches_eliminados then deletes matching matches_nuevos docs', async () => {
    const ref1 = { id: 'd1' }
    const ref2 = { id: 'd2' }
    ;(getDocs as any).mockResolvedValue({
      docs: [
        { ref: ref1, data: () => ({ id: 'm1', otherUserId: 'u1' }) },
        { ref: ref2, data: () => ({ id: 'm-other', otherUserId: 'u-other' }) },
      ],
    })
    const store = useMatchesStore()
    await store.discardCalculatedMatch({
      id: 'm1', otherUserId: 'u1', otherUsername: 'A', otherLocation: '',
      myCards: [], otherCards: [],
    })
    expect(addDoc).toHaveBeenCalledTimes(1)
    expect(deleteDoc).toHaveBeenCalledTimes(1)
    expect(deleteDoc).toHaveBeenCalledWith(ref1)
  })

  it('persistCalculatedMatches writes N docs and calls notifyMatchUser N times', async () => {
    ;(getDocs as any).mockResolvedValue({ docs: [] }) // empty existing matches_nuevos
    const store = useMatchesStore()
    const matches = [
      {
        id: 'a', otherUserId: 'u1', otherUsername: 'A', otherLocation: '', otherEmail: '',
        myCards: [], otherCards: [], myTotalValue: 0, theirTotalValue: 0, valueDifference: 0,
        compatibility: 50, type: 'BIDIRECTIONAL' as const, createdAt: new Date(), lifeExpiresAt: new Date(),
      },
      {
        id: 'b', otherUserId: 'u2', otherUsername: 'B', otherLocation: '', otherEmail: '',
        myCards: [], otherCards: [], myTotalValue: 0, theirTotalValue: 0, valueDifference: 0,
        compatibility: 50, type: 'UNIDIRECTIONAL' as const, createdAt: new Date(), lifeExpiresAt: new Date(),
      },
    ]
    await store.persistCalculatedMatches(matches)
    expect(addDoc).toHaveBeenCalledTimes(2)
    expect(notifyMatchUser).toHaveBeenCalledTimes(2)
  })
})
```

Run tests, CONFIRM RED.

---

**Step 2 (GREEN) — implement the composable**

`src/composables/useDashboardMatches.ts`:
```typescript
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useCollectionStore } from '../stores/collection'
import { usePreferencesStore } from '../stores/preferences'
import { useMatchesStore } from '../stores/matches'
import { usePriceMatchingStore } from '../stores/priceMatchingHelper'
import { useConfirmStore } from '../stores/confirm'
import { useToastStore } from '../stores/toast'
import { useI18n } from './useI18n'
import {
  findCardsMatchingPreferences,
  findPreferencesMatchingCards,
} from '../services/publicCards'
import { groupMatchesByUser, type UserMatchGroup } from '../utils/matchGrouping'
import { getMatchExpirationDate } from '../utils/matchExpiry'
import { getTotalUserCount } from '../services/stats'
import type { CardCondition, CardStatus } from '../types/card'

/** Calculated match shape produced by the dashboard matching logic */
export interface CalculatedMatch {
  id: string
  otherUserId: string
  otherUsername: string
  otherLocation: string
  otherEmail: string
  myCards: unknown[]
  otherCards: unknown[]
  myTotalValue: number
  theirTotalValue: number
  valueDifference: number
  compatibility: number
  type: 'VENDO' | 'BUSCO' | 'BIDIRECTIONAL' | 'UNIDIRECTIONAL'
  createdAt: Date
  lifeExpiresAt: Date
}

/**
 * Pure function: build a CalculatedMatch from a user's grouped cards/prefs.
 * Extracted from the per-user loop body of the original calculateMatches
 * (DashboardView.vue:748-820). Unit-testable with a mocked priceMatching.
 *
 * Exported separately for unit testing.
 */
export function buildMatchFromUserGroup(
  myUserId: string,
  otherUserId: string,
  data: UserMatchGroup,
  myCards: any[],
  myPreferences: any[],
  priceMatching: {
    calculateBidirectionalMatch: (...a: any[]) => any
    calculateUnidirectionalMatch: (...a: any[]) => any
  },
): CalculatedMatch | null {
  const theirCards = data.cards.map(c => ({
    id: c.cardId,
    name: c.cardName,
    scryfallId: c.scryfallId,
    price: c.price,
    edition: c.edition,
    condition: c.condition as CardCondition,
    foil: c.foil,
    quantity: c.quantity,
    image: c.image,
    status: c.status as CardStatus,
    updatedAt: c.updatedAt?.toDate() ?? new Date(),
    createdAt: c.updatedAt?.toDate() ?? new Date(),
  }))

  const theirPreferences = data.prefs.map(p => ({
    id: p.prefId,
    name: p.cardName,
    cardName: p.cardName,
    scryfallId: p.scryfallId,
    maxPrice: p.maxPrice,
    minCondition: p.minCondition,
    type: 'BUSCO' as const,
    quantity: 1,
    condition: 'NM' as const,
    edition: '',
    image: '',
    createdAt: p.updatedAt?.toDate() ?? new Date(),
  }))

  let matchCalc = priceMatching.calculateBidirectionalMatch(
    myCards, myPreferences, theirCards, theirPreferences,
  )
  matchCalc ??= priceMatching.calculateUnidirectionalMatch(
    myCards, myPreferences, theirCards, theirPreferences,
  )

  if (!matchCalc?.isValid) return null

  const createdAt = new Date()
  return {
    id: `${myUserId}_${otherUserId}_${Date.now()}`,
    otherUserId,
    otherUsername: data.username,
    otherLocation: data.location,
    otherEmail: data.email,
    myCards: matchCalc.myCardsInfo ?? [],
    otherCards: matchCalc.theirCardsInfo ?? [],
    myTotalValue: matchCalc.myTotalValue,
    theirTotalValue: matchCalc.theirTotalValue,
    valueDifference: matchCalc.valueDifference,
    compatibility: matchCalc.compatibility,
    type: matchCalc.matchType === 'bidirectional' ? 'BIDIRECTIONAL' : 'UNIDIRECTIONAL',
    createdAt,
    lifeExpiresAt: getMatchExpirationDate(createdAt),
  }
}

/**
 * useDashboardMatches — orchestrates the calculate / save / discard
 * pipeline for the dashboard match section. Owns its own reactive state
 * (refs returned to the caller).
 */
export function useDashboardMatches() {
  const authStore = useAuthStore()
  const collectionStore = useCollectionStore()
  const preferencesStore = usePreferencesStore()
  const matchesStore = useMatchesStore()
  const priceMatching = usePriceMatchingStore()
  const confirmStore = useConfirmStore()
  const toastStore = useToastStore()
  const { t } = useI18n()

  const calculatedMatches = ref<CalculatedMatch[]>([])
  const loading = ref(false)
  const progressCurrent = ref(0)
  const progressTotal = ref(0)
  const totalUsers = ref(0)
  const discardedMatchIds = ref<Set<string>>(new Set())

  /** Load discarded user IDs (called by initMatchData / on demand). */
  const loadDiscardedMatches = async (): Promise<void> => {
    discardedMatchIds.value = await matchesStore.loadDiscardedUserIds()
  }

  /**
   * Calculate matches by pulling the caller's collection + preferences
   * and running them against the public_cards / public_preferences
   * indexes. Behavior-preserving port of DashboardView calculateMatches
   * (lines 687-843) — DO NOT optimize the algorithm.
   */
  const calculateMatches = async (): Promise<void> => {
    if (!authStore.user) return
    loading.value = true
    progressCurrent.value = 0
    progressTotal.value = 0
    calculatedMatches.value = []

    try {
      const myCards = collectionStore.cards
      const myWishlist = myCards.filter(c => c.status === 'wishlist')
      const myPreferences = myWishlist.map(c => ({
        id: c.id, name: c.name, cardName: c.name, scryfallId: c.scryfallId,
        maxPrice: c.price || 0, minCondition: c.condition,
        type: 'BUSCO' as const, quantity: c.quantity || 1,
        condition: c.condition, edition: c.edition, image: c.image,
        createdAt: c.createdAt ?? new Date(),
      }))

      progressTotal.value = 2
      progressCurrent.value = 1
      const matchingCards = await findCardsMatchingPreferences(myWishlist, authStore.user.id)

      progressCurrent.value = 2
      const matchingPrefs = await findPreferencesMatchingCards(myCards, authStore.user.id)

      const userMatches = groupMatchesByUser(matchingCards, matchingPrefs)

      progressTotal.value = userMatches.size + 2
      const foundMatches: CalculatedMatch[] = []
      let userIndex = 0

      for (const [otherUserId, data] of userMatches) {
        progressCurrent.value = userIndex + 3
        userIndex++
        const built = buildMatchFromUserGroup(
          authStore.user.id, otherUserId, data, myCards, myPreferences, priceMatching,
        )
        if (built) foundMatches.push(built)
      }

      foundMatches.sort((a, b) => b.compatibility - a.compatibility)
      calculatedMatches.value = foundMatches.filter(m => !discardedMatchIds.value.has(m.otherUserId))

      if (foundMatches.length > 0) {
        await matchesStore.persistCalculatedMatches(foundMatches)
      }

      await matchesStore.loadAllMatches()
    } catch (error) {
      console.error('Error calculando matches:', error)
    } finally {
      loading.value = false
      progressCurrent.value = 0
      progressTotal.value = 0
    }
  }

  /** Force a recalculation (same as calculateMatches today; kept distinct for UI semantics). */
  const recalculateMatches = async (): Promise<void> => {
    await calculateMatches()
  }

  /** Save handler — defers to existing matchesStore.saveMatch. */
  const handleSaveMatch = async (match: CalculatedMatch): Promise<void> => {
    // PORT verbatim from DashboardView.vue handleSaveMatch (current ~line 916-935).
    // Reads the original closure, calls matchesStore.saveMatch, shows toast.
    // Do not "improve" — Anti-loop Rule 2.
  }

  /** Discard handler — confirms then delegates to store.discardCalculatedMatch. */
  const handleDiscardMatch = async (match: CalculatedMatch): Promise<void> => {
    // PORT verbatim from DashboardView.vue handleDiscardMatch (current ~line 937-957).
    // Confirms via confirmStore, calls matchesStore.discardCalculatedMatch,
    // updates calculatedMatches.value to filter out the discarded match,
    // updates discardedMatchIds.value to add otherUserId, shows toast.
  }

  /** Load discarded + total user count (called from DashboardView onMounted). */
  const initMatchData = async (): Promise<void> => {
    await loadDiscardedMatches()
    totalUsers.value = await getTotalUserCount() - 1 // exclude self, matches prior behavior
  }

  return {
    calculatedMatches,
    loading,
    progressCurrent,
    progressTotal,
    totalUsers,
    discardedMatchIds,
    loadDiscardedMatches,
    calculateMatches,
    recalculateMatches,
    handleSaveMatch,
    handleDiscardMatch,
    initMatchData,
  }
}
```

IMPORTANT — both `handleSaveMatch` and `handleDiscardMatch` bodies above are stubs. Open `src/views/DashboardView.vue` and locate the current implementations (RESEARCH says lines 916-957). Port the bodies verbatim. The toast strings, confirm-store calls, and the post-discard local-state updates must be preserved exactly. After porting, run tests + build to confirm.

Run `npm run test:unit -- useDashboardMatches matches.persistCalculated` — CONFIRM all PASS (GREEN).
  </action>
  <verify>
    <automated>
# Standard test gate first — composable unit tests must pass:
npm run test:unit -- useDashboardMatches matches.persistCalculated

# Strict-diff discipline (PORT-verbatim guard for handleSaveMatch + handleDiscardMatch):
# Both handlers were lifted out of DashboardView.vue (lines ~916-957 per
# RESEARCH §DashboardView Inventory). Their bodies must be byte-equivalent
# to the originals modulo identifier renames (props/store destructures
# already in scope inside the composable; no toast()/confirmStore.show()/
# matchesStore.discardCalculatedMatch() call may be dropped or reordered).
# The gsd-executor commits the pre-port state first, so HEAD~1 has the original.

git show HEAD~1:src/views/DashboardView.vue | sed -n '<HSAVE_START>,<HSAVE_END>p' > /tmp/port-before-handleSave.txt
cat src/composables/useDashboardMatches.ts | sed -n '<NEW_HSAVE_START>,<NEW_HSAVE_END>p' > /tmp/port-after-handleSave.txt
diff -u /tmp/port-before-handleSave.txt /tmp/port-after-handleSave.txt | head -80

git show HEAD~1:src/views/DashboardView.vue | sed -n '<HDISC_START>,<HDISC_END>p' > /tmp/port-before-handleDiscard.txt
cat src/composables/useDashboardMatches.ts | sed -n '<NEW_HDISC_START>,<NEW_HDISC_END>p' > /tmp/port-after-handleDiscard.txt
diff -u /tmp/port-before-handleDiscard.txt /tmp/port-after-handleDiscard.txt | head -80

# <HSAVE_*> / <HDISC_*> placeholders: executor fills in actual line ranges after
# locating the originals (handleSaveMatch ~lines 916-935; handleDiscardMatch
# ~lines 937-957) and the new ranges in useDashboardMatches.ts.
#
# DO NOT skip this check. If either diff shows wholesale rewrite (logic change,
# dropped toast()/confirm()/store calls, reordered awaits), REVERT and port
# again verbatim. Acceptable diffs: identifier renames, import path adjustments.
    </automated>
  </verify>
  <done>useDashboardMatches.ts exists with the public API listed in must_haves.truths. Both new test files pass. The composable's calculateMatches algorithm is line-for-line equivalent to the prior DashboardView implementation (verified by reading both side-by-side). STRICT-DIFF DISCIPLINE: strict-diff was run for handleSaveMatch and handleDiscardMatch (HEAD~1 DashboardView.vue lines ~916-957 vs. the new bodies in useDashboardMatches.ts); reviewer confirmed only identifier renames differ; no toast(), confirm(), localStorage(), or store-call from the originals was dropped.</done>
</task>

<task type="auto">
  <name>Task 3: Wire useDashboardMatches into DashboardView and delete the ~400 lines of moved logic</name>
  <files>src/views/DashboardView.vue</files>
  <action>
Anti-loop Rule 1: read DashboardView.vue in full first. Note the 6 remaining sections that STAY in DashboardView (this task only deletes match-related code):
- Imports (will trim)
- Types: `PublicCardSearchResult` (Plan C will move it; for THIS plan it stays)
- Stores: `useCollectionStore`, `usePreferencesStore`, `useAuthStore`, `useDecksStore`, `useToastStore`, `useConfirmStore` (kept; some used by C/D)
- Clear-data state (lines 100-144 + 478-631) — Plan C owns
- Blocked users (lines 278-432) — Plan C owns
- Public search + Scryfall fallback + sendInterestFromSearch (lines 957-1158) — Plan C owns
- onMounted (lines 434-472) — Plan D owns; Plan B touches only the 2 lines that reference moved functions

---

**Atomic edit list (apply in order, save once at the end):**

1. **Add the composable import** near the other composable imports:
   ```typescript
   import { useDashboardMatches, type CalculatedMatch } from '../composables/useDashboardMatches'
   ```

2. **Remove these imports** (no longer used by DashboardView):
   - `findCardsMatchingPreferences, findPreferencesMatchingCards, type PublicCard, type PublicPreference` from `'../services/publicCards'` — keep ONLY `type PublicCard` and `type PublicPreference` IF they're still referenced by remaining `PublicCardSearchResult` / `searchResults` code (verify with grep). Likely they can be removed entirely; the new composable owns them.
   - `notifyMatchUser` from `'../services/cloudFunctions'` — moved to store.
   - `usePriceMatchingStore` import + `priceMatching` const — moved to composable.
   - `type MatchCard as MatchCardType, type SimpleMatch` — verify usage; if only used in moved functions, remove.
   - `type CardCondition, type CardStatus` — moved to composable; verify no template usage.
   - `type DocumentData` from firebase/firestore — keep ONLY if PublicCardSearchResult or other remaining types reference it (likely yes — keep).

3. **Delete the inline `CalculatedMatch` interface** (lines ~33-49). The composable re-exports it; the import added in step 1 covers the type.

4. **Delete these top-level refs** (now owned by composable):
   - `const loading = ref(false)`
   - `const calculatedMatches = ref<CalculatedMatch[]>([])`
   - `const progressCurrent = ref(0)`
   - `const progressTotal = ref(0)`
   - `const totalUsers = ref(0)`
   - `const discardedMatchIds = ref<Set<string>>(new Set())`

5. **Add the destructure** immediately after the store wirings (around line 79):
   ```typescript
   const {
     calculatedMatches,
     loading,
     progressCurrent,
     progressTotal,
     totalUsers,
     discardedMatchIds,
     calculateMatches,
     recalculateMatches,
     handleSaveMatch,
     handleDiscardMatch,
     initMatchData,
   } = useDashboardMatches()
   ```

6. **Delete these function definitions** (entire bodies):
   - `loadDiscardedMatches` (lines ~171-191)
   - `discardMatchToFirestore` (lines ~193-228)
   - `calculateMatches` (lines ~687-843)
   - `saveMatchesToFirebase` (lines ~845-914)
   - `handleSaveMatch` (lines ~916-935)
   - `handleDiscardMatch` (lines ~937-955)
   - `recalculateMatches` (lines ~955-957) — verify exact line range first

7. **Update onMounted** (Plan B only touches the 2 references that reference moved code):
   - Replace `await loadDiscardedMatches()` with `await initMatchData()` — wait, `initMatchData` is async so it must stay awaited inside the (still-async) onMounted. Plan D will fix the async-onMounted itself.
   - Replace the `getDocs(usersRef)` block (lines ~459-461) with: `// totalUsers loaded by initMatchData()` comment AND remove the `usersRef`/`usersSnapshot`/`totalUsers.value = ...` lines (initMatchData populates totalUsers).
   - The `await calculateMatches()` call at line ~470 still works — calculateMatches is now from the destructure.
   - Keep the `loading.value = true` / `finally { loading.value = false }` wrappers — they reference the composable's `loading` ref via the destructure; reactivity preserved (refs survive destructure).

8. **Verify template** (DashboardView lines 1161-1470) still compiles. The template references `loading`, `calculatedMatches`, `progressCurrent`, `progressTotal`, `totalUsers`, `handleSaveMatch`, `handleDiscardMatch`, `recalculateMatches` — all still in scope via destructure. NO template changes needed.

---

**Atomic-commit checklist before saving:**
- [ ] DashboardView.vue line count is meaningfully smaller (~ -400 lines from current 1470 → ~1050. Plan C will trim further; Plan D verifies < 400.)
- [ ] `grep -n "calculateMatches\|saveMatchesToFirebase\|discardMatchToFirestore\|loadDiscardedMatches" src/views/DashboardView.vue` shows ONLY the destructure line and the call sites (no `const` / `function` definitions).
- [ ] `grep -n "findCardsMatchingPreferences\|findPreferencesMatchingCards\|notifyMatchUser\|usePriceMatchingStore" src/views/DashboardView.vue` returns ZERO matches.
- [ ] `grep -n "from 'firebase/firestore'" src/views/DashboardView.vue` — count of firestore imports is REDUCED (some may remain because Plan C still has searchPublicCards/sendInterestFromSearch inline). Final zero check is Plan D's job.
- [ ] Type-check + build pass.
  </action>
  <verify>
    <automated>npm run test:unit && npx vue-tsc --noEmit && npx vite build 2>&1 | tail -10</automated>
  </verify>
  <done>DashboardView.vue is roughly 400 lines shorter. The 7 moved functions are gone (verified by grep). The composable destructure is in place and the template still renders the same data. Type-check + tests + build all pass. Manual smoke test (loading the dashboard) is deferred to Plan D's E2E.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User auth (authStore.user) → store/composable methods | All match operations gate on authStore.user — no auth = no Firestore writes |
| Other users' public_cards/public_preferences → calculated matches | Public collections written by other users; consumed read-only via Firestore Security Rules |
| Calculated match data → matches_nuevos write | Only the calling user's own subcollection is written; Firestore rules enforce ownership |
| Cloud Function notifyMatchUser | Receives sender + recipient userId; backend validates the caller's auth token |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02B-01 | Spoofing | persistCalculatedMatches notifyMatchUser call | accept | Cloud Function validates caller via Firebase Auth context; not a new attack surface (existing behavior preserved) |
| T-02B-02 | Tampering | discardCalculatedMatch atomicity (eliminate write + nuevos delete) | mitigate | Both operations live in same store method; unit test asserts both addDoc + deleteDoc are called |
| T-02B-03 | Information Disclosure | searchPublicCards reads ALL public_cards client-side | accept | public_cards is a public-by-design index (already exposed via Firestore Rules as user-readable); no new disclosure |
| T-02B-04 | Denial of Service | searchPublicCards full-collection scan | accept | Behavior-preserving port; future optimization tracked separately. No worse than prior DashboardView behavior |
| T-02B-05 | Denial of Service | getTotalUserCount full /users read | mitigate | Use getCountFromServer first (server-side aggregation, ~O(1) cost); fallback to getDocs only on rules rejection |
| T-02B-06 | Repudiation | persistCalculatedMatches without atomic transaction | accept | Existing behavior preserved; matches_nuevos cleanup happens before writes — partial failure leaves user with empty matches list, recoverable by re-running calculateMatches |
</threat_model>

<verification>
After all three tasks complete:

1. `npm run test:unit` — all tests pass (including 2 new test files with all listed cases)
2. `npx vue-tsc --noEmit` — no type errors
3. `npx vite build` — succeeds
4. Function-removal audit:
   - `grep -n "const calculateMatches\|const saveMatchesToFirebase\|const loadDiscardedMatches\|const discardMatchToFirestore" src/views/DashboardView.vue` → ZERO matches
5. Composable wiring audit:
   - `grep -n "useDashboardMatches" src/views/DashboardView.vue` → ONE match (the destructure)
   - `grep -n "useDashboardMatches" src/composables/` → defines + tests reference
6. Service-layer audit:
   - `grep -n "getCountFromServer\|getTotalUserCount" src/services/stats.ts` → both present
   - `grep -n "searchPublicCards" src/services/publicCards.ts` → present
   - `grep -n "getDocs(collection(db, 'users')" src/views/DashboardView.vue` → ZERO (moved to stats service)
7. Manual dashboard load (dev): login → dashboard appears → press recalculate → matches appear → save one → discard one → reload → state preserved (no async-onMounted regression yet because Plan D hasn't touched it; loading must still work as before)
</verification>

<success_criteria>
- `useDashboardMatches` composable exists with the public API in must_haves.truths
- `useMatchesStore` exposes loadDiscardedUserIds, persistCalculatedMatches, discardCalculatedMatch
- `src/services/publicCards.ts` exports searchPublicCards + PublicCardSearchResult interface
- `src/services/stats.ts` exists with getTotalUserCount
- DashboardView.vue no longer defines the 7 moved functions and is ~400 lines shorter
- DashboardView.vue's onMounted no longer calls findCardsMatchingPreferences/findPreferencesMatchingCards/notifyMatchUser directly
- 2 new test files pass (TDD evidence: tests written before implementation)
- Phase 02 success criterion #1 (DashboardView < 400 lines + no Firestore imports) — PARTIALLY CLOSED (final cleanup in Plan D)
- ARCH-01 (composable extraction for matches) — CLOSED
- ARCH-04 (match Firestore calls behind services/stores) — PARTIALLY CLOSED (Plan C closes the rest)
- `npm run test:unit && npx vue-tsc --noEmit && npx vite build` all pass
</success_criteria>

<output>
After completion, create `.planning/phases/02-dashboardview-decomposition/02-B-SUMMARY.md` using the template at `@$HOME/.claude/get-shit-done/templates/summary.md`. Include:
- TDD evidence (RED → GREEN commits or test-first diff)
- DashboardView.vue line-count before/after
- The grep-audit results from <verification> step 4-6
- Verbatim port confirmation: a side-by-side diff of `calculateMatches` original vs. composable version, asserting NO algorithm changes
- Any naming collisions discovered with existing matchesStore methods (should be none)
</output>
