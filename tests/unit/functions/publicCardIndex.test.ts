/**
 * TASK-247 (tanda 2a/4): assembly, divergence-detection, and reconciliation
 * for the public-profile card index. Same technique as publicCardEntry.test
 * (TASK-247 tanda 1) and cardIndexEntry.test (TASK-245): a dependency-free
 * CommonJS module under functions/lib/ that vitest can require() and
 * actually EXECUTE without firebase-admin (functions/ has no emulator
 * harness — TASK-236).
 *
 * AC10 is the whole point of this file: the new index must not inherit
 * card_index's POSITION-based chunking, and reconciliation (detect +
 * repair divergence between the index and public_cards) must exist from
 * day one rather than being deferred like TASK-228 was. Every describe
 * block below maps directly to one half of that AC:
 *   - `buildPublicIndex` — chunk assignment is identity-derived, never
 *     positional (locked by the "same cards, different input order produces
 *     the same chunk assignment" test).
 *   - `diagnosePublicIndex` — detection, including the case card_index's
 *     health checks have never caught: an index that is PRESENT but
 *     VACIADO (every chunk document exists, every entries array is empty).
 *   - `planPublicIndexReconciliation` — repair, as a plan of writes, with
 *     the incremental-vs-full-rebuild line drawn exactly where
 *     publicCardEntry.js's `totalChunks` CONTRACT requires it.
 *
 * Fixture shape matters (lesson paid for in tanda 1 review, e49d5db /
 * 5ffac27): public_cards documents have NO `name` field — only cardName /
 * cardNameLower — and real scryfallId are UUIDs, measured exactly 36
 * characters on all 5,162 ids in the production profile. Both are honored
 * below; a synthetic short/variable-length id population would let a
 * position-based or length-based chunking bug slip through undetected.
 */
import { describe, expect, it } from 'vitest'
import {
  buildPublicIndex,
  diagnosePublicIndex,
  planPublicIndexReconciliation,
  requestedChunkCount,
  DEFAULT_CHUNK_TARGET_SIZE,
} from '../../../functions/lib/publicCardIndex.js'
import { buildPublicEntry, publicChunkId } from '../../../functions/lib/publicCardEntry.js'

/** Same UUID-shaped id generator as publicCardEntry.test.ts, so chunk
 * assignment is exercised against real-shaped scryfallId rather than
 * synthetic ids whose varying length could mask a positional/length bug. */
