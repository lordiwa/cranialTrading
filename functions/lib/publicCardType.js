/**
 * publicCardType — the ONE server-side definition of "what type is this
 * card", for the public profile's type chips and type facets (TASK-247 tanda
 * 4 ronda 2, MEDIUM-2).
 *
 * WHY EXCLUSIVE CATEGORIES (Rafael, ticket comment DECISION 10). Round 1 of
 * this tanda made the type filter a plain `type_line.includes(t)`, which
 * nobody decided: an Artifact Creature then answers to the 'artifact' chip
 * AND to the 'creature' chip, so the public profile's per-type counts EXCEED
 * the owner's own counts over exactly the same cards — visible to the user,
 * and unexplainable. The shipped product's own rule is exclusive: a card
 * falls in exactly ONE category, by the precedence in
 * `src/composables/useCardFilter.ts`'s `getCardTypeCategory`.
 *
 * This is not in tension with the colour filter's OR-inclusive semantics
 * (where a B/G card answers to both chips). The constant criterion in both
 * decisions is "do what the shipped product already does" — colour is
 * OR-inclusive there, type is exclusive there.
 *
 * PRECEDENCE, and it is load-bearing: creature > instant > sorcery >
 * enchantment > artifact > planeswalker > land > other. That order is what
 * makes an Artifact Creature a creature and an Enchantment Artifact an
 * enchantment. It is a COPY of getCardTypeCategory's order, because
 * functions/ (plain CommonJS, no Vite/TS module graph) and src/ (TypeScript
 * compiled by Vite) cannot share a module. Two copies of one rule is exactly
 * how this ticket already earned a HIGH that had to be fixed in two places,
 * so the copies are bound by a test instead:
 * `tests/unit/functions/publicCardTypeParity.test.ts` runs BOTH
 * implementations over all 127 combinations of the seven type words and
 * reddens the moment they disagree — on membership or on precedence. Change
 * one side and that file fails.
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

module.exports = {
  PUBLIC_TYPE_CATEGORIES,
  TYPE_PRECEDENCE,
  publicTypeCategory,
};
