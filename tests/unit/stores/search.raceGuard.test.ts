/**
 * Regression test for the TASK-108 review fix: setSort()/search() race guard.
 *
 * Bug: setSort fired `void search()` with no in-flight guard. If the user
 * changed sort A→B quickly and A's response resolved after B's, results/
 * totalCards would end up showing A's (stale) data while the sort selector
 * showed B. Fixed with a monotonic request token in stores/search.ts: each
 * search() call captures `reqId = ++lastReqId` and discards its own response
 * (and skips flipping `loading` back to false) if a newer request has since
 * started.
 */

vi.mock('@/services/scryfall', () => ({
  searchAdvancedWithMeta: vi.fn(),
}))

vi.mock('@/stores/toast', () => ({
  useToastStore: vi.fn(() => ({ show: vi.fn() })),
}))

vi.mock('@/composables/useI18n', () => ({
  t: (key: string) => key,
}))

import { createPinia, setActivePinia } from 'pinia'
import { useSearchStore } from '@/stores/search'
import { searchAdvancedWithMeta } from '@/services/scryfall'
import type { ScryfallCard } from '@/services/scryfall'

const mockSearchAdvancedWithMeta = vi.mocked(searchAdvancedWithMeta)

interface SearchMeta { results: ScryfallCard[], totalCards: number, hasMore: boolean }

function makeCard(name: string): ScryfallCard {
  return {
    id: `id-${name}`,
    name,
    set: 'tst',
    set_name: 'Test Set',
    collector_number: '1',
    rarity: 'common',
    type_line: 'Creature — Test',
  }
}

