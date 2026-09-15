/**
 * publicCardIndexQuery — the READ side of the public-profile card index
 * (TASK-247 tanda 3/5). This is the tanda that actually closes the ticket:
 * tandas 1/2a/2b/2c built, chunked, reconciled and triggered the index;
 * nothing ever read it. The public profile still filters and searches over
 * whatever ~60 documents `getUserPublicCardsPage` happens to have paginated
 * into memory, which is why Rafael's profile reports 36 black cards where
 * over a thousand public_cards documents are black.
 *
 * A NOTE ON THE NUMBERS BELOW. Every card count quoted in this file is a LIVE
 * count against Rafael's production profile and moves whenever he publishes
 * or unpublishes anything — the black slice measured 1,412 on 2026-08-18 and
 * 1,443 on 2026-08-19. They are kept as DATED measurements, evidence for why
 * a decision was made, and are NOT maintained: the current figures live in
 * the TASK-247 ticket. Where a proportion says the same thing it is used
 * instead, because a proportion survives the collection growing.
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
 * The unit is the DOCUMENT — not unique scryfallId (a real collection holds
 * the same card in several conditions: measured ~1.3 documents per id), and
 * not copies summed by quantity (~1.9x the document count). All three differ,
 * and AC2 names the document count.
 *
 * A consequence worth stating out loud: the five colour totals SUM TO MORE
 * than the number of documents in the profile, because every multicolour card
 * is counted under each of its colours. That overshoot is the semantics
 * working, not a double-count bug.
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
 * search. Measured scope (2026-08-18): 7.1% of entries have no usable colour
 * source at all, plus a small handful of scryfallId with no `scryfall_cache`
 * document — that second gap re-measured as ZERO on 2026-08-19. The `x` code
 * path stays regardless: a gap closing is not the same as a gap being
 * impossible. `indexState.missing`
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
 * a search for 'blight' misses most of its matches (it cannot reach
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
 * 'goblin', 'elf', or any tribal term passes 50 easily in a profile of a few
 * thousand cards. More to the point, a cap makes `total` lie, and `total` lying IS
 * TASK-247. So `total` is always computed over the whole collection and only
 * DELIVERY is paginated: `pageSize` defaults to 60 (matching
 * usePublicProfileCards's DEFAULT_PAGE_SIZE, so the scroll doesn't change)
 * and clamps to [1, 120] — 120 rows x ~222 B is ~27 KB, ~355 ms at the
 * 600 Kbps this project budgets against; 200 rows would cross into
 * noticeable.
 *
 * ── BYTES: THE 13-FIELD ROW, NOT THE 22-FIELD ENTRY ──
 *
 * A full index entry is ~406 B; the subset the grid actually renders is
 * ~222 B. Shipping every entry of one colour as a full entry would be well
 * over half a megabyte — several seconds at 600 Kbps, multiples of this
 * project's ENTIRE 160 KB boot budget, in a single call. So the wire
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
 * the point: a `total` that names the full colour count when the truth might
 * be half of it is
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
const { PUBLIC_TYPE_CATEGORIES, publicTypeCategory, publicTypeCategories } = require('./publicCardType');

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

/**
 * The 13 fields that ALWAYS travel to the browser (222 B/row measured on a
 * realistic entry).
 */
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

/**
 * Fields that travel ONLY when they carry something — see toPublicIndexCard.
 * `pm` (produced_mana) is here rather than in the always-list because it is
 * empty for every card that is not a land, and an empty array still costs 8
 * bytes on the wire. MEASURED (2026-08-19, realistic row): always-shipping
 * `pm` costs +8 B on every row = +480 B on a 60-row page; shipping it only
 * when non-empty costs +11 B for a mono-colour land, +15 B for a dual, +27 B
 * for a five-colour land — about +234 B on a 60-row page at ~30% lands, which
 * is 3.1 ms at the 600 Kbps this project budgets against, against a ~13.9 KB
 * page. Omitting it when empty is free and strictly better, so that is what
 * this does.
 */
const PUBLIC_INDEX_CARD_OPTIONAL_FIELDS = ['pm'];

const COLOR_LETTERS = ['W', 'U', 'B', 'R', 'G'];
/** The pseudo-letter for "genuinely colourless", distinct from "colour unknown". */
const COLORLESS_LETTER = 'C';

