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
      expect(plan.chunksToDelete).toEqual([])
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
      expect(plan.chunksToDelete).toEqual([])
      // MED-5: an incremental repair must still carry the (unchanged) meta
      // — a regression that dropped or corrupted this would let 2b persist
      // a wrong meta on an otherwise-correct incremental repair undetected.
      expect(plan.meta).toEqual(freshBuild.meta)
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
      // Growth (16 -> 32): the old range 0-15 is a subset of the new
      // range 0-31, so there is nothing outside it to delete.
      expect(plan.chunksToDelete).toEqual([])
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

  describe('review round: HIGH-1 duplicate blindness, HIGH-2 shrink non-convergence, and MEDIUM mutation survivors', () => {
    it('HIGH-1: a duplicated entry (same card in two chunks) is NOT invisible — it is reported, not silently overwritten in the actual-index map', () => {
      const docs = makeCards(6)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      const target = docs[0]
      const homeChunk = publicChunkId(target.scryfallId, built.meta.totalChunks)
      const otherChunk = (homeChunk + 1) % built.meta.totalChunks
      expect(otherChunk).not.toBe(homeChunk)
      const entry = built.chunks[homeChunk].entries.find((e: { i: string }) => e.i === target.cardId)

      // Stale copy left behind in another chunk — the original in its
      // correct chunk is untouched, so this is a pure duplication, not a
      // misplacement.
      const withDuplicate = Object.fromEntries(
        Object.entries(built.chunks).map(([id, chunk]) => {
          const numId = Number(id)
          if (numId === otherChunk) return [id, { id: numId, entries: [...chunk.entries, entry] }]
          return [id, chunk]
        })
      )

      const diagnosis = diagnosePublicIndex(withDuplicate, built.meta, docs, { chunkTargetSize: 2 })
      expect(diagnosis.isDivergent).toBe(true)
      expect(diagnosis.duplicated).toHaveLength(1)
      expect(diagnosis.duplicated[0].cardId).toBe(target.cardId)
      expect(diagnosis.duplicated[0].chunks.sort()).toEqual([homeChunk, otherChunk].sort())
      // Must NOT be silently absorbed as "everything's fine" — this was
      // the exact HIGH-1 failure (isDivergent: false, no writes needed).
      expect(diagnosis.missing).toEqual([])
    })

    it('HIGH-1: planPublicIndexReconciliation rewrites every chunk a duplicated card was found in, converging the count back to exactly 1', () => {
      const docs = makeCards(6)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      const target = docs[0]
      const homeChunk = publicChunkId(target.scryfallId, built.meta.totalChunks)
      const otherChunk = (homeChunk + 1) % built.meta.totalChunks
      const entry = built.chunks[homeChunk].entries.find((e: { i: string }) => e.i === target.cardId)
      const withDuplicate = Object.fromEntries(
        Object.entries(built.chunks).map(([id, chunk]) => {
          const numId = Number(id)
          if (numId === otherChunk) return [id, { id: numId, entries: [...chunk.entries, entry] }]
          return [id, chunk]
        })
      )

      const diagnosis = diagnosePublicIndex(withDuplicate, built.meta, docs, { chunkTargetSize: 2 })
      const freshBuild = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      const plan = planPublicIndexReconciliation(diagnosis, freshBuild)

      expect(plan.rebuildRequired).toBe(false)
      expect(Object.keys(plan.chunksToWrite).map(Number).sort()).toEqual([homeChunk, otherChunk].sort())

      // Apply the plan and re-diagnose: the count of that card in the
      // "repaired" store must be exactly 1, not 0 and not 2.
      const repaired = { ...withDuplicate, ...plan.chunksToWrite }
      const occurrences = Object.values(repaired).flatMap((c: any) =>
        c.entries.filter((e: { i: string }) => e.i === target.cardId)
      )
      expect(occurrences).toHaveLength(1)
      const rediagnosed = diagnosePublicIndex(repaired, built.meta, docs, { chunkTargetSize: 2 })
      expect(rediagnosed.isDivergent).toBe(false)
    })

    it('HIGH-2: shrink — a full rebuild plan carries chunksToDelete for every chunk id outside the new (smaller) range', () => {
      // Grow to 17 cards first (chunkTargetSize 1 -> 32 chunks), matching
      // the growth test above, then shrink back down to 8 cards.
      const docs17 = makeCards(17)
      const grown = buildPublicIndex(docs17, {}, { chunkTargetSize: 1 })
      expect(grown.meta.totalChunks).toBe(32)

      const shrunkDocs = docs17.slice(0, 8) // 8 cards -> nextPowerOfTwo(8) = 8
      const diagnosis = diagnosePublicIndex(grown.chunks, grown.meta, shrunkDocs, { chunkTargetSize: 1 })
      expect(diagnosis.totalChunksMismatch).toBe(true)
      expect(diagnosis.desiredTotalChunks).toBe(8)

      const freshBuild = buildPublicIndex(shrunkDocs, {}, { chunkTargetSize: 1 })
      const plan = planPublicIndexReconciliation(diagnosis, freshBuild)

      expect(plan.rebuildRequired).toBe(true)
      expect(Object.keys(plan.chunksToWrite)).toHaveLength(8)
      // Every chunk id 8..31 (24 of them) is outside the new [0,8) range
      // and must be deleted, or those documents are left behind forever.
      expect(plan.chunksToDelete.sort((a: number, b: number) => a - b)).toEqual(
        Array.from({ length: 24 }, (_, i) => i + 8)
      )
    })

    it('HIGH-2: applying chunksToWrite AND chunksToDelete converges the shrunk index to isDivergent: false', () => {
      const docs17 = makeCards(17)
      const grown = buildPublicIndex(docs17, {}, { chunkTargetSize: 1 })
      const shrunkDocs = docs17.slice(0, 8)
      const diagnosis = diagnosePublicIndex(grown.chunks, grown.meta, shrunkDocs, { chunkTargetSize: 1 })
      const freshBuild = buildPublicIndex(shrunkDocs, {}, { chunkTargetSize: 1 })
      const plan = planPublicIndexReconciliation(diagnosis, freshBuild)

      // Simulate correctly applying the plan: chunksToDelete are gone,
      // chunksToWrite are the only chunks left.
      const converged = plan.chunksToWrite
      const rediagnosed = diagnosePublicIndex(converged, plan.meta, shrunkDocs, { chunkTargetSize: 1 })
      expect(rediagnosed.isDivergent).toBe(false)
    })

    it('HIGH-2 regression lock: IGNORING chunksToDelete (writing chunksToWrite only, old chunks left in place) reproduces the measured non-convergent loop', () => {
      const docs17 = makeCards(17)
      const grown = buildPublicIndex(docs17, {}, { chunkTargetSize: 1 })
      const shrunkDocs = docs17.slice(0, 8)
      const diagnosis = diagnosePublicIndex(grown.chunks, grown.meta, shrunkDocs, { chunkTargetSize: 1 })
      const freshBuild = buildPublicIndex(shrunkDocs, {}, { chunkTargetSize: 1 })
      const plan = planPublicIndexReconciliation(diagnosis, freshBuild)

      // Buggy caller: writes chunksToWrite but never applies chunksToDelete
      // — the 31 old chunk documents are still sitting at their paths.
      const buggyStore = { ...grown.chunks, ...plan.chunksToWrite }
      const stillDiverged = diagnosePublicIndex(buggyStore, plan.meta, shrunkDocs, { chunkTargetSize: 1 })
      expect(stillDiverged.isDivergent).toBe(true)
      expect(stillDiverged.totalChunksMismatch).toBe(true)
      expect(stillDiverged.chunksPresentCount).toBe(32)
    })

    it('MED-1: chunk COUNT matching meta is not enough — the actual chunk ids must be exactly 0..totalChunks-1 (a gap/out-of-range id still forces a mismatch)', () => {
      const docs = makeCards(4)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 1 }) // 4 cards -> 4 chunks
      expect(built.meta.totalChunks).toBe(4)

      // Same COUNT of chunk documents (4), but ids {0,1,2,7} instead of
      // {0,1,2,3} — chunk 3 was replaced by a stray chunk at id 7.
      const { 3: dropped, ...rest } = built.chunks
      const withStrayId = { ...rest, 7: { id: 7, entries: dropped.entries } }

      const diagnosis = diagnosePublicIndex(withStrayId, built.meta, docs, { chunkTargetSize: 1 })
      expect(diagnosis.chunksPresentCount).toBe(4)
      expect(diagnosis.totalChunksMismatch).toBe(true)
      expect(diagnosis.isDivergent).toBe(true)
    })

    it('MED-2: a chunk document with a non-numeric id is never absorbed via a positional fallback — it forces totalChunksMismatch and its cards read as missing', () => {
      const docs = makeCards(4)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 1 })
      // Corrupt chunk 2's `id` field — a write bug wrote a string, or the
      // field was dropped entirely.
      const corrupted = {
        ...built.chunks,
        2: { id: 'not-a-number', entries: built.chunks[2].entries },
      }

      const diagnosis = diagnosePublicIndex(corrupted, built.meta, docs, { chunkTargetSize: 1 })
      expect(diagnosis.totalChunksMismatch).toBe(true)
      expect(diagnosis.isDivergent).toBe(true)
      // The card(s) that were only inside the corrupted chunk must show up
      // as missing rather than being credited via a positional guess.
      const cardInChunk2 = docs.find((d) => publicChunkId(d.scryfallId, 4) === 2)
      if (cardInChunk2) {
        expect(diagnosis.missing.some((m) => m.cardId === cardInChunk2.cardId)).toBe(true)
      }
    })

    it('MED-3: misplaced repair actually removes the stale copy from its old (wrong) chunk', () => {
      const docs = makeCards(4)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      const target = docs[0]
      const correctChunk = publicChunkId(target.scryfallId, built.meta.totalChunks)
      const wrongChunk = (correctChunk + 1) % built.meta.totalChunks
      const entry = built.chunks[correctChunk].entries.find((e: { i: string }) => e.i === target.cardId)
      const tampered = Object.fromEntries(
        Object.entries(built.chunks).map(([id, chunk]) => {
          const numId = Number(id)
          if (numId === correctChunk) {
            return [id, { id: numId, entries: chunk.entries.filter((e: { i: string }) => e.i !== target.cardId) }]
          }
          if (numId === wrongChunk) return [id, { id: numId, entries: [...chunk.entries, entry] }]
          return [id, chunk]
        })
      )

      const diagnosis = diagnosePublicIndex(tampered, built.meta, docs, { chunkTargetSize: 2 })
      const freshBuild = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      const plan = planPublicIndexReconciliation(diagnosis, freshBuild)
      const repaired = { ...tampered, ...plan.chunksToWrite }

      // The stale copy must be gone from the wrong chunk, and present
      // exactly once overall.
      expect(
        repaired[wrongChunk].entries.some((e: { i: string }) => e.i === target.cardId)
      ).toBe(false)
      const occurrences = Object.values(repaired).flatMap((c: any) =>
        c.entries.filter((e: { i: string }) => e.i === target.cardId)
      )
      expect(occurrences).toHaveLength(1)
    })

    it('MED-3: orphaned repair actually removes the stale entry from its chunk (the path that runs against the ~1,093 measured restos)', () => {
      const docs = makeCards(4)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      const remainingDocs = docs.filter((d) => d.cardId !== 'card-1')

      const diagnosis = diagnosePublicIndex(built.chunks, built.meta, remainingDocs, { chunkTargetSize: 2 })
      const freshBuild = buildPublicIndex(remainingDocs, {}, { chunkTargetSize: 2 })
      const plan = planPublicIndexReconciliation(diagnosis, freshBuild)
      const repaired = { ...built.chunks, ...plan.chunksToWrite }

      const stillPresent = Object.values(repaired).some((c: any) =>
        c.entries.some((e: { i: string }) => e.i === 'card-1')
      )
      expect(stillPresent).toBe(false)
      const rediagnosed = diagnosePublicIndex(repaired, freshBuild.meta, remainingDocs, { chunkTargetSize: 2 })
      expect(rediagnosed.isDivergent).toBe(false)
    })

    it('MED-4: flags divergence from totalChunksMismatch ALONE, with zero per-entry diffs (account emptied to 0 cards while stale meta still claims 4 chunks)', () => {
      const docs = makeCards(4)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 1 })
      // Chunks are present and, crucially, ALREADY EMPTY of entries (the
      // seller genuinely has 0 cards now) — this isolates the mismatch
      // signal from indexEmptied/missing/orphaned/misplaced/duplicated,
      // which must all read clean here.
      const emptiedChunks = Object.fromEntries(
        Object.entries(built.chunks).map(([id, chunk]) => [id, { id: chunk.id, entries: [] }])
      )

      const diagnosis = diagnosePublicIndex(emptiedChunks, built.meta, [], { chunkTargetSize: 1 })
      expect(diagnosis.totalChunksMismatch).toBe(true)
      expect(diagnosis.missing).toEqual([])
      expect(diagnosis.orphaned).toEqual([])
      expect(diagnosis.misplaced).toEqual([])
      expect(diagnosis.duplicated).toEqual([])
      expect(diagnosis.indexEmptied).toBe(false) // docs.length is 0 here, not the vaciado case
      expect(diagnosis.isDivergent).toBe(true)
    })

    it('LOW: a negative chunkTargetSize normalizes to the default instead of reaching nextPowerOfTwo with a misleading error', () => {
      const docs = makeCards(3)
      expect(() => buildPublicIndex(docs, {}, { chunkTargetSize: -5 })).not.toThrow()
      const { meta } = buildPublicIndex(docs, {}, { chunkTargetSize: -5 })
      expect(meta.chunkTargetSize).toBe(DEFAULT_CHUNK_TARGET_SIZE)
    })

    it('LOW: diagnosePublicIndex falls back to currentMeta.chunkTargetSize when the caller does not pass an explicit option, rather than silently using the module default', () => {
      const docs = makeCards(5)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 2 }) // meta.chunkTargetSize = 2
      // No `options` passed at all — must read chunkTargetSize back from
      // currentMeta (2), not silently fall back to DEFAULT_CHUNK_TARGET_SIZE
      // (400), which would compute a different desiredTotalChunks and
      // wrongly declare a healthy index divergent.
      const diagnosis = diagnosePublicIndex(built.chunks, built.meta, docs)
      expect(diagnosis.isDivergent).toBe(false)
      expect(diagnosis.desiredTotalChunks).toBe(built.meta.totalChunks)
    })
  })

  describe('second review round: MEDIUM-2 (freshBuild bucket-space guard), MEDIUM-1 (chunksToDelete filter), and the 4 missing anchors', () => {
    it('MEDIUM-2: refuses (throws) instead of silently dropping live cards when freshBuild does not share the diagnosis bucket space — the exact no-explicit-options repro measured by the reviewer', () => {
      const docs = makeCards(6)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      expect(built.meta.totalChunks).toBe(4)
      const docsPlusOne = [...docs, makeCard(6)]

      // No explicit options on either call: diagnosePublicIndex correctly
      // falls back to meta.chunkTargetSize (2, the LOW fix), but
      // buildPublicIndex has no meta to fall back to and silently uses the
      // module DEFAULT (400) — producing a completely different bucket
      // space for the same account.
      const diagnosis = diagnosePublicIndex(built.chunks, built.meta, docsPlusOne)
      expect(diagnosis.totalChunksMismatch).toBe(false)
      const freshBuild = buildPublicIndex(docsPlusOne, {})
      expect(freshBuild.meta.totalChunks).toBe(1)

      expect(() => planPublicIndexReconciliation(diagnosis, freshBuild)).toThrow(
        /freshBuild\.meta\.totalChunks/
      )
    })

    it('MEDIUM-2: does NOT throw, and repairs correctly, when freshBuild is built with the same chunkTargetSize the diagnosis resolved', () => {
      const docs = makeCards(6)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      const docsPlusOne = [...docs, makeCard(6)]
      const diagnosis = diagnosePublicIndex(built.chunks, built.meta, docsPlusOne)
      const freshBuild = buildPublicIndex(docsPlusOne, {}, { chunkTargetSize: built.meta.chunkTargetSize })
      expect(freshBuild.meta.totalChunks).toBe(built.meta.totalChunks)

      const plan = planPublicIndexReconciliation(diagnosis, freshBuild)
      expect(plan.rebuildRequired).toBe(false)
      const repaired = { ...built.chunks, ...plan.chunksToWrite }
      const rediagnosed = diagnosePublicIndex(repaired, plan.meta, docsPlusOne, { chunkTargetSize: 2 })
      expect(rediagnosed.isDivergent).toBe(false)
    })

    it('MEDIUM-1: chunksToDelete also catches negative and fractional chunk ids, not just ids >= totalChunks', () => {
      const docs17 = makeCards(17)
      const grown = buildPublicIndex(docs17, {}, { chunkTargetSize: 1 })
      const shrunkDocs = docs17.slice(0, 8)
      // Both -1 and 2.5 are finite numbers, numerically SMALLER than the
      // new totalChunks (8) — a plain `id >= totalChunks` filter lets both
      // slip through and stay behind forever.
      const corrupted = {
        ...grown.chunks,
        neg: { id: -1, entries: [] },
        frac: { id: 2.5, entries: [] },
      }

      const diagnosis = diagnosePublicIndex(corrupted, grown.meta, shrunkDocs, { chunkTargetSize: 1 })
      expect(diagnosis.totalChunksMismatch).toBe(true)
      const freshBuild = buildPublicIndex(shrunkDocs, {}, { chunkTargetSize: 1 })
      const plan = planPublicIndexReconciliation(diagnosis, freshBuild)

      expect(plan.chunksToDelete).toContain(-1)
      expect(plan.chunksToDelete).toContain(2.5)
    })

    it('S3 / MED-2 follow-up: hasMalformedChunkId is exposed on the diagnosis and is the ONLY signal when a malformed chunk sits alongside an otherwise-complete, valid 0..n-1 set', () => {
      const docs = makeCards(4)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 1 }) // 4 chunks, ids 0-3, all valid
      const withExtraMalformed = { ...built.chunks, junk: { id: 'not-a-number', entries: [] } }

      const diagnosis = diagnosePublicIndex(withExtraMalformed, built.meta, docs, { chunkTargetSize: 1 })
      // The valid 0..3 set alone would satisfy both the count check and the
      // exact-id-set check (MED-1) — hasMalformedChunkId is the only thing
      // that can catch the extra corrupt chunk.
      expect(diagnosis.chunksPresentCount).toBe(4)
      expect(diagnosis.hasMalformedChunkId).toBe(true)
      expect(diagnosis.totalChunksMismatch).toBe(true)
      expect(diagnosis.isDivergent).toBe(true)
    })

    it('S4: a chunkTargetSize of exactly 0 also normalizes to the default (0 is falsy in JS, but also not a NEGATIVE number — both branches of the guard matter)', () => {
      const docs = makeCards(3)
      expect(() => buildPublicIndex(docs, {}, { chunkTargetSize: 0 })).not.toThrow()
      const { meta } = buildPublicIndex(docs, {}, { chunkTargetSize: 0 })
      expect(meta.chunkTargetSize).toBe(DEFAULT_CHUNK_TARGET_SIZE)
    })

    it('S1: duplicated-card repair still writes the expectedChunk even when NEITHER stale occurrence sits there', () => {
      const docs = makeCards(6)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      expect(built.meta.totalChunks).toBe(4)
      const target = docs[0]
      const homeChunk = publicChunkId(target.scryfallId, built.meta.totalChunks)
      const entry = built.chunks[homeChunk].entries.find((e: { i: string }) => e.i === target.cardId)
      const otherChunkIds = [0, 1, 2, 3].filter((id) => id !== homeChunk)
      const [chunkA, chunkB] = otherChunkIds

      // Remove the card from its home chunk entirely, and drop two stale
      // copies into two OTHER chunks — neither occurrence sits at the
      // expected chunk.
      const tampered = Object.fromEntries(
        Object.entries(built.chunks).map(([id, chunk]) => {
          const numId = Number(id)
          if (numId === homeChunk) {
            return [id, { id: numId, entries: chunk.entries.filter((e: { i: string }) => e.i !== target.cardId) }]
          }
          if (numId === chunkA || numId === chunkB) {
            return [id, { id: numId, entries: [...chunk.entries, entry] }]
          }
          return [id, chunk]
        })
      )

      const diagnosis = diagnosePublicIndex(tampered, built.meta, docs, { chunkTargetSize: 2 })
      expect(diagnosis.duplicated).toHaveLength(1)
      expect(diagnosis.duplicated[0].chunks.sort()).toEqual([chunkA, chunkB].sort())
      // The chunks array does NOT include homeChunk — this is exactly the
      // case where dropping `affectedChunkIds.add(d.expectedChunk)` from
      // the plan would silently skip rewriting it.
      expect(diagnosis.duplicated[0].chunks).not.toContain(homeChunk)

      const freshBuild = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      const plan = planPublicIndexReconciliation(diagnosis, freshBuild)
      expect(Object.keys(plan.chunksToWrite).map(Number)).toContain(homeChunk)

      const repaired = { ...tampered, ...plan.chunksToWrite }
      expect(repaired[homeChunk].entries.some((e: { i: string }) => e.i === target.cardId)).toBe(true)
      const occurrences = Object.values(repaired).flatMap((c: any) =>
        c.entries.filter((e: { i: string }) => e.i === target.cardId)
      )
      expect(occurrences).toHaveLength(1)
    })

    it('S2: an orphaned card with two stale copies reports one orphaned entry per occurrence, and the plan rewrites both chunks', () => {
      const docs = makeCards(6)
      const built = buildPublicIndex(docs, {}, { chunkTargetSize: 2 })
      const removedCardId = 'card-1'
      const remainingDocs = docs.filter((d) => d.cardId !== removedCardId)

      const orphanHomeChunk = Number(
        Object.entries(built.chunks).find(([, chunk]) =>
          chunk.entries.some((e: { i: string }) => e.i === removedCardId)
        )![0]
      )
      const orphanEntry = built.chunks[orphanHomeChunk].entries.find(
        (e: { i: string }) => e.i === removedCardId
      )
      const otherChunkId = (orphanHomeChunk + 1) % built.meta.totalChunks

      const withExtraOrphanCopy = Object.fromEntries(
        Object.entries(built.chunks).map(([id, chunk]) => {
          const numId = Number(id)
          if (numId === otherChunkId) return [id, { id: numId, entries: [...chunk.entries, orphanEntry] }]
          return [id, chunk]
        })
      )

      const diagnosis = diagnosePublicIndex(withExtraOrphanCopy, built.meta, remainingDocs, {
        chunkTargetSize: 2,
      })
      expect(diagnosis.orphaned).toHaveLength(2)
      expect(diagnosis.orphaned.map((o) => o.actualChunk).sort()).toEqual(
        [orphanHomeChunk, otherChunkId].sort()
      )

      const freshBuild = buildPublicIndex(remainingDocs, {}, { chunkTargetSize: 2 })
      const plan = planPublicIndexReconciliation(diagnosis, freshBuild)
      expect(Object.keys(plan.chunksToWrite).map(Number).sort()).toEqual(
        [orphanHomeChunk, otherChunkId].sort()
      )

      const repaired = { ...withExtraOrphanCopy, ...plan.chunksToWrite }
      const stillPresent = Object.values(repaired).some((c: any) =>
        c.entries.some((e: { i: string }) => e.i === removedCardId)
      )
      expect(stillPresent).toBe(false)
    })
  })
})

