/**
 * publicCardIndexQuery — the READ side of the public-profile card index
 * (TASK-247 tanda 3/5). This is the tanda that actually closes the ticket:
 * tandas 1/2a/2b/2c built, chunked, reconciled and triggered the index;
 * nothing ever read it. The public profile still filters and searches over
 * whatever ~60 documents `getUserPublicCardsPage` happens to have paginated
 * into memory, which is why Rafael's profile reports 36 black cards where
 * 1,412 public_cards documents are black.
 *
 * Same dependency-free CommonJS technique as publicCardEntry.js /
 * publicCardIndex.js, and the same injected-`db` shape as
 * publicCardIndexReconciler.js: everything here is either a pure function or
 * takes `db` as a plain argument, so vitest can execute the real read
 * orchestration end-to-end against a hand-rolled fake Firestore without
 * firebase-admin and without an emulator (functions/ has none — TASK-236).
 * functions/index.js's `queryPublicCardIndex` is thin wiring over this.
 *
 * ── WHY THIS IS A CLOUD FUNCTION AND NOT A CLIENT QUERY ──
 *
 * `firestore.rules` has no `match` for `users/{uid}/public_card_index` at
 * all, so it falls into the catch-all `match /{document=**} { allow read,
 * write: if false }` — the browser cannot read a chunk even when signed in.
 * (`match /users/{userId} { allow read: if true }` does NOT cascade: a
 * `match` without `{document=**}` covers only the document itself.) A second,
 * independent reason points the same way: `scryfall_cache` requires
 * `request.auth != null`, and the whole point of this feature is that an
 * ANONYMOUS visitor browsing a public profile gets correct colours and
 * types — which today's client-side `enrichPublicCardsInMemory` cannot give
 * them at all.
 *
 * ── AC6: THE PRIVACY BOUNDARY, AND WHY A CLIENT-SUPPLIED userId IS SAFE
 *        HERE AND NOWHERE ELSE ──
 *
 * This project has seven recorded appearances of the same authz family, two
 * of them in this exact file's neighbours: TASK-214 (`queryCardIndex`
 * accepted a client-supplied userId and read that user's `card_index`, which
 * holds the WHOLE inventory) and TASK-211 (same shape in `buildCardIndex`).
 * `reconcilePublicCardIndex`'s own header says reintroducing an optional
 * targetUserId would be the third occurrence of that family.
 *
 * This function takes a client-supplied userId anyway, and the exception is
 * argued rather than assumed. The structural difference is the COLLECTION,
 * not the caller:
 *
 *   queryCardIndex   reads users/{uid}/card_index        — everything the
 *                    user owns, private cards included.
 *   this function    reads users/{uid}/public_card_index — derived, by
 *                    construction, only from public_cards, whose own rule
 *                    is already `allow read: if true`.
 *
 * So the defence is not vigilance, it is reach: this module contains no path
 * that can name `users/{uid}/cards` or the private index, and a test greps
 * this file's own source text to keep it that way. Whatever uid an attacker
 * supplies, the most they can reach is data Firestore already serves to the
 * world. Nothing here writes, and nothing here branches on `request.auth` —
 * an anonymous visitor and a signed-in one get byte-identical answers,
 * because the visitor browsing a public profile IS the use case.
 *
 * ── PATH INJECTION, WHICH IS A SEPARATE AND REAL HOLE ──
 *
 * The index path is built by string interpolation
 * (`users/${userId}/public_card_index` — that is literally how
 * publicCardIndexReconciler.js:161 builds it too). A userId containing `/`
 * therefore does not merely name a different user, it names a different
 * COLLECTION: `x/public_card_index/../../other` walks out of the subtree
 * entirely. `if (!userId) throw` does not catch that. `assertValidPublicUserId`
 * does, with a whitelist regex, and it runs before any Firestore call —
 * locked by a test asserting zero reads happened on a rejected id.
 *
 * ── COLOUR SEMANTICS: OR-INCLUSIVE BY LETTER (Rafael's decision) ──
 *
 * A card is black if its `co` array CONTAINS 'B'. A B/G card is therefore
 * black AND green, and there is no separate 'Multicolor' bucket. This is
 * what produces AC2's measured 1,412 documents (against 1,049 unique
 * scryfallId and 2,658 copies-by-quantity — neither of which is the target),
 * and it is why the five colour totals sum to 7,003 over a 6,647-document
 * profile: the overshoot is the semantics working.
 *
 * The researcher's contract recommended implementing BOTH this and
 * `useCardFilter`'s category semantics ('Multicolor' as its own bucket,
 * lands routed to 'Lands' via `produced_mana`) and letting the vocabulary of
 * `filters.color` pick between them. That recommendation is NOT implemented
 * here, deliberately: Rafael settled it as a product decision — OR-inclusive
 * by letter, no Multicolor category — and carrying a second, contradictory
 * colour semantics in the query layer would mean the same chip could return
 * two different numbers depending on which vocabulary the caller happened to
 * send. Migrating the chips to this vocabulary is tanda 4. `pm`
 * (produced_mana) stays in the index entry regardless; it is simply not read
 * by this filter.
 *
 * ── x / cu: THE DECISION IS publicCardEntry.js's, HONORED NOT REINVENTED ──
 *
 * That module's header already ruled: a flagged entry is EXCLUDED from any
 * colour-filtered result (it must never silently count as "colorless" just
 * because `co` is `[]`) but stays INCLUDED in an unfiltered listing and in
 * search. Measured scope: 474 of 6,647 (7.1%) have no usable colour source,
 * 17 scryfallId have no `scryfall_cache` document at all. `indexState.missing`
 * reports the count so the UI can say "474 cards with no colour data" instead
 * of letting them vanish.
 *
 * The trap next door, worth naming: `filterIndexCards` in functions/index.js
 * (the PRIVATE index's filter) does `if (c.co.length === 0) return false`.
 * Copying that line here would make every genuinely COLOURLESS card
 * invisible — `co: []` with no flag is a real answer, not missing data. This
 * module distinguishes the two.
 *
 * ── SUBSTRING SEARCH, AND WHY IT COSTS WHAT IT COSTS ──
 *
 * Firestore has no substring operator — only prefix (`>= term`, `<= term +
 * ''`), which is what `searchUserPublicCards` does today and why
 * 'blight' returns 9 documents instead of 14 (it cannot reach
 * `Marauding Blight-Priest`, `Hooded Blightfang`, `Lithoform Blight`…). The
 * three real options are in-memory filtering, an n-gram inverted index, or an
 * external search service; the latter two are their own tickets. So this
 * filters in memory, exactly as `queryCardIndex` already does for the private
 * index — which is what forces reading every chunk, and therefore the 2 GiB
 * memory setting on the callable (`queryCardIndex` died of OOM at 512 MiB
 * doing the same thing over a 59k-card account; being born at 512 MiB here
 * would repeat that incident on purpose).
 *
 * Search matches `nl` OR lowercased `ed` — name or edition — because that is
 * what `useCardFilter`'s local filter does today, and matching only the name
 * would be a regression dressed as a fix. The `//` in a split card's name is
 * never tokenized away: `nl` is matched as a raw string, which is what makes
 * 'blightsower' (the BACK face of
 * 'Blightreaper Thallid // Blightsower Thallid') findable at all.
 *
 * ── AC5: THE 50-RESULT CAP IS GONE, NOT RAISED ──
 *
 * `searchUserPublicCards`'s comment claims 50 name-prefix matches "covers the
 * realistic case". Under substring it is measurably false — 'island',
 * 'goblin', 'elf', or any tribal term passes 50 easily in a 6,647-card
 * profile. More to the point, a cap makes `total` lie, and `total` lying IS
 * TASK-247. So `total` is always computed over the whole collection and only
 * DELIVERY is paginated: `pageSize` defaults to 60 (matching
 * usePublicProfileCards's DEFAULT_PAGE_SIZE, so the scroll doesn't change)
 * and clamps to [1, 120] — 120 rows x ~231 B is 27.7 KB, ~370 ms at the
 * 600 Kbps this project budgets against; 200 rows would cross into
 * noticeable.
 *
 * ── BYTES: THE 13-FIELD ROW, NOT THE 22-FIELD ENTRY ──
 *
 * A full index entry is ~406 B; the subset the grid actually renders is
 * ~231 B. Shipping 1,412 full entries would be 573 KB = ~7.6 s at 600 Kbps,
 * 3.5x this project's ENTIRE 160 KB boot budget, in one call. So the wire
 * row is 13 fields and three things deliberately do not travel:
 *   1. `image` — derived client-side from `s` via cardImageProxyUrl
 *      (TASK-241), saving ~90 B per row.
 *   2. seller identity — `username`/`avatarUrl`/`location` are per-profile
 *      constants; repeating them 60 times is pure waste. (And `email` never
 *      travels at all: `contact_info` requires auth.)
 *   3. `nl`, `cm`, `pm`, `kw`, `lg`, `ca`, `pw`, `to`, `fa`, `x`, `cu` —
 *      these exist to FILTER, not to display, and stay on the server.
 *
 * ── MITIGATION A: DETECTING A REBUILD IN FLIGHT ──
 *
 * publicCardIndexExecutor.js's header documents, verbatim, that the "never
 * fewer cards visible" guarantee is FALSE while an index GROWS: going from
 * totalChunks 16 to 32, step 1 overwrites old chunks 0..15 with new-scheme
 * content holding roughly half what they used to, while `_meta` — live
 * throughout step 1 — still advertises 16. A reader trusting `_meta` sees
 * roughly HALF the seller's cards, and a crash mid-step-1 pins that state
 * until the next reconciliation, which nothing schedules automatically.
 * That is this very ticket's bug with a new cause.
 *
 * Mitigation A (implemented, cheap, no coordination): every chunk document
 * carries `tc`, the totalChunks it was WRITTEN under (added to
 * `buildPublicIndex` in this tanda — ~20 bytes on 32 documents). If any live
 * chunk's `tc` disagrees with `_meta.totalChunks`, the two are from
 * different generations; re-read `_meta` once (the flip may simply have
 * landed between the two reads) and, if it still disagrees, answer with
 * `indexState.partial = true` and `total: null`. Refusing to name a total is
 * the point: a `total` that says 1,412 when the truth might be 700 is
 * exactly the failure this ticket exists to end. Chunks with no `tc` at all
 * (an index written before this tanda) are not flagged — absence is not
 * disagreement.
 *
 * Mitigation B (double-buffering by generation, so the window never exists)
 * is a change to the WRITE layer, out of this tanda's scope, and A stays
 * useful even after B ships.
 *
 * Two smaller traps, both handled: `_meta` lives INSIDE the same collection
 * as the chunks, so a naive `collection().get()` hands it back mixed in with
 * them and `expandIndexCards` would iterate a document that has no `entries`
 * array — it is filtered by id. And chunk documents OUTSIDE the range
 * `_meta` advertises are ignored: after a shrink they still hold copies of
 * live cards until step 3 deletes them, and counting them would double
 * those cards.
 */

