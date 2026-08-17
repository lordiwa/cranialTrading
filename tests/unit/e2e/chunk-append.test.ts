import { chunkNumberOf, pickAppendChunk, INDEX_CHUNK_SIZE, type ChunkView } from '../../../e2e/helpers/chunk-append'

/**
 * TASK-240 round 7, HIGH-1. The E2E teardown-contract fixture appends one
 * card_index entry, and round 6 appended it to `chunks.docs[0]` — always
 * `chunk_0`, because an unordered Firestore `.get()` returns lexicographic id
 * order. In a multi-chunk account that overflows a FULL chunk to 2001 and the
 * client's next dirty-chunk write then loses a real card's entry.
 *
 * The account this loop measures against holds a single chunk, so a green E2E
 * run there proves nothing about the fix — the bug cannot fire in it. These
 * cases are the evidence that does not depend on the account.
 */
describe('pickAppendChunk (E2E card_index fixture append)', () => {
    const chunk = (id: string, size: number): ChunkView => ({ id, size })

    // THE CASE THAT WAS BROKEN. Lexicographically 'chunk_10' < 'chunk_2', so
    // both `docs[0]` and any string sort pick the wrong chunk; only parsing the
    // number picks chunk_10. Measured: mutating the reduce to a `localeCompare`
    // sort reddens ONLY this case, out of the eight (it picks chunk_2);
    // mutating it back to `chunks[0]` reddens five.
    it('picks the highest chunk NUMBER, not the lexicographically last id', () => {
        const chunks = [chunk('chunk_0', 2000), chunk('chunk_1', 2000), chunk('chunk_10', 7), chunk('chunk_2', 2000)]
        expect(pickAppendChunk(chunks).id).toBe('chunk_10')
    })

    it('picks the last chunk regardless of the order it is given in', () => {
        expect(pickAppendChunk([chunk('chunk_2', 5), chunk('chunk_0', 2000), chunk('chunk_1', 2000)]).id).toBe('chunk_2')
        expect(pickAppendChunk([chunk('chunk_0', 2000), chunk('chunk_1', 2000), chunk('chunk_2', 5)]).id).toBe('chunk_2')
    })

    // The shape of the account every round of this ticket was measured in.
    it('picks the only chunk when there is one', () => {
        expect(pickAppendChunk([chunk('chunk_0', 256)]).id).toBe('chunk_0')
    })

    // A remainder chunk sitting exactly at the cap. Appending would make it
    // 2001 and desynchronise every later chunk's offsets, so it must throw
    // rather than pick anything.
    it('refuses to append when the last chunk is full', () => {
        expect(() => pickAppendChunk([chunk('chunk_0', 2000), chunk('chunk_1', INDEX_CHUNK_SIZE)]))
            .toThrow(/chunk_1 is full \(2000\/2000\)/)
    })

    it('refuses to append when the last chunk is somehow over the cap', () => {
        expect(() => pickAppendChunk([chunk('chunk_0', 2001)])).toThrow(/is full/)
    })

    it('accepts a last chunk one entry below the cap', () => {
        expect(pickAppendChunk([chunk('chunk_0', 2000), chunk('chunk_1', INDEX_CHUNK_SIZE - 1)]).id).toBe('chunk_1')
    })

    it('throws when there are no chunks at all', () => {
        expect(() => pickAppendChunk([])).toThrow(/no card_index chunk/)
    })

    // Same fallback as the app's read path: an id that encodes no number sorts
    // last, so it is preferred over a real chunk — and, holding no parseable
    // position, it is where a stray entry does the least harm.
    it('treats an unparseable chunk id the way the app read path does', () => {
        expect(chunkNumberOf('chunk_7')).toBe(7)
        expect(chunkNumberOf('legacy')).toBe(Number.MAX_SAFE_INTEGER)
        expect(pickAppendChunk([chunk('chunk_0', 2000), chunk('legacy', 3)]).id).toBe('legacy')
    })
})
