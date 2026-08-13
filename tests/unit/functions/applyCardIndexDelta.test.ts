/**
 * TASK-232: applyCardIndexDelta moves card_index chunk writes for
 * status-change/delete mutations off the browser and onto the server,
 * resolving chunkId from each card's own document (TASK-230's sticky
 * field) instead of trusting the client.
 *
 * functions/ has no test harness wired to vitest/CI (see
 * tests/unit/functions/buildCardIndexAuthz.test.ts's header) — onCall
 * functions run under firebase-admin against a real project and are not
 * meaningfully invokable here. Same static-source-assertion approach as
 * that file and bulkImportCardsChunkId.test.ts: these fail if the
 * documented invariants drift out of the source.
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

describe('applyCardIndexDelta — server-side card_index chunk patching (TASK-232)', () => {
  const source = extractOnCallSource('applyCardIndexDelta')

  it('rejects unauthenticated callers', () => {
    expect(source).toMatch(/if\s*\(!request\.auth\)\s*\{\s*throw new HttpsError\(\s*["']unauthenticated["']/)
  })

  it('never trusts a client-supplied userId — derives it exclusively from request.auth.uid', () => {
    // Same class TASK-211/213/214 fixed: a `request.data?.userId` or
    // destructured `userId` from the payload would let a caller target
    // another user's card_index.
    expect(source).not.toMatch(/request\.data\?\.userId/)
    expect(source).toMatch(/const\s+userId\s*=\s*request\.auth\.uid/)
  })

  it('caps the batch size — does not accept unbounded mutation arrays', () => {
    expect(source).toMatch(/rawMutations\.length\s*>\s*500/)
  })

  it('resolves chunkId by reading each card doc — never accepts a client-supplied chunkId field', () => {
    // The only place `chunkId` is read from is `data.chunkId` off a
    // `db.getAll(...)`/doc snapshot, never off the request payload.
    expect(source).toMatch(/data\.chunkId/)
    expect(source).not.toMatch(/request\.data\.mutations\[[^\]]*\]\.chunkId/)
    expect(source).not.toMatch(/m\.chunkId/)
  })

  it('resolves the affected card docs with db.getAll, not one read per card', () => {
    expect(source).toMatch(/db\.getAll\(\.\.\.cardRefs\)/)
  })

  it('never fabricates a NEW index entry for a plain update — only patches one that already exists in its chunk', () => {
    // The insert branch must be gated behind allowInsert; without that
    // gate, an 'update' mutation for a card whose entry doesn't yet exist
    // in its resolved chunk would silently create one at a resolved-but-
    // unverified position (TASK-168's "fabricated invisible card" class).
    expect(source).toMatch(/if\s*\(\s*existingIdx\s*===\s*undefined\s*\)\s*\{\s*if\s*\(\s*allowInsert\s*\)/)
  })

  it('does not skip a delete with no resolvable chunkId — falls back to a full-index scan instead of leaving a phantom', () => {
    // TASK-232 gap #2: silently skipping a delete whose doc has no
    // chunkId (or is already gone) leaves the card_index entry behind —
    // a phantom (index says the card exists, no document backs it).
    expect(source).toMatch(/deleteFallbackIds/)
    expect(source).toMatch(/db\.collection\(`users\/\$\{userId\}\/card_index`\)\.get\(\)/)
  })

  it('patches each affected chunk inside its own transaction (TASK-226 concurrency mitigation)', () => {
    expect(source).toMatch(/db\.runTransaction\(async \(tx\) => \{/)
    expect(source).toMatch(/const chunkSnap = await tx\.get\(chunkRef\)/)
    expect(source).toMatch(/tx\.set\(chunkRef,/)
  })

  it('writes the version field on every chunk it touches, matching buildCardIndex', () => {
    expect(source).toMatch(/version:\s*INDEX_VERSION/)
  })

  it('reports every unresolved mutation back — never a silent no-op', () => {
    expect(source).toMatch(/skippedIds/)
    expect(source).toMatch(/return\s*\{\s*applied:\s*appliedCount,\s*skipped:\s*uniqueSkipped\.length,\s*skippedIds:\s*uniqueSkipped,\s*fallbackUsed\s*\}/)
  })

  it('logs (not just returns) when mutations are skipped — server-side visibility, not just a client-side field', () => {
    expect(source).toMatch(/logger\.warn\(/)
  })
})
