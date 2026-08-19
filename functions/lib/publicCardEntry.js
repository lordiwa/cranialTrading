/**
 * publicCardEntry — how a public-profile index entry is built from a
 * public_cards document plus its scryfall_cache document (TASK-247 tanda
 * 1/4).
 *
 * TASK-247 root cause: the public profile filters and searches over the
 * ~60 cards that happen to already be loaded in memory, instead of a real
 * index — 36 black cards shown of 1,049 real ones. This module is the entry
 * builder for the replacement index (subsequent tandas write the index and
 * wire the query layer to it). Same dependency-free CommonJS technique as
 * functions/lib/cardIndexEntry.js (TASK-245): require()'able and EXECUTABLE
 * by vitest without firebase-admin (functions/ has no emulator harness —
 * TASK-236).
 *
 * Corrections round (review of e49d5db, measured against the 6,647 real
 * public_cards documents of the production profile):
 *
 * HIGH-1: public_cards documents do NOT have a `name` field. The real
 * fields, measured: avatarUrl, cardId, cardName, cardNameLower, condition,
 * edition, foil, image, location, price, quantity, scryfallId, setCode,
 * status, updatedAt, userId, username. Reading `data.name` silently
 * produced an empty string for every entry (0/14 "blight" substring
 * matches instead of 14) — `name` is a field of cardIndexEntry.js's
 * per-user documents, not of public_cards. Fixed: `n`/`nl` now come from
 * `cardName`/`cardNameLower`, deriving `nl` from a lowercased `cardName`
 * only when `cardNameLower` itself is missing (never the other way — the
 * stored lowercase is the source of truth when present, since it may
 * already be normalized in ways a fresh `.toLowerCase()` wouldn't match).
 *
 * HIGH-2: `colors: []` is a legitimate value — it means the card is
 * incolora, not "no data yet". `color_identity` is a different concept
 * (includes mana symbols from the card's rules text, e.g. an artifact that
 * costs {B} to activate) and must never stand in for "the card's actual
 * color" when `colors` is present, even empty. Measured: 49 incolora
 * cards were being counted as colored before this fix (Cranial Plating,
 * colors=[] color_identity=[B], was showing up under "black"; Marshals'
 * Pathcruiser, colors=[] color_identity=[B,G,R,U,W], was showing up under
 * all five colors). Fixed order, `colors` (even empty) now wins outright;
 * `card_faces[].colors` union is the fallback when `colors` is absent;
 * `color_identity` is the last resort, only when neither of the above
 * exists.
 *
 * AC9, corrected: 474 of 6,647 (7.1%) public_cards have NO usable color
 * source at all (no `colors` array, no `card_faces[].colors`, no
 * `color_identity`). Left alone, those entries come out identical to a
 * genuinely colorless card (`co: []`) and are invisible to reconciliation
 * or to a "cards missing color data" query — the exact kind of silent gap
 * TASK-208/TASK-238 already burned this project on once. Decision: a
 * second flag, `cu` (color-unknown), distinct from `x` (no cache doc at
 * all — TASK-247 tanda 1 baseline, 17 of 5,162 scryfallId measured at the
 * time). `x` implies no color data too, but `cu` is the flag that also
 * fires when a cache DOES exist yet still has no usable color source —
 * `x` alone cannot distinguish that case from a colorless card either.
 * `x` and `cu` are independent: `x` is set whenever there's no cache doc,
 * `cu` is set whenever color resolution comes up empty (which includes,
 * but is not limited to, the `x` case).
 *
 * AC9 DECISION (what the query layer must do with `x`/`cu` — this module
 * only flags, later tandas are the ones that have to honor this): a
 * flagged entry is EXCLUDED from any color-filtered result (it must never
 * silently count as "colorless" just because `co` is `[]`), but it stays
 * INCLUDED in an unfiltered listing and in name/substring search — the
 * card is real and for sale, only its color is unknown, and hiding it
 * entirely would be worse than showing it without a color badge. The
 * actual data gap (missing scryfall_cache doc, or a cache doc with none
 * of the three color sources) is out of this module's scope to fix — a
 * backfill job re-fetching those scryfallId from Scryfall is the intended
 * remedy, and re-running the entry builder after that backfill is what
 * clears `x`/`cu` on the next index (re)build. Until backfill runs, the
 * user-visible effect is: the affected cards appear in "All colors" and
 * in search, disappear the instant any single-color filter chip is
 * selected, and never appear miscategorized under a color they don't
 * have.
 *
 * `resolveTypeLine` does not have the same present-but-empty ambiguity:
 * `type_line` is a string, and Scryfall never sends `type_line: ""` for a
 * real card, so treating a falsy `type_line` as "missing" (unlike a falsy
 * `colors`, which would wrongly treat `[]` as missing) is safe as-is.
 *
 * Fallback ORDER, spelled out (reviewer flagged that no pre-fix test had
 * both `card_faces` and `color_identity` present at once, so an inverted
 * order would have gone undetected — two DISTINCT behaviors depend on it,
 * both real-world cases:
 *   1. `card_faces[].colors` must win over `color_identity` when both
 *      carry data (e.g. a dual-faced creature whose faces each print a
 *      color, root `colors` absent, root `color_identity` also set from
 *      an activated ability's mana symbols) — the printed face colors are
 *      the card's actual color, `color_identity` is a superset. Locked by
 *      the 'prefers card_faces[].colors over color_identity...' test.
 *   2. When `card_faces` exist but NONE of them carry a usable `colors`
 *      array (a dual-faced LAND like Westvale Abbey — lands print no
 *      color on either face), resolution must fall THROUGH past
 *      `card_faces` to `color_identity` rather than stopping and
 *      reporting `cu` (color-unknown) — `color_identity` genuinely has
 *      the answer there. Locked by the Westvale Abbey test below.
 *
 * AC10, corrected: `hash % totalChunks` alone is not stable under growth —
 * measured 6,294 of 6,647 entries (94.7%) change chunk when totalChunks
 * goes from 17 to 18, which is the TASK-208/TASK-238 failure mode (an
 * index that reshuffles itself) wearing a hash instead of an array index.
 * Fixed: the requested chunk count is rounded up to the next power of two
 * before the modulo. Growth that doesn't cross a power-of-two boundary
 * (e.g. 9 -> 16 cards' worth of chunks, both round to 16 buckets) remaps
 * NOTHING. Crossing a boundary (e.g. 16 -> 17, which rounds 16 -> 32)
 * remaps roughly half the index — each old bucket splits into two new
 * ones, and an entry either stays in the low half or moves to the new
 * high half — never the near-total reshuffle measured on the plain-modulo
 * scheme. This is the standard bounded cost of any modulo-based bucket
 * scheme; a full consistent-hashing ring would bound it tighter (~1/N of
 * the index per resize) at the cost of extra bookkeeping this ticket does
 * not need yet.
 *
 * Known cost of this scheme for a small seller: bucket count is sized off
 * the account's own card count (whatever the writer passes as
 * `totalChunks`), not a fixed global constant, so a 100-card seller gets a
 * small power-of-two bucket count (e.g. 128 cards -> nextPowerOfTwo(128
 * chunks worth) is NOT how this is invoked — the writer picks totalChunks
 * from its own chunk-sizing logic, e.g. "one chunk per ~400 cards", so a
 * 100-card seller requests 1 chunk and pays for exactly 1 chunk read, not
 * a fixed large bucket count). The cost this scheme genuinely adds is at
 * the boundary: the FIRST time a seller's card count crosses into needing
 * one more chunk than fits the current power of two, that seller's index
 * gets rebuilt (~50% of their own entries remapped) rather than every
 * seller's index reshuffling together.
 *
 * Known READ cost of rounding up (measured, not just theoretical): a
 * seller sized at 17 chunks by whatever "one chunk per ~400 cards" logic
 * later tandas use actually gets `nextPowerOfTwo(17)` = 32 chunks written
 * — measured on the 6,647-card production profile: 32 chunks of ~208
 * entries each, instead of 17 of ~391 each. A query that has to read every
 * chunk (e.g. "give me every card of color X" before any chunk-level
 * color filtering exists) pays for up to roughly DOUBLE the chunk reads
 * in the worst case (the gap between N and the next power of two is
 * largest just after a seller crosses a boundary, shrinking back toward
 * zero as they approach the next one). This is the accepted trade for
 * AC10 stability — the alternative (exact `totalChunks`, no rounding) is
 * the 94.7%-remap-on-every-resize scheme this fix replaces — but it must
 * be sized into any per-query chunk-read budget in later tandas, not
 * discovered there.
 *
 * `totalChunks` CONTRACT (binding on later tandas, not enforced by this
 * module — reviewer measured module-N is NOT consistent hashing: 8->9
 * moves 89.0%, 8->16 moves 49.4%, matching the 17->18 = 94.7% measured
 * independently above): the chunk count a writer passes as `totalChunks`
 * MUST be persisted in the index's own metadata document and MUST change
 * ONLY via a full atomic rebuild of every chunk under the new count —
 * never derived on the fly from the account's current card count at
 * write time. Deriving it on the fly means an incremental single-card
 * writer using the OLD `totalChunks` and a background rebuild using a
 * NEW `totalChunks` would compute different chunk assignments for the
 * same card and step on each other — that is "the index loses entries"
 * with a new cause, the same TASK-208/TASK-238 family this module exists
 * to close. A rebuild must recompute EVERY entry's chunk under the new
 * `totalChunks` and write all chunks atomically (or with a version marker
 * a reader can detect mid-rebuild) before the new count is considered
 * live.
 */

