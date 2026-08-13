/**
 * TASK-232: execution-based regression lock for mapWithConcurrency.
 *
 * Scope, stated honestly: this proves the concurrency limiter itself
 * actually bounds in-flight work and preserves order/results — by
 * EXECUTING it, not by grepping index.js's source text (TASK-236's
 * four-empty-locks finding, 2026-08-13). It does NOT reproduce the
 * applyCardIndexDelta OOM end-to-end (that needs a Firestore
 * emulator/injection harness functions/ does not have yet — TASK-236
 * AC1, still open). If someone removes the mapWithConcurrency call from
 * applyChunkTransactions and goes back to a bare Promise.all, this test
 * keeps passing — it only locks the helper, not its call site. Treat
 * that as a known gap, not a solved one.
 *
 * Run: node functions/lib/concurrency.test.js
 * Mutation-verified: temporarily hardcoding `workerCount = items.length`
 * (i.e. no cap) in concurrency.js makes the "never exceeds the limit"
 * assertion below fail — see hand-off notes for the captured red output.
 */
const assert = require("node:assert/strict");
const { mapWithConcurrency } = require("./concurrency");

async function testNeverExceedsLimit() {
  const limit = 6;
  let active = 0;
  let maxActive = 0;
  const items = Array.from({ length: 40 }, (_, i) => i);

  const results = await mapWithConcurrency(items, limit, async (item) => {
    active++;
    maxActive = Math.max(maxActive, active);
    // Yield to let other workers actually overlap, so this isn't
    // accidentally serial and passing for the wrong reason.
    await new Promise((resolve) => setImmediate(resolve));
    active--;
    return item * 2;
  });

  assert.equal(maxActive <= limit, true, `expected concurrency <= ${limit}, saw ${maxActive}`);
  assert.equal(maxActive > 1, true, "expected some real overlap, not accidental serial execution");
  assert.deepEqual(results, items.map((i) => i * 2), "results must preserve input order");
}

async function testHandlesFewerItemsThanLimit() {
  const results = await mapWithConcurrency([1, 2, 3], 6, async (n) => n + 1);
  assert.deepEqual(results, [2, 3, 4]);
}

async function testEmptyInput() {
  const results = await mapWithConcurrency([], 6, async () => {
    throw new Error("fn must not be called for an empty input array");
  });
  assert.deepEqual(results, []);
}

async function testPropagatesRejection() {
  await assert.rejects(
    () => mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    }),
    /boom/
  );
}

async function main() {
  const tests = {
    testNeverExceedsLimit,
    testHandlesFewerItemsThanLimit,
    testEmptyInput,
    testPropagatesRejection,
  };
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (err) {
      failed++;
      console.error(`FAIL ${name}: ${err.message}`);
    }
  }
  if (failed > 0) {
    console.error(`${failed} test(s) failed`);
    process.exit(1);
  }
  console.log("All concurrency.js tests passed");
}

main();
