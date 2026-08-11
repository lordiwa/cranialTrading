/**
 * Regression lock for TASK-211.
 *
 * buildCardIndex (functions/index.js) used to read `request.data?.userId`
 * and fall back to `request.auth.uid` only when the client omitted it —
 * i.e. it trusted a client-supplied userId with no check that it matched
 * the authenticated caller. Any logged-in user could pass another user's
 * uid and buildCardIndex would rebuild (and therefore rewrite/delete stale
 * chunks of) that victim's users/{victim}/card_index, bypassing
 * firestore.rules entirely (Cloud Functions run with admin privileges).
 *
 * The fix removes the client-supplied userId parameter — no legitimate
 * caller ever sent one (see src/services/cloudFunctions.ts and the two
 * call sites in src/stores/collection.ts, plus scripts/card-index-fixture.mjs
 * --repair, which all call buildCardIndex with no argument). This is a
 * static source assertion (functions/ has no test harness wired to
 * vitest/CI) rather than an invocation test — it fails if the trust-the-
 * payload pattern is ever reintroduced into buildCardIndex.
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

describe('buildCardIndex — authorization regression lock (TASK-211)', () => {
  const source = extractOnCallSource('buildCardIndex')

  it('never reads a client-supplied userId from request.data', () => {
    expect(source).not.toMatch(/request\.data\??\.\s*userId/)
  })

  it('derives userId exclusively from the authenticated caller (request.auth.uid)', () => {
    expect(source).toMatch(/const\s+userId\s*=\s*request\.auth\.uid;/)
  })
})