/**
 * Firebase uids are alphanumerics plus `-` and `_`. Anything else — above
 * all `/`, `.` and `..` — is rejected before the path is interpolated. See
 * the PATH INJECTION section of the header: this is not defence in depth,
 * it is the only thing standing between a client string and an arbitrary
 * Firestore collection path.
 */
const PUBLIC_USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** The document id `_meta` occupies inside the chunk collection. */
const META_DOC_ID = '_meta';

/** Matches usePublicProfileCards's DEFAULT_PAGE_SIZE — changing it changes the UI's scroll. */
const DEFAULT_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 120;

/** Parity with usePublicProfileCards's MIN_SEARCH_LEN. */
const MIN_SEARCH_LEN = 2;

/** `_meta.reconcileLeaseAt` is considered live for this long — RECONCILE_LEASE_STALE_MS. */
const RECONCILE_LEASE_STALE_MS = 10 * 60 * 1000;

/** The 13 fields that actually travel to the browser (~231 B/row measured). */
const PUBLIC_INDEX_CARD_FIELDS = [
  's',
  'i',
  'n',
  'q',
  'p',
  'st',
  'f',
  'cn',
  'sc',
  'ed',
  'co',
  'r',
  't',
];

const COLOR_LETTERS = ['W', 'U', 'B', 'R', 'G'];
/** The pseudo-letter for "genuinely colourless", distinct from "colour unknown". */
const COLORLESS_LETTER = 'C';

