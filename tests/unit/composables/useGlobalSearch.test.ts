/**
 * Unit tests for useGlobalSearch composable — Plan 04-01.
 *
 * Tests cover:
 * - moveHighlight (arrow/home/end navigation, wrap, no-op on empty, activeDescendantId)
 * - activeTab watcher (highlight reset on tab switch)
 * - isExpanded computed (open+loading/results logic)
 * - selectHighlighted (no-highlight → /search; valid → correct goTo* path)
 * - route resolvers (resolveCollectionRoute, resolveUserRoute, resolveScryfallRoute)
 * - scheduleLiveRegionUpdate (debounce, coalesce, clearTimeout-on-re-entry)
 * - activeTab watcher extended (announces count via ariaLiveMessage after tab switch)
 * - performSearch loading/count announcements
 */

import { vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

// Mock stores the composable depends on
vi.mock('@/stores/collection', () => ({
  useCollectionStore: () => ({ cards: [] }),
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: null }),
}))
vi.mock('@/stores/toast', () => ({
  useToastStore: () => ({ show: vi.fn() }),
}))
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}))
vi.mock('@/services/scryfall', () => ({
  searchCards: vi.fn().mockResolvedValue([]),
}))
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  query: vi.fn(),
  where: vi.fn(),
}))
vi.mock('@/services/firebase', () => ({ db: {} }))

// eslint-disable-next-line import/first
import { useGlobalSearch } from '@/composables/useGlobalSearch'
// eslint-disable-next-line import/first
import { makeCard } from '../helpers/fixtures'
// eslint-disable-next-line import/first
import type { PublicCardResult } from '@/composables/useGlobalSearch'
// eslint-disable-next-line import/first
import type { ScryfallCard } from '@/services/scryfall'

beforeEach(() => {
  setActivePinia(createPinia())
  pushMock.mockClear()
})

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeUserResult(overrides: Partial<PublicCardResult> = {}): PublicCardResult {
  return {
    id: 'u1',
    username: 'alice',
    cardName: 'Bolt',
    userId: 'user-1',
    ...overrides,
  }
}

function makeScryfallCard(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    id: 's1',
    name: 'Lightning Bolt',
    ...overrides,
  }
}

// ─── describe: moveHighlight ──────────────────────────────────────────────────

