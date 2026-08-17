/**
 * TASK-240 round 7 — which card_index chunk a new entry may be appended to.
 *
 * WHY THIS IS A MODULE AND NOT A LINE IN THE SPEC. Round 6 appended with
 * `chunks.docs[0]`. A Firestore `.get()` without `orderBy` returns documents in
 * lexicographic `__name__` order, and the chunks are named `chunk_${c}`
 * (src/stores/collection.ts writeChunksConcurrently, functions/index.js), so
 * `docs[0]` is always `chunk_0` — the FIRST chunk, never the last. The app's own
 * read path already carries the warning in a comment: "chunk_10 sorts before
 * chunk_2".
 *
 * Only the last chunk is a remainder; every earlier one holds exactly
 * INDEX_CHUNK_SIZE entries. Appending to `chunk_0` in a multi-chunk account
 * therefore leaves it at 2001, and the client's dirty-chunk persist —
 * `markChunkDirty(Math.floor(position / INDEX_CHUNK_SIZE))` writing
 * `allIndex.slice(c * 2000, (c + 1) * 2000)` — then rewrites some LATER chunk
 * from an array whose offsets no longer match what is on disk: one real card's
 * entry ends up duplicated across two chunks and another is written to none at
 * all. A lost card_index entry is an invisible card, the TASK-234/238 class this
 * whole ticket exists to stop, produced by the teardown test itself.
 *
 * WHY IT IS PURE AND UNIT-TESTED. The bug is unreachable in the account this
 * loop measures against: it holds ONE chunk, so `docs[0]` is also the last one
 * and 256 -> 257 is nowhere near the cap. Every green run of round 6 was run
 * where the bug cannot fire, which means a green E2E run is not evidence about
 * this fix either. tests/unit/e2e/chunk-append.test.ts is — it pins the exact
 * lexicographic case (`chunk_10` vs `chunk_2`) with no account and no
 * credentials, the same arrangement coherence.ts uses and for the same reason.
 *
 * Deliberately pure: no Firestore, no admin, no I/O.
 */

/**
 * Entries per card_index chunk. Must match INDEX_CHUNK_SIZE in
 * src/stores/collection.ts and functions/index.js.
 */
export const INDEX_CHUNK_SIZE = 2000;

/** The parts of a card_index chunk document this needs. */
export interface ChunkView {
  /** The document id, e.g. `chunk_0`. */
  id: string;
  /** How many entries its `cards` array currently holds. */
  size: number;
}

/**
 * The chunk number encoded in a chunk document id, or MAX_SAFE_INTEGER for an
 * id that does not encode one — the same rule and the same fallback as
 * `chunkNumberOf` in src/stores/collection.ts, so an unparseable id sorts last
 * here exactly as it does in the app's read path.
 */
export function chunkNumberOf(id: string): number {
  const n = parseInt(id.replace('chunk_', ''), 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

/**
 * The only chunk a new entry may be appended to: the one with the highest chunk
 * NUMBER (parsed, never string-compared), and only if it has room. Appending
 * there is the sole position that shifts nothing — every entry already on disk
 * keeps its index, so every client-side
 * `Math.floor(position / INDEX_CHUNK_SIZE)` still resolves to the chunk that
 * actually holds it.
 *
 * Generic over the caller's own element type so it can hand back the very
 * object it was given — a Firestore snapshot carrying its `ref`, say. Returning
 * an id would force the caller into a lookup-then-assert dance for a chunk that
 * provably came out of its own array.
 *
 * Throws rather than returning a fallback: both failure states mean the caller
 * cannot append safely, and a test that quietly appends somewhere else is the
 * bug this module was written to remove.
 */
export function pickAppendChunk<T extends ChunkView>(chunks: readonly T[]): T {
  if (chunks.length === 0) {
    throw new Error('[chunk-append] the account has no card_index chunk to append an entry to');
  }
  const last = chunks.reduce((a, b) => (chunkNumberOf(b.id) > chunkNumberOf(a.id) ? b : a));
  if (last.size >= INDEX_CHUNK_SIZE) {
    throw new Error(
      `[chunk-append] the last chunk ${last.id} is full (${last.size}/${INDEX_CHUNK_SIZE}); appending would overflow it, and creating a chunk is the app's job, not a test's`,
    );
  }
  return last;
}