/** A promise plus its externally-callable resolver, for controlling resolution order in tests. */
function deferred<T>(): { promise: Promise<T>, resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

describe('search store: race guard (TASK-108 review fix)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockSearchAdvancedWithMeta.mockReset()
  })

  it('discards a stale response that resolves after a newer request already landed', async () => {
    const store = useSearchStore()

    const first = deferred<SearchMeta>()
    const second = deferred<SearchMeta>()
    mockSearchAdvancedWithMeta
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const p1 = store.search({ name: 'Alpha' })
    const p2 = store.search({ name: 'Beta' })

    // Newer request (Beta) resolves first.
    second.resolve({ results: [makeCard('Beta Card')], totalCards: 1, hasMore: false })
    await p2

    expect(store.results.map(c => c.name)).toEqual(['Beta Card'])
    expect(store.totalCards).toBe(1)

    // Older request (Alpha) resolves late — must be discarded, not overwrite Beta's data.
    first.resolve({ results: [makeCard('Alpha Card')], totalCards: 1, hasMore: false })
    await p1

    expect(store.results.map(c => c.name)).toEqual(['Beta Card'])
    expect(store.totalCards).toBe(1)
    expect(store.loading).toBe(false)
  })

  it('does not flip loading back to false when a stale request resolves while a newer one is still in flight', async () => {
    const store = useSearchStore()

    const first = deferred<SearchMeta>()
    const second = deferred<SearchMeta>()
    mockSearchAdvancedWithMeta
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    // Distinct filter names from the other test — the search store's cache is
    // module-level and persists across tests in this file, so reusing 'Alpha'/'Beta'
    // here would hit the cache instead of exercising the in-flight race.
    const p1 = store.search({ name: 'Gamma' })
    const p2 = store.search({ name: 'Delta' })

    // Older request (Gamma) resolves first, while Delta is still pending.
    first.resolve({ results: [makeCard('Gamma Card')], totalCards: 1, hasMore: false })
    await p1

    // Stale response discarded: no data written, and loading must stay true — Delta is still in flight.
    expect(store.results).toEqual([])
    expect(store.loading).toBe(true)

    second.resolve({ results: [makeCard('Delta Card')], totalCards: 1, hasMore: false })
    await p2

    expect(store.results.map(c => c.name)).toEqual(['Delta Card'])
    expect(store.loading).toBe(false)
  })

  it('does not leave loading stuck true when an in-flight (uncached) request is superseded by a cache-hit search', async () => {
    const store = useSearchStore()

    // Warm the cache for 'CachedName' with a quick resolved response.
    mockSearchAdvancedWithMeta.mockResolvedValueOnce({ results: [makeCard('Cached Card')], totalCards: 1, hasMore: false })
    await store.search({ name: 'CachedName' })
    expect(store.loading).toBe(false)

    // Start a new, uncached search — goes to the network branch, loading=true, left in flight.
    const inFlight = deferred<SearchMeta>()
    mockSearchAdvancedWithMeta.mockImplementationOnce(() => inFlight.promise)
    const p1 = store.search({ name: 'Uncached' })
    expect(store.loading).toBe(true)

    // User immediately switches to the already-cached search — synchronous cache-hit branch,
    // which bumps reqId past the still-pending 'Uncached' request (supersedes it).
    await store.search({ name: 'CachedName' })
    expect(store.results.map(c => c.name)).toEqual(['Cached Card'])
    expect(store.loading).toBe(false) // cache-hit must not leave loading stuck true

    // The superseded in-flight request resolves late — must be discarded and must not
    // be relied on to reset loading (the cache-hit branch already did that).
    inFlight.resolve({ results: [makeCard('Uncached Card')], totalCards: 1, hasMore: false })
    await p1

    expect(store.results.map(c => c.name)).toEqual(['Cached Card'])
    expect(store.loading).toBe(false)
  })

  // Regression (bug report 2026-08-07 — "erasing the searched card fast and typing
  // again breaks the search"): clearSearch() reset the visible state but did NOT
  // bump the request token, so a search still in flight when the user cleared kept
  // its reqId current and repopulated results after the clear.
  describe('clearSearch invalidates the in-flight request', () => {
    it('discards a response that resolves after clearSearch', async () => {
      const store = useSearchStore()

      const inFlight = deferred<SearchMeta>()
      mockSearchAdvancedWithMeta.mockImplementationOnce(() => inFlight.promise)
      const pending = store.search({ name: 'ClearA' })
      expect(store.loading).toBe(true)

      store.clearSearch()
      expect(store.results).toEqual([])

      inFlight.resolve({ results: [makeCard('Lightning Bolt')], totalCards: 1, hasMore: false })
      await pending

      // The erased query's results must NOT come back from the dead.
      expect(store.results).toEqual([])
      expect(store.totalCards).toBe(0)
    })

    it('does not leave loading stuck true when clearing mid-search', async () => {
      const store = useSearchStore()

      const inFlight = deferred<SearchMeta>()
      mockSearchAdvancedWithMeta.mockImplementationOnce(() => inFlight.promise)
      const pending = store.search({ name: 'ClearB' })

      store.clearSearch()
      // The in-flight request's own finally will see a stale reqId and skip
      // resetting loading, so clearSearch has to do it — same reasoning as the
      // cache-hit branch.
      expect(store.loading).toBe(false)

      inFlight.resolve({ results: [], totalCards: 0, hasMore: false })
      await pending
      expect(store.loading).toBe(false)
    })

    it('keeps the sort control working after clear + a new search', async () => {
      const store = useSearchStore()

      // Clear while a search is in flight: the stale response used to repopulate
      // `results` while `lastFilters` stayed null, so setSort had nothing to replay
      // and the sort selector silently stopped doing anything.
      const inFlight = deferred<SearchMeta>()
      mockSearchAdvancedWithMeta.mockImplementationOnce(() => inFlight.promise)
      const pending = store.search({ name: 'ClearC' })
      store.clearSearch()
      inFlight.resolve({ results: [makeCard('Lightning Bolt')], totalCards: 1, hasMore: false })
      await pending

      // Type again — a fresh search must work normally...
      mockSearchAdvancedWithMeta.mockResolvedValueOnce({ results: [makeCard('Bolt')], totalCards: 1, hasMore: false })
      await store.search({ name: 'Bolt' })
      expect(store.results.map(c => c.name)).toEqual(['Bolt'])

      // ...and changing the sort must replay it.
      mockSearchAdvancedWithMeta.mockResolvedValueOnce({ results: [makeCard('Bolt Sorted')], totalCards: 1, hasMore: false })
      store.setSort('price-desc')
      await Promise.resolve()
      await Promise.resolve()
      expect(mockSearchAdvancedWithMeta).toHaveBeenCalledTimes(3)
    })
  })
})