describe('moveHighlight', () => {
  it('moves down from -1 to 0 when results exist', () => {
    const gs = useGlobalSearch()
    gs.collectionResults.value = [makeCard()]
    gs.moveHighlight('down')
    expect(gs.highlightedIndex.value).toBe(0)
  })

  it('wraps from last index to 0 on down (length 8, start 7 → 0)', () => {
    const gs = useGlobalSearch()
    const cards = Array.from({ length: 8 }, (_, i) => makeCard({ id: `card-${i}`, name: `Card ${i}` }))
    gs.collectionResults.value = cards
    gs.highlightedIndex.value = 7
    gs.moveHighlight('down')
    expect(gs.highlightedIndex.value).toBe(0)
  })

  it('wraps from 0 to last index on up (length 8, start 0 → 7)', () => {
    const gs = useGlobalSearch()
    const cards = Array.from({ length: 8 }, (_, i) => makeCard({ id: `card-${i}`, name: `Card ${i}` }))
    gs.collectionResults.value = cards
    gs.highlightedIndex.value = 0
    gs.moveHighlight('up')
    expect(gs.highlightedIndex.value).toBe(7)
  })

  it('moves up from -1 to last index', () => {
    const gs = useGlobalSearch()
    const cards = Array.from({ length: 4 }, (_, i) => makeCard({ id: `card-${i}`, name: `Card ${i}` }))
    gs.collectionResults.value = cards
    gs.highlightedIndex.value = -1
    gs.moveHighlight('up')
    expect(gs.highlightedIndex.value).toBe(3)
  })

  it('home sets index to 0 when results exist', () => {
    const gs = useGlobalSearch()
    const cards = Array.from({ length: 4 }, (_, i) => makeCard({ id: `card-${i}`, name: `Card ${i}` }))
    gs.collectionResults.value = cards
    gs.highlightedIndex.value = 3
    gs.moveHighlight('home')
    expect(gs.highlightedIndex.value).toBe(0)
  })

  it('end sets index to length - 1', () => {
    const gs = useGlobalSearch()
    const cards = Array.from({ length: 4 }, (_, i) => makeCard({ id: `card-${i}`, name: `Card ${i}` }))
    gs.collectionResults.value = cards
    gs.highlightedIndex.value = 0
    gs.moveHighlight('end')
    expect(gs.highlightedIndex.value).toBe(3)
  })

  it('is a no-op when results array is empty (highlightedIndex stays -1, activeDescendantId stays null)', () => {
    const gs = useGlobalSearch()
    // activeTab defaults to 'collection', collectionResults is []
    expect(gs.highlightedIndex.value).toBe(-1)
    gs.moveHighlight('down')
    expect(gs.highlightedIndex.value).toBe(-1)
    expect(gs.activeDescendantId.value).toBeNull()
  })

  it('is a no-op on single-item when direction is down then up (index stays 0)', () => {
    const gs = useGlobalSearch()
    gs.collectionResults.value = [makeCard()]
    gs.highlightedIndex.value = 0
    gs.moveHighlight('down')
    // With single item: 0 >= length-1 → wraps to 0
    expect(gs.highlightedIndex.value).toBe(0)
    gs.moveHighlight('up')
    // With single item: 0 <= 0 → wraps to length-1 = 0
    expect(gs.highlightedIndex.value).toBe(0)
  })

  it('updates activeDescendantId to option-{activeTab}-{index} after a move', () => {
    const gs = useGlobalSearch()
    gs.collectionResults.value = [makeCard(), makeCard({ id: 'card-2', name: 'Counterspell' })]
    gs.moveHighlight('down')
    expect(gs.activeDescendantId.value).toBe('option-collection-0')
    gs.moveHighlight('down')
    expect(gs.activeDescendantId.value).toBe('option-collection-1')
  })
})

// ─── describe: activeTab watcher ──────────────────────────────────────────────

describe('activeTab watcher', () => {
  it('resets highlightedIndex to -1 when activeTab changes', async () => {
    const { nextTick } = await import('vue')
    const gs = useGlobalSearch()
    gs.collectionResults.value = [makeCard(), makeCard({ id: 'c2', name: 'Counterspell' })]
    gs.highlightedIndex.value = 1
    gs.activeTab.value = 'users'
    await nextTick()
    expect(gs.highlightedIndex.value).toBe(-1)
  })

  it('resets activeDescendantId to null when activeTab changes', async () => {
    const { nextTick } = await import('vue')
    const gs = useGlobalSearch()
    gs.collectionResults.value = [makeCard()]
    gs.moveHighlight('down')
    expect(gs.activeDescendantId.value).not.toBeNull()
    gs.activeTab.value = 'users'
    await nextTick()
    expect(gs.activeDescendantId.value).toBeNull()
  })
})

// ─── describe: isExpanded ─────────────────────────────────────────────────────

describe('isExpanded', () => {
  it('is false when isOpen is false regardless of loading/results', () => {
    const gs = useGlobalSearch()
    gs.isOpen.value = false
    gs.loading.value = true
    gs.collectionResults.value = [makeCard()]
    expect(gs.isExpanded.value).toBe(false)
  })

  it('is true when isOpen is true and loading is true', () => {
    const gs = useGlobalSearch()
    gs.isOpen.value = true
    gs.loading.value = true
    expect(gs.isExpanded.value).toBe(true)
  })

  it('is true when isOpen is true and totalResults > 0', () => {
    const gs = useGlobalSearch()
    gs.isOpen.value = true
    gs.loading.value = false
    gs.collectionResults.value = [makeCard()]
    expect(gs.isExpanded.value).toBe(true)
  })

  it('is false when isOpen is true, loading is false, totalResults is 0', () => {
    const gs = useGlobalSearch()
    gs.isOpen.value = true
    gs.loading.value = false
    // no results
    expect(gs.isExpanded.value).toBe(false)
  })
})

