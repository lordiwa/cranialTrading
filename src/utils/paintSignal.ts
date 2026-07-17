/**
 * TASK-132 review fix (LOW-2): the CSS selector used to decide "the app has
 * painted real content, not just the splash screen or the auth loader".
 * Shared by two independent consumers that must agree on the same
 * definition or silently drift apart:
 *   - stores/auth.ts's waitForFirstPaintOrTimeout, which defers the
 *     Firebase SDK fetch until this matches (or a timeout elapses).
 *   - scripts/perf-measure.mjs's APPRENDER detector, which measures how
 *     long the same condition takes to become true.
 * scripts/perf-measure.mjs is a standalone Node script (can't import app
 * TS source), so it carries its own copy of this literal with a pointer
 * comment back here — if you change this selector, update that copy too.
 */
export const PAINTED_CONTENT_SELECTOR = '#app header, #app main, #app input, #app button';