/**
 * A Map, not an object literal: the lookup key comes straight from the
 * client, and an object lookup answers for inherited keys too ('constructor',
 * '__proto__', 'toString'), handing back a function where a letter was
 * expected. A Map only ever answers for keys actually put in it.
 */
const RARITY_INITIAL = new Map([
  ['common', 'c'],
  ['uncommon', 'u'],
  ['rare', 'r'],
  ['mythic', 'm'],
]);

const VALID_SORT_FIELDS = ['name', 'price', 'edition', 'quantity', 'dateAdded'];
const VALID_MODES = ['cards', 'facets'];

/**
 * The `type` facet keys. MEDIUM-2 (tanda 4 ronda 2): these are now the
 * EXCLUSIVE categories of functions/lib/publicCardType.js, the same ones the
 * filter uses, so a facet count and a filtered count can never disagree.
 * 'battle' is gone as a key on purpose — it was never selectable (the chip
 * list has seven entries) and under exclusive categorization a Battle is
 * 'other', exactly as the owner's own view classifies it.
 */
const TYPE_FACETS = PUBLIC_TYPE_CATEGORIES;

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
 * Caps on what an ANONYMOUS caller can ask this 2 GiB / 60 s function to do.
 * There is no auth here, so there is no per-user rate limit to fall back on:
 * every array filter is iterated once per index entry, so an unbounded array
 * multiplies CPU by its own length across every entry in the seller's index
 * (a few thousand on the production profile, up to ~100k at the market
 * ceiling). This
 * is a COST problem, not a data-leak one — but it is Rafael's cost, charged by
 * a caller who never had to log in. Rejected before a single Firestore read.
 *
 * The numbers are generous against real use: the colour vocabulary has 6
 * values, `useCardFilter`'s format list is ~15, its keyword list ~40, and the
 * longest legitimate search term is a full card name.
 */
const MAX_FILTER_VALUES = 50;
const MAX_FILTER_VALUE_LENGTH = 100;
const MAX_SEARCH_LENGTH = 100;
const MAX_PAGE = 100000;

/** name -> what a legitimate value looks like. Anything absent is rejected. */
const FILTER_SPECS = {
  search: { kind: 'string', maxLength: MAX_SEARCH_LENGTH },
  status: { kind: 'stringArray' },
  color: { kind: 'stringArray' },
  rarity: { kind: 'stringArray' },
  type: { kind: 'stringArray' },
  edition: { kind: 'stringArray' },
  keywords: { kind: 'stringArray' },
  formats: { kind: 'stringArray' },
  condition: { kind: 'stringArray' },
  manaValue: { kind: 'manaValueArray' },
  foil: { kind: 'boolean' },
  fullArt: { kind: 'boolean' },
  minPrice: { kind: 'number' },
  maxPrice: { kind: 'number' },
  powerMin: { kind: 'number' },
  powerMax: { kind: 'number' },
  toughnessMin: { kind: 'number' },
  toughnessMax: { kind: 'number' },
};

/**
 * Validates the shape AND the size of every filter. Unknown keys are rejected
 * rather than ignored: silently dropping a filter the caller believes is
 * applied is how a client ends up showing an unfiltered grid and calling it
 * filtered, which is this ticket's own failure mode in miniature.
 *
 * @param {*} filters
 */
