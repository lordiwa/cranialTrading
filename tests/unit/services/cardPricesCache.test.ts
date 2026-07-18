/**
 * RED phase tests for the resolved-card-prices IndexedDB cache (TASK-137).
 *
 * Reuses mtgjson.ts's `openDatabase()` (same physical IndexedDB database,
 * new object store) instead of inventing a parallel IDB connection — see
 * hand-off for the reuse rationale. We mock `openDatabase` with a small
 * in-memory fake that implements just the IDBDatabase/transaction/objectStore
 * surface this module needs (getAll/getAllKeys/put), since happy-dom (this
 * project's unit test environment) has no IndexedDB implementation at all —
 * that absence IS the "IndexedDB not available" fallback path we also test.
 */
import type { CardPrices } from '@/services/mtgjson'

const { mockOpenDatabase } = vi.hoisted(() => ({ mockOpenDatabase: vi.fn() }))

vi.mock('@/services/mtgjson', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/mtgjson')>()
  return {
    ...actual,
    openDatabase: mockOpenDatabase,
  }
})

import { hydrateCardPricesCache, persistCardPricesBatch } from '@/services/cardPricesCache'
import { RESOLVED_PRICES_STORE } from '@/services/mtgjson'

/** Minimal in-memory fake of the IDBDatabase surface this module touches. */
function makeFakeDb(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial))

  function makeRequest<T>(run: () => T, shouldError = false) {
    const req: any = { onsuccess: null, onerror: null, result: undefined, error: undefined }
    queueMicrotask(() => {
      if (shouldError) {
        req.error = new Error('fake IDB error')
        req.onerror?.()
      } else {
        req.result = run()
        req.onsuccess?.()
      }
    })
    return req
  }

  return {
    _store: store,
    transaction(_names: string | string[], _mode: 'readonly' | 'readwrite') {
      return {
        objectStore(name: string) {
          if (name !== RESOLVED_PRICES_STORE) throw new Error(`unexpected store: ${name}`)
          return {
            getAll: () => makeRequest(() => Array.from(store.values())),
            getAllKeys: () => makeRequest(() => Array.from(store.keys())),
            put: (value: unknown, key: string) => makeRequest(() => { store.set(key, value) }),
          }
        },
      }
    },
  }
}

const ckPrices = (retail: number): CardPrices => ({
  cardKingdom: { retail, retailFoil: null, buylist: null, buylistFoil: null },
})

describe('cardPricesCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('hydrateCardPricesCache', () => {
    it('returns fresh entries as scryfallId -> CardPrices', async () => {
      const now = Date.now()
      mockOpenDatabase.mockResolvedValue(makeFakeDb({
        'scry-1': { prices: ckPrices(5), cachedAt: now },
        'scry-2': { prices: null, cachedAt: now },
      }))

      const result = await hydrateCardPricesCache()

      expect(result.get('scry-1')).toEqual(ckPrices(5))
      expect(result.has('scry-2')).toBe(true)
      expect(result.get('scry-2')).toBeNull()
      expect(result.size).toBe(2)
    })

    it('drops entries older than the 24h TTL (they will be re-fetched)', async () => {
      const now = Date.now()
      const twentyFiveHoursAgo = now - 25 * 60 * 60 * 1000
      mockOpenDatabase.mockResolvedValue(makeFakeDb({
        'scry-fresh': { prices: ckPrices(3), cachedAt: now },
        'scry-stale': { prices: ckPrices(9), cachedAt: twentyFiveHoursAgo },
      }))

      const result = await hydrateCardPricesCache()

      expect(result.has('scry-fresh')).toBe(true)
      expect(result.has('scry-stale')).toBe(false)
      expect(result.size).toBe(1)
    })

    it('returns an empty Map when the store has no entries (missing entry case)', async () => {
      mockOpenDatabase.mockResolvedValue(makeFakeDb({}))

      const result = await hydrateCardPricesCache()

      expect(result.size).toBe(0)
    })

    it('falls back to an empty Map without throwing when IndexedDB is unavailable', async () => {
      mockOpenDatabase.mockRejectedValue(new Error('IndexedDB not available'))

      await expect(hydrateCardPricesCache()).resolves.toEqual(new Map())
    })

    it('skips corrupted entries (malformed stored value) instead of throwing', async () => {
      const now = Date.now()
      mockOpenDatabase.mockResolvedValue(makeFakeDb({
        'scry-good': { prices: ckPrices(1), cachedAt: now },
        'scry-corrupt-1': 'not-an-object',
        'scry-corrupt-2': { prices: ckPrices(2) }, // missing cachedAt
        'scry-corrupt-3': null,
      }))

      const result = await hydrateCardPricesCache()

      expect(result.get('scry-good')).toEqual(ckPrices(1))
      expect(result.has('scry-corrupt-1')).toBe(false)
      expect(result.has('scry-corrupt-2')).toBe(false)
      expect(result.has('scry-corrupt-3')).toBe(false)
      expect(result.size).toBe(1)
    })

    it('falls back to an empty Map when the transaction itself errors (corrupted DB)', async () => {
      const db = makeFakeDb({ 'scry-1': { prices: ckPrices(1), cachedAt: Date.now() } })
      // Force getAll/getAllKeys to error to simulate a corrupted/broken store.
      db.transaction = () => ({
        objectStore: () => ({
          getAll: () => {
            const req: any = { onsuccess: null, onerror: null }
            queueMicrotask(() => { req.error = new Error('corrupt store'); req.onerror?.() })
            return req
          },
          getAllKeys: () => {
            const req: any = { onsuccess: null, onerror: null }
            queueMicrotask(() => { req.result = []; req.onsuccess?.() })
            return req
          },
        }),
      })
      mockOpenDatabase.mockResolvedValue(db)

      await expect(hydrateCardPricesCache()).resolves.toEqual(new Map())
    })
  })

  describe('persistCardPricesBatch', () => {
    it('writes each entry into the store under its scryfallId key', async () => {
      const db = makeFakeDb({})
      mockOpenDatabase.mockResolvedValue(db)

      await persistCardPricesBatch(new Map([
        ['scry-1', ckPrices(4)],
        ['scry-2', null],
      ]))

      expect(db._store.get('scry-1')).toMatchObject({ prices: ckPrices(4) })
      expect(db._store.get('scry-2')).toMatchObject({ prices: null })
      expect((db._store.get('scry-1') as any).cachedAt).toEqual(expect.any(Number))
    })

    it('is a no-op for an empty batch (does not open the DB)', async () => {
      await persistCardPricesBatch(new Map())
      expect(mockOpenDatabase).not.toHaveBeenCalled()
    })

    it('does not throw when IndexedDB is unavailable (best-effort, silent fallback)', async () => {
      mockOpenDatabase.mockRejectedValue(new Error('IndexedDB not available'))

      await expect(persistCardPricesBatch(new Map([['scry-1', ckPrices(1)]]))).resolves.toBeUndefined()
    })

    it('does not throw when a write fails mid-batch (corrupted store)', async () => {
      const db = makeFakeDb({})
      db.transaction = () => ({
        objectStore: () => ({
          put: () => {
            const req: any = { onsuccess: null, onerror: null }
            queueMicrotask(() => { req.error = new Error('write failed'); req.onerror?.() })
            return req
          },
        }),
      })
      mockOpenDatabase.mockResolvedValue(db)

      await expect(persistCardPricesBatch(new Map([['scry-1', ckPrices(1)]]))).resolves.toBeUndefined()
    })
  })
})