// ─── describe: selectHighlighted ──────────────────────────────────────────────

describe('selectHighlighted', () => {
  it('navigates to /search with q=searchQuery when highlightedIndex is -1', () => {
    const gs = useGlobalSearch()
    gs.searchQuery.value = 'bolt'
    gs.isOpen.value = true
    gs.selectHighlighted()
    expect(pushMock).toHaveBeenCalledWith({ path: '/search', query: { q: 'bolt' } })
    expect(gs.isOpen.value).toBe(false)
  })

  it('navigates to /search with q=searchQuery when highlightedIndex >= results.length (boundary safety)', () => {
    const gs = useGlobalSearch()
    gs.searchQuery.value = 'sol'
    gs.collectionResults.value = [makeCard()]
    gs.highlightedIndex.value = 5 // out of bounds
    gs.selectHighlighted()
    expect(pushMock).toHaveBeenCalledWith({ path: '/search', query: { q: 'sol' } })
  })

  it('calls goToCollection equivalent for collection tab', () => {
    const gs = useGlobalSearch()
    const card = makeCard({ id: 'bolt-1', name: 'Lightning Bolt' })
    gs.collectionResults.value = [card]
    gs.activeTab.value = 'collection'
    gs.highlightedIndex.value = 0
    gs.selectHighlighted()
    expect(pushMock).toHaveBeenCalledWith({ path: '/collection', query: { search: 'Lightning Bolt' } })
  })

  it('calls goToUserCard equivalent for users tab', () => {
    const gs = useGlobalSearch()
    const userCard = makeUserResult({ id: 'u1', username: 'alice' })
    gs.usersResults.value = [userCard]
    gs.activeTab.value = 'users'
    gs.highlightedIndex.value = 0
    gs.selectHighlighted()
    expect(pushMock).toHaveBeenCalledWith('/@alice')
  })

  it('calls goToScryfall equivalent for scryfall tab', () => {
    const gs = useGlobalSearch()
    const scryCard = makeScryfallCard({ id: 's1', name: 'Bolt' })
    gs.scryfallResults.value = [scryCard]
    gs.activeTab.value = 'scryfall'
    gs.highlightedIndex.value = 0
    gs.selectHighlighted()
    expect(pushMock).toHaveBeenCalledWith({ path: '/collection', query: { addCard: 'Bolt' } })
  })
})

// ─── describe: route resolvers ────────────────────────────────────────────────

describe('route resolvers', () => {
  it('resolveCollectionRoute returns { path: "/collection", query: { search: card.name } }', () => {
    const gs = useGlobalSearch()
    const card = makeCard({ name: 'Counterspell' })
    const route = gs.resolveCollectionRoute(card)
    expect(route).toEqual({ path: '/collection', query: { search: 'Counterspell' } })
  })

  it('resolveUserRoute returns `/@${username}` string', () => {
    const gs = useGlobalSearch()
    const user = makeUserResult({ username: 'rafaelmatovelle' })
    const route = gs.resolveUserRoute(user)
    expect(route).toBe('/@rafaelmatovelle')
  })

  it('resolveScryfallRoute returns { path: "/collection", query: { addCard: card.name } }', () => {
    const gs = useGlobalSearch()
    const card = makeScryfallCard({ name: 'Black Lotus' })
    const route = gs.resolveScryfallRoute(card)
    expect(route).toEqual({ path: '/collection', query: { addCard: 'Black Lotus' } })
  })
})

// ─── describe: scheduleLiveRegionUpdate ──────────────────────────────────────