function assertValidFilters(filters) {
  if (filters === undefined || filters === null) return {};
  if (typeof filters !== 'object' || Array.isArray(filters)) {
    throw invalidArgument('filters must be an object');
  }

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    if (!Object.prototype.hasOwnProperty.call(FILTER_SPECS, key)) {
      throw invalidArgument(`unknown filter "${key}"`);
    }
    // eslint-disable-next-line security/detect-object-injection
    const spec = FILTER_SPECS[key];

    if (spec.kind === 'string') {
      if (typeof value !== 'string') throw invalidArgument(`filters.${key} must be a string`);
      if (value.length > spec.maxLength) {
        throw invalidArgument(`filters.${key} must be at most ${spec.maxLength} characters`);
      }
      continue;
    }

    if (spec.kind === 'boolean') {
      if (typeof value !== 'boolean') throw invalidArgument(`filters.${key} must be a boolean`);
      continue;
    }

    if (spec.kind === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw invalidArgument(`filters.${key} must be a finite number`);
      }
      continue;
    }

    if (!Array.isArray(value)) throw invalidArgument(`filters.${key} must be an array`);
    if (value.length > MAX_FILTER_VALUES) {
      throw invalidArgument(`filters.${key} must have at most ${MAX_FILTER_VALUES} values`);
    }
    for (const item of value) {
      if (spec.kind === 'manaValueArray') {
        const ok =
          (typeof item === 'number' && Number.isFinite(item)) ||
          (typeof item === 'string' && item.length <= MAX_FILTER_VALUE_LENGTH);
        if (!ok) throw invalidArgument(`filters.${key} values must be numbers or short strings`);
        continue;
      }
      if (typeof item !== 'string') throw invalidArgument(`filters.${key} values must be strings`);
      if (item.length > MAX_FILTER_VALUE_LENGTH) {
        throw invalidArgument(
          `filters.${key} values must be at most ${MAX_FILTER_VALUE_LENGTH} characters`
        );
      }
    }
  }

  return filters;
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
  for (const field of PUBLIC_INDEX_CARD_OPTIONAL_FIELDS) {
    // eslint-disable-next-line security/detect-object-injection
    const value = entry[field];
    // eslint-disable-next-line security/detect-object-injection
    if (Array.isArray(value) && value.length > 0) row[field] = value;
  }
  return row;
}

/**
 * MTG lands print no `colors` — a Swamp is `colors: []`. Their colour, both
 * to a player and to this app's own UI, is what they PRODUCE.
 * `useCardFilter.ts`'s `passesColorFilter` already works this way in the
 * shipped product: a card whose type line contains 'land' and which has
 * `produced_mana` passes on ANY produced colour. A server filter reading only
 * `co` therefore makes every Swamp in every profile invisible under "Black" —
 * satisfying the AC while regressing behaviour that works today, which is the
 * failure mode this project has a standing rule about.
 *
 * Gated on being a LAND, deliberately. Birds of Paradise produces all five
 * colours and is a green creature; matching `pm` for non-lands would file it
 * under every chip and inflate every count. Locked by a negative-control test.
 */
function isLand(entry) {
  return String(entry.t || '').toLowerCase().includes('land');
}