function fakeScryfallUuid(i: number): string {
  const seed = (Math.imul(i + 1, 2654435761) >>> 0).toString(16).padStart(8, '0')
  const hex = (seed + seed + seed + seed).slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** A public_cards document with the real measured field set — no `name`. */
function makeCard(i: number, overrides: Record<string, unknown> = {}) {
  return {
    scryfallId: fakeScryfallUuid(i),
    cardId: `card-${i}`,
    cardName: `Test Card ${i}`,
    cardNameLower: `test card ${i}`,
    quantity: 1,
    price: 1,
    status: 'sale',
    foil: false,
    condition: 'NM',
    setCode: 'znr',
    edition: 'Zendikar Rising',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makeCards(n: number) {
  return Array.from({ length: n }, (_, i) => makeCard(i))
}

describe('publicCardIndex — assembly, divergence detection, reconciliation (TASK-247 tanda 2a)', () => {
  describe('buildPublicIndex — identity-derived chunk assembly (AC10)', () => {
    it('sizes totalChunks from requestedChunkCount rounded to the next power of two', () => {
      const docs = makeCards(5)
      const { meta } = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      // ceil(5/2) = 3 requested -> nextPowerOfTwo(3) = 4
      expect(meta.totalChunks).toBe(4)
      expect(meta.count).toBe(5)
      expect(meta.chunkTargetSize).toBe(2)
      expect(meta.schemaVersion).toBe(1)
    })

    it('produces every chunk 0..totalChunks-1, including empty ones — never a sparse chunk range', () => {
      const docs = makeCards(1)
      const { chunks, meta } = buildPublicIndex(docs, {}, { chunkTargetSize: 400 })
      expect(meta.totalChunks).toBe(1)
      expect(Object.keys(chunks)).toHaveLength(1)
      expect(chunks[0].entries).toHaveLength(1)
    })

    it('handles zero cards without throwing — totalChunks 1, a single empty chunk', () => {
      const { chunks, meta } = buildPublicIndex([], {})
      expect(meta.totalChunks).toBe(1)
      expect(meta.count).toBe(0)
      expect(chunks[0].entries).toEqual([])
    })

    it('AC10 core: chunk assignment is identity-derived, NOT positional — feeding the same cards in a different order produces the same chunk id per card', () => {
      const docs = makeCards(12)
      const forward = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      const reversed = buildPublicIndex([...docs].reverse(), {}, { chunkTargetSize: 2 })

      expect(forward.meta.totalChunks).toBe(reversed.meta.totalChunks)

      function chunkOf(built: ReturnType<typeof buildPublicIndex>, cardId: string): number {
        for (const chunk of Object.values(built.chunks)) {
          if (chunk.entries.some((e: { i: string }) => e.i === cardId)) return chunk.id
        }
        throw new Error(`${cardId} not found in any chunk`)
      }

      for (const doc of docs) {
        expect(chunkOf(forward, doc.cardId)).toBe(chunkOf(reversed, doc.cardId))
      }
    })

    it('each entry lands in publicChunkId(scryfallId, totalChunks) — the exact rule diagnosePublicIndex re-derives independently', () => {
      const docs = makeCards(10)
      const { chunks, meta } = buildPublicIndex(docs, {}, { chunkTargetSize: 3 })
      for (const doc of docs) {
        const expectedChunk = publicChunkId(doc.scryfallId, meta.totalChunks)
        expect(chunks[expectedChunk].entries.some((e: { i: string }) => e.i === doc.cardId)).toBe(true)
      }
    })

    it('builds entries via buildPublicEntry (carries cache-derived fields), and flags cards with no cache doc the same way tanda 1 does', () => {
      const docs = [makeCard(0)]
      const cache = { [docs[0].scryfallId]: { colors: ['G'], type_line: 'Basic Land — Forest' } }
      const withCache = buildPublicIndex(docs, cache, { chunkTargetSize: 400 })
      const withoutCache = buildPublicIndex(docs, {}, { chunkTargetSize: 400 })

      const entryWithCache = Object.values(withCache.chunks).flatMap((c) => c.entries)[0]
      const entryWithoutCache = Object.values(withoutCache.chunks).flatMap((c) => c.entries)[0]
      expect(entryWithCache.co).toEqual(['G'])
      expect(entryWithCache.x).toBeUndefined()
      expect(entryWithoutCache.x).toBe(1)
    })

    it('DEFAULT_CHUNK_TARGET_SIZE documents the sizing decision (~400 cards/chunk), justified in this module\'s header against the measured 441-byte entry weight and the 1 MiB Firestore doc limit', () => {
      expect(DEFAULT_CHUNK_TARGET_SIZE).toBe(400)
    })

    it('requestedChunkCount: todays largest measured seller (6,647 cards) requests 17 chunks at the default target size', () => {
      expect(requestedChunkCount(6647, DEFAULT_CHUNK_TARGET_SIZE)).toBe(17)
    })

    it('requestedChunkCount: a 100k-card seller (measured target-market ceiling) requests 250 chunks at the default target size', () => {
      expect(requestedChunkCount(100000, DEFAULT_CHUNK_TARGET_SIZE)).toBe(250)
    })
  })

  describe('diagnosePublicIndex — divergence detection (AC10, first half)', () => {
    it('reports no divergence when the index was just built from the same public_cards documents', () => {
      const docs = makeCards(6)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      const diagnosis = diagnosePublicIndex(built.chunks, built.meta, docs, { chunkTargetSize: 2 })

      expect(diagnosis.isDivergent).toBe(false)
      expect(diagnosis.missing).toEqual([])
      expect(diagnosis.orphaned).toEqual([])
      expect(diagnosis.misplaced).toEqual([])
      expect(diagnosis.totalChunksMismatch).toBe(false)
      expect(diagnosis.indexEmptied).toBe(false)
    })

    it('AC10 headline case: an index PRESENT but VACIADO (every chunk document exists, every entries array empty) is caught — this is the exact shape card_index\'s health checks have never detected', () => {
      const docs = makeCards(6)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      // Simulate the emptied-index failure: chunk documents still exist at
      // their paths, meta is untouched, but every entries array lost its
      // contents (TASK-208/TASK-238 failure shape).
      const emptiedChunks = Object.fromEntries(
        Object.entries(built.chunks).map(([id, chunk]) => [id, { id: chunk.id, entries: [] }])
      )

      const diagnosis = diagnosePublicIndex(emptiedChunks, built.meta, docs, { chunkTargetSize: 2 })

      expect(diagnosis.isDivergent).toBe(true)
      expect(diagnosis.indexEmptied).toBe(true)
      expect(diagnosis.missing).toHaveLength(docs.length)
      expect(diagnosis.missing.map((m) => m.cardId).sort()).toEqual(docs.map((d) => d.cardId).sort())
    })

    it('does NOT flag indexEmptied for a genuinely empty account (zero cards, one empty chunk) — that is convergence, not a failure', () => {
      const built = buildPublicIndex([], {})
      const diagnosis = diagnosePublicIndex(built.chunks, built.meta, [])
      expect(diagnosis.isDivergent).toBe(false)
      expect(diagnosis.indexEmptied).toBe(false)
    })

    it('detects a card missing from the index (present in public_cards, absent from every chunk)', () => {
      const docs = makeCards(4)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      const missingDoc = docs[2]
      const chunksWithoutOne = Object.fromEntries(
        Object.entries(built.chunks).map(([id, chunk]) => [
          id,
          { id: chunk.id, entries: chunk.entries.filter((e: { i: string }) => e.i !== missingDoc.cardId) },
        ])
      )

      const diagnosis = diagnosePublicIndex(chunksWithoutOne, built.meta, docs, { chunkTargetSize: 2 })
      expect(diagnosis.isDivergent).toBe(true)
      expect(diagnosis.missing).toHaveLength(1)
      expect(diagnosis.missing[0].cardId).toBe(missingDoc.cardId)
      expect(diagnosis.orphaned).toEqual([])
      expect(diagnosis.misplaced).toEqual([])
    })

    it('detects an orphaned entry (restos): present in the index, no longer backed by a public_cards document', () => {
      const docs = makeCards(4)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      // The seller deleted card-1 — it's gone from public_cards but the
      // stale entry is still sitting in its chunk.
      const remainingDocs = docs.filter((d) => d.cardId !== 'card-1')

      const diagnosis = diagnosePublicIndex(built.chunks, built.meta, remainingDocs, { chunkTargetSize: 2 })
      // Note: removing a card changes the desired totalChunks calculation's
      // input count, but at this scale (3 vs 4 cards, chunkTargetSize 2)
      // both request 2 chunks -> nextPowerOfTwo stays 2, so this stays an
      // incremental (non-totalChunksMismatch) case and isolates orphaned
      // detection cleanly.
      expect(diagnosis.totalChunksMismatch).toBe(false)
      expect(diagnosis.isDivergent).toBe(true)
      expect(diagnosis.orphaned).toHaveLength(1)
      expect(diagnosis.orphaned[0].cardId).toBe('card-1')
      expect(diagnosis.missing).toEqual([])
    })

    it('detects a misplaced entry: the card exists in both public_cards and the index, but in the wrong chunk', () => {
      const docs = makeCards(4)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      const target = docs[0]
      const correctChunk = publicChunkId(target.scryfallId, built.meta.totalChunks)
      const wrongChunk = (correctChunk + 1) % built.meta.totalChunks
      expect(wrongChunk).not.toBe(correctChunk)

      const entry = built.chunks[correctChunk].entries.find((e: { i: string }) => e.i === target.cardId)
      const tampered = Object.fromEntries(
        Object.entries(built.chunks).map(([id, chunk]) => {
          const numId = Number(id)
          if (numId === correctChunk) {
            return [id, { id: numId, entries: chunk.entries.filter((e: { i: string }) => e.i !== target.cardId) }]
          }
          if (numId === wrongChunk) {
            return [id, { id: numId, entries: [...chunk.entries, entry] }]
          }
          return [id, chunk]
        })
      )

      const diagnosis = diagnosePublicIndex(tampered, built.meta, docs, { chunkTargetSize: 2 })
      expect(diagnosis.isDivergent).toBe(true)
      expect(diagnosis.misplaced).toHaveLength(1)
      expect(diagnosis.misplaced[0].cardId).toBe(target.cardId)
      expect(diagnosis.misplaced[0].actualChunk).toBe(wrongChunk)
      expect(diagnosis.misplaced[0].expectedChunk).toBe(correctChunk)
      expect(diagnosis.missing).toEqual([])
      expect(diagnosis.orphaned).toEqual([])
    })

    it('flags totalChunksMismatch when meta.totalChunks disagrees with what the current card count wants (growth crossed a power-of-two boundary)', () => {
      // Build at 16 cards (chunkTargetSize 1 -> requested 16 -> nextPowerOfTwo 16).
      const docs16 = makeCards(16)
      const built = buildPublicIndex(docs16, {}, { chunkTargetSize: 1 })
      expect(built.meta.totalChunks).toBe(16)

      // The seller added one more card (17 total) — the index's meta still
      // says 16, but 17 cards at chunkTargetSize 1 wants 32.
      const docs17 = [...docs16, makeCard(16)]
      const diagnosis = diagnosePublicIndex(built.chunks, built.meta, docs17, { chunkTargetSize: 1 })

      expect(diagnosis.totalChunksMismatch).toBe(true)
      expect(diagnosis.metaTotalChunks).toBe(16)
      expect(diagnosis.desiredTotalChunks).toBe(32)
      expect(diagnosis.isDivergent).toBe(true)
    })

    it('flags totalChunksMismatch when the chunk documents actually present do not match what meta claims (a chunk document went missing)', () => {
      const docs = makeCards(8)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      expect(built.meta.totalChunks).toBe(4)
      const { 3: _dropped, ...missingOneChunk } = built.chunks

      const diagnosis = diagnosePublicIndex(missingOneChunk, built.meta, docs, { chunkTargetSize: 2 })
      expect(diagnosis.totalChunksMismatch).toBe(true)
      expect(diagnosis.chunksPresentCount).toBe(3)
      expect(diagnosis.metaTotalChunks).toBe(4)
    })

    it('treats a null/undefined meta document as "no index" — totalChunksMismatch true, every real card missing', () => {
      const docs = makeCards(3)
      const diagnosis = diagnosePublicIndex({}, null, docs)
      expect(diagnosis.totalChunksMismatch).toBe(true)
      expect(diagnosis.metaTotalChunks).toBeNull()
      expect(diagnosis.missing).toHaveLength(3)
      expect(diagnosis.isDivergent).toBe(true)
    })
  })

  describe('planPublicIndexReconciliation — repair as a plan of writes (AC10, second half)', () => {
    it('plans no writes when the index already matches public_cards', () => {
      const docs = makeCards(5)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      const diagnosis = diagnosePublicIndex(built.chunks, built.meta, docs, { chunkTargetSize: 2 })
      const freshBuild = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })

      const plan = planPublicIndexReconciliation(diagnosis, freshBuild)
      expect(plan.rebuildRequired).toBe(false)
      expect(plan.chunksToWrite).toEqual({})
      expect(plan.reason).toMatch(/no writes needed/)
    })

    it('plans an INCREMENTAL repair (only the affected chunks) when totalChunks still agrees — missing/orphaned/misplaced isolated to their own chunks', () => {
      const docs = makeCards(6)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      const missingDoc = docs[1]
      const damagedChunks = Object.fromEntries(
        Object.entries(built.chunks).map(([id, chunk]) => [
          id,
          { id: chunk.id, entries: chunk.entries.filter((e: { i: string }) => e.i !== missingDoc.cardId) },
        ])
      )
      const diagnosis = diagnosePublicIndex(damagedChunks, built.meta, docs, { chunkTargetSize: 2 })
      const freshBuild = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })

      const plan = planPublicIndexReconciliation(diagnosis, freshBuild)
      expect(plan.rebuildRequired).toBe(false)
      const writtenChunkIds = Object.keys(plan.chunksToWrite).map(Number)
      expect(writtenChunkIds).toHaveLength(1)
      const expectedChunk = publicChunkId(missingDoc.scryfallId, built.meta.totalChunks)
      expect(writtenChunkIds[0]).toBe(expectedChunk)
      // The written chunk's content is exactly the fresh build's version —
      // the missing card is back, nothing else in that chunk changed.
      expect(plan.chunksToWrite[expectedChunk]).toEqual(freshBuild.chunks[expectedChunk])
      // Untouched chunks are not part of the plan at all — only the one
      // chunk actually affected by the missing card was written.
      expect(Object.keys(plan.chunksToWrite)).toEqual([String(expectedChunk)])
    })

    it('plans a FULL REBUILD (every chunk) when totalChunks itself is wrong — patching individual chunks under a stale bucket space is the bug this module exists to prevent', () => {
      const docs16 = makeCards(16)
      const built = buildPublicIndex(docs16, {}, { chunkTargetSize: 1 })
      const docs17 = [...docs16, makeCard(16)]
      const diagnosis = diagnosePublicIndex(built.chunks, built.meta, docs17, { chunkTargetSize: 1 })
      const freshBuild = buildPublicIndex(docs17, {}, { chunkTargetSize: 1 })

      const plan = planPublicIndexReconciliation(diagnosis, freshBuild)
      expect(plan.rebuildRequired).toBe(true)
      expect(plan.meta.totalChunks).toBe(32)
      expect(Object.keys(plan.chunksToWrite)).toHaveLength(32)
      expect(plan.chunksToWrite).toEqual(freshBuild.chunks)
      expect(plan.reason).toMatch(/full rebuild required/)
    })

    it('a full rebuild plan contains every card at its correct new chunk (sanity: the plan actually converges, not just "is large")', () => {
      const docs16 = makeCards(16)
      const built = buildPublicIndex(docs16, {}, { chunkTargetSize: 1 })
      const docs17 = [...docs16, makeCard(16)]
      const diagnosis = diagnosePublicIndex(built.chunks, built.meta, docs17, { chunkTargetSize: 1 })
      const freshBuild = buildPublicIndex(docs17, {}, { chunkTargetSize: 1 })
      const plan = planPublicIndexReconciliation(diagnosis, freshBuild)

      const rebuiltDiagnosis = diagnosePublicIndex(plan.chunksToWrite, plan.meta, docs17, { chunkTargetSize: 1 })
      expect(rebuiltDiagnosis.isDivergent).toBe(false)
    })
  })
})