describe('scheduleLiveRegionUpdate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not set ariaLiveMessage synchronously', () => {
    const gs = useGlobalSearch()
    gs.scheduleLiveRegionUpdate('hello')
    expect(gs.ariaLiveMessage.value).toBe('')
  })

  it('sets ariaLiveMessage 500ms later', () => {
    const gs = useGlobalSearch()
    gs.scheduleLiveRegionUpdate('hi')
    vi.advanceTimersByTime(499)
    expect(gs.ariaLiveMessage.value).toBe('')
    vi.advanceTimersByTime(1)
    expect(gs.ariaLiveMessage.value).toBe('hi')
  })

  it('coalesces rapid calls — only last message wins', () => {
    const gs = useGlobalSearch()
    gs.scheduleLiveRegionUpdate('a')
    vi.advanceTimersByTime(100)
    gs.scheduleLiveRegionUpdate('b')
    vi.advanceTimersByTime(500)
    expect(gs.ariaLiveMessage.value).toBe('b')
  })

  it('clears previous timeout when called again', () => {
    const gs = useGlobalSearch()
    gs.scheduleLiveRegionUpdate('first')
    vi.advanceTimersByTime(200)
    gs.scheduleLiveRegionUpdate('second')
    vi.advanceTimersByTime(499)
    // 'first' timer was cleared before it fired
    expect(gs.ariaLiveMessage.value).toBe('')
    vi.advanceTimersByTime(1)
    expect(gs.ariaLiveMessage.value).toBe('second')
  })
})

// ─── describe: activeTab watcher (extended — announces count) ─────────────────

describe('activeTab watcher (extended)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedules a resultsCount announcement when activeTab changes to a tab with multiple results', async () => {
    const { nextTick } = await import('vue')
    const gs = useGlobalSearch()
    gs.usersResults.value = [
      makeUserResult({ id: 'u1', username: 'alice' }),
      makeUserResult({ id: 'u2', username: 'bob' }),
      makeUserResult({ id: 'u3', username: 'carol' }),
    ]
    gs.activeTab.value = 'users'
    await nextTick()
    vi.advanceTimersByTime(500)
    expect(gs.ariaLiveMessage.value).toContain('header.search.resultsCount')
  })

  it('schedules a resultsCountSingular announcement when count === 1', async () => {
    const { nextTick } = await import('vue')
    const gs = useGlobalSearch()
    gs.usersResults.value = [makeUserResult({ id: 'u1', username: 'alice' })]
    gs.activeTab.value = 'users'
    await nextTick()
    vi.advanceTimersByTime(500)
    expect(gs.ariaLiveMessage.value).toContain('header.search.resultsCountSingular')
  })
})

// ─── describe: performSearch loading announcement ─────────────────────────────

describe('performSearch loading announcement', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sets ariaLiveMessage to header.search.searching synchronously when loading becomes true', async () => {
    // We trigger performSearch and check ariaLiveMessage right after it sets loading=true
    // Since performSearch is async, we check the state mid-execution by running real timers for
    // the search debounce but not the live-region timer
    const gs = useGlobalSearch()
    gs.searchQuery.value = 'bolt'

    // Start the search (won't await its completion — check live message mid-flight)
    const searchPromise = gs.performSearch()
    // After performSearch starts, ariaLiveMessage should be set immediately (no debounce)
    expect(gs.ariaLiveMessage.value).toBe('header.search.searching')

    // Let timers and promises resolve
    await vi.runAllTimersAsync()
    await searchPromise
  })

  it('schedules header.search.resultsCount after performSearch finally block', async () => {
    const gs = useGlobalSearch()
    gs.searchQuery.value = 'bolt'

    const searchPromise = gs.performSearch()
    await vi.runAllTimersAsync()
    await searchPromise

    // After timers advance past 500ms debounce, ariaLiveMessage should contain resultsCount key
    expect(gs.ariaLiveMessage.value).toContain('header.search.resultsCount')
  })
})
