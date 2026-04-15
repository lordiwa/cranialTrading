---
phase: 02-dashboardview-decomposition
plan: C
type: execute
wave: 3
depends_on:
  - A
  - B
files_modified:
  - src/composables/useBlockedUsers.ts
  - src/composables/useClearUserData.ts
  - src/composables/useDashboardPublicSearch.ts
  - tests/unit/composables/useClearUserData.test.ts
  - src/views/DashboardView.vue
autonomous: true
requirements:
  - ARCH-01
  - ARCH-04

must_haves:
  truths:
    - "useBlockedUsers composable exposes blockedUsers, loadingBlockedUsers, showBlockedUsersModal, blockUsernameInput, blockingUser refs and openBlockedUsersModal/loadBlockedUsers/unblockUser/handleBlockByUsername actions"
    - "useClearUserData composable exposes clearDataProgress ref, clearAllData, executeClearData, resumeClearData actions and persists/restores state via localStorage key 'cranial_clear_data_progress'"
    - "useDashboardPublicSearch composable exposes searchQuery, searchResults, searching, searchedOnce, sentInterestIds, suggestions, showSuggestions, scryfallResults, showScryfallFallback, searchContainer refs + searchPublicCards/addToWishlist/handleSearchInput/selectSuggestion/handleClickOutside/sendInterestFromSearch actions"
    - "DashboardView.vue NO LONGER defines blocked-users state/handlers, clear-data state/handlers, public-search state/handlers, the inline duplicate sendInterestFromSearch, or debugPublicCollections"
    - "DashboardView.vue NO LONGER imports addDoc/deleteDoc/getDocs/query/where/limit/doc directly from firebase/firestore"
    - "DashboardView.vue's PublicCardSearchResult interface is removed (the type lives in src/services/publicCards.ts as of Plan B)"
    - "useDashboardPublicSearch's sendInterestFromSearch delegates to useGlobalSearch.sendInterestFromSearch (no duplicated body)"
    - "debugPublicCollections function and its globalThis.window exposure are deleted (verified dead code)"
  artifacts:
    - path: "src/composables/useBlockedUsers.ts"
      provides: "Blocked-users state + Firestore reads/writes (matches_eliminados load + unblock + block-by-username)"
    - path: "src/composables/useClearUserData.ts"
      provides: "Resumable clear-all-data state machine with localStorage persistence"
    - path: "src/composables/useDashboardPublicSearch.ts"
      provides: "Public cards search, Scryfall fallback, auto-suggest dropdown, send-interest delegation"
    - path: "tests/unit/composables/useClearUserData.test.ts"
      provides: "Tests for save/load/clear of clear-data state in localStorage + step progression logic"
  key_links:
    - from: "src/views/DashboardView.vue"
      to: "src/composables/useBlockedUsers.ts + useClearUserData.ts + useDashboardPublicSearch.ts"
      via: "destructured composable returns at top of <script setup>"
    - from: "src/composables/useDashboardPublicSearch.ts sendInterestFromSearch"
      to: "src/composables/useGlobalSearch.ts sendInterestFromSearch"
      via: "delegate call — no duplicated logic"
    - from: "src/composables/useDashboardPublicSearch.ts searchPublicCards"
      to: "src/services/publicCards.ts searchPublicCards"
      via: "import { searchPublicCards as searchPublicCardsService } from '../services/publicCards'"
---

<objective>
Move the remaining three responsibilities out of DashboardView.vue into focused composables: blocked-users management (155 lines), the clear-all-data resumable state machine (~190 lines), and the public-cards search + Scryfall fallback + auto-suggest (~140 lines). Delete the duplicated `sendInterestFromSearch` and the dead `debugPublicCollections` console helper. After this plan, DashboardView's `<script setup>` is just imports + store wiring + composable destructures + thin handlers + the still-async onMounted (which Plan D fixes).

Purpose: Closes ARCH-01 and ARCH-04 fully. Removes the last inline Firestore call sites from DashboardView. Sets the stage for Plan D's < 400-line verification and the async-onMounted fix.

