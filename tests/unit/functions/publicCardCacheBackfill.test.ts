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
  MAX_RETRY_AFTER_MS,
  NOT_FOUND_RETRY_MS,
  SCRYFALL_BATCH_SIZE,
  SCRYFALL_NOT_FOUND_COLLECTION,
  backfillScryfallCacheForIds,
  pickScryfallCacheFields,
  selectIdsNeedingCacheBackfill,
} from '../../../functions/lib/publicCardCacheBackfill.js'

/**
 * Minimal fake Firestore: `collection().doc()`, `db.batch()` and
 * `db.getAll()`. Documents are keyed BY PATH (review round 3): the backfill
 * now writes to two collections — `scryfall_cache` and the not-found
 * tombstones — and a fake that keyed only by document id would let one
 * silently overwrite the other.
 */
function makeFakeDb() {
  const store: Record<string, Record<string, Record<string, unknown>>> = {}
  let commits = 0

  function docRef(path: string, id: string) {
    return {
      id,
      _path: path,
      async get() {
        const data = (store[path] ?? {})[id]
        return { id, exists: data !== undefined, data: () => data }
      },
    }
  }

  return {
    store,
    /** Convenience view kept from the earlier fake: the cache collection. */
    get written(): Record<string, Record<string, unknown>> {
      return store.scryfall_cache ?? {}
    },
    get commits() {
      return commits
    },
    collection(path: string) {
      return { doc: (id: string) => docRef(path, id) }
    },
    async getAll(...refs: Array<{ get: () => Promise<unknown> }>) {
      return Promise.all(refs.map((ref) => ref.get()))
    },
    batch() {
      const ops: Array<[string, string, Record<string, unknown>]> = []
      return {
        set(ref: { id: string; _path: string }, data: Record<string, unknown>) {
          ops.push([ref._path, ref.id, data])
        },
        async commit() {
          commits++
          for (const [path, id, data] of ops) {
            store[path] = store[path] ?? {}
            store[path][id] = { ...(store[path][id] ?? {}), ...data }
          }
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
    expect(picked.ids).toEqual(['b'])
  })

  it('picks ids whose cache document exists but has no `set`', () => {
    // The measured 322: written by the import path, which never stored `set`.
    const picked = selectIdsNeedingCacheBackfill(['a'], { a: { type_line: 'Instant' } })
    expect(picked.ids).toEqual(['a'])
  })

  it('leaves ids that already have `set` alone — no quota spent on them', () => {
    const picked = selectIdsNeedingCacheBackfill(['a', 'b'], { a: { set: 'm20' }, b: { set: 'war' } })
    expect(picked.ids).toEqual([])
  })

  it('caps the work per run so one reconcile cannot stall on a cold account', () => {
    const ids = Array.from({ length: MAX_BACKFILL_IDS + 50 }, (_, i) => `id-${i}`)
    expect(selectIdsNeedingCacheBackfill(ids, {}).ids).toHaveLength(MAX_BACKFILL_IDS)
  })

  // LOW (review round 3): the cap used to be silent — the module stopped at
  // MAX_BACKFILL_IDS and said nothing about how many ids it had left behind,
  // so an operator reading the logs could not tell a run that finished the
  // job from one that stopped halfway.
  it('reports how many ids the per-run cap left behind, instead of dropping them silently', () => {
    const ids = Array.from({ length: MAX_BACKFILL_IDS + 50 }, (_, i) => `id-${i}`)
    expect(selectIdsNeedingCacheBackfill(ids, {}).remaining).toBe(50)
  })

  it('reports zero remaining when everything needing a fetch fits in one run', () => {
    expect(selectIdsNeedingCacheBackfill(['a', 'b'], {}).remaining).toBe(0)
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

/**
 * MEDIUM-4 (review round 3) — the DOMINANT shape of this backfill had no
 * sensor at any level. MEASURED by the reviewer: every call above passes an
 * EMPTY `cacheByScryfallId`, and with an empty base `{ ...(base || {}),
 * ...fields }` and a plain `fields` are literally indistinguishable — so
 * mutating the merge into a replacement could not fail the suite.
 *
 * That matters because the majority shape in production is not "no cache
 * document" but "a cache document that exists and is rich, only without
 * `set`" — written by the import path, whose buildCacheFieldsFromScryfall
 * never stored `set`. Those documents carry type_line, cmc, rarity,
 * oracle_text, keywords and — the one that bites — `produced_mana`, which is
 * what the land rule hangs off (a land is categorized by the mana it
 * PRODUCES, not by `colors`) and which travels into the index entry as `pm`.
 * A replacing merge would blank `produced_mana` on every such card whose
 * Scryfall response happens not to repeat it, dropping those lands into the
 * generic bucket and quietly lowering the profile's per-color counts — the
 * exact symptom this ticket exists to fix, with a new cause.
 *
 * No production figure is asserted here: the test controls its own numbers.
 */
describe('backfillScryfallCacheForIds — MERGES into an existing partial cache document', () => {
  it('keeps what the partial cache document already had and adds the missing set', async () => {
    const db = makeFakeDb()
    // The dominant production shape: rich cache document, no `set`.
    const cacheByScryfallId: Record<string, Record<string, unknown>> = {
      s1: { type_line: 'Land', produced_mana: ['B'], keywords: ['Cycling'] },
    }
    // Scryfall's answer here does NOT repeat produced_mana/type_line/keywords —
    // that is what makes a merge and a replacement distinguishable at all.
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ data: [{ id: 's1', name: 'Bloodfell Caves', set: 'znr', set_name: 'Zendikar Rising' }] }),
    })

    await backfillScryfallCacheForIds({
      db,
      scryfallIds: ['s1'],
      cacheByScryfallId,
      fetchImpl,
      sleepImpl: async () => {},
    })

    expect(cacheByScryfallId.s1.set).toBe('znr')
    expect(cacheByScryfallId.s1.set_name).toBe('Zendikar Rising')
    // The land rule's own field must survive the merge.
    expect(cacheByScryfallId.s1.produced_mana).toEqual(['B'])
    expect(cacheByScryfallId.s1.type_line).toBe('Land')
    expect(cacheByScryfallId.s1.keywords).toEqual(['Cycling'])
  })
})

/**
 * MEDIUM-2 (review round 3) — `Retry-After` was taken at face value and
 * slept for unconditionally, inside a 300s Cloud Function, at a point in the
 * reconcile BEFORE any index write. A hostile or simply large header
 * ("Retry-After: 3600") was therefore the one path that ends in "no index
 * was written at all" — which contradicts the failure policy this module
 * declares in its own header: a failed batch leaves its ids uncached, their
 * entries keep `sc: ''`, and the index is still built.
 */
describe('backfillScryfallCacheForIds — 429 handling is bounded', () => {
  const rateLimited = (retryAfter: string | null) => ({
    ok: false,
    status: 429,
    headers: { get: () => retryAfter },
    json: async () => ({}),
  })

  it('never sleeps longer than the cap, whatever Retry-After asks for', async () => {
    const sleepImpl = vi.fn().mockResolvedValue(undefined)
    const fetchImpl = vi.fn().mockResolvedValue(rateLimited('3600'))
    await backfillScryfallCacheForIds({
      db: makeFakeDb(),
      scryfallIds: ['a'],
      cacheByScryfallId: {},
      fetchImpl,
      sleepImpl,
      retries: 2,
    })
    expect(sleepImpl).toHaveBeenCalled()
    for (const call of sleepImpl.mock.calls) {
      expect(call[0]).toBeLessThanOrEqual(MAX_RETRY_AFTER_MS)
    }
  })

  it('gives up on a persistently rate-limited batch instead of taking the run down', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(rateLimited('3600'))
    const result = await backfillScryfallCacheForIds({
      db: makeFakeDb(),
      scryfallIds: ['a', 'b'],
      cacheByScryfallId: {},
      fetchImpl,
      sleepImpl: async () => {},
      retries: 2,
    })
    // Declared failure policy: the ids stay uncached and are counted, nothing throws.
    expect(result.failed).toBe(2)
    expect(result.written).toBe(0)
  })

  it('a garbage Retry-After header does not become a NaN sleep', async () => {
    const sleepImpl = vi.fn().mockResolvedValue(undefined)
    await backfillScryfallCacheForIds({
      db: makeFakeDb(),
      scryfallIds: ['a'],
      cacheByScryfallId: {},
      fetchImpl: vi.fn().mockResolvedValue(rateLimited('later')),
      sleepImpl,
      retries: 2,
    })
    expect(sleepImpl).toHaveBeenCalled()
    for (const call of sleepImpl.mock.calls) {
      expect(Number.isFinite(call[0])).toBe(true)
      expect(call[0]).toBeGreaterThan(0)
    }
  })

  it('stops asking Scryfall once the run has spent its time budget, and says so', async () => {
    // A whole-run ceiling, not only a per-sleep one: enough capped batches
    // still add up inside a 300s function.
    let clock = 0
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ data: [] }),
    })
    const ids = Array.from({ length: SCRYFALL_BATCH_SIZE * 4 }, (_, i) => `id-${i}`)
    const result = await backfillScryfallCacheForIds({
      db: makeFakeDb(),
      scryfallIds: ids,
      cacheByScryfallId: {},
      fetchImpl,
      sleepImpl: async () => {},
      nowImpl: () => {
        clock += 5000
        return clock
      },
      timeBudgetMs: 10000,
    })
    expect(fetchImpl.mock.calls.length).toBeLessThan(4)
    expect(result.abandoned).toBeGreaterThan(0)
  })
})