/** Only real colour letters — Scryfall's produced_mana also carries 'C'. */
function colorLetters(values) {
  return (Array.isArray(values) ? values : [])
    .map((c) => String(c).toUpperCase())
    .filter((c) => COLOR_LETTERS.includes(c));
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
  // Lands answer with what they produce (see isLand). A land producing only
  // colourless mana (Wastes) has no valid letters and falls through to the
  // colourless branch below, which is the right answer for it.
  if (isLand(entry)) {
    const produced = colorLetters(entry.pm);
    if (produced.length > 0) return produced.some((c) => letters.has(c));
  }
  const colors = colorLetters(entry.co);
  if (colors.length === 0) return letters.has(COLORLESS_LETTER);
  return colors.some((c) => letters.has(c));
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
        return RARITY_INITIAL.get(key) || key.charAt(0);
      })
    );
    result = result.filter((e) => initials.has(String(e.r || '').toLowerCase()));
  }

  if (skip !== 'type' && Array.isArray(f.type) && f.type.length > 0) {
    // TASK-289, Rafael's DECISION 2026-08-27: MULTIPLE membership, at parity
    // with useCardFilter.getCardTypeCategories — the rule the owner's own
    // collection views use for filtering since TASK-288. A card passes if
    // ANY of its categories is among the ones requested, so an Artifact Land
    // answers to both the `artifact` chip and the `land` chip. This
    // supersedes MEDIUM-2's exclusive rule for FILTERING only; facet counts
    // below still use the single primary category (publicTypeCategory), so
    // the facet sum still can never exceed the total. The two
    // implementations are bound by tests/unit/functions/publicCardTypeParity
    // .test.ts (all 127 combinations of the seven type words, both pairs).
    const wanted = new Set(f.type.map((t) => String(t).toLowerCase()));
    result = result.filter((e) => publicTypeCategories(e.t).some((category) => wanted.has(category)));
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

/** A keyword filter is "active" only when it actually names something. */
function hasKeywordFilter(filters) {
  return Array.isArray(filters.keywords) && filters.keywords.length > 0;
}

/**
 * TASK-248 AC4/AC5 measurement, against the same 6,647-entry production
 * profile publicCardEntry.js's header dates its own numbers against
 * (2026-08-19).
 *
 * AC4 (card_faces / split cards, e.g. 'Blightreaper Thallid // Blightsower
 * Thallid'): MEASURED there is no fallback chain to write. Scryfall's own
 * `card_faces[].` objects carry NO `keywords` property at all — checked
 * against all 192 production entries whose scryfallId has `card_faces`, 0
 * had a face-level `keywords` array. The top-level `keywords` field (this
 * entry's `kw`) is Scryfall's own aggregate for the WHOLE card, both faces
 * included, computed by Scryfall itself — there is nowhere else for a named
 * keyword ability to hide. This is why `kw` needed no `resolveColors`/
 * `resolveTypeLine`-style fallback in publicCardEntry.js's buildPublicEntry
 * to begin with. Confirmed directly against Blightreaper Thallid //
 * Blightsower Thallid's own cached document: root `keywords: ['Transform']`,
 * root `oracle_text` absent, BOTH faces carry real oracle_text and NEITHER
 * carries a `keywords` key.
 *
 * AC5 (the 3,136-of-6,647 entries with `kw: []`): MEASURED against every one
 * of them — all 3,136 have a real scryfall_cache document (0 had the `x`
 * flag at measurement time). Of those, 30 have no oracle_text/keywords
 * anywhere (root or faces — genuinely blank rules text, e.g. a French
 * vanilla land) and 66 have oracle_text only inside `card_faces[]` (root
 * oracle_text absent, e.g. an MDFC where the printed text lives entirely on
 * the two faces). NEITHER group is a data gap for keyword search: oracle_text
 * is not part of this index at all (buildPublicEntry's own note: hundreds of
 * bytes/card against a 4G-slow byte budget, deferred to TASK-248 and still
 * out of scope here — see FUERA DE ALCANCE in the ticket). `kw: []` on an
 * entry that HAS a cache document is Scryfall correctly reporting "no named
 * keyword ability", the same legitimate-empty-value shape as `colors: []`
 * meaning incolora in publicCardEntry.js's AC9 — not a hole to patch.
 *
 * DECISION (reusing `x`/`cu`, not inventing a third flag, as the ticket
 * asked): the ONLY real data gap a keyword filter can hide is the same one
 * AC9 already flags — no scryfall_cache document at all (`x`). An x-flagged
 * entry has no keywords AND no type_line (publicCardEntry's `kw`/`t` both
 * come from `cache`, which is null), so it was already being silently
 * dropped by an active keyword filter with nothing to explain it — the exact
 * "hueco ignorado" AC5 forbids, the same shape AC9 fixed for colour. `cu` is
 * deliberately NOT part of this check: it means colour resolution failed,
 * which says nothing about whether the entry's keywords are known — an
 * entry can be `cu`-flagged with a perfectly good cache document and real
 * keywords.
 */
function isKeywordDataUnknown(entry) {
  return entry.x === 1;
}

/**
 * How many entries were excluded from a keyword-filtered result specifically
 * because their keyword data is unknown (`x` — see isKeywordDataUnknown),
 * mirroring countColorUnknownExcluded. Zero when no keyword filter is
 * active.
 *
 * KNOWN LIMITATION, documented rather than solved (out of TASK-248's
 * concrete scope, which is a single active keyword filter — Rafael's
 * repro): when a colour filter AND a keyword filter are BOTH active at
 * once, an x-flagged entry is already dropped by whichever filter's
 * `skip`-free pass runs first, so it is invisible to the OTHER filter's own
 * `{ skip: '...' }` recount — the two counts can each undercount in that
 * combination rather than double-count. `missing` stays a non-negative,
 * finite number in every case; it is a lower bound on "cards hidden by
 * unknown data" when multiple unknown-data-sensitive filters are combined,
 * not a guaranteed exact count. Fixing this precisely needs `skip` to accept
 * more than one dimension at once, which is a real change to
 * filterPublicIndexEntries's contract — left for the ticket that actually
 * needs the combination to be exact, rather than added here unasked.
 */
function countKeywordUnknownExcluded(entries, filters) {
  if (!hasKeywordFilter(filters)) return 0;
  return filterPublicIndexEntries(entries, filters, { skip: 'keywords' }).filter(isKeywordDataUnknown).length;
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
  // Locale pinned explicitly. A bare `localeCompare` uses the runtime's
  // default locale, which is not guaranteed to be the same on a Cloud
  // Functions instance as on a developer's machine (or across two instances
  // with different ICU data) — the same query could then return the same page
  // in a different order depending on which instance answered it, which is
  // visible to a user scrolling a paginated grid.

  switch (s.field) {
    case 'price':
      sorted.sort((a, b) => dir * ((a.p || 0) - (b.p || 0)));
      break;
    case 'edition':
      sorted.sort((a, b) => dir * String(a.sc || '').localeCompare(String(b.sc || ''), 'en'));
      break;
    case 'quantity':
      sorted.sort((a, b) => dir * ((a.q || 0) - (b.q || 0)));
      break;
    case 'dateAdded':
      sorted.sort((a, b) => dir * ((a.ca || 0) - (b.ca || 0)));
      break;
    case 'name':
    default:
      sorted.sort((a, b) => dir * String(a.n || '').localeCompare(String(b.n || ''), 'en'));
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
    type[name] = 0;
  }
  for (const e of forType) {
    const category = publicTypeCategory(e.t);
    // eslint-disable-next-line security/detect-object-injection
    type[category] = (type[category] || 0) + 1;
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
 * Mitigation A's detector, in two independent halves. Either one firing means
 * the chunk documents in hand and the `_meta` in hand are not from the same
 * generation, so no count taken from them can be trusted.
 *
 *  1. DISAGREEMENT — a live chunk declares a `tc` (the totalChunks it was
 *     written under) different from what `_meta` advertises. A chunk carrying
 *     no `tc` predates this field and is not evidence of anything, so it is
 *     not flagged.
 *  2. INCOMPLETENESS — `_meta` advertises N chunks and fewer than N are
 *     actually in hand. This half is what round 1 lacked, and it is the half
 *     that matters most: `buildPublicIndex` always emits EVERY chunk in
 *     0..totalChunks-1 (empty ones included), so a gap is never normal. It is
 *     also the only signal that catches the real growth window, where our
 *     chunk snapshot was taken while `_meta` still said 16 and the flip to 32
 *     landed afterwards — every chunk we hold then agrees with the NEW `tc`,
 *     and a `tc`-only check happily certifies a snapshot containing half the
 *     seller's cards.
 */
function detectGenerationMismatch(docs, totalChunks) {
  if (!Number.isInteger(totalChunks) || totalChunks < 1) return true;
  const seen = new Set();
  for (const doc of docs) {
    if (doc.id === META_DOC_ID) continue;
    const chunkId = Number(doc.id);
    if (!Number.isInteger(chunkId) || chunkId < 0 || chunkId >= totalChunks) continue;
    seen.add(chunkId);
    const tc = (doc.data || {}).tc;
    if (Number.isFinite(tc) && tc !== totalChunks) return true;
  }
  return seen.size < totalChunks;
}

/**
 * Reads the whole index for one seller: one `collection().get()` (which
 * costs one Firestore read per chunk document, NOT per card — 33 reads for
 * the production profile as measured 2026-08-18, ~257 for a 100k-card
 * account) plus, at
 * most, one extra `_meta` read when the generation detector fires.
 *
 * @param {object} db injected Firestore
 * @param {string} userId ALREADY validated by assertValidPublicUserId
 */
async function readPublicIndex(db, userId) {
  const indexRef = db.collection(`users/${userId}/public_card_index`);

  const readAll = async () => {
    const snapshot = await indexRef.get();
    const docs = snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
    const metaDoc = docs.find((d) => d.id === META_DOC_ID);
    return { docs, meta: metaDoc ? metaDoc.data : null };
  };

  let { docs, meta } = await readAll();

  if (!meta) {
    // No index yet (never built, or built under an older layout). An empty
    // answer is honest; it is emphatically NOT `partial`, which means "the
    // number I'd give you would be a lie".
    return { entries: [], meta: null, partial: false };
  }

  let totalChunks = Number(meta.totalChunks) || 0;
  let partial = false;

  if (detectGenerationMismatch(docs, totalChunks)) {
    // Re-read the WHOLE index, not just `_meta`. Re-reading `_meta` alone was
    // the round-2 MEDIUM-1 bug: the new meta gets validated against the OLD
    // chunk snapshot, so a growth that landed after our first read looks
    // perfectly consistent (every chunk we hold carries the new `tc`) while we
    // are in fact holding half the chunks — and we would answer with a FIRM
    // total over half the seller's cards. That is strictly worse than
    // `partial: true`, because the client has no way to tell it is being
    // lied to. Re-reading both together is the only way the completeness half
    // of the detector can see the chunks that appeared in the meantime.
    //
    // Cost: one extra collection read, and only on a detected mismatch — not
    // on the ordinary path, which stays at exactly one read.
    ({ docs, meta } = await readAll());
    if (!meta) return { entries: [], meta: null, partial: false };
    totalChunks = Number(meta.totalChunks) || 0;
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
  // never reach the path interpolation, and a rejected filter must never get
  // to spend CPU. Tests assert zero reads happened in both cases.
  assertValidPublicUserId(userId);
  // The RETURN VALUE is what the rest of this function must use: for a null
  // (or undefined) payload assertValidFilters normalizes to {}, and throwing
  // that away let a null reach hasColorFilter and crash with a TypeError —
  // a 500, raised only AFTER the whole index had already been read and paid
  // for. Every downstream use below reads `safeFilters`, not `filters`.
  const safeFilters = assertValidFilters(filters);

  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > MAX_PAGE) {
    throw invalidArgument(`page must be an integer between 0 and ${MAX_PAGE}`);
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

  const filtered = filterPublicIndexEntries(entries, safeFilters);
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
    // `sorted` and `filtered` are the same length by construction, so the two
    // arms of the old `partial ? ... : ...` here computed the identical value.
    // Dead branch removed rather than left to imply a distinction that isn't
    // there. Under `partial` this is a lower bound, like everything else
    // derived from an incomplete read.
    hasMore: start + resolvedPageSize < filtered.length,
    // Facet counts are counts, and under `partial` they are counts over an
    // incomplete read — exactly as untrustworthy as `total`, so they go the
    // same way rather than staying firm next to a null total.
    facets: partial ? null : computePublicFacets(entries, safeFilters),
    indexState: {
      // MEDIUM-1 (tanda 4 ronda 2): "this seller's index has never been
      // built" is a DIFFERENT thing from "this seller publishes nothing", and
      // until now the two were indistinguishable — every count came back 0
      // either way, while the profile header went on showing the seller's
      // real "1703 for sale" over a body saying they have no public cards.
      // MEASURED 2026-08-19: zero accounts have a built index in either
      // project, so on deploy day this is the state of EVERY profile until
      // the backfill runs. `_meta` is the signal; it was being thrown away.
      built: !!meta,
      schemaVersion: meta ? Number(meta.schemaVersion) || 0 : 0,
      totalChunks: meta ? Number(meta.totalChunks) || 0 : 0,
      count: meta ? Number(meta.count) || 0 : 0,
      reconciling: isReconciling(meta, now),
      partial,
      // Same rule as `total` and `facets`: under `partial` this is a count
      // over an incomplete read, so it is withheld rather than left standing
      // firm next to a null total — a firm-looking "474 cards hidden" beside
      // "we cannot tell you how many there are" is the inconsistency this
      // mitigation exists to avoid.
      // TASK-248 AC5: combined with the keyword-filter equivalent — see
      // countKeywordUnknownExcluded's own header for the documented
      // undercount limitation when both filters are active at once.
      missing: partial
        ? null
        : countColorUnknownExcluded(entries, safeFilters) + countKeywordUnknownExcluded(entries, safeFilters),
    },
  };
}

module.exports = {
  PUBLIC_INDEX_CARD_FIELDS,
  PUBLIC_USER_ID_PATTERN,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_SEARCH_LEN,
  MAX_FILTER_VALUES,
  MAX_SEARCH_LENGTH,
  PUBLIC_INDEX_CARD_OPTIONAL_FIELDS,
  assertValidPublicUserId,
  assertValidFilters,
  isLand,
  toPublicIndexCard,
  filterPublicIndexEntries,
  sortPublicIndexEntries,
  computePublicFacets,
  countKeywordUnknownExcluded,
  isKeywordDataUnknown,
  expandPublicIndexChunks,
  detectGenerationMismatch,
  countColorUnknownExcluded,
  readPublicIndex,
  queryPublicCardIndexForUser,
};
