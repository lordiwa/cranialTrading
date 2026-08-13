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
 */
export function computeVerdict(mode, { totalWritten, totalFailed, accountsIncomplete }) {
  const totalMissing = mode === 'run' ? totalFailed : totalWritten;
  return { totalMissing, clean: totalMissing === 0 && accountsIncomplete === 0 };
}
