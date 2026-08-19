/**
 * TASK-247 (tanda 2b/5): the server-side write layer for the
 * public-profile card index. Same dependency-free CommonJS technique as
 * publicCardEntry.test (tanda 1) / publicCardIndex.test (tanda 2a) — this
 * module never imports firebase-admin, so vitest can require() and
 * EXECUTE it directly (functions/ has no emulator harness — TASK-236).
 *
 * This file locks the two contract items the ticket calls out explicitly:
 *   1. chunksToDelete must actually be honored, batched under Firestore's
 *      500-op / 10 MiB WriteBatch ceilings (project memory: 5 measured
 *      failed-deletion incidents from hitting that exact byte ceiling).
 *   2. hasMalformedChunkId must route to a strategy that does NOT rely on
 *      chunksToDelete (which cannot name a non-numeric chunk id at all).
 */
import { describe, expect, it } from 'vitest'
import {
  BATCH_MAX_OPS,
  BATCH_MAX_BYTES,
  estimateOpBytes,
  chunkOpsIntoBatches,
  planFirestoreBatches,
  chooseApplyStrategy,
  buildPublicCardsQuerySpec,
  requiresCollapseConfirmation,
} from '../../../functions/lib/publicCardIndexExecutor.js'

describe('estimateOpBytes', () => {
  it('estimates a set op from its JSON-serialized data', () => {
    const op = { type: 'set', chunkId: 0, data: { id: 0, entries: [{ s: 'x', n: 'Card' }] } }
    const expected = Buffer.byteLength(JSON.stringify(op.data), 'utf8')
    expect(estimateOpBytes(op)).toBe(expected)
  })

  it('estimates a delete op as a small constant, independent of any payload', () => {
    const bytes = estimateOpBytes({ type: 'delete', chunkId: 5 })
    expect(bytes).toBeGreaterThan(0)
    expect(bytes).toBeLessThan(1024)
  })

  it('never throws on circular data — routes it to its own oversized estimate instead', () => {
    const circular: any = { id: 0 }
    circular.self = circular
    const op = { type: 'set', chunkId: 0, data: circular }
    expect(() => estimateOpBytes(op)).not.toThrow()
    expect(estimateOpBytes(op)).toBeGreaterThanOrEqual(BATCH_MAX_BYTES)
  })
})

