/**
 * TASK-247 tanda 4 ronda 2 — MEDIUM-2, and the RISK that comes with it.
 * Extended by TASK-289: there are now TWO rules, not one, each with its own
 * server/browser pair, and both pairs must stay bound.
 *
 * The public profile's type filter runs on the SERVER (functions/lib, plain
 * CommonJS, no Vite module graph) while the owner's own collection views run
 * the equivalent logic in the BROWSER (src/composables/useCardFilter.ts,
 * TypeScript). TASK-289 copied the client's plural/singular split to the
 * server:
 *   - SINGULAR pair: `publicTypeCategory` (server) vs `getCardTypeCategory`
 *     (client) — first-match-wins by precedence, used only for facet counts
 *     / grouping.
 *   - PLURAL pair: `publicTypeCategories` (server) vs `getCardTypeCategories`
 *     (client) — every matching category, used for FILTERING (an Artifact
 *     Land must answer to both the `artifact` and the `land` chip).
 *
 * Two definitions of one rule is exactly how this ticket already earned a
 * HIGH that had to be fixed in two places. The build cannot share one module
 * across those two worlds, so THIS FILE is the binding instead: it runs BOTH
 * pairs over EVERY combination of the seven type words plus a handful of
 * real cards, and reddens the moment either pair disagrees — including on
 * precedence (singular pair) or on membership (plural pair).
 *
 * If a future change adds a category to one side only, or reorders the
 * precedence in one side only, or drops a match from one side's plural set,
 * this file fails. That is its whole job.
 */
import { describe, expect, it } from 'vitest'
import { PUBLIC_TYPE_CATEGORIES, publicTypeCategory, publicTypeCategories } from '../../../functions/lib/publicCardType.js'
import { getCardTypeCategory, getCardTypeCategories } from '@/composables/useCardFilter'

/** The client's display categories, in the server's own vocabulary. */
const CLIENT_TO_SERVER: Record<string, string> = {
  Creatures: 'creature',
  Instants: 'instant',
  Sorceries: 'sorcery',
  Enchantments: 'enchantment',
  Artifacts: 'artifact',
  Planeswalkers: 'planeswalker',
  Lands: 'land',
  Other: 'other',
}

const TYPE_WORDS = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land']

/** Every non-empty combination of the seven words, in every order they can
 *  appear as a subset — 127 type lines, which is what makes a precedence
 *  divergence impossible to slip through. */
function everyCombination(): string[] {
  const lines: string[] = []
  for (let mask = 1; mask < 1 << TYPE_WORDS.length; mask++) {
    const parts = TYPE_WORDS.filter((_, i) => mask & (1 << i))
    lines.push(parts.join(' '))
  }
  return lines
}

describe('the server and the browser classify a type line identically', () => {
  it('agrees on all 127 combinations of the seven top-level types', () => {
    const disagreements: string[] = []
    for (const line of everyCombination()) {
      const client = CLIENT_TO_SERVER[getCardTypeCategory({ name: '', edition: '', type_line: line })]
      const server = publicTypeCategory(line)
      if (client !== server) disagreements.push(`${line}: browser=${client} server=${server}`)
    }
    expect(disagreements).toEqual([])
  })

  it('agrees on all 127 combinations for the PLURAL (filtering) rule — every matching category, not just the primary', () => {
    const disagreements: string[] = []
    for (const line of everyCombination()) {
      const client = getCardTypeCategories({ name: '', edition: '', type_line: line })
        .map((c) => CLIENT_TO_SERVER[c])
        .sort()
      const server = publicTypeCategories(line).sort()
      if (JSON.stringify(client) !== JSON.stringify(server)) {
        disagreements.push(`${line}: browser=${JSON.stringify(client)} server=${JSON.stringify(server)}`)
      }
    }
    expect(disagreements).toEqual([])
  })

  it('the plural rule keeps an Artifact Land under BOTH artifact and land — the bug this ticket closes', () => {
    expect(publicTypeCategories('Artifact Land').sort()).toEqual(['artifact', 'land'])
    expect(getCardTypeCategories({ name: '', edition: '', type_line: 'Artifact Land' }).sort()).toEqual(['Artifacts', 'Lands'])
  })

  /**
   * LOW-1 (TASK-289 review). `everyCombination()` only produces the 127
   * NON-EMPTY subsets, so the no-match case was never exercised for the
   * PLURAL pair — a mutant that changes `publicTypeCategories`' fallback
   * from `['other']` to `matches` (or the client's to `[]`) survives the
   * whole suite otherwise, because an empty array vs `['other']` is never
   * compared. Ties both sides down for a type line with none of the seven
   * keywords.
   */
  it("the plural rule's no-match fallback agrees with the client's — both say ['other'] / ['Other'], never an empty array", () => {
    for (const line of ['', 'Conspiracy', 'Battle — Siege']) {
      expect(publicTypeCategories(line)).toEqual(['other'])
      expect(getCardTypeCategories({ name: '', edition: '', type_line: line })).toEqual(['Other'])
    }
  })

  it('agrees on real cards, including the ones whose category is not the first word', () => {
    const realCards = [
      'Legendary Creature — Goblin Shaman',
      'Artifact Creature — Golem',
      'Enchantment Artifact',
      'Enchantment Creature — Nymph',
      'Artifact Land',
      'Legendary Planeswalker — Jace',
      'Basic Land — Swamp',
      'Land Creature — Dryad',
      'Instant — Arcane',
      'Sorcery',
      'Battle — Siege', // no category on either side: both must say "other"
      'Conspiracy',
      '',
    ]
    for (const line of realCards) {
      const client = CLIENT_TO_SERVER[getCardTypeCategory({ name: '', edition: '', type_line: line })]
      expect(`${line} -> ${publicTypeCategory(line)}`).toBe(`${line} -> ${client}`)
    }
  })

  it('exposes the same category vocabulary the chips offer, plus "other"', () => {
    // PUBLIC_TYPES in src/composables/usePublicProfileIndex.ts is the chip
    // list; 'other' is not selectable but must exist as a bucket, or a card
    // that belongs to no category would silently belong to the last one.
    expect(PUBLIC_TYPE_CATEGORIES).toEqual([
      'creature',
      'instant',
      'sorcery',
      'enchantment',
      'artifact',
      'planeswalker',
      'land',
      'other',
    ])
  })

  it('is not fooled by a subtype that happens to contain a category word', () => {
    // 'Goblin' is a subtype; nothing about it makes the card an artifact or a
    // land. This is the class of false positive the substring rule produced.
    expect(publicTypeCategory('Creature — Goblin Artificer')).toBe('creature')
    expect(publicTypeCategory('Creature — Island Fish')).toBe('creature')
  })

  it('handles a missing or non-string type line without throwing', () => {
    expect(publicTypeCategory(undefined)).toBe('other')
    expect(publicTypeCategory(null)).toBe('other')
    expect(publicTypeCategory(42 as unknown as string)).toBe('other')
  })
})
