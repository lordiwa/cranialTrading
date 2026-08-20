import { withTimeout, TimeoutError } from '../../../src/utils/withTimeout'

describe('withTimeout', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('resolves with the inner value when it settles before the timeout', async () => {
        const promise = withTimeout(Promise.resolve('ok'), 1000, 'test-op')
        await vi.advanceTimersByTimeAsync(0)
        await expect(promise).resolves.toBe('ok')
    })

    it('rejects with the inner error when it rejects before the timeout', async () => {
        vi.useRealTimers()
        const inner = Promise.reject(new Error('boom'))
        const promise = withTimeout(inner, 1000, 'test-op')
        await expect(promise).rejects.toThrow('boom')
        vi.useFakeTimers()
    })

    // TASK-255 AC4: the real production bug is a promise that NEVER
    // resolves — not a rejection. Simulating a hang (a promise that never
    // settles) is the whole point of this test; a rejecting promise would
    // not exercise the timeout path at all.
    it('rejects with a TimeoutError when the inner promise never settles (a hang, not a rejection)', async () => {
        const neverSettles = new Promise<string>(() => {})
        const promise = withTimeout(neverSettles, 5000, 'test-op')

        const assertion = expect(promise).rejects.toBeInstanceOf(TimeoutError)
        await vi.advanceTimersByTimeAsync(5000)
        await assertion
    })

    it('TimeoutError message includes the label and the duration', async () => {
        const neverSettles = new Promise<string>(() => {})
        const promise = withTimeout(neverSettles, 5000, 'deleteDoc')

        const assertion = expect(promise).rejects.toThrow('deleteDoc timed out after 5000ms')
        await vi.advanceTimersByTimeAsync(5000)
        await assertion
    })

    it('does not fire the timeout once the inner promise has already resolved', async () => {
        const promise = withTimeout(Promise.resolve('fast'), 5000, 'test-op')
        await vi.advanceTimersByTimeAsync(0)
        await expect(promise).resolves.toBe('fast')
        // Advancing well past the timeout must not throw an unhandled
        // rejection — the timer was cleared on settlement.
        await vi.advanceTimersByTimeAsync(10000)
    })
})