const RARITY_INITIAL = { common: 'c', uncommon: 'u', rare: 'r', mythic: 'm' };

const VALID_SORT_FIELDS = ['name', 'price', 'edition', 'quantity', 'dateAdded'];
const VALID_MODES = ['cards', 'facets'];

/** Top-level MTG card types, for the `type` facet counts. */
const TYPE_FACETS = [
  'creature',
  'instant',
  'sorcery',
  'artifact',
  'enchantment',
  'planeswalker',
  'land',
  'battle',
];

/**
 * An argument error the callable wrapper can map onto
 * `HttpsError('invalid-argument')` without this module importing
 * firebase-functions (which would drag firebase-admin in and make the module
 * untestable — the whole reason it is separate from functions/index.js).
 */
function invalidArgument(message) {
  const error = new Error(message);
  error.invalidArgument = true;
  return error;
}

/**
 * Rejects any userId that could change which Firestore collection the path
 * names. Throws — never coerces, never falls back to a default — because a
 * caller that got here with a bad id has no correct answer to be given.
 *
 * @param {*} userId
 */
function assertValidPublicUserId(userId) {
  if (typeof userId !== 'string' || !PUBLIC_USER_ID_PATTERN.test(userId)) {
    throw invalidArgument(
      'userId must be a string of 1-128 characters matching /^[A-Za-z0-9_-]+$/'
    );
  }
  return userId;
}