/**
 * LOW (review round 3) — an id Scryfall's collection endpoint does not
 * return is a deleted or never-existing printing, not a transient failure.
 * It was counted and logged, but nothing remembered it, so every future
 * reconcile of that seller spent a Scryfall request on it again, forever.
 */
describe('backfillScryfallCacheForIds — ids Scryfall does not know are remembered', () => {
  const okFetch = (cards: unknown[]) =>
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ data: cards }),
    })

  it('records a not-found id so the next run does not ask for it again', async () => {
    const db = makeFakeDb()
    await backfillScryfallCacheForIds({
      db,
      scryfallIds: ['a', 'ghost'],
      cacheByScryfallId: {},
      fetchImpl: okFetch([scryfallCard('a')]),
      sleepImpl: async () => {},
    })
    expect(db.store[SCRYFALL_NOT_FOUND_COLLECTION]?.ghost).toBeDefined()
    // And NOT as a cache document: an empty cache doc would clear the entry
    // builder's `x` flag while carrying no data at all.
    expect(db.written.ghost).toBeUndefined()
  })

  it('skips an id already recorded as not found rather than re-requesting it', async () => {
    const db = makeFakeDb()
    db.store[SCRYFALL_NOT_FOUND_COLLECTION] = { ghost: { notFoundAt: Date.now() } }
    const fetchImpl = okFetch([])
    const result = await backfillScryfallCacheForIds({
      db,
      scryfallIds: ['ghost'],
      cacheByScryfallId: {},
      fetchImpl,
      sleepImpl: async () => {},
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.skippedKnownMissing).toBe(1)
  })

  it('retries an id whose not-found record has gone stale', async () => {
    const db = makeFakeDb()
    db.store[SCRYFALL_NOT_FOUND_COLLECTION] = {
      ghost: { notFoundAt: Date.now() - (NOT_FOUND_RETRY_MS + 60000) },
    }
    const fetchImpl = okFetch([scryfallCard('ghost')])
    await backfillScryfallCacheForIds({
      db,
      scryfallIds: ['ghost'],
      cacheByScryfallId: {},
      fetchImpl,
      sleepImpl: async () => {},
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

/**
 * MEDIUM-1 (review round 4) — a 200 with an unexpected body used to mark the
 * WHOLE batch as non-existent for 30 days, and report `failed: 0`.
 *
 * MEASURED by the reviewer against the real module: `fetchImpl` returning
 * `{ok: true, status: 200, json: () => ({object: 'error'})}` over five VALID
 * ids produced `{notFound: 5, failed: 0}`, and all five were written into
 * `scryfall_not_found`. Nothing in the result said anything had gone wrong.
 *
 * The cause was inferring "not found" BY ABSENCE: `cards: (data && data.data)
 * || []` discarded the `not_found` array the endpoint itself returns, so any
 * 200 without `data` — a proxy, a captive portal, an API shape change, an
 * error wrapped in a 200 — read as "Scryfall knows none of these". Up to 75
 * legitimate cards per batch would then keep `sc: ''` for 30 days, with no
 * Card Kingdom price and no repair path short of deleting documents by hand.
 *
 * Two rules, neither of which assumes anything about the API: a body without
 * a `data` ARRAY is a FAILED batch, and when `not_found` is present it is the
 * AUTHORITY on which ids do not exist — never the set difference.
 */
describe('backfillScryfallCacheForIds — a 200 is not automatically an answer', () => {
  const ids = ['a', 'b', 'c', 'd', 'e']
  const bodyFetch = (body: unknown) =>
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => body,
    })

  it('treats a 200 whose body has no `data` array as a FAILED batch, not as five non-existent cards', async () => {
    const db = makeFakeDb()
    const result = await backfillScryfallCacheForIds({
      db,
      scryfallIds: ids,
      cacheByScryfallId: {},
      fetchImpl: bodyFetch({ object: 'error' }),
      sleepImpl: async () => {},
    })
    expect(result.failed).toBe(5)
    expect(result.notFound).toBe(0)
    // And nothing was tombstoned: a 30-day "this card does not exist" record
    // is exactly what must NOT come out of an unreadable response.
    expect(db.store[SCRYFALL_NOT_FOUND_COLLECTION]).toBeUndefined()
  })

  it('treats a 200 with no body at all as a failed batch', async () => {
    const db = makeFakeDb()
    const result = await backfillScryfallCacheForIds({
      db,
      scryfallIds: ids,
      cacheByScryfallId: {},
      fetchImpl: bodyFetch(null),
      sleepImpl: async () => {},
    })
    expect(result.failed).toBe(5)
    expect(result.notFound).toBe(0)
  })

  it('treats a `data` that is not an array as a failed batch', async () => {
    const db = makeFakeDb()
    const result = await backfillScryfallCacheForIds({
      db,
      scryfallIds: ids,
      cacheByScryfallId: {},
      fetchImpl: bodyFetch({ data: { 0: scryfallCard('a') } }),
      sleepImpl: async () => {},
    })
    expect(result.failed).toBe(5)
    expect(result.notFound).toBe(0)
  })

  // THE NORMAL RESPONSE of POST /cards/collection: some identifiers resolve,
  // the rest come back in `not_found`. This is the path that runs most.
  //
  // `d` is deliberately in NEITHER array — the shape that separates the two
  // rules. Under the authority rule only `b` is a miss; under the old set
  // difference `d` would be tombstoned for 30 days on the strength of an
  // anomaly nobody asserted.
  it('uses `not_found` as the authority on the mixed response, the endpoint’s normal shape', async () => {
    const db = makeFakeDb()
    const cacheByScryfallId: Record<string, Record<string, unknown>> = {}
    const result = await backfillScryfallCacheForIds({
      db,
      scryfallIds: ['a', 'b', 'c', 'd'],
      cacheByScryfallId,
      fetchImpl: bodyFetch({
        data: [scryfallCard('a'), scryfallCard('c')],
        // Scryfall echoes the identifier objects that failed to resolve.
        not_found: [{ id: 'b' }],
      }),
      sleepImpl: async () => {},
    })
    expect(result.written).toBe(2)
    expect(result.notFound).toBe(1)
    expect(result.failed).toBe(0)
    expect(cacheByScryfallId.a?.set).toBe('m20')
    expect(db.store[SCRYFALL_NOT_FOUND_COLLECTION]?.b).toBeDefined()
    expect(db.store[SCRYFALL_NOT_FOUND_COLLECTION]?.a).toBeUndefined()
    expect(db.store[SCRYFALL_NOT_FOUND_COLLECTION]?.c).toBeUndefined()
    expect(db.store[SCRYFALL_NOT_FOUND_COLLECTION]?.d).toBeUndefined()
  })

  it('records nothing when `not_found` is present and empty, even if a card is missing from `data`', async () => {
    // Scryfall said "none of these are missing". Believe IT, not the set
    // difference — an id absent from both arrays is an anomaly, and inventing
    // a 30-day tombstone for it is the exact damage MEDIUM-1 describes.
    const db = makeFakeDb()
    const result = await backfillScryfallCacheForIds({
      db,
      scryfallIds: ['a', 'b'],
      cacheByScryfallId: {},
      fetchImpl: bodyFetch({ data: [scryfallCard('a')], not_found: [] }),
      sleepImpl: async () => {},
    })
    expect(result.written).toBe(1)
    expect(result.notFound).toBe(0)
    expect(db.store[SCRYFALL_NOT_FOUND_COLLECTION]).toBeUndefined()
  })

  it('accepts a bare string identifier in `not_found` as well as an object', async () => {
    const db = makeFakeDb()
    const result = await backfillScryfallCacheForIds({
      db,
      scryfallIds: ['a', 'b'],
      cacheByScryfallId: {},
      fetchImpl: bodyFetch({ data: [scryfallCard('a')], not_found: ['b'] }),
      sleepImpl: async () => {},
    })
    expect(result.notFound).toBe(1)
    expect(db.store[SCRYFALL_NOT_FOUND_COLLECTION]?.b).toBeDefined()
  })

  it('ignores a `not_found` id that was never in this batch', async () => {
    const db = makeFakeDb()
    const result = await backfillScryfallCacheForIds({
      db,
      scryfallIds: ['a'],
      cacheByScryfallId: {},
      fetchImpl: bodyFetch({ data: [], not_found: [{ id: 'a' }, { id: 'somebody-elses-id' }] }),
      sleepImpl: async () => {},
    })
    expect(result.notFound).toBe(1)
    expect(db.store[SCRYFALL_NOT_FOUND_COLLECTION]?.['somebody-elses-id']).toBeUndefined()
  })
})

/**
 * LOW-3 (review round 4) — two clocks in the same loop. The Scryfall throttle
 * read `Date.now()` while the time budget read the injected `nowImpl()`, so a
 * test injecting a fake clock controlled the budget but NOT the rate limiter,
 * which kept measuring wall time. Nothing breaks today; it is a half-done
 * injection that would mislead the next test written against it.
 */
describe('backfillScryfallCacheForIds — one injected clock, not two', () => {
  it('paces requests off the injected clock, so a fake clock controls the throttle too', async () => {
    // A clock that advances 200ms per reading — comfortably past
    // SCRYFALL_MIN_INTERVAL_MS, so a module reading THIS clock never needs to
    // sleep between batches. A module reading the wall clock sees ~0ms
    // elapsed and sleeps.
    let t = 1_000_000
    const nowImpl = () => {
      t += 200
      return t
    }
    const sleepImpl = vi.fn().mockResolvedValue(undefined)
    const idsTwoBatches = Array.from({ length: SCRYFALL_BATCH_SIZE + 1 }, (_, i) => `id-${i}`)
    const result = await backfillScryfallCacheForIds({
      db: makeFakeDb(),
      scryfallIds: idsTwoBatches,
      cacheByScryfallId: {},
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ data: [], not_found: [] }),
      }),
      sleepImpl,
      nowImpl,
    })
    expect(result.requests).toBe(2)
    expect(sleepImpl).not.toHaveBeenCalled()
  })
})
