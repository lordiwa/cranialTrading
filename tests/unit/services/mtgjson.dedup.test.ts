/**
 * TASK-174 — fetchPriceData() and fetchSetMapping() (src/services/mtgjson.ts)
 * memoize the RESOLVED value (priceDataCache / scryfallToUuidMap entries)
 * but only set it AFTER the underlying fetch completes — there is no
 * in-flight-PROMISE memoization. Confirmed empirically: a single /collection
 * navigation triggered 5 concurrent 5.48MB AllPricesToday.json.gz downloads
 * and 5 concurrent MSC.json.gz per-set-mapping fetches (scripts/perf-collection-dedup.mjs),
 * because each visible CollectionGridCard's own IntersectionObserver calls
 * getCardPrices() independently, and several fire before the first
 * in-flight fetch resolves.
 *
 * ensureSetListLoaded() (same file, line ~378) already has the correct
 * pattern — a module-level in-flight promise (setListLoadPromise) that
 * concurrent callers await instead of re-triggering the fetch. These tests
 * hold fetchPriceData/fetchSetMapping to that same standard: a SEQUENTIAL
 * test (call, await, call again) would pass even with the bug present —
 * priceDataCache is already set by the time the second call runs — so every
 * test here fires calls CONCURRENTLY, before the first has a chance to
 * resolve.
 */

function installFakeDecompression() {
  // Real gzip decompression is irrelevant to what these tests check (call
  // count / promise identity), so DecompressionStream is stubbed as an
  // identity pass-through — the mocked fetch response bodies below are
  // plain (uncompressed) JSON text, and this stub just relays the bytes
  // unchanged instead of actually gzip-decoding them.
  class FakeDecompressionStream {
    readable: ReadableStream
    writable: WritableStream
    constructor() {
      const { readable, writable } = new TransformStream()
      this.readable = readable
      this.writable = writable
    }
  }
  vi.stubGlobal('DecompressionStream', FakeDecompressionStream)
}

function gzMockResponse(payload: unknown) {
  const jsonText = JSON.stringify(payload)
  const blob = new Blob([jsonText], { type: 'application/json' })
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    blob: () => Promise.resolve(blob),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('mtgjson.ts — concurrent-call dedup (TASK-174)', () => {
  beforeEach(() => {
    vi.resetModules()
    installFakeDecompression()
    // Force the IndexedDB cache path to miss gracefully (getFromDB's
    // try/catch swallows the TypeError from calling .open on undefined and
    // resolves null) so every test exercises the network path deterministically.
    vi.stubGlobal('indexedDB', undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('fetchPriceData', () => {
    it('issues exactly ONE network fetch when 3 callers race before the first resolves', async () => {
      const { fetchPriceData } = await import('@/services/mtgjson')

      const priceFetch = deferred<unknown>()
      const fetchMock = vi.fn().mockImplementation(() => priceFetch.promise)
      vi.stubGlobal('fetch', fetchMock)

      // Three concurrent callers, none awaited individually before the
      // others start — this is what an IntersectionObserver batch does.
      const call1 = fetchPriceData()
      const call2 = fetchPriceData()
      const call3 = fetchPriceData()

      // The path to the fetch() call crosses several real microtask hops
      // (loadPriceDataFromCache -> getFromDB -> openDatabase's try/catch on
      // the stubbed-undefined indexedDB) before any of the three callers
      // reach the network call — vi.waitFor polls instead of guessing a
      // fixed tick count.
      await vi.waitFor(() => { expect(fetchMock).toHaveBeenCalled() })
      expect(fetchMock).toHaveBeenCalledTimes(1)

      priceFetch.resolve(gzMockResponse({ data: { 'uuid-1': { paper: {} } } }))

      const [r1, r2, r3] = await Promise.all([call1, call2, call3])
      expect(r1).toEqual({ 'uuid-1': { paper: {} } })
      expect(r2).toBe(r1)
      expect(r3).toBe(r1)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('clears the memoized in-flight promise on failure so a later retry issues a new fetch', async () => {
      const { fetchPriceData } = await import('@/services/mtgjson')

      const firstAttempt = deferred<unknown>()
      const fetchMock = vi.fn()
        .mockImplementationOnce(() => firstAttempt.promise)
        .mockImplementationOnce(() => Promise.resolve(gzMockResponse({ data: { 'uuid-2': { paper: {} } } })))
      vi.stubGlobal('fetch', fetchMock)

      const failingCall = fetchPriceData()
      firstAttempt.resolve({ ok: false, status: 500, headers: { get: () => null } })
      await expect(failingCall).rejects.toThrow()
      expect(fetchMock).toHaveBeenCalledTimes(1)

      // A later, independent call must retry over the network — not hang
      // forever on a promise that already rejected, and not silently return
      // undefined/null without ever calling fetch again.
      const retryResult = await fetchPriceData()
      expect(retryResult).toEqual({ 'uuid-2': { paper: {} } })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('does not refetch once the first call already resolved (memoized value still wins)', async () => {
      const { fetchPriceData } = await import('@/services/mtgjson')

      const fetchMock = vi.fn().mockResolvedValue(gzMockResponse({ data: { 'uuid-3': { paper: {} } } }))
      vi.stubGlobal('fetch', fetchMock)

      const first = await fetchPriceData()
      const second = await fetchPriceData()

      expect(second).toBe(first)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('fetchSetMapping', () => {
    it('issues exactly ONE network fetch for the SAME set when 3 callers race before the first resolves', async () => {
      const { fetchSetMapping } = await import('@/services/mtgjson')

      const setFetch = deferred<unknown>()
      const fetchMock = vi.fn().mockImplementation(() => setFetch.promise)
      vi.stubGlobal('fetch', fetchMock)

      const call1 = fetchSetMapping('MSC')
      const call2 = fetchSetMapping('MSC')
      const call3 = fetchSetMapping('MSC')

      await Promise.resolve()
      await Promise.resolve()

      expect(fetchMock).toHaveBeenCalledTimes(1)

      setFetch.resolve(gzMockResponse({ data: { cards: [{ uuid: 'u1', identifiers: { scryfallId: 's1' } }] } }))
      await Promise.all([call1, call2, call3])

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('does not refetch a set that already finished loading', async () => {
      const { fetchSetMapping } = await import('@/services/mtgjson')

      const fetchMock = vi.fn().mockResolvedValue(
        gzMockResponse({ data: { cards: [{ uuid: 'u1', identifiers: { scryfallId: 's1' } }] } })
      )
      vi.stubGlobal('fetch', fetchMock)

      await fetchSetMapping('AFR')
      await fetchSetMapping('AFR')

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('clears the memoized in-flight promise on failure so a retry of the SAME set issues a new fetch', async () => {
      const { fetchSetMapping } = await import('@/services/mtgjson')

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 500, headers: { get: () => null } })
        .mockResolvedValueOnce(gzMockResponse({ data: { cards: [{ uuid: 'u2', identifiers: { scryfallId: 's2' } }] } }))
      vi.stubGlobal('fetch', fetchMock)

      // fetchSetMapping swallows its own errors (failedSets.add + return,
      // see src/services/mtgjson.ts) rather than throwing — the network
      // failure itself never surfaces as a rejection here. What must NOT
      // happen is the in-flight-promise map staying wedged on the first
      // (failed) attempt, which would make every subsequent call for this
      // same set silently resolve without ever calling fetch again.
      await fetchSetMapping('BLC')
      expect(fetchMock).toHaveBeenCalledTimes(1)

      await fetchSetMapping('BLC')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })
})