/**
 * Projects a full index entry down to the 13 fields the grid renders. See
 * the BYTES section of the header for what is left behind and why.
 *
 * @param {object} entry
 */
function toPublicIndexCard(entry) {
  const row = {};
  for (const field of PUBLIC_INDEX_CARD_FIELDS) {
    // eslint-disable-next-line security/detect-object-injection
    row[field] = entry[field];
  }
  return row;
}

/** A colour filter is "active" only when it actually names something. */
function hasColorFilter(filters) {
  return Array.isArray(filters.color) && filters.color.length > 0;
}

/**
 * publicCardEntry.js's AC9 decision: an entry whose colour could not be
 * resolved is excluded from a colour-filtered result, never counted as
 * colourless.
 */
function isColorUnknown(entry) {
  return entry.x === 1 || entry.cu === 1;
}

/**
 * OR-inclusive colour match by letter. `C` means "genuinely colourless"
 * (`co: []` with no unknown flag) — NOT "no colour data", which the caller
 * has already excluded via isColorUnknown.
 */
function matchesColor(entry, letters) {
  const colors = Array.isArray(entry.co) ? entry.co : [];
  if (colors.length === 0) return letters.has(COLORLESS_LETTER);
  return colors.some((c) => letters.has(String(c).toUpperCase()));
}

/**
 * Substring match over name OR edition — the parity `useCardFilter`'s local
 * filter has today and the prefix query lost. The raw `nl` string is matched
 * as-is, so a split card's `//` and its back face stay searchable.
 */
function matchesSearch(entry, term) {
  const name = entry.nl || String(entry.n || '').toLowerCase();
  if (name.includes(term)) return true;
  return String(entry.ed || '').toLowerCase().includes(term);
}

/**
 * A stat like `power` is a STRING on Scryfall ('*', '1+*', '2'), and for a
 * dual-faced card this index stores both faces joined as "1 // 3" (aligned
 * with how `t` joins type lines). A range matches when ANY face falls inside
 * it; a non-numeric value never satisfies a bound, exactly as
 * `useCardFilter`'s passesStatRange treats NaN.
 */
