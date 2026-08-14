/**
 * TASK-232 (review round, 2026-08-13, HIGH-1): the previous regression lock
 * for functions/lib/concurrency.js lived at functions/lib/concurrency.test.js,
 * a plain-Node script runnable only via `node lib/concurrency.test.js` or
 * `npm test` inside functions/ — MEASURED, neither is ever invoked: CI's
 * .github/workflows/test.yml runs the root `npm run test:unit` (this
 * project's vitest suite) and never touches functions/; firebase.json has
 * no `predeploy` hook that would run functions/package.json's `test`
 * script either. A lock nothing runs is equivalent to no lock — this file
 * replaces it by living inside tests/unit/, which IS what `npm run
 * test:unit` (and therefore CI) actually executes.
 *
 * Unlike most of tests/unit/functions/ (buildCardIndexAuthz.test.ts,
 * applyCardIndexDelta.test.ts, ...), this is NOT a source-text assertion —
 * concurrency.js is a plain CommonJS module with zero dependencies on
 * firebase-admin (extracted from functions/index.js for exactly this
 * reason — see its own header comment), so it can be `require()`'d and
 * actually EXECUTED here, same as any other unit under test. This proves
 * the concurrency bound behaves as claimed at runtime; it does NOT prove
 * applyChunkTransactions in functions/index.js still calls it instead of a
 * bare Promise.all — that call-site coupling has no execution harness
 * (TASK-236) and is covered only by the source-text tripwire in
 * applyCardIndexDelta.test.ts.
 *
 * Mutation-verified directly against THIS file, 2026-08-13: temporarily
 * hardcoding `workerCount = items.length` in functions/lib/concurrency.js
 * (removing the concurrency cap) turns testNeverExceedsLimit red —
 * `expected concurrency <= 6, saw 40` — with the other three cases
 * unaffected; reverting restores all four green. That run is what
 * grounds this test, not a pointer to notes recorded anywhere else.
 */
import { mapWithConcurrency } from '../../../functions/lib/concurrency.js'

describe('mapWithConcurrency (functions/lib/concurrency.js, TASK-232)', () => {
    it('never runs more than `limit` calls concurrently, and preserves input order', async () => {
        const limit = 6
        let active = 0
        let maxActive = 0
        const items = Array.from({ length: 40 }, (_, i) => i)

        const results = await mapWithConcurrency(items, limit, async (item: number) => {
            active++
            maxActive = Math.max(maxActive, active)
            // Yield so other workers can actually overlap — without this the
            // loop could pass trivially by staying serial for the wrong reason.
            await new Promise(resolve => setImmediate(resolve))
            active--
            return item * 2
        })

        expect(maxActive).toBeLessThanOrEqual(limit)
        expect(maxActive).toBeGreaterThan(1) // real overlap happened, not accidental serial execution
        expect(results).toEqual(items.map(i => i * 2))
    })

    it('handles fewer items than the limit', async () => {
        const results = await mapWithConcurrency([1, 2, 3], 6, async (n: number) => n + 1)
        expect(results).toEqual([2, 3, 4])
    })

    it('never calls fn for an empty input array', async () => {
        const fn = vi.fn(async () => { throw new Error('must not be called') })
        const results = await mapWithConcurrency([], 6, fn)
        expect(results).toEqual([])
        expect(fn).not.toHaveBeenCalled()
    })

    it('propagates a rejection from fn', async () => {
        await expect(
            mapWithConcurrency([1, 2, 3], 2, async (n: number) => {
                if (n === 2) throw new Error('boom')
                return n
            })
        ).rejects.toThrow('boom')
    })
})
