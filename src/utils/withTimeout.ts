/**
 * TASK-255 AC1. The Firestore web SDK's addDoc/updateDoc/deleteDoc have NO
 * built-in operation timeout — under a bad connection (the project's target
 * market is slow 4G, see project_target_market_slow_4g) the underlying
 * request can sit unresolved indefinitely: not rejected, not resolved, just
 * pending. TASK-255's production incident measured exactly this: a
 * deleteDoc await that never settled left CardDetailModal's save button
 * stuck on "GUARDANDO" forever, and — because nothing ever reached the
 * catch block — the existing failure-compensation logic never ran either.
 *
 * withTimeout races a promise against a timer and rejects with a
 * TimeoutError if the timer wins. It does NOT cancel the underlying
 * operation (the web SDK gives no way to abort a pending write) — the
 * original promise is left to settle on its own, its result simply ignored
 * once the timeout has already rejected. This means a Firestore write CAN
 * still land on the server after the client has already given up and shown
 * an error; that is an accepted trade-off (see TASK-255's decision writeup
 * for why the specific compensation this unlocks in deleteCard is safe even
 * when the "failed" write actually completes late).
 */
export class TimeoutError extends Error {
    constructor(label: string, ms: number) {
        super(`${label} timed out after ${ms}ms`)
        this.name = 'TimeoutError'
    }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new TimeoutError(label, ms))
        }, ms)
        // Promise.resolve() normalizes anything thenable-or-not — some
        // test doubles for Firestore's SDK calls return `undefined`
        // instead of a real Promise, and calling `.then` directly on that
        // would throw synchronously instead of racing against the timer.
        Promise.resolve(promise).then(
            (value) => {
                clearTimeout(timer)
                resolve(value)
            },
            (err: unknown) => {
                clearTimeout(timer)
                // Re-propagate the ORIGINAL rejection reason — no wrapping,
                // no replacing — whenever it already IS an Error. Firestore
                // (FirebaseError extends Error) always rejects with one, so
                // in practice this is always a pure passthrough: callers
                // such as deleteCard's isNotFoundError discriminate on a
                // `.code` field carried on that SAME object, and wrapping
                // it in a new Error would erase that field, silently
                // breaking that discrimination (and with it TASK-232 gap
                // #1's compensation). The fallback only exists to satisfy
                // prefer-promise-reject-errors for the type-theoretical
                // case of a non-Error rejection reason, which no known call
                // site here can actually produce.
                reject(err instanceof Error ? err : new Error(String(err)))
            },
        )
    })
}
