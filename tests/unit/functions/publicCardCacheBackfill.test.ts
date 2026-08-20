/**
 * TASK-247 tanda 4 ronda 2 — HIGH-1, the half the `sc` fallback cannot reach.
 *
 * MEASURED against production 2026-08-19 (read-only, whole `public_cards`
 * collection, 8,388 documents): 3,005 documents carry no `setCode`, spread
 * over 2,387 distinct scryfallIds. Of those ids, 2,054 have `set` in
 * `scryfall_cache` — those are closed by publicCardEntry.js's fallback. The
 * REMAINING 333 are not: 322 have a cache document with no `set` field at
 * all (written by the import path, whose buildCacheFieldsFromScryfall never
 * stored `set`), and 11 have no cache document whatsoever.
 *
 * Rafael's decision (ticket comment, DECISION 9): what is missing from
 * `scryfall_cache` is fetched from Scryfall DURING THE RECONCILE, in the
 * writer — not in the browser, which only ever reaches the loaded page and
 * is the original defect of this ticket. That also leaves the shared cache
 * better populated for the rest of the product, not just for public
 * profiles.
 *
 * Everything here runs against an injected `fetch` and an injected `sleep`,
 * so the batching, the rate limiting, the partial-failure isolation and the
 * cap are all executable without a network — same dependency-free CommonJS
 * technique as the rest of functions/lib (TASK-236).
 */
import { describe, expect, it, vi } from 'vitest'
import {
  MAX_BACKFILL_IDS,
  SCRYFALL_BATCH_SIZE,
  backfillScryfallCacheForIds,
  pickScryfallCacheFields,
  selectIdsNeedingCacheBackfill,
} from '../../../functions/lib/publicCardCacheBackfill.js'

/** Minimal fake Firestore: only `collection().doc()` and `db.batch()`. */
function makeFakeDb() {
  const written: Record<string, Record<string, unknown>> = {}
  let commits = 0
  return {
    written,
    get commits() {
      return commits
    },
    collection(path: string) {
      return { doc: (id: string) => ({ path: `${path}/${id}`, id }) }
    },
    batch() {
      const ops: Array<[string, Record<string, unknown>]> = []
      return {
        set(ref: { id: string }, data: Record<string, unknown>) {
          ops.push([ref.id, data])
        },
        async commit() {
          commits++
          for (const [id, data] of ops) written[id] = { ...(written[id] ?? {}), ...data }
        },
      }
    },
  }
}

function scryfallCard(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name: `Card ${id}`,
    set: 'm20',
    set_name: 'Core Set 2020',
    type_line: 'Creature — Human',
    cmc: 2,
    colors: ['W'],
    rarity: 'common',
    ...over,
  }
}

describe('selectIdsNeedingCacheBackfill — which ids are worth a Scryfall request', () => {
  it('picks ids with no cache document at all', () => {
    const picked = selectIdsNeedingCacheBackfill(['a', 'b'], { a: { set: 'm20' } })
    expect(picked).toEqual(['b'])
  })

  it('picks ids whose cache document exists but has no `set`', () => {
    // The measured 322: written by the import path, which never stored `set`.
    const picked = selectIdsNeedingCacheBackfill(['a'], { a: { type_line: 'Instant' } })
    expect(picked).toEqual(['a'])
  })

  it('leaves ids that already have `set` alone — no quota spent on them', () => {
    const picked = selectIdsNeedingCacheBackfill(['a', 'b'], { a: { set: 'm20' }, b: { set: 'war' } })
    expect(picked).toEqual([])
  })

  it('caps the work per run so one reconcile cannot stall on a cold account', () => {
    const ids = Array.from({ length: MAX_BACKFILL_IDS + 50 }, (_, i) => `id-${i}`)
    expect(selectIdsNeedingCacheBackfill(ids, {})).toHaveLength(MAX_BACKFILL_IDS)
  })
})

describe('pickScryfallCacheFields — the cache document a fetched card becomes', () => {
  it('stores `set` (the CODE) and `set_name` (the human name) as separate fields', () => {
    const fields = pickScryfallCacheFields(scryfallCard('x'))
    expect(fields.set).toBe('m20')
    expect(fields.set_name).toBe('Core Set 2020')
  })

  it('never invents a field Scryfall did not send', () => {
    const fields = pickScryfallCacheFields({ id: 'x', name: 'X', set: 'm20' })
    expect(fields).not.toHaveProperty('colors')
    expect(fields).not.toHaveProperty('type_line')
  })
})