function matchesStatRange(value, min, max) {
  if (min === undefined && max === undefined) return true;
  const parts = String(value === undefined || value === null ? '' : value).split('//');
  return parts.some((part) => {
    const parsed = Number.parseFloat(part.trim());
    if (Number.isNaN(parsed)) return false;
    if (min !== undefined && parsed < min) return false;
    if (max !== undefined && parsed > max) return false;
    return true;
  });
}

/**
 * Every filter is ANDed; array-valued filters are ORed within themselves,
 * except `keywords` and `formats`, which are ANDed within themselves because
 * that is what `useCardFilter`'s passesKeywords/passesFormats do (`.every`).
 *
 * `skip` lets the facet counter re-run the whole filter set minus one
 * dimension, so a chip can still report how many results it WOULD give.
 *
 * @param {Array<object>} entries
 * @param {object} filters
 * @param {{skip?: string}} [options]
 */
function filterPublicIndexEntries(entries, filters, options = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const f = filters || {};
  const skip = options.skip;
  let result = list;

  const term = typeof f.search === 'string' ? f.search.trim().toLowerCase() : '';
  if (skip !== 'search' && term.length >= MIN_SEARCH_LEN) {
    result = result.filter((e) => matchesSearch(e, term));
  }

  if (skip !== 'status' && Array.isArray(f.status) && f.status.length > 0) {
    const statuses = new Set(f.status.map((s) => String(s).toLowerCase()));
    result = result.filter((e) => statuses.has(String(e.st || '').toLowerCase()));
  }

  if (skip !== 'color' && hasColorFilter(f)) {
    const letters = new Set(f.color.map((c) => String(c).toUpperCase()));
    // AC9, publicCardEntry.js's decision: unknown-colour entries are dropped
    // by a colour filter rather than silently counted as colourless.
    result = result.filter((e) => !isColorUnknown(e) && matchesColor(e, letters));
  }

  if (skip !== 'rarity' && Array.isArray(f.rarity) && f.rarity.length > 0) {
    const initials = new Set(
      f.rarity.map((r) => {
        const key = String(r).toLowerCase();
        // eslint-disable-next-line security/detect-object-injection
        return RARITY_INITIAL[key] || key.charAt(0);
      })
    );
    result = result.filter((e) => initials.has(String(e.r || '').toLowerCase()));
  }

  if (skip !== 'type' && Array.isArray(f.type) && f.type.length > 0) {
    const terms = f.type.map((t) => String(t).toLowerCase());
    result = result.filter((e) => {
      const line = String(e.t || '').toLowerCase();
      return terms.some((t) => line.includes(t));
    });
  }

  if (skip !== 'manaValue' && Array.isArray(f.manaValue) && f.manaValue.length > 0) {
    const exact = new Set();
    let tenPlus = false;
    for (const v of f.manaValue) {
      if (v === '10+') tenPlus = true;
      else exact.add(Number(v));
    }
    result = result.filter((e) => {
      const cm = Number(e.cm) || 0;
      return exact.has(cm) || (tenPlus && cm >= 10);
    });
  }

  if (skip !== 'edition' && Array.isArray(f.edition) && f.edition.length > 0) {
    const codes = new Set(f.edition.map((s) => String(s).toUpperCase()));
    result = result.filter((e) => codes.has(String(e.sc || '').toUpperCase()));
  }

  if (skip !== 'keywords' && Array.isArray(f.keywords) && f.keywords.length > 0) {
    const wanted = f.keywords.map((k) => String(k).toLowerCase());
    result = result.filter((e) => {
      const own = (Array.isArray(e.kw) ? e.kw : []).map((k) => String(k).toLowerCase());
      const line = String(e.t || '').toLowerCase();
      // Two of useCardFilter's three sources. The third, oracle_text, is out
      // of the index on purpose — hundreds of bytes of free text per card
      // against a 4G-slow byte budget. Deferred to TASK-248.
      return wanted.every((k) => own.includes(k) || line.includes(k));
    });
  }

  if (skip !== 'formats' && Array.isArray(f.formats) && f.formats.length > 0) {
    const wanted = f.formats.map((s) => String(s).toLowerCase());
    result = result.filter((e) => {
      const legal = (Array.isArray(e.lg) ? e.lg : []).map((s) => String(s).toLowerCase());
      return wanted.every((s) => legal.includes(s));
    });
  }

  if (skip !== 'foil' && (f.foil === true || f.foil === false)) {
    result = result.filter((e) => !!e.f === f.foil);
  }

  if (skip !== 'condition' && Array.isArray(f.condition) && f.condition.length > 0) {
    const wanted = new Set(f.condition.map((c) => String(c).toUpperCase()));
    result = result.filter((e) => wanted.has(String(e.cn || '').toUpperCase()));
  }

  if (skip !== 'price') {
    if (typeof f.minPrice === 'number') result = result.filter((e) => (e.p || 0) >= f.minPrice);
    if (typeof f.maxPrice === 'number') result = result.filter((e) => (e.p || 0) <= f.maxPrice);
  }

  if (skip !== 'power' && (f.powerMin !== undefined || f.powerMax !== undefined)) {
    result = result.filter((e) => matchesStatRange(e.pw, f.powerMin, f.powerMax));
  }

  if (skip !== 'toughness' && (f.toughnessMin !== undefined || f.toughnessMax !== undefined)) {
    result = result.filter((e) => matchesStatRange(e.to, f.toughnessMin, f.toughnessMax));
  }

  if (skip !== 'fullArt' && f.fullArt === true) {
    result = result.filter((e) => !!e.fa);
  }

  return result;
}

