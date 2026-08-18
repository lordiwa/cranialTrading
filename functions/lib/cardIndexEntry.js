/**
 * cardIndexEntry — how a card_index entry is built from a user card
 * document plus its scryfall_cache document.
 *
 * Extracted as its own dependency-free CommonJS module (TASK-245) for two
 * reasons:
 *
 *  1. It is the "parallel sibling" case CLAUDE.md's Rule 1 is about.
 *     buildCardIndex joined scryfall_cache before calling toIndexCard;
 *     applyCardIndexDelta did not, and passed the raw user document
 *     straight in (functions/index.js:1471/1479). On this project's older
 *     accounts the user document never carried type_line/cmc/colors/rarity
 *     — they only exist in scryfall_cache — so every status change blanked
 *     those fields in the index. Measured in dev 2026-08-18: 6787/6787
 *     touched cards lost type_line; land count in the index 7129 -> 376.
 *     With the merge living HERE, there is exactly one definition of what
 *     an index entry contains, and both callers use it.
 *
 *  2. It can be require()'d and EXECUTED by vitest without firebase-admin
 *     (index.js calls admin.initializeApp() at require time, and
 *     functions/ has no emulator harness — TASK-236). Same technique as
 *     lib/concurrency.js: tests/unit/functions/cardIndexEntry.test.ts is a
 *     real sensor, not a source-text assertion.
 */

/**
 * Compact index-entry shape. Short keys to minimize doc size (~170 bytes
 * per card). Moved verbatim from functions/index.js (TASK-245) — behavior
 * unchanged, only its home.
 *
 * @param {string} id card document id
 * @param {object} data card fields (merge with the cache FIRST — see
 *   mergeScryfallMetadata; passing a raw user doc is the TASK-245 defect)
 */
function toIndexCard(id, data) {
  // Compact legalities: only store format names where card is legal
  let lg = [];
  if (data.legalities && typeof data.legalities === 'object') {
    lg = Object.entries(data.legalities)
      .filter(([, v]) => v === 'legal')
      .map(([k]) => k);
  }

  // Compact rarity: first char
  const rarity = data.rarity ? data.rarity.charAt(0) : '';

  // Compact createdAt: timestamp in ms
  let ca = 0;
  if (data.createdAt) {
    if (typeof data.createdAt.toMillis === 'function') {
      ca = data.createdAt.toMillis();
    } else if (data.createdAt._seconds) {
      ca = data.createdAt._seconds * 1000;
    }
  }

  return {
    i: id,
    s: data.scryfallId || '',
    n: data.name || '',
    st: data.status || 'collection',
    q: data.quantity || 1,
    p: data.price || 0,
    cm: data.cmc ?? 0,
    co: data.colors || [],
    r: rarity,
    t: data.type_line || '',
    f: !!data.foil,
    sc: data.setCode || '',
    e: data.edition || '',
    pw: data.power || '',
    to: data.toughness || '',
    fa: !!data.full_art,
    pm: data.produced_mana || [],
    kw: data.keywords || [],
    lg,
    ca,
    cn: data.condition || 'NM',
    pb: data.public !== false,
    df: (() => {
      try { return !!(JSON.parse(data.image || '').card_faces?.length > 1); }
      catch { return false; }
    })(),
  };
}

/**
 * Merge a scryfall_cache document's metadata into a user card document.
 * The user document always wins where it actually carries a value; the
 * cache fills in what it doesn't. `cmc` uses ?? (not ||) so a legitimate
 * cmc of 0 on the user doc is not replaced by the cache.
 *
 * Returns `data` untouched when there is no cache entry.
 *
 * @param {object} data user card document fields
 * @param {object|null|undefined} cache scryfall_cache document fields
 */
function mergeScryfallMetadata(data, cache) {
  if (!cache) return data;
  return {
    ...data,
    cmc: data.cmc ?? cache.cmc,
    type_line: data.type_line || cache.type_line,
    colors: (data.colors && data.colors.length > 0) ? data.colors : cache.colors,
    rarity: data.rarity || cache.rarity,
    power: data.power || cache.power,
    toughness: data.toughness || cache.toughness,
    full_art: data.full_art ?? cache.full_art,
    produced_mana: (data.produced_mana && data.produced_mana.length > 0) ? data.produced_mana : cache.produced_mana,
    keywords: (data.keywords && data.keywords.length > 0) ? data.keywords : cache.keywords,
    legalities: data.legalities || cache.legalities,
  };
}

/**
 * Dual-faced detection from a scryfall_cache document — 2+ faces that
 * actually carry images (a card with card_faces where only one face has
 * image_uris is NOT dual-faced for display purposes). Previously inline in
 * buildCardIndex.
 *
 * @param {object|null|undefined} cache scryfall_cache document fields
 */
function isDualFaced(cache) {
  if (!cache || !Array.isArray(cache.card_faces) || cache.card_faces.length < 2) return false;
  return cache.card_faces.filter((f) => f.image_uris).length > 1;
}

module.exports = { toIndexCard, mergeScryfallMetadata, isDualFaced };
