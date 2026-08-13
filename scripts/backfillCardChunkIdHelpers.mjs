/**
 * Pure, side-effect-free reporting logic for scripts/backfill-card-chunk-id.mjs
 * (TASK-230). Extracted so it can be unit-tested directly (same pattern as
 * scripts/usernameMigration.mjs) without touching Firestore, fs, or process.
 *
 * THE BUG THIS EXISTS TO PREVENT (review HIGH, TASK-230): `st.failed` is only
 * ever incremented on a WRITE failure, and writes only happen in RUN mode. In
 * STATUS mode every card missing the field lands in `written` (the "would be
 * written" preview count), never in `failed` — so counting only `failed` as
 * "missing" made STATUS report a clean 0-missing verdict against prod while
 * ALL 6,535 cards there were missing chunkId. Reproduced against prod by the
 * reviewer: exit code 0, "VEREDICTO: 0 cartas sin chunkId" while 100% of the
 * account's cards lacked the field.
 */

/**
 * How many cards in this account are STILL missing chunkId, given the mode.
 *  - RUN:    a write was attempted for every missing card; only ones whose
 *            write failed remain missing → `failed`.
 *  - STATUS: nothing was ever attempted; every card counted in `written`
 *            (the preview "would write" count) is, by definition, missing
 *            the field right now → `written`.
 */
export function accountMissingCount(mode, { written, failed }) {
  return mode === 'run' ? failed : written;
}

/** Human-readable per-account status line label. */
export function accountStatusLabel(mode, { done, written, failed }) {
  if (!done) return 'INTERRUMPIDA (correr de nuevo para retomar)';
  const missing = accountMissingCount(mode, { written, failed });
  if (missing === 0) return 'completa';
  return mode === 'run' ? 'INCOMPLETO (fallos de escritura)' : 'INCOMPLETO (cartas sin el campo)';
}

/**
 * Aggregate verdict across every account. `clean` (and therefore the exit
 * code) MUST be false whenever any card is still missing chunkId, in EITHER
 * mode — this is what the HIGH above broke.
 *
 * `accountsResumedFromCache` (TASK-230 MED-B): count of accounts whose
 * result THIS call came from a persisted `done: true` cursor (a previous
 * run's totals), not from reading a single document this call — see
 * processAccount's early-return branch in backfill-card-chunk-id.mjs. Only
 * possible in RUN mode; --status is stateless and never produces this.
 *
 * Before this fix, a `--run` repeated over a state file left by a completed
 * run skipped every account via that branch and still printed "VEREDICTO: 0
 * cartas sin chunkId" — a clean verdict this invocation never measured. Any
 * card that legitimately lost its chunkId afterward (addCard() omits it on
 * write failure, see src/stores/collection.ts) would go undetected forever
 * by repeated `--run`s, only caught by `--status`.
 *
 * When any account was resumed from cache, the verdict can't honestly claim
 * "0 cartas sin chunkId" — it can only claim "0 sin chunkId among what THIS
 * run measured", which is a different, weaker statement. `unverified` flags
 * that gap; callers must fold it into `clean` (or otherwise surface it) so
 * the tool cannot report success for an account it never looked at this run.
 */
export function computeVerdict(mode, { totalWritten, totalFailed, accountsIncomplete, accountsResumedFromCache = 0 }) {
  const totalMissing = mode === 'run' ? totalFailed : totalWritten;
  const unverified = mode === 'run' && accountsResumedFromCache > 0;
  return { totalMissing, clean: totalMissing === 0 && accountsIncomplete === 0 && !unverified, unverified };
}