/**
 * How many entries a colour filter DROPPED for having no usable colour data
 * — the number `indexState.missing` reports so those cards can be explained
 * instead of just disappearing. Zero when no colour filter is active, since
 * nothing was dropped.
 */
function countColorUnknownExcluded(entries, filters) {
  if (!hasColorFilter(filters)) return 0;
  return filterPublicIndexEntries(entries, filters, { skip: 'color' }).filter(isColorUnknown).length;
}

/**
 * Sorts a copy — never the caller's array. Default (no/unknown direction) is
 * ascending; the default FIELD is `name`, matching `getUserPublicCardsPage`'s
 * `orderBy('cardName')` so migrating the profile onto this index doesn't
 * silently reorder the grid.
 */
function sortPublicIndexEntries(entries, sort) {
  const sorted = [...(Array.isArray(entries) ? entries : [])];
  const s = sort || {};
  const dir = s.direction === 'desc' ? -1 : 1;

  switch (s.field) {
    case 'price':
      sorted.sort((a, b) => dir * ((a.p || 0) - (b.p || 0)));
      break;
    case 'edition':
      sorted.sort((a, b) => dir * String(a.sc || '').localeCompare(String(b.sc || '')));
      break;
    case 'quantity':
      sorted.sort((a, b) => dir * ((a.q || 0) - (b.q || 0)));
      break;
    case 'dateAdded':
      sorted.sort((a, b) => dir * ((a.ca || 0) - (b.ca || 0)));
      break;
    case 'name':
    default:
      sorted.sort((a, b) => dir * String(a.n || '').localeCompare(String(b.n || '')));
      break;
  }

  return sorted;
}

/**
 * Facet counts: for each dimension, how many results the user would get if
 * they clicked that chip — i.e. the whole filter set applied EXCEPT that
 * dimension. Without the skip, selecting "Black" would report every other
 * colour as 0 and the chips would become unusable after one click.
 */
function computePublicFacets(entries, filters) {
  const color = {};
  const forColor = filterPublicIndexEntries(entries, filters, { skip: 'color' });
  for (const letter of [...COLOR_LETTERS, COLORLESS_LETTER]) {
    const letters = new Set([letter]);
    // eslint-disable-next-line security/detect-object-injection
    color[letter] = forColor.filter((e) => !isColorUnknown(e) && matchesColor(e, letters)).length;
  }

  const status = {};
  for (const e of filterPublicIndexEntries(entries, filters, { skip: 'status' })) {
    const key = String(e.st || '');
    // eslint-disable-next-line security/detect-object-injection
    status[key] = (status[key] || 0) + 1;
  }

  const rarity = {};
  for (const e of filterPublicIndexEntries(entries, filters, { skip: 'rarity' })) {
    const key = String(e.r || '');
    // eslint-disable-next-line security/detect-object-injection
    rarity[key] = (rarity[key] || 0) + 1;
  }

  const type = {};
  const forType = filterPublicIndexEntries(entries, filters, { skip: 'type' });
  for (const name of TYPE_FACETS) {
    // eslint-disable-next-line security/detect-object-injection
    type[name] = forType.filter((e) => String(e.t || '').toLowerCase().includes(name)).length;
  }

  return { color, status, rarity, type };
}