/**
 * Compact index-entry shape, same short-key convention as cardIndexEntry's
 * toIndexCard (measured ~230B/entry here vs ~832B copying raw fields).
 *
 * @param {object} publicCardDoc a users/{uid}/public_cards/{id} document
 * @param {object|null|undefined} scryfallCacheDoc the matching
 *   scryfall_cache document, or null/undefined when there is no cache
 *   entry at all for this scryfallId (measured: 17 of 5,162 at TASK-247
 *   tanda 1 baseline)
 */
function buildPublicEntry(publicCardDoc, scryfallCacheDoc) {
  const data = publicCardDoc || {};
  const cache = scryfallCacheDoc || null;

  // Compact legalities: only store format names where the card is legal —
  // same criterion as cardIndexEntry's toIndexCard.
  let lg = [];
  if (cache && cache.legalities && typeof cache.legalities === 'object') {
    lg = Object.entries(cache.legalities)
      .filter(([, v]) => v === 'legal')
      .map(([k]) => k);
  }

  const rarity = cache && cache.rarity ? cache.rarity.charAt(0) : '';

  // HIGH-1: public_cards documents carry cardName/cardNameLower, not
  // `name` — `name` belongs to cardIndexEntry.js's per-user documents.
  const name = data.cardName || '';
  const nameLower = data.cardNameLower || name.toLowerCase();

  const colors = resolveColors(cache);

  return {
    s: data.scryfallId || '',
    i: data.cardId || '',
    n: name,
    nl: nameLower,
    // LOW (review): `|| 1` was silently turning a stored quantity of 0
    // into 1 — a corrupted/zeroed doc would show as having stock. `??`
    // only substitutes the default when quantity is null/undefined.
    q: data.quantity ?? 1,
    p: data.price || 0,
    st: data.status || 'collection',
    f: !!data.foil,
    cn: data.condition || 'NM',
    sc: data.setCode || '',
    // AC9 addendum (review): the human-readable set name — UserProfileView
    // relies on useCardFilter's local substring search matching name OR
    // edition (see useCardFilter.ts's filteredCards), so search parity
    // with today's behavior needs this alongside `sc`/setCode, which is
    // the machine set CODE and not interchangeable with it.
    ed: data.edition || '',
    t: resolveTypeLine(cache),
    cm: (cache && cache.cmc) ?? 0,
    co: colors || [],
    // AC9 addendum (review): land color categorization in useCardFilter
    // (getCardColorCategory/passesColorFilter) reads produced_mana, not
    // colors, for lands — without it every land in the index would fall
    // back to the generic "Lands" bucket instead of its actual color(s).
    pm: (cache && cache.produced_mana) || [],
    r: rarity,
    kw: (cache && cache.keywords) || [],
    // TASK-247 tanda 3: the three fields useCardFilter's advanced filters
    // read that were NOT in this entry — advPowerMin/Max, advToughnessMin/Max
    // and advFullArtOnly. Without them, moving the public profile onto this
    // index would satisfy AC2/AC3 and REGRESS those three filters in the
    // same change. `keywords` (`kw`, above) was the fourth field of that
    // group and was already here since tanda 1.
    //
    // oracle_text is deliberately NOT added: its only consumer is
    // passesKeywords, which already matches `keywords` and `type_line` too —
    // both in this entry — and it is hundreds of bytes of free text per
    // card against a byte budget sized for slow 4G. Deferred to TASK-248.
    pw: resolveStat(cache, 'power'),
    to: resolveStat(cache, 'toughness'),
    fa: !!(cache && cache.full_art),
    lg,
    // AC9 addendum (review): sort-by-date-added (useCardFilter's
    // getCardTimestamp) needs a timestamp. public_cards documents do NOT
    // carry `createdAt` (measured — only `updatedAt` is written, see
    // src/services/publicCards.ts); `updatedAt` is the best available
    // proxy and is used here as `ca`, epoch milliseconds. Known
    // limitation, not fixable in this module: `updatedAt` moves on any
    // edit, not only on the card being added, so "sort by date added"
    // over this index is actually "sort by date last touched" until (if
    // ever) a real createdAt is added upstream to public_cards.
    ca: resolveTimestamp(data.updatedAt),
    // No cache doc at all for this scryfallId — the query layer and
    // reconciliation can find these rather than being handed an entry
    // that looks like every field was genuinely empty.
    ...(cache ? {} : { x: 1 }),
    // HIGH-2/AC9: color resolution came up with nothing (no `colors`, no
    // `card_faces[].colors`, no `color_identity` anywhere it looked) —
    // distinct from a genuinely colorless card, which resolves to `co: []`
    // WITHOUT this flag. Independent of `x`: a cache doc can exist and
    // still carry no usable color source.
    ...(colors === null ? { cu: 1 } : {}),
  };
}

