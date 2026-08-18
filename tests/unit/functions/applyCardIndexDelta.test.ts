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
 *
 * HONEST LIMIT OF THIS TECHNIQUE (team-lead verification round, TASK-232):
 * a source-text regex proves a LINE is present, never that the MECHANISM
 * behaves as claimed at runtime. Measured directly on this file: the
 * "buildCardIndex only rewrites docs whose chunkId actually drifted" test
 * stayed GREEN while the projected Phase 1 read (`INDEX_FIELDS`) omitted
 * `chunkId` entirely — meaning `allRawCards[i].data.chunkId` was always
 * `undefined`, the drift comparison was always true, and the real behavior
 * was "every card, every rebuild" while the assertion below claimed the
 * opposite. Neither `chunkIdFixes.push(...)` nor `allRawCards[i].data.chunkId`
 * ever stopped appearing in the source — the bug lived in a DIFFERENT part
 * of the file (the read projection) that no assertion here was checking.
 * The team-lead's synthetic probe of the round-2 escalation logic (inverting
 * `!stillMissing.has` to `stillMissing.has`, which makes located phantoms
 * never actually get deleted) also left all 15 tests green with the text
 * otherwise untouched. Read every "it" below as "this exact line has not
 * been deleted or trivially inverted" — not as "this behaves correctly
 * against real Firestore data". Treat any change here that removes or
 * reorders a matched line as a signal to re-derive the assertion, not
 * evidence the underlying mechanism still works.
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

  it('TASK-232 HIGH-1: a delete NOT found in its believed chunk is escalated to the fallback scan — never treated as "already absent"', () => {
    // The card's own chunkId (bulkImportCards' creation-order assignment,
    // or drift from an earlier position-based rewrite) is not guaranteed
    // to match the chunk its entry actually lives in. Silently concluding
    // "not there -> already deleted" when it's really "wrong chunk" leaves
    // the real entry behind forever — a phantom no different from gap #2's
    // missing-chunkId case. The delete branch must collect these into a
    // separate bucket (not just `continue`) and a later scan/re-apply pass
    // must exist to resolve them.
    expect(source).toMatch(/notFoundDeletes\.push\(cardId\)/)
    expect(source).not.toMatch(/if\s*\(existingIdx === undefined\) continue; \/\/ already absent/)
    // The escalation must actually be consumed by a second pass, not just
    // collected and discarded — look for a second call site that re-applies
    // the scan/transaction machinery.
    const scanCallSites = source.match(/scanAndAssign\(/g) ?? []
    const applyCallSites = source.match(/applyChunkTransactions\(/g) ?? []
    expect(scanCallSites.length).toBeGreaterThanOrEqual(2)
    expect(applyCallSites.length).toBeGreaterThanOrEqual(2)
  })

  it('URGENT PROD FIX (2026-08-18, right-click and bulk status-change both broken): an UPDATE not found in its believed chunk is escalated to the fallback scan too — not silently added straight to skippedIds', () => {
    // MEDIDO en produccion (v1.58.4): updateCard/batchUpdateCards resolve
    // `true`, the Firestore document write lands correctly, and
    // applyCardIndexDelta itself returns HTTP 200 — yet the card_index entry
    // never changes and reverts on reload. Root cause traced by reading this
    // exact function: chunkId is STICKY on each card doc (TASK-230) but the
    // chunk a card's entry actually lives in can drift (append-order
    // chunkId vs rank-order rebuild/backfill — TASK-230 LOW-2, TASK-232
    // HIGH-1). HIGH-1's fix only escalated the DELETE case
    // (notFoundDeletes -> round 2 scanAndAssign); the UPDATE case
    // (notFoundUpdates) was left going straight into `skippedIds` right
    // after round 1, with zero attempt to locate the entry elsewhere in the
    // index — a silent, permanent, "200 OK" no-op for exactly the status-
    // change path every user actually exercises (right-click one card,
    // "select all" -> bulk status change).
    //
    // Before this fix: `skippedIds.push(...round1.notFoundUpdateIds)`
    // appears immediately after round1 with NO scan escalation in between —
    // this assertion is INVERTED on purpose (a `not.toMatch`) so it is RED
    // while that unconditional push exists, and turns GREEN only once
    // notFoundUpdateIds are folded into the same round-2 scan+re-apply the
    // delete path already gets.
    expect(source).not.toMatch(/skippedIds\.push\(\.\.\.round1\.notFoundUpdateIds\)/)

    // Positive requirement: round1's notFoundUpdateIds must reach
    // scanAndAssign (the same full-index fallback used for deletes) before
    // anything is finally declared skipped.
    expect(source).toMatch(/notFoundUpdateIds/)
    expect(source).toMatch(/scanAndAssign\(\s*\[\s*\.\.\.round1\.notFoundUpdateIds\s*,\s*\.\.\.round1\.notFoundDeleteIds\s*\]/)
  })

  it('TRIPWIRE, not a behavior test (TASK-232 OOM fix, review round MED-2): applyChunkTransactions still calls the bounded mapWithConcurrency helper, not a bare unbounded Promise.all', () => {
    // tests/unit/functions/concurrency.test.ts proves mapWithConcurrency
    // ITSELF bounds concurrency by EXECUTING it — real coverage. This test
    // proves nothing about behavior; it only catches someone reverting the
    // call site back to `Promise.all(chunkNumbers.map(...))` (silently
    // reopening the OOM this ticket fixed) WITHOUT reintroducing
    // mapWithConcurrency somewhere else first. A source-text match can't
    // tell a real revert from a cosmetic rename, so treat a failure here as
    // "go re-read applyChunkTransactions", not as proof either way on its
    // own — same honest-limit caveat as every other test in this file.
    expect(source).toMatch(/mapWithConcurrency\(/)
    expect(source).not.toMatch(/await Promise\.all\(\s*chunkNumbers/)
  })
})

describe('buildCardIndex — self-corrects drifted chunkId on every rebuild (TASK-232 HIGH-1)', () => {
  const source = extractOnCallSource('buildCardIndex')

  it('compares each card doc\'s chunkId against the chunk this rebuild is actually placing it in', () => {
    expect(source).toMatch(/allRawCards\[i\]\.data\.chunkId\s*!==\s*correctChunkId/)
  })

  it('only rewrites docs whose chunkId actually drifted — not every card on every rebuild', () => {
    // The fix must be conditioned on a real mismatch (chunkIdFixes.length),
    // not an unconditional batch-write of the whole collection — that would
    // turn every rebuild into a full second write pass over every card doc.
    expect(source).toMatch(/if\s*\(chunkIdFixes\.length > 0\)\s*\{/)
  })

  it('reads chunkId in the Phase 1 projected query — without this, data.chunkId is always undefined and the drift comparison above is vacuously always true (the actual HIGH found in the first cut of this fix)', () => {
    const fieldsMatch = source.match(/const INDEX_FIELDS = \[([\s\S]*?)\];/)
    expect(fieldsMatch).not.toBeNull()
    expect(fieldsMatch![1]).toMatch(/['"]chunkId['"]/)
  })

  it('batches the chunkId rewrites (bounded per-commit size), not one write per card', () => {
    expect(source).toMatch(/FIX_BATCH/)
    expect(source).toMatch(/batch\.update\(colRef\.doc\(fix\.id\),\s*\{\s*chunkId:\s*fix\.chunkId\s*\}\)/)
  })
})