/**
 * Flattens chunk documents into one array of entries. Only documents whose
 * id is a chunk id inside `[0, totalChunks)` contribute: `_meta` lives in the
 * same collection and has no `entries` array, and chunks left OUTSIDE the
 * live range by a not-yet-finished shrink still hold copies of live cards,
 * which would be counted twice.
 *
 * @param {Array<{id: string, data: object}>} docs
 * @param {number} totalChunks
 */
function expandPublicIndexChunks(docs, totalChunks) {
  const entries = [];
  for (const doc of docs) {
    if (doc.id === META_DOC_ID) continue;
    const chunkId = Number(doc.id);
    if (!Number.isInteger(chunkId) || chunkId < 0 || chunkId >= totalChunks) continue;
    const data = doc.data || {};
    if (!Array.isArray(data.entries)) continue;
    for (const entry of data.entries) entries.push(entry);
  }
  return entries;
}

/**
 * Mitigation A's detector: does any LIVE chunk declare a `tc` (the
 * totalChunks it was written under) that disagrees with what `_meta`
 * currently advertises? A chunk with no `tc` at all predates this tanda and
 * is not evidence of anything, so it is not flagged.
 */
function detectGenerationMismatch(docs, totalChunks) {
  for (const doc of docs) {
    if (doc.id === META_DOC_ID) continue;
    const chunkId = Number(doc.id);
    if (!Number.isInteger(chunkId) || chunkId < 0 || chunkId >= totalChunks) continue;
    const tc = (doc.data || {}).tc;
    if (Number.isFinite(tc) && tc !== totalChunks) return true;
  }
  return false;
}

/**
 * Reads the whole index for one seller: one `collection().get()` (which
 * costs one Firestore read per chunk document, NOT per card — 33 reads for
 * the 6,647-card production profile, ~257 for a 100k-card account) plus, at
 * most, one extra `_meta` read when the generation detector fires.
 *
 * @param {object} db injected Firestore
 * @param {string} userId ALREADY validated by assertValidPublicUserId
 */
async function readPublicIndex(db, userId) {
  const indexRef = db.collection(`users/${userId}/public_card_index`);
  const snapshot = await indexRef.get();
  const docs = snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));

  const metaDoc = docs.find((d) => d.id === META_DOC_ID);
  let meta = metaDoc ? metaDoc.data : null;

  if (!meta) {
    // No index yet (never built, or built under an older layout). An empty
    // answer is honest; it is emphatically NOT `partial`, which means "the
    // number I'd give you would be a lie".
    return { entries: [], meta: null, partial: false };
  }

  let totalChunks = Number(meta.totalChunks) || 0;
  let partial = false;

  if (detectGenerationMismatch(docs, totalChunks)) {
    // The flip may simply have landed between our chunk read and now. One
    // re-read of the single `_meta` document settles it; if it still
    // disagrees, we are genuinely inside the reduced-visibility window
    // publicCardIndexExecutor.js documents, and we say so rather than
    // reporting a total that could be half the truth.
    const fresh = await indexRef.doc(META_DOC_ID).get();
    const freshMeta = fresh && fresh.exists ? fresh.data() : null;
    if (freshMeta) {
      meta = freshMeta;
      totalChunks = Number(freshMeta.totalChunks) || 0;
    }
    partial = detectGenerationMismatch(docs, totalChunks);
  }

  return { entries: expandPublicIndexChunks(docs, totalChunks), meta, partial };
}