/**
 * AC9 color fallback chain: colors (even empty — that's "incolora", a real
 * answer) -> union of card_faces[].colors -> color_identity, only as a
 * last resort when neither of the above exists at all. Returns `null`
 * (never `[]`) when no source could be found, so buildPublicEntry can tell
 * "no data" apart from "colorless" and set the `cu` flag.
 *
 * @param {object|null} cache scryfall_cache document fields
 * @returns {string[]|null}
 */
function resolveColors(cache) {
  if (!cache) return null;
  // `colors` wins outright as soon as it's present, even as `[]` — an
  // empty array here is the card telling us it's colorless, not the card
  // telling us nothing. Falling through to color_identity in this case
  // was the HIGH-2 bug (49 incolora cards counted as colored).
  if (Array.isArray(cache.colors)) return cache.colors;
  if (Array.isArray(cache.card_faces)) {
    const facesWithColors = cache.card_faces.filter((face) => Array.isArray(face.colors));
    if (facesWithColors.length > 0) {
      const union = [];
      for (const face of facesWithColors) {
        for (const color of face.colors) {
          if (!union.includes(color)) union.push(color);
        }
      }
      return union;
    }
  }
  if (Array.isArray(cache.color_identity)) return cache.color_identity;
  return null;
}

/**
 * AC9-style fallback for a printed stat (`power` / `toughness`): root value
 * -> the card_faces values joined the way Scryfall itself displays a
 * dual-faced card ("1 // 3"). A transforming creature carries no root
 * power/toughness at all — both live on the faces — so without the fallback
 * every dual-faced creature would look statless to a power/toughness range
 * filter.
 *
 * Joined rather than front-face-only so neither face's stats are silently
 * dropped; the query layer splits on `//` and matches a range against EITHER
 * face (functions/lib/publicCardIndexQuery.js's matchesStatRange). Values
 * stay STRINGS and are never coerced — Scryfall really does print `*` and
 * `1+*`, and turning those into 0 would put Tarmogoyf in the "power 0"
 * bucket instead of out of every numeric range, which is what
 * useCardFilter's own NaN handling already does.
 *
 * @param {object|null} cache scryfall_cache document fields
 * @param {'power'|'toughness'} field
 * @returns {string}
 */
