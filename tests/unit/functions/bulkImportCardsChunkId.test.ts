/**
 * TASK-230: bulkImportCards must also write the sticky `chunkId` field on
 * every card document it creates — the other of the two creation paths
 * (src/stores/collection.ts addCard is the client path, covered by
 * collection.chunkId.test.ts). Nothing reads the field yet.
 *
 * functions/ has no test harness wired to vitest/CI (see
 * tests/unit/functions/buildCardIndexAuthz.test.ts's header) — onCall
 * functions run under firebase-admin against a real project and are not
 * meaningfully invokable here. Same static-source-assertion approach as
 * that file: these tests fail if bulkImportCards stops computing/writing
 * chunkId, or if the formula drifts from the position-based
 * floor(position / INDEX_CHUNK_SIZE) contract shared with the client path
 * and with buildCardIndex's own chunking (functions/index.js:1063).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const functionsSource = readFileSync(
  resolve(__dirname, '../../../functions/index.js'),
  'utf-8'
)

/** Slice out a single `exports.<fnName> = onCall(...)` function's source text. */
function extractOnCallSource(fnName: string): string {
  const marker = `exports.${fnName} = onCall(`
  const start = functionsSource.indexOf(marker)
  if (start === -1) {
    throw new Error(`exports.${fnName} = onCall(...) not found in functions/index.js`)
  }
  const rest = functionsSource.slice(start + marker.length)
  const nextExportMatch = rest.match(/\nexports\.\w+\s*=\s*onCall\(/)
  const end = nextExportMatch
    ? start + marker.length + nextExportMatch.index!
    : functionsSource.length
  return functionsSource.slice(start, end)
}

describe('bulkImportCards — sticky chunkId on creation (TASK-230)', () => {
  const source = extractOnCallSource('bulkImportCards')

  it('reads the existing card count for this account before assigning positions', () => {
    // Position must continue from where the account's existing cards leave
    // off, not restart at 0 for every import call — otherwise a second
    // import into a non-empty collection would collide chunkId with the
    // first import's.
    expect(source).toMatch(/\.count\(\)\.get\(\)/)
  })

  it('computes chunkId as floor(position / INDEX_CHUNK_SIZE), matching the client and buildCardIndex', () => {
    expect(source).toMatch(/chunkId\s*=\s*Math\.floor\(\s*\w+\s*\/\s*INDEX_CHUNK_SIZE\s*\)/)
  })

  it('writes chunkId onto the batch.set() payload for every created card', () => {
    expect(source).toMatch(/batch\.set\(\s*ref\s*,\s*\{[^}]*chunkId/s)
  })

  it('increments position for every card across the whole call, not just within one BATCH_SIZE chunk', () => {
    // A per-inner-chunk counter (e.g. reset per `for (const chunk of ...)`
    // iteration) would assign the same chunkId range to every 500-card batch
    // instead of a monotonically increasing position across all `cards`.
    // Guard: the position variable must be declared OUTSIDE the outer
    // `for (let i = 0; i < importCards.length; i += BATCH_SIZE)` loop.
    // TASK-286 renamed the loop variable from `cards` to `importCards`
    // (post-enrichment array) — same loop, same contract, new name.
    const outerLoopIdx = source.indexOf('for (let i = 0; i < importCards.length; i += BATCH_SIZE)')
    expect(outerLoopIdx).toBeGreaterThan(-1)
    const beforeOuterLoop = source.slice(0, outerLoopIdx)
    expect(beforeOuterLoop).toMatch(/let\s+\w+\s*=\s*\(await\s+colRef\.count\(\)\.get\(\)\)/)
  })

  it('ties the increment to the chunkId calculation itself, per card — a vacuous lock otherwise (TASK-230 MED-A)', () => {
    // The test above only asserts WHERE the counter variable is declared —
    // it never checked that it is ever incremented. Deleting `position += 1`
    // entirely leaves it green: every card in the whole call (all 5000)
    // would then get chunkId = floor(existingCount / INDEX_CHUNK_SIZE), the
    // SAME chunkId, and no test here would notice.
    //
    // This backreference ties the increment to the chunkId assignment: the
    // captured counter name from `chunkId = Math.floor(<name> / ...)` must
    // reappear as `<name> += 1` within the following ~40 characters — i.e.
    // right after computing chunkId for THIS card, inside the per-card
    // `for (const card of chunk)` loop, not somewhere unrelated in the file.
    expect(source).toMatch(
      /const\s+chunkId\s*=\s*Math\.floor\(\s*(\w+)\s*\/\s*INDEX_CHUNK_SIZE\s*\);[\s\S]{0,40}\1\s*\+=\s*1/
    )
  })

  it('computes chunkId INSIDE the per-card loop, not once above it for the whole 500-card chunk (TASK-230 review M3)', () => {
    // The backreference test above ties `position += 1` to the SAME
    // chunkId assignment, but a backreference can't see loop nesting: moving
    // BOTH lines together — `const chunkId = Math.floor(...)` AND
    // `position += 1` — up above `for (const card of chunk)` keeps them
    // exactly as adjacent as they are today, so that test would still pass,
    // while the real defect this whole candado exists to catch would be
    // live: chunkId (and position) would advance once per 500-card BATCH
    // instead of once per card, freezing chunkId for the entire chunk.
    //
    // Guard directly against that: the chunkId assignment must appear AFTER
    // the per-card loop opens, i.e. textually inside it.
    const perCardLoopIdx = source.indexOf('for (const card of chunk)')
    expect(perCardLoopIdx).toBeGreaterThan(-1)
    const chunkIdIdx = source.indexOf('const chunkId = Math.floor(')
    expect(chunkIdIdx).toBeGreaterThan(perCardLoopIdx)
  })
})
