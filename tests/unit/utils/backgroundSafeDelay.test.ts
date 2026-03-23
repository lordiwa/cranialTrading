import { backgroundSafeDelay } from '../../../src/utils/backgroundSafeDelay'

describe('backgroundSafeDelay', () => {
    it('resolves immediately for ms <= 0', async () => {
        const start = performance.now()
        await backgroundSafeDelay(0)
        expect(performance.now() - start).toBeLessThan(50)
    })

    it('resolves immediately for negative ms', async () => {
        const start = performance.now()
        await backgroundSafeDelay(-100)
        expect(performance.now() - start).toBeLessThan(50)
    })

    it('waits approximately the requested delay', async () => {
        const start = performance.now()
        await backgroundSafeDelay(100)
        const elapsed = performance.now() - start
        // Should be at least 90ms (allow some timing tolerance)
        expect(elapsed).toBeGreaterThanOrEqual(80)
        // Should not overshoot by more than 200ms
        expect(elapsed).toBeLessThan(300)
    })

    it('returns a Promise', () => {
        const result = backgroundSafeDelay(10)
        expect(result).toBeInstanceOf(Promise)
    })
})
