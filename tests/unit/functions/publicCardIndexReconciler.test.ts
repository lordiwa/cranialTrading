/**
 * TASK-247 tanda 2b, review round 2 (MEDIUM-4/5/3). The reviewer's push
 * back was specific: "que no se pueda testear el I/O no significa que no
 * se pueda testear qué colección elegís" — a full reconciliation run,
 * unlike a bare Firestore SDK call, doesn't actually need admin.initializeApp()
 * or a real project: functions/lib/publicCardIndexReconciler.js takes `db`
 * as a plain injected argument, so a small hand-rolled fake Firestore is
 * enough to exercise the real orchestration end-to-end — including the
 * three fixes from this review round that were previously only reachable
 * by real Firestore reads/writes:
 *   - MEDIUM-5: a chunk doc whose path disagrees with its own `id` field
 *     (e.g. path "07", `id: 7`) routes to wipe-subcollection and actually
 *     gets deleted by its real path.
 *   - MEDIUM-3: two reconciliations for the same seller can't run
 *     concurrently — the second is refused while the first's lease is live.
 *   - The collapse guard (MEDIUM-1, functions/lib/publicCardIndexExecutor.js)
 *     actually stops a real run from writing anything when tripped.
 *
 * This is still not a substitute for the pure unit tests on
 * publicCardIndex.js / publicCardIndexExecutor.js — it is a thin
 * end-to-end smoke layer on top of them, using a fake that only
 * implements the small slice of the Firestore SDK this module calls.
 */
import { describe, expect, it, vi } from 'vitest'
import { reconcilePublicCardIndexForUser, acquireReconcileLease } from '../../../functions/lib/publicCardIndexReconciler.js'

// ---------------------------------------------------------------------
// Minimal fake Firestore — implements exactly the calls
// publicCardIndexReconciler.js makes: collection().where().select()
// .orderBy().limit().startAfter().get(), collection().doc(id).get(),
// collection().listDocuments(), db.batch(), db.getAll(...), and
// db.runTransaction(cb) with tx.get()/tx.set().
// ---------------------------------------------------------------------
function makeFakeDb(initialStore: Record<string, Record<string, any>>) {
  const store: Record<string, Record<string, any>> = JSON.parse(JSON.stringify(initialStore))

  function collectionRef(path: string) {
    const state: { filters: Array<[string, string, any]>; limit: number; startAfterId: string | null } = {
      filters: [],
      limit: Infinity,
      startAfterId: null,
    }
    const ref: any = {
      path,
      where(field: string, _op: string, value: any) {
        state.filters.push([field, _op, value])
        return ref
      },
      select(..._fields: string[]) {
        return ref
      },
      orderBy(..._args: any[]) {
        return ref
      },
      limit(n: number) {
        state.limit = n
        return ref
      },
      startAfter(doc: any) {
        state.startAfterId = doc.id
        return ref
      },
      doc(id: string) {
        return docRef(path, id)
      },
      async get() {
        let entries = Object.entries(store[path] || {})
        for (const [field, , value] of state.filters) {
          entries = entries.filter(([, data]) => data[field] === value)
        }
        entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        if (state.startAfterId) {
          const idx = entries.findIndex(([id]) => id === state.startAfterId)
          entries = entries.slice(idx + 1)
        }
        entries = entries.slice(0, state.limit)
        const docs = entries.map(([id, data]) => ({ id, exists: true, data: () => data }))
        return { docs, empty: docs.length === 0 }
      },
      async listDocuments() {
        return Object.keys(store[path] || {}).map((id) => docRef(path, id))
      },
    }
    return ref
  }

  function docRef(path: string, id: string) {
    return {
      id,
      _path: path,
      async get() {
        const data = (store[path] || {})[id]
        return { id, exists: data !== undefined, data: () => data }
      },
      async set(data: any) {
        store[path] = store[path] || {}
        store[path][id] = data
      },
    }
  }

  const db: any = {
    collection(path: string) {
      return collectionRef(path)
    },
    async getAll(...refs: any[]) {
      const results = []
      for (const ref of refs) results.push(await ref.get())
      return results
    },
    batch() {
      const ops: Array<{ type: 'set' | 'delete'; ref: any; data?: any; merge?: boolean }> = []
      return {
        // The backfill writes cache docs with { merge: true }; the reconciler
        // writes chunk docs without it. A fake that ignored the flag would
        // make a merging write look like a replacing one.
        set(ref: any, data: any, opts?: { merge?: boolean }) {
          ops.push({ type: 'set', ref, data, merge: !!(opts && opts.merge) })
        },
        delete(ref: any) {
          ops.push({ type: 'delete', ref })
        },
        async commit() {
          for (const op of ops) {
            store[op.ref._path] = store[op.ref._path] || {}
            if (op.type === 'set') {
              store[op.ref._path][op.ref.id] = op.merge
                ? { ...(store[op.ref._path][op.ref.id] || {}), ...op.data }
                : op.data
            }
            else delete store[op.ref._path][op.ref.id]
          }
        },
      }
    },
    async runTransaction(fn: (tx: any) => Promise<any>) {
      const tx = {
        async get(ref: any) {
          return ref.get()
        },
        set(ref: any, data: any, opts?: { merge?: boolean }) {
          store[ref._path] = store[ref._path] || {}
          const existing = store[ref._path][ref.id] || {}
          store[ref._path][ref.id] = opts && opts.merge ? { ...existing, ...data } : data
        },
      }
      return fn(tx)
    },
  }
  return { db, store }
}