function resolveStat(cache, field) {
  if (!cache) return '';
  // eslint-disable-next-line security/detect-object-injection
  const root = cache[field];
  if (root !== undefined && root !== null && root !== '') return String(root);
  if (Array.isArray(cache.card_faces)) {
    const parts = cache.card_faces
      // eslint-disable-next-line security/detect-object-injection
      .map((f) => (f && f[field] !== undefined && f[field] !== null ? String(f[field]) : ''))
      .filter((v) => v !== '');
    if (parts.length > 0) return parts.join(' // ');
  }
  return '';
}

/**
 * AC9 type_line fallback chain: root type_line -> card_faces[].type_line
 * joined the way Scryfall itself displays split/dual-faced cards ("Front //
 * Back"). Unlike resolveColors, an empty string here is safe to treat as
 * "missing" — Scryfall never sends a real card with `type_line: ""`.
 *
 * @param {object|null} cache scryfall_cache document fields
 */
function resolveTypeLine(cache) {
  if (!cache) return '';
  if (cache.type_line) return cache.type_line;
  if (Array.isArray(cache.card_faces)) {
    const parts = cache.card_faces.map((f) => f.type_line).filter(Boolean);
    if (parts.length > 0) return parts.join(' // ');
  }
  return '';
}

/**
 * Normalizes a Firestore Timestamp (or Date, or ISO string) into epoch
 * milliseconds, without importing firebase-admin (this module stays
 * dependency-free — TASK-236). Firestore Timestamps expose `.toMillis()`;
 * this also accepts a plain `.toDate()`-bearing object, a `Date`, or an
 * ISO string, and returns 0 (never throws) for anything else — the
 * `Number.isNaN` guard on the ISO-string branch matters: `Date.parse` on
 * garbage input returns `NaN`, and without the guard `ca` itself would be
 * `NaN` (not merely 0), which is worse to sort/serialize on.
 *
 * Informational (reviewer, not a bug in the real pipeline — every
 * public_cards write goes through `Timestamp.now()`, verified at 7 call
 * sites in src/services/publicCards.ts): a plain `{_seconds,
 * _nanoseconds}` object (the JSON-serialized shape of a Firestore
 * Timestamp, e.g. from an exported dump) or a raw epoch-ms NUMBER are
 * both NOT handled by any branch above and fall through to `Date.parse`,
 * which returns `NaN` on either — so both resolve to 0, not the real
 * date. Irrelevant to the live Firestore pipeline; would only bite a
 * future script reading a JSON export instead of live documents.
 *
 * @param {*} value
 * @returns {number}
 */
