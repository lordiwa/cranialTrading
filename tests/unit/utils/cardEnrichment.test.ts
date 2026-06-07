import { buildEnrichmentPatch, needsEnrichment } from '../../../src/utils/cardEnrichment'
import { makeCard } from '../helpers/fixtures'
import type { Card } from '../../../src/types/card'

// A representative raw Scryfall card object (the fields the patch reads from).
function makeScryfallCard(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sc-1',
    name: 'Lightning Bolt',
    set: 'lea',
    set_name: 'Limited Edition Alpha',
    type_line: 'Instant',
    colors: ['R'],
    cmc: 1,
    rarity: 'common',
    oracle_text: 'Lightning Bolt deals 3 damage to any target.',
    keywords: [],
    legalities: { modern: 'legal', standard: 'not_legal' },
    produced_mana: [],
    full_art: false,
    image_uris: { normal: 'https://img/normal.jpg' },
    prices: { usd: '2.50' },
    ...overrides,
  }
}

describe('cardEnrichment', () => {
  describe('needsEnrichment', () => {
    it('returns true for a bare card missing type_line', () => {
      const card = makeCard({ scryfallId: 'sc-1' })
      // makeCard fixture may set type_line; force it bare
      const bare = { ...card, type_line: undefined, produced_mana: undefined } as Card
      expect(needsEnrichment(bare)).toBe(true)
    })

    it('returns true when produced_mana is undefined even if type_line present', () => {
      const card = makeCard({ scryfallId: 'sc-1', type_line: 'Instant' })
      const partial = { ...card, produced_mana: undefined } as Card
      expect(needsEnrichment(partial)).toBe(true)
    })

    it('returns false for a fully-enriched card', () => {
      const card = makeCard({
        scryfallId: 'sc-1',
        type_line: 'Instant',
        colors: ['R'],
        cmc: 1,
        rarity: 'common',
        produced_mana: [],
      }) as Card
      expect(needsEnrichment(card)).toBe(false)
    })

    it('returns false when there is no scryfallId to enrich from', () => {
      const card = makeCard({ scryfallId: '' }) as Card
      const bare = { ...card, type_line: undefined, produced_mana: undefined } as Card
      expect(needsEnrichment(bare)).toBe(false)
    })
  })

  describe('buildEnrichmentPatch', () => {
    it('fills missing type_line, colors, cmc, rarity from Scryfall', () => {
      const card = makeCard({ scryfallId: 'sc-1' })
      const bare = { ...card, type_line: undefined, colors: undefined, cmc: undefined, rarity: undefined, produced_mana: undefined } as Card
      const patch = buildEnrichmentPatch(bare, makeScryfallCard())

      expect(patch.type_line).toBe('Instant')
      expect(patch.colors).toEqual(['R'])
      expect(patch.cmc).toBe(1)
      expect(patch.rarity).toBe('common')
    })

    it('fills produced_mana, keywords, legalities, full_art when missing', () => {
      const card = makeCard({ scryfallId: 'sc-1' })
      const bare = { ...card, produced_mana: undefined, keywords: undefined, legalities: undefined, full_art: undefined } as Card
      const sc = makeScryfallCard({
        produced_mana: ['R'],
        keywords: ['flying'],
        legalities: { modern: 'legal' },
        full_art: true,
      })
      const patch = buildEnrichmentPatch(bare, sc)

      expect(patch.produced_mana).toEqual(['R'])
      expect(patch.keywords).toEqual(['flying'])
      expect(patch.legalities).toEqual({ modern: 'legal' })
      expect(patch.full_art).toBe(true)
    })

    it('sets setCode from the Scryfall `set` field (the CODE, not the name)', () => {
      const card = makeCard({ scryfallId: 'sc-1' })
      const bare = { ...card, setCode: undefined } as Card
      const sc = makeScryfallCard({ set: 'lea', set_name: 'Limited Edition Alpha' })
      const patch = buildEnrichmentPatch(bare, sc)

      // CANONICAL RULE: setCode is the set CODE
      expect(patch.setCode).toBe('lea')
    })

    it('does NOT clobber edition (edition is the human-readable set_name, kept as-is)', () => {
      const card = makeCard({ scryfallId: 'sc-1', edition: 'Limited Edition Alpha', setCode: undefined })
      const bare = { ...card } as Card
      const sc = makeScryfallCard({ set: 'lea', set_name: 'Limited Edition Alpha' })
      const patch = buildEnrichmentPatch(bare, sc)

      // The patch must never write `edition`
      expect(patch).not.toHaveProperty('edition')
    })

    it('does not overwrite setCode when the card already has one', () => {
      const card = makeCard({ scryfallId: 'sc-1', setCode: 'MH2' }) as Card
      const sc = makeScryfallCard({ set: 'lea' })
      const patch = buildEnrichmentPatch(card, sc)
      expect(patch).not.toHaveProperty('setCode')
    })

    it('returns an empty patch for an already-complete card (no-op)', () => {
      const card = makeCard({
        scryfallId: 'sc-1',
        setCode: 'lea',
        type_line: 'Instant',
        colors: ['R'],
        cmc: 1,
        rarity: 'common',
        oracle_text: 'deals 3 damage',
        keywords: ['flying'],
        legalities: { modern: 'legal' },
        power: '1',
        toughness: '1',
        produced_mana: ['R'],
        full_art: true,
        image: 'https://existing/img.jpg',
        price: 5,
      }) as Card
      const patch = buildEnrichmentPatch(card, makeScryfallCard())
      expect(Object.keys(patch)).toHaveLength(0)
    })

    it('does not overwrite existing falsy-meaningful fields it already has', () => {
      const card = makeCard({ scryfallId: 'sc-1', type_line: 'Sorcery', colors: ['U'] }) as Card
      const patch = buildEnrichmentPatch(card, makeScryfallCard({ type_line: 'Instant', colors: ['R'] }))
      expect(patch).not.toHaveProperty('type_line')
      expect(patch).not.toHaveProperty('colors')
    })

    it('extracts image from nested image_uris when card.image is empty', () => {
      const card = makeCard({ scryfallId: 'sc-1', image: '' }) as Card
      const patch = buildEnrichmentPatch(card, makeScryfallCard({ image_uris: { normal: 'https://img/x.jpg' } }))
      expect(patch.image).toBe('https://img/x.jpg')
    })

    it('extracts image from card_faces[0] for split cards when image_uris absent', () => {
      const card = makeCard({ scryfallId: 'sc-1', image: '' }) as Card
      const sc = makeScryfallCard({
        image_uris: undefined,
        card_faces: [{ image_uris: { normal: 'https://img/face0.jpg' } }],
      })
      const patch = buildEnrichmentPatch(card, sc)
      expect(patch.image).toBe('https://img/face0.jpg')
    })

    it('extracts price from nested prices.usd when card.price is 0', () => {
      const card = makeCard({ scryfallId: 'sc-1', price: 0 }) as Card
      const patch = buildEnrichmentPatch(card, makeScryfallCard({ prices: { usd: '12.34' } }))
      expect(patch.price).toBeCloseTo(12.34)
    })

    it('does not set price when card already has a non-zero price', () => {
      const card = makeCard({ scryfallId: 'sc-1', price: 7 }) as Card
      const patch = buildEnrichmentPatch(card, makeScryfallCard({ prices: { usd: '12.34' } }))
      expect(patch).not.toHaveProperty('price')
    })
  })
})
