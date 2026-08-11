/**
 * Regression lock for TASK-211, TASK-213 and TASK-214.
 *
 * TASK-211 (buildCardIndex): used to read `request.data?.userId` and fall
 * back to `request.auth.uid` only when the client omitted it — i.e. it
 * trusted a client-supplied userId with no check that it matched the
 * authenticated caller. Any logged-in user could pass another user's uid
 * and buildCardIndex would rebuild (and therefore rewrite/delete stale
 * chunks of) that victim's users/{victim}/card_index, bypassing
 * firestore.rules entirely (Cloud Functions run with admin privileges).
 * The fix removed the client-supplied userId parameter entirely.
 *
 * TASK-213 (migrateUserCards): identical trust-the-payload pattern, but
 * WORSE — it operates on users/{victim}/cards (the source card documents
 * themselves) and its job is to DELETE fields off them. No legitimate
 * caller ever invoked it (verified: zero references in src/, scripts/,
 * e2e/), so the function was deleted outright rather than patched.
 *
 * TASK-214 (queryCardIndex): same pattern (a client-supplied userId,
 * destructured from request.data, used with no ownership check) but on a
 * read path. The fix removed userId from the destructured payload —
 * queryCardIndex now derives targetUserId exclusively from
 * request.auth.uid.
 *
 * These are static source assertions (functions/ has no test harness wired
 * to vitest/CI) rather than invocation tests — they fail if the
 * trust-the-payload pattern is ever reintroduced into any of these
 * functions, or into any *new* onCall function that reads a client-supplied
 * userId (TASK-213 AC4/AC5 general sweep, TASK-214 AC6 destructuring
 * coverage).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const functionsSource = readFileSync(
  resolve(__dirname, '../../../functions/index.js'),
  'utf-8'
)

/** Every `exports.<fnName> = onCall(...)` function name declared in functions/index.js. */
function listOnCallFunctionNames(): string[] {
  const names: string[] = []
  const re = /\nexports\.(\w+)\s*=\s*onCall\(/g
  let m: RegExpExecArray | null
  // Also match a leading declaration at the very start of the file (unlikely, but don't miss it).
  const reStart = /^exports\.(\w+)\s*=\s*onCall\(/
  const startMatch = functionsSource.match(reStart)
  if (startMatch) names.push(startMatch[1])
  while ((m = re.exec(functionsSource)) !== null) {
    names.push(m[1])
  }
  return names
}

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

// Trust-the-payload patterns: a client-supplied userId read either via
// property access (request.data?.userId / request.data.userId) or via
// destructuring (const { userId, ... } = request.data || {}).
const PROPERTY_ACCESS_PATTERN = /request\.data\??\.\s*userId/
const DESTRUCTURE_PATTERN = /const\s*\{[^}]*\buserId\b[^}]*\}\s*=\s*request\.data/

describe('buildCardIndex — authorization regression lock (TASK-211)', () => {
  const source = extractOnCallSource('buildCardIndex')

  it('never reads a client-supplied userId from request.data', () => {
    expect(source).not.toMatch(PROPERTY_ACCESS_PATTERN)
    expect(source).not.toMatch(DESTRUCTURE_PATTERN)
  })

  it('derives userId exclusively from the authenticated caller (request.auth.uid)', () => {
    expect(source).toMatch(/const\s+userId\s*=\s*request\.auth\.uid;/)
  })
})

describe('migrateUserCards — deleted, not patched (TASK-213)', () => {
  it('no longer exists in functions/index.js', () => {
    expect(functionsSource).not.toMatch(/exports\.migrateUserCards\s*=\s*onCall\(/)
  })

  it('is not referenced anywhere else in functions/index.js either', () => {
    expect(functionsSource).not.toMatch(/migrateUserCards/)
  })
})

describe('queryCardIndex — authorization regression lock (TASK-214)', () => {
  const source = extractOnCallSource('queryCardIndex')

  it('never reads a client-supplied userId from request.data (property access or destructuring)', () => {
    expect(source).not.toMatch(PROPERTY_ACCESS_PATTERN)
    expect(source).not.toMatch(DESTRUCTURE_PATTERN)
  })

  it('derives targetUserId exclusively from the authenticated caller (request.auth.uid)', () => {
    expect(source).toMatch(/const\s+targetUserId\s*=\s*request\.auth\.uid;/)
  })
})

describe('all onCall functions — general sweep for the trust-the-payload pattern (TASK-213 AC4/AC5)', () => {
  const fnNames = listOnCallFunctionNames()

  it('found at least the functions this file already knows about (sanity check on the sweep itself)', () => {
    expect(fnNames).toEqual(expect.arrayContaining(['buildCardIndex', 'queryCardIndex']))
    expect(fnNames).not.toContain('migrateUserCards')
  })

  it.each(listOnCallFunctionNames())(
    'exports.%s never reads a client-supplied userId from request.data',
    (fnName) => {
      const source = extractOnCallSource(fnName)
      expect(source).not.toMatch(PROPERTY_ACCESS_PATTERN)
      expect(source).not.toMatch(DESTRUCTURE_PATTERN)
    }
  )
})