function resolveTimestamp(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * FNV-1a 32-bit hash, hand-rolled to keep this module dependency-free.
 *
 * @param {string} str
 */
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Rounds a requested bucket count up to the nearest power of two (minimum
 * 1). AC10: restricting the actual bucket space to powers of two is what
 * makes chunk assignment stable under growth — each time capacity doubles,
 * every existing bucket splits cleanly into two, so only entries that land
 * in the new "upper half" of their old bucket move at all.
 *
 * MEDIUM (review): garbage `n` (0, NaN, undefined, a negative number) used
 * to be silently coerced — `Math.max(1, Math.ceil(NaN))` is `NaN`, which
 * fails every `p < min1` comparison and returns bucket count 1;
 * `Math.max(1, Math.ceil(0))` returns 1 outright. Either way EVERY card
 * collapses into chunk 0 while a reader expecting the real chunk count
 * looks elsewhere for them — silently, this is exactly the "index loses
 * entries" failure this module exists to close (TASK-208/TASK-238), just
 * arrived at through a bad `totalChunks` instead of a bad hash. The
 * `totalChunks` CONTRACT above says this value must come from persisted
 * index metadata — a failed read of that metadata is a real, expected
 * failure mode a caller WILL hit, so this throws instead of coercing:
 * a loud error a writer must handle is safer than a silent bad write.
 *
 * @param {number} n requested chunk count (>= 1)
 */
function nextPowerOfTwo(n) {
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`nextPowerOfTwo: totalChunks must be a finite number >= 1, got ${n}`);
  }
  let p = 1;
  while (p < Math.ceil(n)) p *= 2;
  return p;
}

/**
 * AC10: which chunk a card's index entry belongs to, derived from a hash
 * of its own scryfallId — never from its position in whatever list happens
 * to be iterated when the index is (re)built — rounded to the next
 * power-of-two bucket space so that growing the index doesn't reshuffle
 * cards that were already correctly placed. This is the line that keeps
 * this new index from inheriting the card_index family of bugs
 * (TASK-208/TASK-238): a card's chunk assignment cannot change just
 * because something else in the account was added, removed, or reordered,
 * and it changes as LITTLE as possible even when the account's own growth
 * requires a bigger bucket space.
 *
 * `totalChunks` is the caller's requested minimum chunk count (e.g. from
 * "one chunk per ~400 cards" sizing logic in a later tanda) — the actual
 * bucket space used is `nextPowerOfTwo(totalChunks)`, which THROWS (does
 * not coerce) on a non-finite or sub-1 `totalChunks` — see nextPowerOfTwo.
 *
 * @param {string} scryfallId
 * @param {number} totalChunks must be a finite number >= 1 — throws otherwise
 */
function publicChunkId(scryfallId, totalChunks) {
  const bucketCount = nextPowerOfTwo(totalChunks);
  return fnv1a(String(scryfallId)) % bucketCount;
}

module.exports = {
  buildPublicEntry,
  resolveColors,
  resolveTypeLine,
  resolveStat,
  resolveTimestamp,
  publicChunkId,
  nextPowerOfTwo,
};