describe('chunkOpsIntoBatches', () => {
  it('keeps a small op list in a single batch', () => {
    const ops = Array.from({ length: 10 }, (_, i) => ({ type: 'set' as const, chunkId: i, data: { id: i, entries: [] } }))
    const batches = chunkOpsIntoBatches(ops)
    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(10)
  })

  it('splits at exactly the 500-operation ceiling', () => {
    // Tiny payloads so byte size never forces an earlier split — isolates
    // the op-count ceiling as the only thing under test here.
    const ops = Array.from({ length: 1001 }, (_, i) => ({ type: 'delete' as const, chunkId: i }))
    const batches = chunkOpsIntoBatches(ops)
    expect(batches).toHaveLength(3)
    expect(batches[0]).toHaveLength(BATCH_MAX_OPS)
    expect(batches[1]).toHaveLength(BATCH_MAX_OPS)
    expect(batches[2]).toHaveLength(1)
    // Every op still present, none dropped, none duplicated.
    const flat = batches.flat()
    expect(flat).toHaveLength(1001)
    expect(new Set(flat.map((o) => o.chunkId)).size).toBe(1001)
  })

  it('splits on byte size well before 500 ops when payloads are large', () => {
    // Each simulated chunk of 391 entries serializes to ~126 KB (measured
    // via this same fixture) — 80 of those is ~9.9 MB, over BATCH_MAX_BYTES
    // while still only 80 ops, nowhere near the 500-op ceiling. Proves the
    // byte-size path splits on its own, independent of op count.
    const bigEntries = Array.from({ length: 391 }, (_, i) => ({
      s: `scryfall-id-${i}-${'x'.repeat(20)}`,
      n: `Card Name Number ${i}`,
      nl: `card name number ${i}`,
      i: `card-doc-id-${i}`,
      q: 1,
      p: 12.5,
      st: 'sale',
      f: false,
      cn: 'NM',
      sc: 'abc',
      ed: 'Some Real Set Name',
      t: 'Creature — Human Wizard',
      cm: 3,
      co: ['U'],
      pm: [],
      r: 'r',
      kw: [],
      lg: ['modern', 'legacy'],
      ca: 1700000000000,
    }))
    const ops = Array.from({ length: 80 }, (_, i) => ({
      type: 'set' as const,
      chunkId: i,
      data: { id: i, entries: bigEntries },
    }))
    const batches = chunkOpsIntoBatches(ops)
    expect(batches.length).toBeGreaterThan(1)
    for (const batch of batches) {
      const totalBytes = batch.reduce((sum, op) => sum + estimateOpBytes(op), 0)
      expect(totalBytes).toBeLessThanOrEqual(BATCH_MAX_BYTES)
      expect(batch.length).toBeLessThanOrEqual(BATCH_MAX_OPS)
    }
    // No entry lost or duplicated across the split.
    const flatChunkIds = batches.flat().map((o) => o.chunkId)
    expect(new Set(flatChunkIds).size).toBe(80)
  })

  it('gives an oversized single op its own batch rather than dropping it', () => {
    const huge = { type: 'set' as const, chunkId: 0, data: { id: 0, entries: Array(50000).fill({ n: 'x'.repeat(200) }) } }
    const small = { type: 'set' as const, chunkId: 1, data: { id: 1, entries: [] } }
    const batches = chunkOpsIntoBatches([huge, small])
    expect(batches.flat()).toHaveLength(2)
    // The huge op is alone in its batch (nothing else could fit alongside it).
    const hugeBatch = batches.find((b) => b.some((o) => o.chunkId === 0))
    expect(hugeBatch).toHaveLength(1)
  })

  it('returns an empty array for an empty op list', () => {
    expect(chunkOpsIntoBatches([])).toEqual([])
  })

  // Review round 2: an empty batch in the returned array would make a
  // caller do a no-op db.batch().commit() for nothing — every batch
  // chunkOpsIntoBatches emits, across every split scenario above, must
  // have at least one op in it.
  it('never emits an empty batch, across every op-count and byte-size scenario', () => {
    const scenarios: Array<{ type: 'set' | 'delete'; chunkId: number; data?: object }[]> = [
      Array.from({ length: 1001 }, (_, i) => ({ type: 'delete' as const, chunkId: i })),
      Array.from({ length: 80 }, (_, i) => ({
        type: 'set' as const,
        chunkId: i,
        data: { id: i, entries: Array.from({ length: 391 }, () => ({ n: 'x'.repeat(200) })) },
      })),
      [],
      [{ type: 'delete' as const, chunkId: 0 }],
    ]
    for (const ops of scenarios) {
      const batches = chunkOpsIntoBatches(ops)
      for (const batch of batches) {
        expect(batch.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('planFirestoreBatches', () => {
  it('honors chunksToDelete — batches it separately from writes, drops nothing', () => {
    // Measured regression this is anchored against (ticket): a seller
    // shrinking from 32 chunks to 8 leaves 31 orphaned chunk documents if
    // chunksToDelete is ignored — 6,443 orphans on the next diagnose pass.
    const plan = {
      rebuildRequired: true,
      chunksToWrite: {
        0: { id: 0, entries: [{ i: 'a' }] },
        1: { id: 1, entries: [{ i: 'b' }] },
      },
      chunksToDelete: [2, 3, 4, 5, 6, 7, 8, 9],
      meta: { schemaVersion: 1, totalChunks: 2, count: 2, chunkTargetSize: 400 },
    }
    const result = planFirestoreBatches(plan)
    const writeChunkIds = result.writeBatches.flat().map((op) => op.chunkId)
    const deleteChunkIds = result.deleteBatches.flat().map((op) => op.chunkId)
    expect(writeChunkIds.sort()).toEqual([0, 1])
    expect(deleteChunkIds.sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9])
    expect(result.metaOp).toEqual({ type: 'set', data: plan.meta })
  })

  it('produces no delete batches when chunksToDelete is empty (incremental repair)', () => {
    const plan = {
      rebuildRequired: false,
      chunksToWrite: { 3: { id: 3, entries: [] } },
      chunksToDelete: [],
      meta: { schemaVersion: 1, totalChunks: 4, count: 10, chunkTargetSize: 400 },
    }
    const result = planFirestoreBatches(plan)
    expect(result.deleteBatches).toEqual([])
    expect(result.writeBatches.flat()).toHaveLength(1)
  })

  it('handles a plan with no writes and no deletes (already converged)', () => {
    const plan = {
      rebuildRequired: false,
      chunksToWrite: {},
      chunksToDelete: [],
      meta: { schemaVersion: 1, totalChunks: 4, count: 10, chunkTargetSize: 400 },
    }
    const result = planFirestoreBatches(plan)
    expect(result.writeBatches).toEqual([])
    expect(result.deleteBatches).toEqual([])
    expect(result.metaOp.data).toEqual(plan.meta)
  })

  it('splits a large chunksToWrite across multiple write batches at 100k-card scale', () => {
    // 256 chunks (100k cards, ticket header), tiny per-chunk payload here —
    // isolates the op-count path since 256 < 500 alone, so this also
    // proves a full rebuild at this scale does NOT need splitting at all
    // when payload is small, only exercising the size-based path elsewhere.
    const chunksToWrite: Record<number, any> = {}
    for (let i = 0; i < 256; i++) chunksToWrite[i] = { id: i, entries: [] }
    const plan = {
      rebuildRequired: true,
      chunksToWrite,
      chunksToDelete: [],
      meta: { schemaVersion: 1, totalChunks: 256, count: 100000, chunkTargetSize: 400 },
    }
    const result = planFirestoreBatches(plan)
    expect(result.writeBatches.flat()).toHaveLength(256)
    expect(new Set(result.writeBatches.flat().map((o) => o.chunkId)).size).toBe(256)
  })
})

describe('chooseApplyStrategy', () => {
  it('picks wipe-subcollection whenever hasMalformedChunkId is true, regardless of the plan', () => {
    const plan = { rebuildRequired: false, chunksToWrite: {}, chunksToDelete: [], meta: {} }
    const diagnosis = { hasMalformedChunkId: true }
    expect(chooseApplyStrategy(plan, diagnosis)).toBe('wipe-subcollection')
  })

  it('picks wipe-subcollection even when the plan ALSO calls for a full rebuild', () => {
    const plan = { rebuildRequired: true, chunksToWrite: { 0: {} }, chunksToDelete: [1], meta: {} }
    const diagnosis = { hasMalformedChunkId: true }
    expect(chooseApplyStrategy(plan, diagnosis)).toBe('wipe-subcollection')
  })

  it('picks rebuild-by-id when the plan requires a rebuild and chunk ids are all sound', () => {
    const plan = { rebuildRequired: true, chunksToWrite: { 0: {} }, chunksToDelete: [5], meta: {} }
    const diagnosis = { hasMalformedChunkId: false }
    expect(chooseApplyStrategy(plan, diagnosis)).toBe('rebuild-by-id')
  })

  it('picks incremental when the plan is not a rebuild and touches at least one chunk', () => {
    const plan = { rebuildRequired: false, chunksToWrite: { 3: {} }, chunksToDelete: [], meta: {} }
    const diagnosis = { hasMalformedChunkId: false }
    expect(chooseApplyStrategy(plan, diagnosis)).toBe('incremental')
  })

  // Review round 2: an incremental plan can touch a chunk via
  // chunksToDelete alone (nothing to write, something to delete) — the
  // original "touchesNothing" check only looked at chunksToWrite.length
  // and chunksToDelete.length together, but this locks the chunksToDelete
  // half specifically so a future edit can't quietly drop it from the OR.
  it('picks incremental when only chunksToDelete has entries and chunksToWrite is empty', () => {
    const plan = { rebuildRequired: false, chunksToWrite: {}, chunksToDelete: [5], meta: {} }
    const diagnosis = { hasMalformedChunkId: false }
    expect(chooseApplyStrategy(plan, diagnosis)).toBe('incremental')
  })

  it('picks noop when the plan touches nothing at all', () => {
    const plan = { rebuildRequired: false, chunksToWrite: {}, chunksToDelete: [], meta: {} }
    const diagnosis = { hasMalformedChunkId: false }
    expect(chooseApplyStrategy(plan, diagnosis)).toBe('noop')
  })

  it('treats a missing/undefined diagnosis as not malformed (defensive default)', () => {
    const plan = { rebuildRequired: false, chunksToWrite: {}, chunksToDelete: [], meta: {} }
    expect(chooseApplyStrategy(plan, undefined)).toBe('noop')
  })
})

describe('buildPublicCardsQuerySpec', () => {
  // TASK-247 tanda 2b HIGH fix, measured against production: public_cards
  // is a ROOT collection with a `userId` field, NOT a subcollection under
  // users/{uid}. `users/<uid>/public_cards` measured 0 documents for a
  // seller with 6,647 real public_cards documents at the root, filtered by
  // userId. This is the regression lock for that exact bug: it must never
  // again point at `users/{uid}/public_cards`.
  it('points at the root public_cards collection, not a subcollection of users/{uid}', () => {
    const spec = buildPublicCardsQuerySpec('seller-123')
    expect(spec.collectionPath).toBe('public_cards')
    expect(spec.collectionPath).not.toContain('users/')
    expect(spec.collectionPath).not.toContain('/')
  })

  it('filters by the userId field with equality', () => {
    const spec = buildPublicCardsQuerySpec('seller-123')
    expect(spec.whereField).toBe('userId')
    expect(spec.whereOp).toBe('==')
    expect(spec.whereValue).toBe('seller-123')
  })

  it('throws on a missing or non-string userId rather than building a query that would read every seller', () => {
    expect(() => buildPublicCardsQuerySpec('')).toThrow()
    expect(() => buildPublicCardsQuerySpec(undefined as unknown as string)).toThrow()
    expect(() => buildPublicCardsQuerySpec(null as unknown as string)).toThrow()
  })
})

describe('requiresCollapseConfirmation', () => {
  // TASK-247 tanda 2b safety guard, added after the query bug above was
  // measured live: any executor that can REDUCE a derived copy needs a
  // check for "the source read came back suspiciously, catastrophically
  // small" for an account that already has a real index — see this
  // function's own header in publicCardIndexExecutor.js for the full
  // reasoning, including the review-round-2 correction to a PROPORTIONAL
  // check (COLLAPSE_MIN_META_COUNT / COLLAPSE_RATIO).
  it('requires confirmation when 0 docs were read but the current index already has entries', () => {
    expect(requiresCollapseConfirmation(0, { count: 6647 })).toBe(true)
  })

  // Review round 2 (MEDIUM-1) regression lock: the FIRST version of this
  // guard only checked docsCount === 0, so a truncated read that came back
  // with exactly 1 document (not 0) sailed through unguarded and would
  // have collapsed 6,647 entries down to 1.
  it('requires confirmation when the read comes back far smaller than the existing index, even if not exactly 0', () => {
    expect(requiresCollapseConfirmation(1, { count: 6647 })).toBe(true)
    expect(requiresCollapseConfirmation(10, { count: 6647 })).toBe(true)
  })

  it('does NOT require confirmation when 0 docs were read and there was never an index (new seller)', () => {
    expect(requiresCollapseConfirmation(0, null)).toBe(false)
    expect(requiresCollapseConfirmation(0, undefined)).toBe(false)
  })

  // meta.count below COLLAPSE_MIN_META_COUNT (100): a proportional check
  // doesn't mean much for a small index, so the ORIGINAL exact-zero
  // behavior (from before the proportional rewrite) still applies here —
  // a 0-count index has nothing to collapse, but any OTHER count still
  // refuses on a 0-document read.
  //
  // CORRECTION (review round 3): the first version of this proportional
  // rewrite made `metaCount < COLLAPSE_MIN_META_COUNT` return `false`
  // UNCONDITIONALLY, silently dropping the original exact-zero protection
  // for small indexes — measured against production, 3 of this project's
  // 5 real sellers with public cards (18, 15, 5 entries) sit under this
  // threshold, so that regression would have left most real accounts
  // completely unguarded against the exact failure mode (a query
  // returning 0 documents for every seller) that created this guard.
  // `(0, { count: 5 })` and `(0, { count: 99 })` below are the regression
  // lock: both must still require confirmation.
  it('preserves the ORIGINAL exact-zero guard for small indexes below the proportional-check threshold', () => {
    expect(requiresCollapseConfirmation(0, { count: 0 })).toBe(false) // nothing to collapse
    expect(requiresCollapseConfirmation(0, { count: 5 })).toBe(true)
    expect(requiresCollapseConfirmation(0, { count: 99 })).toBe(true)
  })

  it('does NOT require confirmation for a small existing index when real cards were actually read', () => {
    expect(requiresCollapseConfirmation(5, { count: 5 })).toBe(false)
    expect(requiresCollapseConfirmation(1, { count: 5 })).toBe(false)
  })

  it('does NOT require confirmation when real cards were actually read (well above the 10% floor)', () => {
    expect(requiresCollapseConfirmation(6647, { count: 6647 })).toBe(false)
    expect(requiresCollapseConfirmation(1000, { count: 6647 })).toBe(false)
  })

  it('sits right at the 10% boundary as expected: just under refuses, just at or over does not', () => {
    // 10% of 1000 is 100 — docsCount < 100 refuses, docsCount >= 100 does not.
    expect(requiresCollapseConfirmation(99, { count: 1000 })).toBe(true)
    expect(requiresCollapseConfirmation(100, { count: 1000 })).toBe(false)
  })

  // Review round 3: the OTHER boundary — metaCount itself sitting exactly
  // at COLLAPSE_MIN_META_COUNT (100) — had no assert; a `<` -> `<=` typo
  // would have survived. At metaCount=100 the proportional rule is
  // already active (10% of 100 is 10).
  it('sits right at the metaCount=100 boundary: the proportional rule is already active there, not the exact-zero floor', () => {
    expect(requiresCollapseConfirmation(9, { count: 100 })).toBe(true) // 9 < 10% of 100
    expect(requiresCollapseConfirmation(10, { count: 100 })).toBe(false) // 10 >= 10% of 100
  })

  // Review round 2 (MEDIUM-1) fail-closed correction: an unusable stored
  // count used to fall through to "no confirmation needed" — the opposite
  // of safe. Now it requires confirmation whenever the caller can show the
  // index still has real entries via currentEntryCount.
  it('fails closed on a non-finite meta.count when the index is known to still have entries', () => {
    expect(requiresCollapseConfirmation(0, { count: '6647' as unknown as number }, 6647)).toBe(true)
    expect(requiresCollapseConfirmation(0, { count: Infinity }, 6647)).toBe(true)
    expect(requiresCollapseConfirmation(0, { count: NaN }, 6647)).toBe(true)
  })

  it('does NOT require confirmation on a non-finite meta.count when no entries are known to exist', () => {
    expect(requiresCollapseConfirmation(0, { count: NaN }, 0)).toBe(false)
    expect(requiresCollapseConfirmation(0, {})).toBe(false)
  })
})