describe('backfillScryfallCacheForIds — the reconcile-time repair', () => {
  const okFetch = (cards: unknown[]) =>
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ data: cards }),
    })

  it('writes the fetched metadata into scryfall_cache', async () => {
    const db = makeFakeDb()
    const fetchImpl = okFetch([scryfallCard('a')])
    const result = await backfillScryfallCacheForIds({
      db,
      scryfallIds: ['a'],
      cacheByScryfallId: {},
      fetchImpl,
      sleepImpl: async () => {},
    })
    expect(result.written).toBe(1)
    expect(db.written.a?.set).toBe('m20')
  })

  it('feeds the freshly fetched cache back to the caller, so THIS build already uses it', async () => {
    // The whole point: the entry builder runs right after, in the same
    // reconcile. A backfill that only wrote Firestore would leave this run's
    // index with the same empty `sc` and fix nothing until the NEXT run.
    const db = makeFakeDb()
    const cacheByScryfallId: Record<string, Record<string, unknown>> = {}
    await backfillScryfallCacheForIds({
      db,
      scryfallIds: ['a'],
      cacheByScryfallId,
      fetchImpl: okFetch([scryfallCard('a')]),
      sleepImpl: async () => {},
    })
    expect(cacheByScryfallId.a?.set).toBe('m20')
  })

  it('asks Scryfall in batches, never one request per card', async () => {
    const ids = Array.from({ length: SCRYFALL_BATCH_SIZE + 1 }, (_, i) => `id-${i}`)
    const fetchImpl = okFetch([])
    await backfillScryfallCacheForIds({
      db: makeFakeDb(),
      scryfallIds: ids,
      cacheByScryfallId: {},
      fetchImpl,
      sleepImpl: async () => {},
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('waits between requests rather than bursting at Scryfall', async () => {
    const sleepImpl = vi.fn().mockResolvedValue(undefined)
    const ids = Array.from({ length: SCRYFALL_BATCH_SIZE + 1 }, (_, i) => `id-${i}`)
    await backfillScryfallCacheForIds({
      db: makeFakeDb(),
      scryfallIds: ids,
      cacheByScryfallId: {},
      fetchImpl: okFetch([]),
      sleepImpl,
    })
    expect(sleepImpl).toHaveBeenCalled()
  })

  it('identifies itself with a User-Agent, as Scryfall asks', async () => {
    const fetchImpl = okFetch([])
    await backfillScryfallCacheForIds({
      db: makeFakeDb(),
      scryfallIds: ['a'],
      cacheByScryfallId: {},
      fetchImpl,
      sleepImpl: async () => {},
    })
    const init = fetchImpl.mock.calls[0]?.[1] as { headers: Record<string, string> }
    expect(init.headers['User-Agent']).toMatch(/CranialTrading/)
  })

  it('a failed batch never takes the reconcile down — the other batch still lands', async () => {
    // The AC the lead spelled out: a card that cannot be resolved stays with
    // `sc: ''` and the index is still built. An exception escaping here would
    // abort a reconcile that had already read the whole collection.
    const db = makeFakeDb()
    const ids = Array.from({ length: SCRYFALL_BATCH_SIZE + 1 }, (_, i) => `id-${i}`)
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ data: [scryfallCard(`id-${SCRYFALL_BATCH_SIZE}`)] }),
      })
    const result = await backfillScryfallCacheForIds({
      db,
      scryfallIds: ids,
      cacheByScryfallId: {},
      fetchImpl,
      sleepImpl: async () => {},
      retries: 1,
    })
    expect(result.failed).toBe(SCRYFALL_BATCH_SIZE)
    expect(result.written).toBe(1)
    expect(db.written[`id-${SCRYFALL_BATCH_SIZE}`]?.set).toBe('m20')
  })

  it('reports ids Scryfall does not know rather than retrying them forever', async () => {
    const result = await backfillScryfallCacheForIds({
      db: makeFakeDb(),
      scryfallIds: ['a', 'b'],
      cacheByScryfallId: {},
      fetchImpl: okFetch([scryfallCard('a')]),
      sleepImpl: async () => {},
    })
    expect(result.notFound).toBe(1)
    expect(result.written).toBe(1)
  })

  it('does nothing at all — not even one request — when there is nothing to fetch', async () => {
    const fetchImpl = okFetch([])
    const result = await backfillScryfallCacheForIds({
      db: makeFakeDb(),
      scryfallIds: [],
      cacheByScryfallId: {},
      fetchImpl,
      sleepImpl: async () => {},
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.written).toBe(0)
  })
})
