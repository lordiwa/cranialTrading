/**
 * mapWithConcurrency — runs `fn` over `items` with at most `limit` calls
 * in flight at once, preserving input order in the returned array.
 *
 * Extracted as its own dependency-free module (TASK-232 OOM fix) so it can
 * be unit-tested by EXECUTION without pulling in firebase-admin — index.js
 * calls admin.initializeApp() at require-time, and functions/ has no
 * Firestore-emulator test harness yet (TASK-236). Regression lock:
 * tests/unit/functions/concurrency.test.ts requires this file directly and
 * runs it for real (part of the root `npm run test:unit` suite CI actually
 * executes) — more than the existing source-text assertions in this
 * project ever proved (TASK-236's four empty-lock finding, 2026-08-13).
 * An earlier version of this lock (functions/lib/concurrency.test.js, a
 * standalone Node script) was itself never run by anything — CI does not
 * touch functions/, and no predeploy hook exists — and was removed in
 * favor of the vitest spec above (review round, 2026-08-13, HIGH-1).
 *
 * @param {T[]} items
 * @param {number} limit - max concurrent in-flight calls to fn (>= 1)
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

module.exports = { mapWithConcurrency };
