/**
 * publicCardType — the ONE server-side definition of "what type is this
 * card", for the public profile's type chips and type facets (TASK-247 tanda
 * 4 ronda 2, MEDIUM-2; superseded in part by TASK-289).
 *
 * TASK-289, Rafael's DECISION 2026-08-27, SUPERSEDES the "exclusive
 * categories" premise below for FILTERING. That premise had gone false the
 * moment TASK-288 fixed the same bug on the client: `useCardFilter.ts` splits
 * a PLURAL `getCardTypeCategories` (every category a card belongs to, for
 * filtering) from the SINGULAR `getCardTypeCategory` (first-match-wins, for
 * grouping only). An Artifact Land is both an Artifact and a Land — it plays
 * as a land regardless of what a filter thinks — and TASK-288 already made
 * the client honor that. This module had been left copying only the
 * singular half of that rule, so a seller's Artifact Land never surfaced
 * under the public profile's `land` chip. Measured before the fix (AC1):
 * `filterPublicIndexEntries` with `{ type: ['land'] }` excluded an
 * `Artifact Land` entry.
 *
 * The objection that motivated "exclusive" in the first place — MEDIUM-2's
 * round 1, where a plain substring filter made the public profile's
 * per-type counts EXCEED the owner's own counts over the same cards,
 * "visible to the user and unexplainable" — does NOT apply to the FACET
 * counts, which is the only place a user-visible number lives: `grep -rn
 * facets src/views/UserProfileView.vue src/components/` returns nothing, no
 * component ever paints them. So the fix Rafael chose keeps that objection
 * permanently moot instead of relying on nobody wiring facets to the UI
 * later: FILTER by multiple membership (`publicTypeCategories`, every
 * category whose keyword is in the type line), COUNT facets by the single
 * PRIMARY category (`publicTypeCategory`, unchanged) — so the facet sum
 * still equals the total and can never exceed it, exactly as before.
 *
 * PRECEDENCE for the singular/primary category, and it is load-bearing:
 * creature > instant > sorcery > enchantment > artifact > planeswalker >
 * land > other. That order is what makes an Artifact Creature a creature
 * and an Enchantment Artifact an enchantment for GROUPING purposes. It is a
 * COPY of getCardTypeCategory's order (and `publicTypeCategories` is a copy
 * of getCardTypeCategories' membership rule), because functions/ (plain
 * CommonJS, no Vite/TS module graph) and src/ (TypeScript compiled by Vite)
 * cannot share a module. Two copies of one rule is exactly how this ticket
 * already earned a HIGH that had to be fixed in two places, so the copies
 * are bound by a test instead: `tests/unit/functions/publicCardTypeParity
 * .test.ts` runs BOTH pairs — the singular pair and the plural pair — over
 * all 127 combinations of the seven type words and reddens the moment
 * either disagrees, on membership or on precedence. Change one side and
 * that file fails.
 */

/**
 * The category vocabulary. The first seven are the chip list
 * (`PUBLIC_TYPES` in src/composables/usePublicProfileIndex.ts); 'other' is
 * not selectable but has to exist as a bucket, or a card belonging to no
 * category would silently fall into the last one.
 */
const PUBLIC_TYPE_CATEGORIES = [
  'creature',
  'instant',
  'sorcery',
  'enchantment',
  'artifact',
  'planeswalker',
  'land',
  'other',
];

/** Ordered exactly as getCardTypeCategory tests them — see the header. */
const TYPE_PRECEDENCE = [
  'creature',
  'instant',
  'sorcery',
  'enchantment',
  'artifact',
  'planeswalker',
  'land',
];

/**
 * @param {string|null|undefined} typeLine the index entry's `t`
 * @returns {string} one of PUBLIC_TYPE_CATEGORIES
 */
function publicTypeCategory(typeLine) {
  const line = typeof typeLine === 'string' ? typeLine.toLowerCase() : '';
  for (const category of TYPE_PRECEDENCE) {
    if (line.includes(category)) return category;
  }
  return 'other';
}

/**
 * ALL categories the card belongs to (TASK-289, AC2) — the plural half of
 * the pair, mirroring `getCardTypeCategories` in
 * `src/composables/useCardFilter.ts`. Use this one for FILTERING
 * (`filterPublicIndexEntries`'s `type` clause), never `publicTypeCategory`,
 * so an Artifact Land matches both the `artifact` and the `land` chip.
 *
 * @param {string|null|undefined} typeLine the index entry's `t`
 * @returns {string[]} every category in PUBLIC_TYPE_CATEGORIES whose keyword
 *   appears in the type line, or `['other']` if none does
 */
function publicTypeCategories(typeLine) {
  const line = typeof typeLine === 'string' ? typeLine.toLowerCase() : '';
  const matches = TYPE_PRECEDENCE.filter((category) => line.includes(category));
  return matches.length > 0 ? matches : ['other'];
}

module.exports = {
  PUBLIC_TYPE_CATEGORIES,
  TYPE_PRECEDENCE,
  publicTypeCategory,
  publicTypeCategories,
};
