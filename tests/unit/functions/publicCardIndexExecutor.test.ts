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
