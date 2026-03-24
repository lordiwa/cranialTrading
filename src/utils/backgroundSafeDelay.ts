/**
 * Background-tab-safe delay.
 *
 * In foreground tabs: uses plain setTimeout (no event loop flooding).
 * In background tabs: uses MessageChannel polling fallback since
 * browsers throttle setTimeout to ~1/sec in background tabs.
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

        // setTimeout works fine in foreground — always set it
        const timer = setTimeout(done, ms)

        // Only activate MessageChannel polling in background tabs
        // (avoids flooding the event loop with macrotasks in foreground)
        if (typeof document !== 'undefined' && document.hidden) {
            const start = performance.now()
            const ch = new MessageChannel()
            ch.port1.onmessage = () => {
                if (resolved) return
                if (performance.now() - start >= ms) {
                    clearTimeout(timer)
                    done()
                } else {
                    ch.port2.postMessage(null)
                }
            }
            ch.port2.postMessage(null)
        }
    })
}