// Real scryfallId shape matters elsewhere in this ticket's fixtures, but
// this module never inspects scryfallId beyond using it as a cache lookup
// key, so a short id is fine here.
function publicCardDoc(cardId: string, scryfallId: string, extra: Record<string, any> = {}) {
  return {
    userId: 'seller-1',
    cardId,
    scryfallId,
    cardName: `Card ${cardId}`,
    cardNameLower: `card ${cardId}`,
    quantity: 1,
    price: 1,
    status: 'sale',
    foil: false,
    condition: 'NM',
    setCode: 'abc',
    edition: 'Some Set',
    updatedAt: { toMillis: () => 1700000000000 },
    ...extra,
  }
}

/**
 * MEDIUM-1 (review round 3): five tests in this file used to run with no
 * `scryfallFetch` injected at all, so the reconcile's cache backfill reached
 * the REAL api.scryfall.com — measured by the reviewer as five live HTTP 400
 * responses (the fixtures' short ids are not valid Scryfall ids). They were
 * green by luck, tied the suite to a third party, and under a real 429 would
 * have entered the retry path with the REAL sleep. Every call below now
 * injects both, whether or not it expects the backfill to run.
 */
function offlineScryfall() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ data: [] }),
  })
}

describe('reconcilePublicCardIndexForUser (fake Firestore, end-to-end)', () => {
  it('reads public_cards from the ROOT collection filtered by userId, not a subcollection', async () => {
    const { db } = makeFakeDb({
      public_cards: {
        c1: publicCardDoc('c1', 's1'),
        c2: publicCardDoc('c2', 's2', { userId: 'someone-else' }), // must NOT be read
      },
    })
    const result = await reconcilePublicCardIndexForUser({
      db,
      userId: 'seller-1',
      documentIdOrderBy: '__name__',
      scryfallFetch: offlineScryfall(),
      sleepImpl: async () => {},
    })
    expect(result.count).toBe(1) // only c1, not someone-else's c2
  })

  it('MEDIUM-5: a chunk doc whose path disagrees with its own id field routes to wipe-subcollection and gets deleted by real path', async () => {
    const { db, store } = makeFakeDb({
      public_cards: { c1: publicCardDoc('c1', 's1') },
      users: {}, // unused top-level, chunks live at users/seller-1/public_card_index
    })
    // Seed a corrupt chunk doc at path "07" whose declared id field is 7 —
    // a well-formed-looking id, but the PATH itself is wrong.
    store['users/seller-1/public_card_index'] = {
      '07': { id: 7, entries: [{ i: 'stale-card', s: 'stale-scryfall' }] },
      _meta: { schemaVersion: 1, totalChunks: 8, count: 1, chunkTargetSize: 400 },
    }

    const result = await reconcilePublicCardIndexForUser({
      db,
      userId: 'seller-1',
      documentIdOrderBy: '__name__',
      scryfallFetch: offlineScryfall(),
      sleepImpl: async () => {},
    })

    expect(result.strategy).toBe('wipe-subcollection')
    // The corrupt doc at path "07" must actually be gone afterward.
    expect(store['users/seller-1/public_card_index']['07']).toBeUndefined()
    // The real card (c1) must be present somewhere in the rebuilt index.
    const chunkEntries = Object.entries(store['users/seller-1/public_card_index'])
      .filter(([id]) => id !== '_meta')
      .flatMap(([, chunk]: [string, any]) => chunk.entries)
    expect(chunkEntries.some((e: any) => e.i === 'c1')).toBe(true)
  })

  it('MEDIUM-1/collapse guard: refuses and writes nothing when the read comes back far smaller than the existing index', async () => {
    const { db, store } = makeFakeDb({
      public_cards: { c1: publicCardDoc('c1', 's1') }, // only 1 doc read
    })
    store['users/seller-1/public_card_index'] = {
      0: { id: 0, entries: Array.from({ length: 500 }, (_, i) => ({ i: `card-${i}`, s: `s-${i}` })) },
      _meta: { schemaVersion: 1, totalChunks: 1, count: 6647, chunkTargetSize: 400 },
    }
    const before = JSON.parse(JSON.stringify(store['users/seller-1/public_card_index']))

    const result = await reconcilePublicCardIndexForUser({
      db,
      userId: 'seller-1',
      documentIdOrderBy: '__name__',
      scryfallFetch: offlineScryfall(),
      sleepImpl: async () => {},
    })

    expect(result.refused).toBe(true)
    expect(store['users/seller-1/public_card_index']).toEqual(before) // nothing written
  })

  it('MEDIUM-1: forceEmptyIndex lets a collapsing rebuild through deliberately', async () => {
    const { db, store } = makeFakeDb({
      public_cards: {}, // seller genuinely has 0 public cards now
    })
    store['users/seller-1/public_card_index'] = {
      0: { id: 0, entries: Array.from({ length: 500 }, (_, i) => ({ i: `card-${i}`, s: `s-${i}` })) },
      _meta: { schemaVersion: 1, totalChunks: 1, count: 6647, chunkTargetSize: 400 },
    }

    const result = await reconcilePublicCardIndexForUser({
      db,
      userId: 'seller-1',
      documentIdOrderBy: '__name__',
      forceEmptyIndex: true,
      scryfallFetch: offlineScryfall(),
      sleepImpl: async () => {},
    })

    expect(result.refused).toBeUndefined()
    expect(result.count).toBe(0)
  })

  it('MEDIUM-3: a second reconciliation for the same seller is refused while the first holds a live lease', async () => {
    const { db, store } = makeFakeDb({
      public_cards: { c1: publicCardDoc('c1', 's1') },
    })
    store['users/seller-1/public_card_index'] = {
      _meta: { schemaVersion: 1, totalChunks: 1, count: 0, chunkTargetSize: 400, reconcileLeaseAt: Date.now() },
    }

    const result = await reconcilePublicCardIndexForUser({
      db,
      userId: 'seller-1',
      documentIdOrderBy: '__name__',
      scryfallFetch: offlineScryfall(),
      sleepImpl: async () => {},
    })

    expect(result.refused).toBe(true)
    expect(result.message).toMatch(/reconciliation attempt started/)
  })

  // Review round 3 (reviewer's mutation): every lease test above seeds
  // `reconcileLeaseAt` by hand and checks it's HONORED — none of them
  // check that acquireReconcileLease actually WRITES it. Deleting the
  // `tx.set(...)` line inside acquireReconcileLease left all lease tests
  // above green (7/7) because none of them observe the write side. This
  // test calls acquireReconcileLease directly and inspects the fake
  // store afterward — it must fail if that write is ever removed.
  it('MEDIUM-3: acquireReconcileLease actually stamps reconcileLeaseAt on the meta doc, not just honors an existing one', async () => {
    const { db, store } = makeFakeDb({ public_cards: {} })
    const metaRef = db.collection('users/seller-1/public_card_index').doc('_meta')
    const before = Date.now()

    const outcome = await acquireReconcileLease(db, metaRef)

    expect(outcome.acquired).toBe(true)
    const stamped = store['users/seller-1/public_card_index']['_meta'].reconcileLeaseAt
    expect(typeof stamped).toBe('number')
    expect(stamped).toBeGreaterThanOrEqual(before)
  })

  it('MEDIUM-3: a STALE lease (older than the staleness window) does not block a new run', async () => {
    const { db, store } = makeFakeDb({
      public_cards: { c1: publicCardDoc('c1', 's1') },
    })
    store['users/seller-1/public_card_index'] = {
      _meta: {
        schemaVersion: 1,
        totalChunks: 1,
        count: 0,
        chunkTargetSize: 400,
        reconcileLeaseAt: Date.now() - 20 * 60 * 1000, // 20 minutes ago, well past the 10-minute staleness window
      },
    }

    const result = await reconcilePublicCardIndexForUser({
      db,
      userId: 'seller-1',
      documentIdOrderBy: '__name__',
      scryfallFetch: offlineScryfall(),
      sleepImpl: async () => {},
    })

    expect(result.refused).toBeUndefined()
  })

  // Review round 3 gap: the fail-closed path (non-finite meta.count, but
  // real entries present) is unit-tested on requiresCollapseConfirmation
  // directly, but wasn't exercised end-to-end through the reconciler's OWN
  // wiring of `currentEntryCount` (summed from the real chunk read).
  // Passing a hardcoded `0` for that argument at the call site would leave
  // this green for the wrong reason — this test would catch it.
  it('MEDIUM-1 fail-closed, end-to-end: a corrupted non-finite meta.count with real chunk entries still refuses', async () => {
    const { db, store } = makeFakeDb({
      public_cards: {}, // read comes back small/empty either way
    })
    store['users/seller-1/public_card_index'] = {
      0: { id: 0, entries: [{ i: 'card-1', s: 's-1' }] }, // real entries present in the chunk
      _meta: { schemaVersion: 1, totalChunks: 1, count: 'corrupted' as unknown as number, chunkTargetSize: 400 },
    }
    const before = JSON.parse(JSON.stringify(store['users/seller-1/public_card_index']))

    const result = await reconcilePublicCardIndexForUser({
      db,
      userId: 'seller-1',
      documentIdOrderBy: '__name__',
      scryfallFetch: offlineScryfall(),
      sleepImpl: async () => {},
    })

    expect(result.refused).toBe(true)
    expect(store['users/seller-1/public_card_index']).toEqual(before) // nothing written
  })

  it('dryRun performs no writes even when the index is genuinely divergent', async () => {
    const { db, store } = makeFakeDb({
      public_cards: { c1: publicCardDoc('c1', 's1'), c2: publicCardDoc('c2', 's2') },
    })
    // No existing index at all yet.
    const result = await reconcilePublicCardIndexForUser({
      db,
      userId: 'seller-1',
      documentIdOrderBy: '__name__',
      dryRun: true,
      scryfallFetch: offlineScryfall(),
      sleepImpl: async () => {},
    })
    expect(result.dryRun).toBe(true)
    expect(store['users/seller-1/public_card_index']).toBeUndefined()
  })

  // ── TASK-247 tanda 4 ronda 2, HIGH-1 ────────────────────────────────────
  //
  // A public card whose document has no `setCode` and whose scryfall_cache
  // document has no `set` either used to come out of the index with `sc: ''`,
  // which costs it its Card Kingdom price (getCardPrices cannot resolve an
  // mtgjson uuid without a set code) and drops it out of the profile's set
  // filter. MEASURED on production 2026-08-19: 333 of the 2,387 distinct
  // scryfallIds without a setCode are in exactly that state. Rafael's
  // decision (DECISION 9): the reconcile fetches them from Scryfall and
  // populates scryfall_cache, so the index it is building right now already
  // has them.
  describe('HIGH-1 — the reconcile fills scryfall_cache gaps from Scryfall', () => {
    const seed = () =>
      makeFakeDb({
        public_cards: {
          c1: publicCardDoc('c1', 's1', { setCode: undefined }),
        },
        scryfall_cache: {},
      })

    const scryfallResponse = (cards: any[]) => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ data: cards }),
    })

    it('writes the fetched metadata into scryfall_cache', async () => {
      const { db, store } = seed()
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(scryfallResponse([{ id: 's1', name: 'Card c1', set: 'm20', set_name: 'Core Set 2020', type_line: 'Instant' }]))
      await reconcilePublicCardIndexForUser({
        db,
        userId: 'seller-1',
        documentIdOrderBy: '__name__',
        scryfallFetch: fetchImpl,
        sleepImpl: async () => {},
      })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(store.scryfall_cache.s1.set).toBe('m20')
    })

    it('the index built in the SAME run already carries the set code', async () => {
      // The point of doing this in the writer: a backfill whose result only
      // showed up on the NEXT reconcile would leave the profile without a CK
      // price until someone ran it twice.
      const { db, store } = seed()
      await reconcilePublicCardIndexForUser({
        db,
        userId: 'seller-1',
        documentIdOrderBy: '__name__',
        scryfallFetch: vi
          .fn()
          .mockResolvedValue(scryfallResponse([{ id: 's1', name: 'Card c1', set: 'm20', set_name: 'Core Set 2020' }])),
        sleepImpl: async () => {},
      })
      const chunks = Object.entries(store['users/seller-1/public_card_index'] || {})
        .filter(([id]) => id !== '_meta')
        .flatMap(([, doc]: [string, any]) => doc.entries || [])
      expect(chunks).toHaveLength(1)
      expect(chunks[0].sc).toBe('M20')
    })

    it('never spends a Scryfall request on an id the cache already has a set for', async () => {
      const { db } = makeFakeDb({
        public_cards: { c1: publicCardDoc('c1', 's1', { setCode: undefined }) },
        scryfall_cache: { s1: { set: 'war', type_line: 'Instant' } },
      })
      const fetchImpl = vi.fn()
      await reconcilePublicCardIndexForUser({
        db,
        userId: 'seller-1',
        documentIdOrderBy: '__name__',
        scryfallFetch: fetchImpl,
        sleepImpl: async () => {},
      })
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('a Scryfall outage does NOT abort the reconcile — the index is still written', async () => {
      const { db, store } = seed()
      const result = await reconcilePublicCardIndexForUser({
        db,
        userId: 'seller-1',
        documentIdOrderBy: '__name__',
        scryfallFetch: vi.fn().mockRejectedValue(new Error('ECONNRESET')),
        sleepImpl: async () => {},
      })
      expect(result.refused).toBeFalsy()
      expect(result.count).toBe(1)
      const chunks = Object.entries(store['users/seller-1/public_card_index'] || {})
        .filter(([id]) => id !== '_meta')
        .flatMap(([, doc]: [string, any]) => doc.entries || [])
      expect(chunks).toHaveLength(1)
      // The unresolvable card keeps an empty set code and stays in the index
      // rather than breaking it.
      expect(chunks[0].sc).toBe('')
    })

    it('does not touch Scryfall at all on a dry run', async () => {
      const { db } = seed()
      const fetchImpl = vi.fn()
      await reconcilePublicCardIndexForUser({
        db,
        userId: 'seller-1',
        documentIdOrderBy: '__name__',
        dryRun: true,
        scryfallFetch: fetchImpl,
        sleepImpl: async () => {},
      })
      expect(fetchImpl).not.toHaveBeenCalled()
    })
  })


  /**
   * MEDIUM-4 (review round 3) — every HIGH-1 test above starts from an EMPTY
   * `scryfall_cache`, which is the MINORITY shape. The majority shape is a
   * cache document that already exists and is rich, only without `set`
   * (written by the import path, whose buildCacheFieldsFromScryfall never
   * stored it). With an empty base a merging write and a replacing write are
   * indistinguishable, so nothing here could tell them apart.
   *
   * The field that makes the difference visible is `produced_mana`: the land
   * rule categorizes a land by the mana it PRODUCES, not by `colors`, and the
   * field travels into the entry as `pm`. A replacing write would blank it
   * for every card whose Scryfall response does not repeat it, dropping those
   * lands into the generic bucket and lowering the profile's per-color counts
   * silently — this ticket's own symptom, with a new cause.
   */
  describe('MEDIUM-4 — a cache document that exists but is INCOMPLETE is merged, not replaced', () => {
    it('adds the missing set while keeping produced_mana, so the land rule still fires', async () => {
      const { db, store } = makeFakeDb({
        public_cards: { c1: publicCardDoc('c1', 's1', { setCode: undefined }) },
        // The dominant production shape: rich, but no `set`.
        scryfall_cache: { s1: { type_line: 'Land', produced_mana: ['B'], keywords: ['Cycling'] } },
      })
      // Scryfall's answer deliberately does not repeat produced_mana.
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ data: [{ id: 's1', name: 'Card c1', set: 'znr', set_name: 'Zendikar Rising' }] }),
      })

      await reconcilePublicCardIndexForUser({
        db,
        userId: 'seller-1',
        documentIdOrderBy: '__name__',
        scryfallFetch: fetchImpl,
        sleepImpl: async () => {},
      })

      const entries = Object.entries(store['users/seller-1/public_card_index'] || {})
        .filter(([id]) => id !== '_meta')
        .flatMap(([, doc]: [string, any]) => doc.entries || [])
      expect(entries).toHaveLength(1)
      // sc is the CODE, uppercased; ed is the human name — never crossed.
      expect(entries[0].sc).toBe('ZNR')
      expect(entries[0].ed).toBe('Some Set')
      // The land rule's field survived the backfill.
      expect(entries[0].pm).toEqual(['B'])
      expect(entries[0].t).toBe('Land')
      // And the cache document itself kept what it already had.
      expect(store.scryfall_cache.s1.produced_mana).toEqual(['B'])
      expect(store.scryfall_cache.s1.set).toBe('znr')
    })
  })

  /**
   * MEDIUM-3 (review round 3) — the backfill used to run in phase 2b, BEFORE
   * the collapse guard and BEFORE the lease. Two consequences: a run that was
   * about to be refused still spent Scryfall quota, and the lease — the one
   * mechanism that stops two writers working the same seller at once — did
   * not cover the external call at all. It now runs after both.
   *
   * The lease and the collapse guard themselves are untouched; only the
   * backfill moved relative to them.
   */
  describe('MEDIUM-3 — no Scryfall quota is spent on a run that will not write', () => {
    it('does not call Scryfall when the collapse guard refuses the run', async () => {
      const { db, store } = makeFakeDb({
        public_cards: { c1: publicCardDoc('c1', 's1', { setCode: undefined }) },
      })
      store['users/seller-1/public_card_index'] = {
        0: { id: 0, entries: Array.from({ length: 500 }, (_, i) => ({ i: `card-${i}`, s: `s-${i}` })) },
        _meta: { schemaVersion: 1, totalChunks: 1, count: 6647, chunkTargetSize: 400 },
      }
      const fetchImpl = offlineScryfall()

      const result = await reconcilePublicCardIndexForUser({
        db,
        userId: 'seller-1',
        documentIdOrderBy: '__name__',
        scryfallFetch: fetchImpl,
        sleepImpl: async () => {},
      })

      expect(result.refused).toBe(true)
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('does not call Scryfall when another run already holds the lease', async () => {
      const { db, store } = makeFakeDb({
        public_cards: { c1: publicCardDoc('c1', 's1', { setCode: undefined }) },
      })
      store['users/seller-1/public_card_index'] = {
        _meta: { schemaVersion: 1, totalChunks: 1, count: 0, chunkTargetSize: 400, reconcileLeaseAt: Date.now() },
      }
      const fetchImpl = offlineScryfall()

      const result = await reconcilePublicCardIndexForUser({
        db,
        userId: 'seller-1',
        documentIdOrderBy: '__name__',
        scryfallFetch: fetchImpl,
        sleepImpl: async () => {},
      })

      expect(result.refused).toBe(true)
      expect(fetchImpl).not.toHaveBeenCalled()
    })
  })

})