Output: 3 new composables, 1 new test file (useClearUserData state-persistence tests; the other two composables are integration-tested via the existing dashboard E2E + Plan D's new spec), large net-delete from DashboardView.vue.
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
@.planning/phases/02-dashboardview-decomposition/02-B-PLAN.md
@CLAUDE.md

<interfaces>
<!-- ============================================================ -->
<!-- DashboardView source ranges (verified against current code,  -->
<!-- post-Plan-B which already removed match-related code).       -->
<!-- ============================================================ -->

<!-- BLOCKED USERS (DashboardView.vue lines 278-432, ~155 lines):
     interface BlockedUser { odifUserId, username, location?, blockedAt: Date, docIds: string[] }
     refs: showBlockedUsersModal, blockedUsers, loadingBlockedUsers,
           blockUsernameInput, blockingUser
     actions:
       openBlockedUsersModal()  → sets showBlockedUsersModal.value = true; calls loadBlockedUsers()
       loadBlockedUsers()       → reads matches_eliminados, groups by otherUserId
       unblockUser(user)        → confirms, deletes all docIds for that user, removes from local list
       handleBlockByUsername()  → searches /users where('username','==',name), creates matches_eliminados doc
     Firestore calls:
       collection(db, 'users', uid, 'matches_eliminados') + getDocs (load)
       deleteDoc(doc(db, ..., 'matches_eliminados', docId)) (unblock loop)
       collection(db, 'users') + query(where('username','==',name)) + getDocs (lookup)
       collection(db, 'users', uid, 'matches_eliminados') + addDoc (block)
-->

<!-- CLEAR-DATA (DashboardView.vue lines 100-144 + 478-631, ~190 lines):
     types:
       type ClearDataStep = 'cards' | 'preferences' | 'matches_nuevos' |
                            'matches_guardados' | 'matches_eliminados' |
                            'contactos' | 'decks'
       interface ClearDataState { status, completedSteps, currentStep, errors }
       const ALL_CLEAR_STEPS: ClearDataStep[] = [...7 strings]
       const CLEAR_DATA_STORAGE_KEY = 'cranial_clear_data_progress'
     refs: clearDataProgress
     actions:
       saveClearDataState / loadClearDataState / clearClearDataState
       deleteCollectionStep(stepName: ClearDataStep) → deletes ALL docs in user subcollection
       executeClearData()  → orchestrates step-by-step deletion + state save after each
       resumeClearData(savedState) → resumes from completedSteps
       clearAllData()      → confirm modal, then executeClearData
     Firestore calls:
       collection(db, 'users', uid, '<stepName>') + getDocs + deleteDoc loop
       Plus calls into decksStore.clear() for the 'decks' step
     ALSO: dev-only `globalThis.__clearAllData = clearAllData` exposure → KEEP it but expose from the composable level (so window var still works in dev console).
-->

<!-- PUBLIC SEARCH + SCRYFALL FALLBACK + AUTO-SUGGEST (DashboardView.vue lines 149-165 + 957-1077, ~140 lines):
     refs:
       searchQuery, searchResults, searching, searchedOnce, sentInterestIds,
       suggestions, showSuggestions, suppressSuggestions, searchContainer,
       suggestLoading, scryfallResults, showScryfallFallback
     actions:
       handleSearchInput()       → debounced getCardSuggestions(searchQuery), populates suggestions
       selectSuggestion(s)       → sets searchQuery, runs searchPublicCards
       handleClickOutside(e)     → closes dropdown when click is outside searchContainer
       searchPublicCards()       → calls service, falls back to Scryfall on empty
       addToWishlist(scryfallCard) → existing flow (uses collectionStore)
     EVENT LISTENER: handleClickOutside is registered/unregistered by DashboardView's
       onMounted/onUnmounted (lines 434-476). The composable should self-register
       on mount and self-cleanup on unmount via tryOnMounted/tryOnScopeDispose
       (or simple onMounted/onUnmounted) so DashboardView no longer manages it.
-->

<!-- SEND INTEREST DUPLICATION (DashboardView.vue lines 1079-1158):
     `sendInterestFromSearch` is ~80 lines duplicating
     src/composables/useGlobalSearch.ts:180-259 almost verbatim.
     DECISION: useDashboardPublicSearch should NOT re-implement this.
     It should call useGlobalSearch().sendInterestFromSearch(card).
     Note: useGlobalSearch's signature accepts a slightly different card
     shape — check the type compatibility. If the inputs differ
     materially, the composable must adapt by mapping
     PublicCardSearchResult → useGlobalSearch's expected card shape
     before delegating. Document the mapping in the implementation.
-->

<!-- DEAD CODE (DashboardView.vue lines 248-276):
     `debugPublicCollections` async function + globalThis.window exposure.
     RESEARCH §Risk 7 confirms zero callers via grep. SAFE TO DELETE.
     Per Anti-loop Rule 1, run `grep -rn "debugPublicCollections" src/`
     before deleting and confirm only DashboardView.vue is the source.
     Document the deletion in the SUMMARY.
-->

<!-- AUTO-SUGGEST UNIFICATION DECISION (per user Plan-Phase decision #2):
     Prefer extending useSearchSuggestions if feasible. Current state:
       - useSearchSuggestions takes Ref<string>, returns localMatches
         (collection cards) + scryfallSuggestions (string[]) + isLoading +
         showDropdown + clearSuggestions
       - DashboardView's auto-suggest uses ONLY scryfall (no collection mix)
         and exposes `suggestions: string[]` (not the localMatches/scryfall
         split)
     IMPEDANCE MISMATCH: yes, materially different shape. Decision:
     useDashboardPublicSearch implements a thin local debounce around
     getCardSuggestions (preserving DashboardView's exact behavior) and
     leaves a TODO comment pointing at a future
     `useScryfallOnlySuggestions` extraction. Do NOT force-fit
     useSearchSuggestions in this plan — the shape divergence would
     require API changes to useSearchSuggestions which is out of scope.
     Add the TODO comment with a link to RESEARCH §Open Questions #1.
-->

<!-- useGlobalSearch.sendInterestFromSearch signature (verified at
     src/composables/useGlobalSearch.ts:180-259) accepts a card-like
     object and uses Plan-A's getMatchExpirationDate. Calling shape:
     `await sendInterestFromSearch(card)` where card has scryfallId,
     edition, cardName, userId, username, location, quantity, condition,
     foil, price, status. PublicCardSearchResult has all these fields
     with the same names — direct delegation is safe. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create useClearUserData composable + tests for state persistence</name>
  <files>src/composables/useClearUserData.ts, tests/unit/composables/useClearUserData.test.ts</files>
  <behavior>
    - saveClearDataState writes to localStorage under 'cranial_clear_data_progress' as JSON
    - loadClearDataState returns parsed state from localStorage; null if absent or malformed JSON
    - clearClearDataState removes the localStorage key and sets the in-memory ref to null
    - The composable exposes a reactive `clearDataProgress` ref that mirrors localStorage after save/clear
    - Calling saveClearDataState({status:'in_progress', completedSteps:['cards'], currentStep:'preferences', errors:0}) followed by loadClearDataState() → returns equal object
    - loadClearDataState with bad JSON in localStorage returns null and does not throw
    - clearClearDataState is idempotent (calling twice is fine)
  </behavior>
  <action>
**Step 1 (RED) — write the test file first.** Run `npm run test:unit -- useClearUserData` and CONFIRM RED.

`tests/unit/composables/useClearUserData.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useClearUserData } from '@/composables/useClearUserData'

// We don't want to actually trigger any Firestore-backed actions in this
// unit test — only the localStorage state machine is under test.
vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  deleteDoc: vi.fn(),
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'me-id' } }) }))
vi.mock('@/stores/decks', () => ({ useDecksStore: () => ({ clear: vi.fn() }) }))
vi.mock('@/stores/collection', () => ({ useCollectionStore: () => ({}) }))
vi.mock('@/stores/preferences', () => ({ usePreferencesStore: () => ({}) }))
vi.mock('@/stores/matches', () => ({ useMatchesStore: () => ({}) }))
vi.mock('@/stores/toast', () => ({ useToastStore: () => ({ show: vi.fn() }) }))
vi.mock('@/stores/confirm', () => ({ useConfirmStore: () => ({ show: vi.fn().mockResolvedValue(true) }) }))
vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

describe('useClearUserData — localStorage state machine', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saveClearDataState writes JSON to localStorage and updates clearDataProgress', () => {
    const { saveClearDataState, clearDataProgress } = useClearUserData()
    saveClearDataState({
      status: 'in_progress',
      completedSteps: ['cards'],
      currentStep: 'preferences',
      errors: 0,
    })
    const raw = localStorage.getItem('cranial_clear_data_progress')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!).completedSteps).toEqual(['cards'])
    expect(clearDataProgress.value?.currentStep).toBe('preferences')
  })

  it('loadClearDataState returns the previously-saved state', () => {
    const { saveClearDataState, loadClearDataState } = useClearUserData()
    saveClearDataState({
      status: 'in_progress',
      completedSteps: ['cards', 'preferences'],
      currentStep: 'matches_nuevos',
      errors: 1,
    })
    const loaded = loadClearDataState()
    expect(loaded).toEqual({
      status: 'in_progress',
      completedSteps: ['cards', 'preferences'],
      currentStep: 'matches_nuevos',
      errors: 1,
    })
  })

  it('loadClearDataState returns null when storage is empty', () => {
    const { loadClearDataState } = useClearUserData()
    expect(loadClearDataState()).toBeNull()
  })

  it('loadClearDataState returns null when storage has malformed JSON', () => {
    localStorage.setItem('cranial_clear_data_progress', '{not-json')
    const { loadClearDataState } = useClearUserData()
    expect(loadClearDataState()).toBeNull()
  })

  it('clearClearDataState removes the key and sets clearDataProgress to null', () => {
    const { saveClearDataState, clearClearDataState, clearDataProgress } = useClearUserData()
    saveClearDataState({
      status: 'complete',
      completedSteps: ['cards'],
      currentStep: null,
      errors: 0,
    })
    clearClearDataState()
    expect(localStorage.getItem('cranial_clear_data_progress')).toBeNull()
    expect(clearDataProgress.value).toBeNull()
  })

  it('clearClearDataState is idempotent', () => {
    const { clearClearDataState } = useClearUserData()
    clearClearDataState()
    clearClearDataState()
    expect(localStorage.getItem('cranial_clear_data_progress')).toBeNull()
  })
})
```

Run tests, CONFIRM RED.

---

**Step 2 (GREEN) — implement the composable**

`src/composables/useClearUserData.ts`:
```typescript
import { ref } from 'vue'
import { collection, deleteDoc, getDocs } from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuthStore } from '../stores/auth'
import { useCollectionStore } from '../stores/collection'
import { usePreferencesStore } from '../stores/preferences'
import { useMatchesStore } from '../stores/matches'
import { useDecksStore } from '../stores/decks'
import { useToastStore } from '../stores/toast'
import { useConfirmStore } from '../stores/confirm'
import { useI18n } from './useI18n'

export type ClearDataStep =
  | 'cards' | 'preferences' | 'matches_nuevos'
  | 'matches_guardados' | 'matches_eliminados' | 'contactos' | 'decks'

export interface ClearDataState {
  status: 'in_progress' | 'complete' | 'error'
  completedSteps: ClearDataStep[]
  currentStep: ClearDataStep | null
  errors: number
}

const CLEAR_DATA_STORAGE_KEY = 'cranial_clear_data_progress'
const ALL_CLEAR_STEPS: ClearDataStep[] = [
  'cards', 'preferences', 'matches_nuevos',
  'matches_guardados', 'matches_eliminados', 'contactos', 'decks',
]

export function useClearUserData() {
  const authStore = useAuthStore()
  const collectionStore = useCollectionStore()
  const preferencesStore = usePreferencesStore()
  const matchesStore = useMatchesStore()
  const decksStore = useDecksStore()
  const toastStore = useToastStore()
  const confirmStore = useConfirmStore()
  const { t } = useI18n()

  const clearDataProgress = ref<ClearDataState | null>(null)

  const saveClearDataState = (state: ClearDataState): void => {
    try {
      localStorage.setItem(CLEAR_DATA_STORAGE_KEY, JSON.stringify(state))
      clearDataProgress.value = state
    } catch (e) {
      console.warn('[ClearData] Failed to save state:', e)
    }
  }

  const loadClearDataState = (): ClearDataState | null => {
    try {
      const saved = localStorage.getItem(CLEAR_DATA_STORAGE_KEY)
      if (!saved) return null
      return JSON.parse(saved) as ClearDataState
    } catch (e) {
      console.warn('[ClearData] Failed to load state:', e)
      return null
    }
  }

  const clearClearDataState = (): void => {
    try {
      localStorage.removeItem(CLEAR_DATA_STORAGE_KEY)
      clearDataProgress.value = null
    } catch (e) {
      console.warn('[ClearData] Failed to clear state:', e)
    }
  }

  // PORT verbatim from src/views/DashboardView.vue lines 478-631:
  //   - deleteCollectionStep
  //   - executeClearData
  //   - resumeClearData
  //   - clearAllData (with confirmStore + toastStore strings preserved)
  // All references to authStore.user / decksStore.clear() / collectionStore /
  // preferencesStore / matchesStore stay the same — those imports are
  // already in scope above. DO NOT modify the algorithm.
  const deleteCollectionStep = async (_step: ClearDataStep): Promise<number> => {
    // STUB — replace with verbatim port from DashboardView lines 478~520.
    return 0
  }
  const executeClearData = async (): Promise<void> => {
    // STUB — replace with verbatim port from DashboardView lines 521~595.
  }
  const resumeClearData = async (_savedState: ClearDataState): Promise<void> => {
    // STUB — replace with verbatim port from DashboardView lines 596~615.
  }
  const clearAllData = async (): Promise<void> => {
    // STUB — replace with verbatim port from DashboardView lines 616~625.
  }

  return {
    clearDataProgress,
    saveClearDataState,
    loadClearDataState,
    clearClearDataState,
    deleteCollectionStep,
    executeClearData,
    resumeClearData,
    clearAllData,
    ALL_CLEAR_STEPS,
  }
}
```

IMPORTANT: the four action stubs MUST be replaced with verbatim ports from DashboardView (open the current DashboardView.vue, locate lines 478-631, copy each function body in). Anti-loop Rule 2 — do not "improve" the loops or error handling.

After porting, run `npm run test:unit -- useClearUserData` — CONFIRM all PASS (GREEN).

Optional dev-only globalThis exposure (preserves the prior `__clearAllData` console helper):
```typescript
if (import.meta.env.DEV && globalThis.window !== undefined) {
  (globalThis as unknown as Record<string, unknown>).__clearAllData = clearAllData
}
```
Place this at the bottom of the composable factory, after the actions are defined. Note: this fires every time the composable is instantiated; for a single-instance dashboard view this is fine. Document in SUMMARY that the helper is now scoped to `import.meta.env.DEV` (previously DashboardView wrapped it the same way).
  </action>
  <verify>
    <automated>
# Standard test gate first:
npm run test:unit -- useClearUserData && npx vue-tsc --noEmit && npx vite build 2>&1 | tail -10

# Strict-diff discipline (PORT-verbatim guard for 4 clear-data action bodies):
# deleteCollectionStep, executeClearData, resumeClearData, clearAllData were
# lifted from DashboardView.vue (lines ~478-631 per RESEARCH §DashboardView
# Inventory). Their bodies must be byte-equivalent to the originals modulo
# identifier renames — composable already has authStore/decksStore/collectionStore/
# preferencesStore/matchesStore/toastStore/confirmStore/t in scope.
# The gsd-executor commits the pre-port state first, so HEAD~1 has the original.
#
# Run for EACH of the 4 ported functions:
git show HEAD~1:src/views/DashboardView.vue | sed -n '<DELETE_START>,<DELETE_END>p' > /tmp/port-before-delete.txt
cat src/composables/useClearUserData.ts | sed -n '<NEW_DELETE_START>,<NEW_DELETE_END>p' > /tmp/port-after-delete.txt
diff -u /tmp/port-before-delete.txt /tmp/port-after-delete.txt | head -60

git show HEAD~1:src/views/DashboardView.vue | sed -n '<EXEC_START>,<EXEC_END>p' > /tmp/port-before-exec.txt
cat src/composables/useClearUserData.ts | sed -n '<NEW_EXEC_START>,<NEW_EXEC_END>p' > /tmp/port-after-exec.txt
diff -u /tmp/port-before-exec.txt /tmp/port-after-exec.txt | head -120

git show HEAD~1:src/views/DashboardView.vue | sed -n '<RESUME_START>,<RESUME_END>p' > /tmp/port-before-resume.txt
cat src/composables/useClearUserData.ts | sed -n '<NEW_RESUME_START>,<NEW_RESUME_END>p' > /tmp/port-after-resume.txt
diff -u /tmp/port-before-resume.txt /tmp/port-after-resume.txt | head -60

git show HEAD~1:src/views/DashboardView.vue | sed -n '<CLEAR_START>,<CLEAR_END>p' > /tmp/port-before-clear.txt
cat src/composables/useClearUserData.ts | sed -n '<NEW_CLEAR_START>,<NEW_CLEAR_END>p' > /tmp/port-after-clear.txt
diff -u /tmp/port-before-clear.txt /tmp/port-after-clear.txt | head -60

# <*_START>/<*_END> placeholders: executor fills in actual line ranges after
# locating each original (deleteCollectionStep ~478-520, executeClearData ~521-595,
# resumeClearData ~596-615, clearAllData ~616-625) and the new ranges in
# useClearUserData.ts.
#
# DO NOT skip this check. If diff shows wholesale rewrite (logic change,
# dropped toast()/confirm()/localStorage()/saveClearDataState() call,
# reordered loops, simplified error handling), REVERT and port again verbatim.
# Acceptable diffs: identifier renames into the new composable scope only.
    </automated>
  </verify>
  <done>useClearUserData.ts exists with the API listed in must_haves. The 6 state-machine tests pass. The 4 action functions are verbatim ports from DashboardView (verified by side-by-side read). Type-check + build pass. STRICT-DIFF DISCIPLINE: per-function diffs were run for deleteCollectionStep / executeClearData / resumeClearData / clearAllData against HEAD~1 DashboardView.vue (lines ~478-631); reviewer signed off that only identifier renames differ — no toast(), confirm(), localStorage(), or saveClearDataState() call from the originals was dropped, and no loop ordering was changed.</done>
</task>

<task type="auto">
  <name>Task 2: Create useBlockedUsers + useDashboardPublicSearch composables</name>
  <files>src/composables/useBlockedUsers.ts, src/composables/useDashboardPublicSearch.ts</files>
  <action>
Anti-loop Rule 1: read DashboardView.vue lines 278-432 (blocked users) and lines 149-165 + 957-1158 (search + send-interest) in full first.

---

**A. `src/composables/useBlockedUsers.ts`**

```typescript
import { ref } from 'vue'
import { addDoc, collection, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import { useConfirmStore } from '../stores/confirm'
import { useI18n } from './useI18n'
import { getMatchExpirationDate } from '../utils/matchExpiry'

export interface BlockedUser {
  odifUserId: string  // Note: original field name preserved (typo in source)
  username: string
  location?: string
  blockedAt: Date
  docIds: string[]
}

export function useBlockedUsers() {
  const authStore = useAuthStore()
  const toastStore = useToastStore()
  const confirmStore = useConfirmStore()
  const { t } = useI18n()

  const showBlockedUsersModal = ref(false)
  const blockedUsers = ref<BlockedUser[]>([])
  const loadingBlockedUsers = ref(false)
  const blockUsernameInput = ref('')
  const blockingUser = ref(false)

  // PORT verbatim from src/views/DashboardView.vue lines 278-432:
  //   - loadBlockedUsers      (lines ~296-340)
  //   - openBlockedUsersModal (lines ~342-345)
  //   - unblockUser           (lines ~347-380)
  //   - handleBlockByUsername (lines ~385-432)
  // Replace any inline `15 * 24 * 60 * 60 * 1000` math with
  // getMatchExpirationDate() (Plan A canonical helper).
  // Preserve all toast strings, confirm modal copy, and the BlockedUser
  // shape exactly. Anti-loop Rule 2.

  const loadBlockedUsers = async (): Promise<void> => { /* PORT */ }
  const openBlockedUsersModal = async (): Promise<void> => {
    showBlockedUsersModal.value = true
    await loadBlockedUsers()
  }
  const unblockUser = async (_user: BlockedUser): Promise<void> => { /* PORT */ }
  const handleBlockByUsername = async (): Promise<void> => { /* PORT */ }

  return {
    showBlockedUsersModal,
    blockedUsers,
    loadingBlockedUsers,
    blockUsernameInput,
    blockingUser,
    openBlockedUsersModal,
    loadBlockedUsers,
    unblockUser,
    handleBlockByUsername,
  }
}
```

After porting the 4 stubs, `grep -n "15 \* 24 \* 60 \* 60" src/composables/useBlockedUsers.ts` MUST return zero matches (Plan A's canonical helper is the only allowed expiry source).

Anti-loop Rule 6: the original blocked-users template is also duplicated in `src/views/SavedMatchesView.vue`. RESEARCH §Risk 6 flags this as a stretch goal. We are NOT extracting `BlockedUsersModal.vue` as a component in this phase (per user Plan-Phase decision #3). Document this deferral in the SUMMARY.

---

**B. `src/composables/useDashboardPublicSearch.ts`**

```typescript
import { onMounted, onUnmounted, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useCollectionStore } from '../stores/collection'
import { useToastStore } from '../stores/toast'
import { useI18n } from './useI18n'
import { useGlobalSearch } from './useGlobalSearch'
import {
  searchPublicCards as searchPublicCardsService,
  type PublicCardSearchResult,
} from '../services/publicCards'
import { getCardSuggestions, type ScryfallCard, searchCards } from '../services/scryfall'

export function useDashboardPublicSearch() {
  const authStore = useAuthStore()
  const collectionStore = useCollectionStore()
  const toastStore = useToastStore()
  const { t } = useI18n()
  const globalSearch = useGlobalSearch()

  // Search state
  const searchQuery = ref('')
  const searchResults = ref<PublicCardSearchResult[]>([])
  const searching = ref(false)
  const searchedOnce = ref(false)
  const sentInterestIds = ref<Set<string>>(new Set())

  // Auto-suggest state
  const suggestions = ref<string[]>([])
  const showSuggestions = ref(false)
  const suppressSuggestions = ref(false)
  const searchContainer = ref<HTMLElement | null>(null)
  const suggestLoading = ref(false)

  // Scryfall fallback state
  const scryfallResults = ref<ScryfallCard[]>([])
  const showScryfallFallback = ref(false)

  // Debounce handle for auto-suggest
  let suggestDebounce: ReturnType<typeof setTimeout> | null = null

  // PORT verbatim from src/views/DashboardView.vue:
  //   - handleSearchInput      (lines ~959-985)  — debounced getCardSuggestions
  //   - selectSuggestion       (lines ~987-995)
  //   - handleClickOutside     (lines ~997-1010) — closes dropdown when click outside searchContainer
  //   - searchPublicCards      (lines ~1015-1067) — calls service then Scryfall fallback
  //   - addToWishlist          (lines ~1069-1077) — uses collectionStore
  //
  // For searchPublicCards: REPLACE the inline Firestore body
  //   `const cardsRef = collection(db, 'public_cards'); const snap = ...`
  // with a call to `searchPublicCardsService(searchQuery.value, authStore.user.id)`.
  // The service was added in Plan B and matches the prior behavior verbatim.

  const handleSearchInput = async (): Promise<void> => { /* PORT */ }
  const selectSuggestion = async (_s: string): Promise<void> => { /* PORT */ }
  const handleClickOutside = (_e: MouseEvent): void => { /* PORT */ }
  const searchPublicCards = async (): Promise<void> => { /* PORT — uses searchPublicCardsService */ }
  const addToWishlist = async (_card: ScryfallCard): Promise<void> => { /* PORT */ }

  /**
   * Send-interest delegation: the original DashboardView.sendInterestFromSearch
   * (lines 1079-1158) duplicated useGlobalSearch.sendInterestFromSearch almost
   * verbatim. We delegate to the existing composable.
   *
   * PublicCardSearchResult and useGlobalSearch's expected card shape
   * share field names — direct pass-through is safe. If runtime testing
   * reveals a shape mismatch, add an explicit mapping here and document
   * in SUMMARY.
   */
  const sendInterestFromSearch = async (card: PublicCardSearchResult): Promise<void> => {
    if (!authStore.user || sentInterestIds.value.has(card.id)) return
    await globalSearch.sendInterestFromSearch(card as never)
    sentInterestIds.value.add(card.id)
  }

  // Self-manage the document click listener (was DashboardView's responsibility before).
  onMounted(() => {
    document.addEventListener('click', handleClickOutside)
  })
  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
    if (suggestDebounce) clearTimeout(suggestDebounce)
  })

  return {
    searchQuery,
    searchResults,
    searching,
    searchedOnce,
    sentInterestIds,
    suggestions,
    showSuggestions,
    suppressSuggestions,
    searchContainer,
    suggestLoading,
    scryfallResults,
    showScryfallFallback,
    handleSearchInput,
    selectSuggestion,
    handleClickOutside,
    searchPublicCards,
    addToWishlist,
    sendInterestFromSearch,
  }
}
```

TODO comment to include verbatim near the auto-suggest section:
```typescript
// TODO(phase-04+): consider extracting a useScryfallOnlySuggestions
// composable to share debounce logic with useSearchSuggestions. The
// existing useSearchSuggestions mixes collection-local matches with
// scryfall results, which is undesirable in the public-search context.
// See .planning/phases/02-dashboardview-decomposition/RESEARCH.md
// §Open Questions #1.
```

PORT IMPORTANT NOTES:
- `selectSuggestion` likely sets `searchQuery.value = s; suppressSuggestions.value = true; suggestions.value = []; await searchPublicCards()`. Verify exact body.
- `handleClickOutside` should check `searchContainer.value` is set and `!searchContainer.value.contains(e.target as Node)` before closing dropdown.
- `searchPublicCards` MUST set `searching.value = true / false` and `searchedOnce.value = true` and clear/populate `scryfallResults` + `showScryfallFallback` based on whether the service returns results.
- After porting, verify:
  - `grep -n "from 'firebase/firestore'" src/composables/useDashboardPublicSearch.ts` returns ZERO (all firestore goes through the service).
  - `grep -n "addDoc\|getDocs\|deleteDoc" src/composables/useDashboardPublicSearch.ts` returns ZERO.

If the runtime delegation in `sendInterestFromSearch` fails type-check (the `as never` cast is intentional — useGlobalSearch's parameter type is internal and stricter), add a small mapping function:
```typescript
const toGlobalSearchCard = (c: PublicCardSearchResult) => ({
  id: c.id, scryfallId: c.scryfallId ?? '', cardId: c.cardId,
  cardName: c.cardName ?? '', edition: c.edition ?? '',
  condition: c.condition ?? 'NM', foil: c.foil ?? false,
  price: c.price ?? 0, quantity: c.quantity ?? 1,
  image: c.image ?? '', status: c.status ?? 'sale',
  username: c.username ?? '', userId: c.userId ?? '',
  location: c.location ?? '',
})
// then: await globalSearch.sendInterestFromSearch(toGlobalSearchCard(card))
```
Document the chosen approach in the SUMMARY.
  </action>
  <verify>
    <automated>
# Standard test gate first:
npm run test:unit && npx vue-tsc --noEmit && npx vite build 2>&1 | tail -10

# Strict-diff discipline (PORT-verbatim guard for 4 blocked-users + 5 public-search action bodies).
# Both composables were created by lifting bodies out of DashboardView.vue.
# The gsd-executor commits the pre-port state first, so HEAD~1 has the original.
#
# BLOCKED USERS (4 functions, originals at DashboardView.vue lines ~278-432 per RESEARCH):
for fn in loadBlockedUsers openBlockedUsersModal unblockUser handleBlockByUsername; do
  echo "=== diff: $fn ==="
  # Executor fills in <BLOCKED_${fn}_START>/<BLOCKED_${fn}_END> from HEAD~1 DashboardView.vue
  # and <NEW_${fn}_START>/<NEW_${fn}_END> from src/composables/useBlockedUsers.ts.
  # See line range hints: loadBlockedUsers ~296-340, openBlockedUsersModal ~342-345,
  # unblockUser ~347-380, handleBlockByUsername ~385-432.
done

# PUBLIC SEARCH (5 functions, originals at DashboardView.vue lines ~959-1077 per RESEARCH):
for fn in handleSearchInput selectSuggestion handleClickOutside searchPublicCards addToWishlist; do
  echo "=== diff: $fn ==="
  # Executor fills in <SEARCH_${fn}_START>/<SEARCH_${fn}_END> from HEAD~1 DashboardView.vue
  # and <NEW_${fn}_START>/<NEW_${fn}_END> from src/composables/useDashboardPublicSearch.ts.
  # NOTE: searchPublicCards's inline Firestore body IS expected to differ — it's
  # replaced by a call to searchPublicCardsService(). Reviewer must confirm the
  # SHAPE of the function (loading flags, searchedOnce flag, scryfall fallback
  # branch, toast strings) is identical; only the firestore lookup is delegated.
done

# Concrete diff command template (executor instantiates per-function):
# git show HEAD~1:src/views/DashboardView.vue | sed -n '<START>,<END>p' > /tmp/port-before-FN.txt
# cat src/composables/use<Composable>.ts | sed -n '<NEW_START>,<NEW_END>p' > /tmp/port-after-FN.txt
# diff -u /tmp/port-before-FN.txt /tmp/port-after-FN.txt | head -80
#
# DO NOT skip these checks. If any diff shows wholesale rewrite (dropped
# toast()/confirm()/localStorage() call, removed loading flag, reordered
# awaits, simplified error handling), REVERT and port again verbatim.
# Acceptable diffs:
#   - identifier renames (composable already has authStore/toastStore/etc. in scope)
#   - searchPublicCards inline firestore body → searchPublicCardsService() call
#   - sendInterestFromSearch body → globalSearch.sendInterestFromSearch() delegation
#   - 15-day expiry math → getMatchExpirationDate() (Plan A canonical helper)
    </automated>
  </verify>
  <done>Both composables exist with the documented APIs. All inline Firestore calls are gone from useDashboardPublicSearch (delegates to publicCards service). useBlockedUsers preserves the four actions verbatim from DashboardView. No new MATCH_LIFETIME_DAYS or 15-day inline math introduced. Type-check + build pass. STRICT-DIFF DISCIPLINE: per-function diffs were run for the 4 blocked-users actions (loadBlockedUsers, openBlockedUsersModal, unblockUser, handleBlockByUsername) and the 5 public-search actions (handleSearchInput, selectSuggestion, handleClickOutside, searchPublicCards, addToWishlist) against HEAD~1 DashboardView.vue; reviewer signed off that only identifier renames differ (plus the documented searchPublicCards delegation to searchPublicCardsService and the sendInterestFromSearch delegation to useGlobalSearch); no toast(), confirm(), localStorage(), or store-call from the originals was dropped.</done>
</task>

<task type="auto">
  <name>Task 3: Wire all 3 composables into DashboardView, delete moved code, kill debugPublicCollections + duplicate sendInterestFromSearch</name>
  <files>src/views/DashboardView.vue</files>
  <action>
Anti-loop Rule 1: read DashboardView.vue in full (post-Plan-B state, ~1050 lines). Identify and confirm the 3 sections to delete (blocked users, clear data, public search) and the 2 dead-code targets (debugPublicCollections, duplicate sendInterestFromSearch).

---

**Atomic edit list** (apply in order, save once):

1. **Add the 3 composable imports** alongside other composable imports (top of `<script setup>`):
   ```typescript
   import { useBlockedUsers } from '../composables/useBlockedUsers'
   import { useClearUserData } from '../composables/useClearUserData'
   import { useDashboardPublicSearch } from '../composables/useDashboardPublicSearch'
   ```

2. **Add the 3 destructures** after the matchesStore wiring (after `useDashboardMatches()` from Plan B):
   ```typescript
   const {
     showBlockedUsersModal, blockedUsers, loadingBlockedUsers,
     blockUsernameInput, blockingUser,
     openBlockedUsersModal, loadBlockedUsers, unblockUser, handleBlockByUsername,
   } = useBlockedUsers()

   const {
     clearDataProgress, clearAllData, executeClearData, resumeClearData,
     loadClearDataState, clearClearDataState,
   } = useClearUserData()

   const {
     searchQuery, searchResults, searching, searchedOnce, sentInterestIds,
     suggestions, showSuggestions, searchContainer,
     scryfallResults, showScryfallFallback,
     handleSearchInput, selectSuggestion,
     searchPublicCards, addToWishlist, sendInterestFromSearch,
   } = useDashboardPublicSearch()
   ```

3. **Delete the BlockedUser interface** (around lines 279-285) and ALL of:
   - The 5 refs (lines ~287-291): `showBlockedUsersModal`, `blockedUsers`, `loadingBlockedUsers`, `blockUsernameInput`, `blockingUser`
   - `loadBlockedUsers` function
   - `openBlockedUsersModal` function (if defined inline)
   - `unblockUser` function
   - `handleBlockByUsername` function

4. **Delete the ClearData section**:
   - `type ClearDataStep` and `interface ClearDataState` (lines ~102-109)
   - `const CLEAR_DATA_STORAGE_KEY` (line ~111)
   - `const clearDataProgress = ref(...)` (line ~112)
   - `const ALL_CLEAR_STEPS = [...]` (line ~114)
   - `saveClearDataState`, `loadClearDataState`, `clearClearDataState` functions (lines ~116-144)
   - `deleteCollectionStep`, `executeClearData`, `resumeClearData`, `clearAllData` (lines ~478-625)
   - The `if (import.meta.env.DEV) (globalThis as ...)__clearAllData = clearAllData` block (the composable now owns it)

5. **Delete the public-search section**:
   - `const searchQuery / searchResults / searching / searchedOnce / sentInterestIds` (lines ~150-154)
   - Auto-suggest refs `suggestions / showSuggestions / suppressSuggestions / searchContainer / suggestLoading` (lines ~157-161)
   - `scryfallResults / showScryfallFallback` (lines ~164-165)
   - The `interface PublicCardSearchResult` (lines ~52-68) — type now lives in src/services/publicCards.ts (added by Plan B)
   - `handleSearchInput`, `selectSuggestion`, `handleClickOutside`, `searchPublicCards`, `addToWishlist` functions
   - `sendInterestFromSearch` (lines ~1079-1158) — DELETE the duplicate; the composable owns it

6. **Delete `debugPublicCollections`** (lines ~248-271) AND the `globalThis.window !== undefined` exposure block (lines ~273-276). Confirm with `grep -rn "debugPublicCollections" src/` returning ZERO before saving (already verified in RESEARCH §Risk 7; re-confirm).

7. **Delete `syncPublicData` if trivial** — RESEARCH says this is already a thin wrapper around `collectionStore.syncAllToPublic()`. If the template references `syncPublicData`, KEEP a 2-line inline version OR change the template to call `collectionStore.syncAllToPublic()` directly (the latter is preferred). Verify by grep before changing.

8. **Update onMounted** — DO NOT touch the async-onMounted structure (Plan D's job). But the click-listener registration (line 435: `document.addEventListener('click', handleClickOutside)`) is now self-managed by useDashboardPublicSearch's onMounted. DELETE that line from DashboardView's onMounted. Likewise DELETE the corresponding `document.removeEventListener` in onUnmounted (lines ~474-476).
   - The `loadDiscardedMatches` and `calculateMatches` calls inside onMounted now resolve to the composable destructure from Plan B — no change needed there.
   - The `await initMatchData()` (Plan B added) still belongs in onMounted; don't remove.

9. **Trim imports** — after all deletions, audit and remove:
   - `addDoc, collection, deleteDoc, doc, type DocumentData, getDocs, limit, query, where` from `'firebase/firestore'` — ALL should now be unused inside DashboardView.vue. If `type DocumentData` was only used by the removed `PublicCardSearchResult` interface, also gone.
   - `db` from `'../services/firebase'` — likely unused now.
   - `getCardSuggestions, type ScryfallCard, searchCards` from `'../services/scryfall'` — moved to useDashboardPublicSearch.
   - Run `npx vue-tsc --noEmit` — if it complains about an unused import, remove it. If it complains about a missing reference, the corresponding code wasn't deleted; re-check.

10. **Verify the template still compiles** — DashboardView's template (lines 1161-1470) references all the destructured names. They're all still in scope. Composable refs survive destructure (Vue auto-unwraps in template), so no `.value` changes needed.

---

**Atomic-commit checklist before saving:**
- [ ] DashboardView.vue line count is now ~400-500 lines (from ~1050 post-Plan-B). Plan D will verify the < 400 final.
- [ ] `grep -n "interface BlockedUser\|interface ClearDataState\|interface PublicCardSearchResult\|debugPublicCollections" src/views/DashboardView.vue` → ZERO matches.
- [ ] `grep -n "from 'firebase/firestore'" src/views/DashboardView.vue` → ZERO matches.
- [ ] `grep -n "import.*from '../services/firebase'\|from '../services/scryfall'" src/views/DashboardView.vue` → ZERO matches (db and scryfall both moved).
- [ ] `grep -n "useBlockedUsers\|useClearUserData\|useDashboardPublicSearch" src/views/DashboardView.vue` → ONE match each (the destructure).
- [ ] Type-check + tests + build pass.
  </action>
  <verify>
    <automated>npm run test:unit && npx vue-tsc --noEmit && npx vite build 2>&1 | tail -10</automated>
  </verify>
  <done>DashboardView.vue is roughly 500 lines lighter; the 3 composables are wired via destructure; the 5 deleted code blocks are gone (verified by grep); zero firebase/firestore imports remain in DashboardView; type-check + tests + build pass. The template still renders the same UI (manual verification in dev deferred to Plan D's E2E spec).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User-supplied username (block-by-username input) → Firestore query | String passed into `where('username', '==', input)` query |
| LocalStorage (cranial_clear_data_progress) → resumeClearData state | JSON state read on mount; controls which Firestore subcollections get deleted |
| Document click event → handleClickOutside | DOM event used to close auto-suggest dropdown |
| Public search results → sendInterestFromSearch payload | PublicCardSearchResult passed to useGlobalSearch.sendInterestFromSearch |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02C-01 | Tampering | localStorage-driven resumeClearData triggers Firestore deletes | accept | Existing behavior preserved; the user's own subcollections only (Firestore Rules enforce ownership). Worst case: a tampered localStorage causes the user to re-delete already-empty collections — idempotent |
| T-02C-02 | Spoofing | block-by-username Firestore query | accept | Looks up by username then writes only to caller's matches_eliminados; no privilege escalation |
| T-02C-03 | Information Disclosure | useBlockedUsers reads matches_eliminados (caller's subcollection) | accept | Firestore Rules already restrict access; same data read by the prior inline implementation |
| T-02C-04 | Denial of Service | searchPublicCards full-collection scan | accept | Inherited from Plan B's service-level implementation; no new cost in this plan |
| T-02C-05 | Tampering | sendInterestFromSearch shape passed to useGlobalSearch | mitigate | Explicit `toGlobalSearchCard` mapper (if needed) zero-pads optional fields with safe defaults; no untrusted code paths |
| T-02C-06 | Repudiation | clearAllData state machine partial-failure | mitigate | State persisted to localStorage after each step; resumeClearData picks up where it left off — preserved behavior |
| T-02C-07 | Information Disclosure | debugPublicCollections globalThis exposure | mitigate | Removed entirely (dead code). Closes a small dev-time information-leak surface |
</threat_model>

<verification>
After all three tasks complete:

1. `npm run test:unit` — all tests pass (incl. useClearUserData)
2. `npx vue-tsc --noEmit` — no type errors
3. `npx vite build` — succeeds
4. Composable extraction audit:
   - `grep -n "useBlockedUsers\|useClearUserData\|useDashboardPublicSearch" src/views/DashboardView.vue` → 3 matches (the destructures)
   - `grep -n "function loadBlockedUsers\|function executeClearData\|function searchPublicCards\|function debugPublicCollections" src/views/DashboardView.vue` → ZERO
5. Firestore decoupling:
   - `grep -n "from 'firebase/firestore'" src/views/DashboardView.vue` → ZERO
   - `grep -n "addDoc\|getDocs\|deleteDoc" src/views/DashboardView.vue` → ZERO
6. Dead-code deletion:
   - `grep -rn "debugPublicCollections" src/` → ZERO
7. Manual smoke (dev): login → dashboard → open blocked-users modal → modal renders, list loads → close modal → run public search → results appear → click suggestion → search refines → click "send interest" → toast appears
</verification>

<success_criteria>
- 3 new composables exist with the documented APIs
- 1 new test file passes (useClearUserData state-machine tests, TDD evidence)
- DashboardView.vue no longer contains: blocked-users state/functions, clear-data state/functions, public-search state/functions, debugPublicCollections, the duplicate sendInterestFromSearch
- Zero `from 'firebase/firestore'` imports in DashboardView.vue
- ARCH-01 (composable extraction) — CLOSED
- ARCH-04 (Firestore behind services/stores) — CLOSED
- Phase 02 success criterion #1 (no Firestore imports in DashboardView) — CLOSED (line-count check is Plan D)
- `npm run test:unit && npx vue-tsc --noEmit && npx vite build` all pass
</success_criteria>

<output>
After completion, create `.planning/phases/02-dashboardview-decomposition/02-C-SUMMARY.md` using the template at `@$HOME/.claude/get-shit-done/templates/summary.md`. Include:
- TDD evidence for useClearUserData
- Decision and rationale for sendInterestFromSearch shape mapping (direct cast vs. explicit mapper)
- DashboardView.vue line count before (post-Plan-B) and after this plan
- Confirmation that BlockedUsersModal component extraction was deferred (per Plan-Phase decision #3)
- Confirmation that debugPublicCollections was dead code (grep evidence)
- Any new TODOs left behind (e.g. useScryfallOnlySuggestions follow-up)
</output>