// ── TASK-247 tanda 3: mitigation A, the mid-rebuild detector ──
//
// publicCardIndexExecutor.js's header documents the window this closes,
// LEIDO verbatim: growing totalChunks from 16 to 32 overwrites OLD chunks
// 0..15 with NEW-scheme content while `_meta` still advertises 16, so a
// reader honoring `_meta.totalChunks` during that window sees roughly HALF
// the seller's real cards — indefinitely, if the run crashed, because
// nothing reconciles automatically. That is TASK-247's own bug with a new
// cause, and a reader cannot detect it from `_meta` alone.
//
// The fix is one field per chunk document: `tc`, the totalChunks the chunk
// was WRITTEN under. Any chunk whose `tc` disagrees with `_meta.totalChunks`
// proves the two are from different generations. It costs ~20 bytes per
// chunk document (32 of them on the production profile) and is detectable
// with no transaction, no lease, and no coordination.
describe('buildPublicIndex — each chunk records the totalChunks it was written under (mitigation A)', () => {
  it('stamps tc on every chunk, including the empty ones', () => {
    const docs = Array.from({ length: 50 }, (_, i) => ({
      cardId: `card-${i}`,
      scryfallId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      cardName: `Card ${i}`,
    }))
    const { chunks, meta } = buildPublicIndex(docs, {}, { chunkTargetSize: 10 })
    expect(Object.keys(chunks)).toHaveLength(meta.totalChunks)
    for (const chunk of Object.values(chunks) as Array<{ id: number; tc: number }>) {
      expect(chunk.tc).toBe(meta.totalChunks)
    }
  })

  it('changes tc when the bucket space grows, which is exactly what makes the window detectable', () => {
    const small = buildPublicIndex(
      [{ cardId: 'c1', scryfallId: 'sf-1', cardName: 'A' }],
      {},
      { chunkTargetSize: 1 }
    )
    const big = buildPublicIndex(
      Array.from({ length: 40 }, (_, i) => ({ cardId: `c${i}`, scryfallId: `sf-${i}`, cardName: `A${i}` })),
      {},
      { chunkTargetSize: 1 }
    )
    expect(small.chunks[0].tc).toBe(small.meta.totalChunks)
    expect(big.chunks[0].tc).toBe(big.meta.totalChunks)
    expect(big.chunks[0].tc).not.toBe(small.chunks[0].tc)
  })
})
