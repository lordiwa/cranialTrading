import { calculateColorAnalysis } from '@/utils/manaCost'
import type { HydratedDeckCard } from '@/types/deck'

function makeCard(overrides: Partial<HydratedDeckCard> = {}): HydratedDeckCard {
    return {
        cardId: 'card-1',
        scryfallId: 'sf-1',
        name: 'Test Card',
        edition: 'Test Set',
        condition: 'NM',
        foil: false,
        price: 0,
        image: '',
        allocatedQuantity: 1,
        isInSideboard: false,
        addedAt: new Date(),
        isWishlist: false as const,
        availableInCollection: 0,
        totalInCollection: 1,
        ...overrides,
    }
}

describe('calculateColorAnalysis', () => {
    it('returns zero counts for empty deck', () => {
        const out = calculateColorAnalysis([])
        expect(out.W).toEqual({ demand: 0, sources: 0 })
        expect(out.U).toEqual({ demand: 0, sources: 0 })
        expect(out.B).toEqual({ demand: 0, sources: 0 })
        expect(out.R).toEqual({ demand: 0, sources: 0 })
        expect(out.G).toEqual({ demand: 0, sources: 0 })
    })

    it('counts only sources for lands (Plains x4)', () => {
        const out = calculateColorAnalysis([
            makeCard({
                name: 'Plains',
                type_line: 'Basic Land — Plains',
                produced_mana: ['W'],
                allocatedQuantity: 4,
            }),
        ])
        expect(out.W).toEqual({ demand: 0, sources: 4 })
    })

    it('counts only demand for non-land cards (Lightning Bolt x4)', () => {
        const out = calculateColorAnalysis([
            makeCard({
                name: 'Lightning Bolt',
                type_line: 'Instant',
                mana_cost: '{R}',
                allocatedQuantity: 4,
            }),
        ])
        expect(out.R).toEqual({ demand: 4, sources: 0 })
    })

    it('counts mixed deck: 4 Plains + 4 Bolt', () => {
        const out = calculateColorAnalysis([
            makeCard({
                cardId: 'plains',
                name: 'Plains',
                type_line: 'Basic Land — Plains',
                produced_mana: ['W'],
                allocatedQuantity: 4,
            }),
            makeCard({
                cardId: 'bolt',
                name: 'Lightning Bolt',
                type_line: 'Instant',
                mana_cost: '{R}',
                allocatedQuantity: 4,
            }),
        ])
        expect(out.W).toEqual({ demand: 0, sources: 4 })
        expect(out.R).toEqual({ demand: 4, sources: 0 })
    })

    it('counts dual lands as contributing to both colors', () => {
        const out = calculateColorAnalysis([
            makeCard({
                name: 'Tundra',
                type_line: 'Land',
                produced_mana: ['W', 'U'],
                allocatedQuantity: 2,
            }),
        ])
        expect(out.W).toEqual({ demand: 0, sources: 2 })
        expect(out.U).toEqual({ demand: 0, sources: 2 })
    })

    it('does not crash when card has no mana_cost', () => {
        const out = calculateColorAnalysis([
            makeCard({
                name: 'Mystery',
                type_line: 'Creature — Eldrazi',
                allocatedQuantity: 1,
            }),
        ])
        expect(out.W.demand).toBe(0)
    })

    it('excludes lands from demand even if they have mana_cost (Dryad Arbor edge case)', () => {
        const out = calculateColorAnalysis([
            makeCard({
                name: 'Dryad Arbor',
                type_line: 'Land Creature — Forest Dryad',
                mana_cost: '{G}',
                produced_mana: ['G'],
                allocatedQuantity: 1,
            }),
        ])
        // Land's mana_cost is NOT counted as demand
        expect(out.G).toEqual({ demand: 0, sources: 1 })
    })

    it('multiplies demand and sources by allocatedQuantity', () => {
        const out = calculateColorAnalysis([
            makeCard({
                name: 'Counterspell',
                type_line: 'Instant',
                mana_cost: '{U}{U}',
                allocatedQuantity: 4,
            }),
            makeCard({
                cardId: 'island',
                name: 'Island',
                type_line: 'Basic Land — Island',
                produced_mana: ['U'],
                allocatedQuantity: 20,
            }),
        ])
        expect(out.U).toEqual({ demand: 8, sources: 20 })
    })

    it('counts spell+land MDFC demand AND sources (Shatterskull Smashing)', () => {
        const out = calculateColorAnalysis([
            makeCard({
                name: 'Shatterskull Smashing',
                type_line: 'Sorcery // Land',
                mana_cost: '{X}{R}{R}',
                produced_mana: ['R'],
                allocatedQuantity: 4,
            }),
        ])
        // Front-face cost contributes demand (R x 2 per copy = 8)
        expect(out.R.demand).toBe(8)
        // Back-face land contributes sources (R x 1 per copy = 4)
        expect(out.R.sources).toBe(4)
    })

    it('excludes pure-land MDFC from demand (Pathway: Land // Land)', () => {
        const out = calculateColorAnalysis([
            makeCard({
                name: 'Branchloft Pathway',
                type_line: 'Land // Land',
                produced_mana: ['G'],
                allocatedQuantity: 4,
            }),
        ])
        expect(out.G.demand).toBe(0)
        expect(out.G.sources).toBe(4)
    })

    it('sums hybrid card demand to BOTH colors per ticket', () => {
        const out = calculateColorAnalysis([
            makeCard({
                name: 'Boros Charm',
                type_line: 'Instant',
                mana_cost: '{R/W}{R/W}',
                allocatedQuantity: 4,
            }),
        ])
        expect(out.R.demand).toBe(8)
        expect(out.W.demand).toBe(8)
    })
})
