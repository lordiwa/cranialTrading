import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * TASK-290 review round 2 — MEDIUM-1.
 *
 * scripts/repair-public-cards-parity.mjs is a top-level script (it calls
 * `initializeApp` and hits Firestore at module-eval time), so it cannot be
 * `import`ed directly in a unit test the way repairPublicCardsParityHelpers.mjs
 * can — this is a source-read sensor (same genre as
 * tests/unit/scripts/splash.test.ts's index.html check), not a behavioral
 * one, because the behavior it locks lives in a script this suite cannot
 * safely execute.
 *
 * The bug this guards against: the script's four production call sites for
 * `buildPublicCardDoc` (src/stores/collection.ts:1920, 2037, 2262, 2884) all
 * pass `userInfo.avatarUrl`, but this repair script originally hardcoded the
 * 5th argument to `null`. That was silently correct for `qa_mtg` (no
 * avatarUrl on that account) and would be silently WRONG for any seller who
 * has one — run against them, the "repair" would strip avatarUrl from every
 * one of their public_cards documents, which is the exact content drift
 * this script exists to fix, not cause.
 */
const scriptSrc = readFileSync(
  resolve(__dirname, '../../../scripts/repair-public-cards-parity.mjs'),
  'utf-8'
)

describe('repair-public-cards-parity.mjs reads avatarUrl from userData instead of hardcoding null (TASK-290 MEDIUM-1)', () => {
  it('derives avatarUrl from userData before calling buildPublicCardDoc', () => {
    expect(scriptSrc).toMatch(/const\s+avatarUrl\s*=\s*userData\.avatarUrl\s*\?\?\s*null/)
  })

  it('passes the derived avatarUrl variable into buildPublicCardDoc, never a literal null', () => {
    const callMatch = scriptSrc.match(/buildPublicCardDoc\(\s*card,\s*targetUid,\s*username,\s*location,\s*([^)]+)\)/)
    expect(callMatch).not.toBeNull()
    const fifthArg = callMatch![1].trim()
    expect(fifthArg).toBe('avatarUrl')
    expect(fifthArg).not.toBe('null')
  })
})
