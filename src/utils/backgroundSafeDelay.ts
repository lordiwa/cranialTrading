/**
 * Background-tab-safe delay.
 *
 * Browsers throttle setTimeout to ~1/sec in background tabs.
 * MessageChannel.onmessage is NOT throttled, so we race both:
 * whichever fires first after the requested delay resolves the promise.
 */
export function backgroundSafeDelay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve()

    return new Promise(resolve => {
        let resolved = false
        const done = () => {
            if (!resolved) {
                resolved = true
                resolve()
            }
        }

        // Primary: setTimeout (works normally in foreground tabs)
        const timer = setTimeout(done, ms)

        // Fallback: MessageChannel polling (not throttled in background tabs)
        const start = performance.now()
        const ch = new MessageChannel()
        ch.port1.onmessage = () => {
            if (performance.now() - start >= ms) {
                clearTimeout(timer)
                done()
            } else {
                ch.port2.postMessage(null)
            }
        }
        ch.port2.postMessage(null)
    })
}
