/**
 * TASK-247 tanda 4 ronda 2 — MEDIUM-2, and the RISK that comes with it.
 *
 * The public profile's type filter runs on the SERVER (functions/lib, plain
 * CommonJS, no Vite module graph) while the owner's own collection views run
 * `getCardTypeCategory` in the BROWSER (src/composables/useCardFilter.ts,
 * TypeScript). Rafael's DECISION 10 is that the two must agree — the public
 * counts had started exceeding the owner's counts over the same cards.
 *
 * Two definitions of one rule is exactly how this ticket already earned a
 * HIGH that had to be fixed in two places. The build cannot share one module
 * across those two worlds, so THIS FILE is the binding instead: it runs both
 * implementations over EVERY combination of the seven type words plus a
 * handful of real cards, and reddens the moment they disagree — including on
 * precedence, which is the part that is easy to get subtly wrong.
 *
 * If a future change adds a category to one side only, or reorders the
 * precedence in one side only, this file fails. That is its whole job.
 */
import { describe, expect, it } from 'vitest'
import { PUBLIC_TYPE_CATEGORIES, publicTypeCategory } from '../../../functions/lib/publicCardType.js'
import { getCardTypeCategory } from '@/composables/useCardFilter'

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