/** `_meta.reconcileLeaseAt` fresh => a reconciliation is running right now. */
function isReconciling(meta, now) {
  if (!meta) return false;
  const leaseAt = meta.reconcileLeaseAt;
  const ms =
    leaseAt && typeof leaseAt.toMillis === 'function'
      ? leaseAt.toMillis()
      : typeof leaseAt === 'number'
        ? leaseAt
        : 0;
  if (!ms) return false;
  return now - ms < RECONCILE_LEASE_STALE_MS;
}

/**
 * The whole public query, end to end.
 *
 * @param {object} params
 * @param {object} params.db injected Firestore
 * @param {string} params.userId the seller whose PUBLIC profile is being viewed
 * @param {object} [params.filters]
 * @param {{field: string, direction: string}} [params.sort]
 * @param {number} [params.page] 0-based
 * @param {number} [params.pageSize] default 60, clamped to [1, 120]
 * @param {'cards'|'facets'} [params.mode] 'facets' returns counts and no cards
 * @param {number} [params.now] injectable clock, for the reconciling flag
 */
async function queryPublicCardIndexForUser(params) {
  const {
    db,
    userId,
    filters = {},
    sort,
    page = 0,
    pageSize,
    mode = 'cards',
    now = Date.now(),
  } = params || {};

  // Validation FIRST, before any Firestore call — a rejected userId must
  // never reach the path interpolation, and a test asserts zero reads.
  assertValidPublicUserId(userId);

  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0) {
    throw invalidArgument('page must be a non-negative integer');
  }
  if (!VALID_MODES.includes(mode)) {
    throw invalidArgument(`mode must be one of: ${VALID_MODES.join(', ')}`);
  }
  if (sort && sort.field && !VALID_SORT_FIELDS.includes(sort.field)) {
    throw invalidArgument(`sort.field must be one of: ${VALID_SORT_FIELDS.join(', ')}`);
  }
  if (sort && sort.direction && sort.direction !== 'asc' && sort.direction !== 'desc') {
    throw invalidArgument('sort.direction must be "asc" or "desc"');
  }

  const resolvedPageSize = Math.max(
    1,
    Math.min(MAX_PAGE_SIZE, Number(pageSize) > 0 ? Number(pageSize) : DEFAULT_PAGE_SIZE)
  );

  const { entries, meta, partial } = await readPublicIndex(db, userId);

  const filtered = filterPublicIndexEntries(entries, filters);
  const sorted = sortPublicIndexEntries(filtered, sort);

  const start = page * resolvedPageSize;
  const pageEntries = mode === 'facets' ? [] : sorted.slice(start, start + resolvedPageSize);

  return {
    cards: pageEntries.map(toPublicIndexCard),
    // AC5: the count is over the WHOLE collection; only delivery is paged.
    // Mitigation A: while the index is mid-rebuild, refuse to name a number
    // at all rather than name one that could be half the truth — a lying
    // total is this ticket.
    total: partial ? null : filtered.length,
    page,
    pageSize: resolvedPageSize,
    hasMore: partial ? sorted.length > start + resolvedPageSize : start + resolvedPageSize < filtered.length,
    facets: computePublicFacets(entries, filters),
    indexState: {
      schemaVersion: meta ? Number(meta.schemaVersion) || 0 : 0,
      totalChunks: meta ? Number(meta.totalChunks) || 0 : 0,
      count: meta ? Number(meta.count) || 0 : 0,
      reconciling: isReconciling(meta, now),
      partial,
      missing: countColorUnknownExcluded(entries, filters),
    },
  };
}

module.exports = {
  PUBLIC_INDEX_CARD_FIELDS,
  PUBLIC_USER_ID_PATTERN,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_SEARCH_LEN,
  assertValidPublicUserId,
  toPublicIndexCard,
  filterPublicIndexEntries,
  sortPublicIndexEntries,
  computePublicFacets,
  expandPublicIndexChunks,
  detectGenerationMismatch,
  countColorUnknownExcluded,
  readPublicIndex,
  queryPublicCardIndexForUser,
};
