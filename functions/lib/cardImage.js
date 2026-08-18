/**
 * cardImage — pure, dependency-free helpers for the card-image proxy/cache
 * (TASK-241 AC2/AC3/AC4/AC6/AC7). Extracted the same way as concurrency.js
 * (TASK-232) so this can be unit-tested by EXECUTION without pulling in
 * firebase-admin — index.js calls admin.initializeApp() at require-time and
 * functions/ has no Firestore/Storage-emulator test harness (TASK-236).
 *
 * URL shape mirrors Scryfall's own path layout on purpose (variant/face/id)
 * so the mapping to/from the Scryfall CDN URL is a straight rename, not a
 * lookup: /img/{variant}/{face}/{scryfallId}.webp
 *
 * TASK-241 only ever needs the two variants the grid actually renders
 * (`thumb` replaces the old `small`, `grid` replaces the old `normal` — see
 * AC1's hand-off) — not the full Scryfall variant set.
 */

const VARIANTS = new Set(['thumb', 'grid']);
const FACES = new Set(['front', 'back']);
// Scryfall IDs are UUIDs (lowercase in practice, matched case-insensitively
// because the index card_index data has been through several code paths).
const SCRYFALL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH_RE = /^\/img\/([a-z]+)\/([a-z]+)\/([0-9a-fA-F-]+)\.webp$/;

/**
 * Parses a request path of the form "/img/{variant}/{face}/{scryfallId}.webp".
 * Returns null (never throws) for anything that doesn't match the expected
 * shape or fails allow-list/format validation — the caller is expected to
 * respond 400 on null, never construct a Storage path or an outbound
 * Scryfall URL from unvalidated input.
 *
 * @param {string} path
 * @returns {{variant: string, face: string, scryfallId: string} | null}
 */
function parseImagePath(path) {
  const m = PATH_RE.exec(path || '');
  if (!m) return null;
  const [, variant, face, scryfallId] = m;
  if (!VARIANTS.has(variant)) return null;
  if (!FACES.has(face)) return null;
  if (!SCRYFALL_ID_RE.test(scryfallId)) return null;
  return { variant, face, scryfallId };
}

/**
 * Firebase Storage object path for a parsed image request. One object per
 * (variant, face, scryfallId) triple — never overwritten once written,
 * matching Scryfall's own "printings are immutable" cache-forever contract.
 *
 * @param {{variant: string, face: string, scryfallId: string}} parsed
 * @returns {string}
 */
function storagePath({ variant, face, scryfallId }) {
  return `card-images/${variant}/${face}/${scryfallId}.webp`;
}

/**
 * The Scryfall CDN URL a parsed image request maps to — used both as the
 * fill-path source (AC3) and as the AC7 degradation target when our own
 * cache/function can't serve the request.
 *
 * @param {{variant: string, face: string, scryfallId: string}} parsed
 * @returns {string}
 */
function scryfallUrl({ variant, face, scryfallId }) {
  return `https://cards.scryfall.io/${variant}/${face}/${scryfallId.charAt(0)}/${scryfallId.charAt(1)}/${scryfallId}.webp`;
}

/**
 * Good-citizenship throttle for the Scryfall fill path (AC6): never let two
 * calls to the returned `wait()` function resolve less than `minIntervalMs`
 * apart. Time source and sleep function are injectable so tests can run
 * this by EXECUTION, with fake time, instead of real wall-clock waits.
 *
 * KNOWN LIMITATION (documented, not silently assumed away): this state is
 * per-module-instance. Cloud Functions can run multiple instances
 * concurrently under load, and each instance gets its own throttle — this
 * bounds the rate PER INSTANCE, not globally across the whole deployment.
 * Scryfall's own published policy (LEÍDO, scryfall.com/docs/api/rate-limits,
 * 2026-08-18) says the direct file origins (`*.scryfall.io`, which is what
 * the fill path calls) "do not have rate limits" at all — this throttle is
 * good-citizenship etiquette on top of that, not a requirement their policy
 * imposes, so a per-instance bound is an accepted trade-off, not a gap.
 *
 * @param {number} minIntervalMs
 * @param {() => number} [now]
 * @param {(ms: number) => Promise<void>} [sleep]
 * @returns {() => Promise<void>}
 */
function createThrottle(minIntervalMs, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
  let lastAt = 0;
  return async function wait() {
    const n = now();
    const remaining = lastAt + minIntervalMs - n;
    if (remaining > 0) {
      await sleep(remaining);
    }
    lastAt = Math.max(now(), lastAt + minIntervalMs);
  };
}

module.exports = { parseImagePath, storagePath, scryfallUrl, createThrottle, VARIANTS, FACES };
