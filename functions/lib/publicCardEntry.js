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
 * AC9 — measured over the 5,145 cached public cards: 380 (7.4%) have
 * neither `colors` nor `color_identity` at the document root; 115 of those
 * are dual-faced cards whose colors live only in `card_faces[].colors`; 1
 * has no `type_line`. Fallback chains below close that gap explicitly.
 * Additionally, 17 of 5,162 public_cards scryfallId have NO scryfall_cache
 * document at all (99.67% coverage) — see buildPublicEntry's cache=null
 * handling and the `x` flag.
 *
 * AC10 — publicChunkId must derive a card's chunk from its identity
 * (scryfallId hash), never from its position in an array. Position-based
 * chunking is the shared root of the TASK-208/TASK-238 family: chunks that
 * lose entries on reorder, and an index that empties itself and doesn't
 * repair on its own.
 */

/**
 * Compact index-entry shape, same short-key convention as cardIndexEntry's
 * toIndexCard (measured ~230B/entry here vs ~832B copying raw fields).
 *
 * @param {object} publicCardDoc a users/{uid}/public_cards/{id} document
 * @param {object|null|undefined} scryfallCacheDoc the matching
 *   scryfall_cache document, or null/undefined for the 17 measured
 *   scryfallId with no cache entry
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

  return {
    s: data.scryfallId || '',
    i: data.cardId || '',
    n: data.name || '',
    nl: (data.name || '').toLowerCase(),
    q: data.quantity || 1,
    p: data.price || 0,
    st: data.status || 'collection',
    f: !!data.foil,
    cn: data.condition || 'NM',
    sc: data.setCode || '',
    t: resolveTypeLine(cache),
    cm: (cache && cache.cmc) ?? 0,
    co: resolveColors(cache),
    r: rarity,
    kw: (cache && cache.keywords) || [],
    lg,
    // AC9: explicit flag for the 17 measured scryfallId with no cache doc
    // at all, so the query layer can decide what to do with them and
    // reconciliation can find them — rather than silently shipping a
    // half-empty entry that looks the same as a colorless card.
    ...(cache ? {} : { x: 1 }),
  };
}

/**
 * AC9 color fallback chain: colors -> color_identity -> union of
 * card_faces[].colors. Explicit, not a chained `||` (a chained `||` would
 * silently accept an empty-array `colors` as "present" in some engines and
 * is unreadable once a third source is added).
 *
 * @param {object|null} cache scryfall_cache document fields
 */
function resolveColors(cache) {
  if (!cache) return [];
  if (Array.isArray(cache.colors) && cache.colors.length > 0) {
    return cache.colors;
  }
  if (Array.isArray(cache.color_identity) && cache.color_identity.length > 0) {
    return cache.color_identity;
  }
  if (Array.isArray(cache.card_faces)) {
    const union = [];
    for (const face of cache.card_faces) {
      if (!Array.isArray(face.colors)) continue;
      for (const color of face.colors) {
        if (!union.includes(color)) union.push(color);
      }
    }
    return union;
  }
  return [];
}

/**
 * AC9 type_line fallback chain: root type_line -> card_faces[].type_line
 * joined the way Scryfall itself displays split/dual-faced cards ("Front //
 * Back").
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
 * AC10: which chunk a card's index entry belongs to, derived ONLY from a
 * hash of its own scryfallId — never from its position in whatever list
 * happens to be iterated when the index is (re)built. This is the line
 * that keeps this new index from inheriting the card_index family of bugs
 * (TASK-208/TASK-238): a card's chunk assignment cannot change just because
 * something else in the account was added, removed, or reordered.
 *
 * @param {string} scryfallId
 * @param {number} totalChunks must be >= 1
 */
function publicChunkId(scryfallId, totalChunks) {
  return fnv1a(String(scryfallId)) % totalChunks;
}

module.exports = { buildPublicEntry, resolveColors, resolveTypeLine, publicChunkId };
