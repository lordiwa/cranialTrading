import { calculateKarstenAnalysis } from '@/utils/manaCost'
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

describe('calculateKarstenAnalysis', () => {
    it('returns empty channels for empty deck', () => {
        const out = calculateKarstenAnalysis([], 60)
        expect(out.W.spellChecks).toEqual([])
        expect(out.W.status).toBe('noDemand')
        expect(out.W.sources).toBe(0)
    })

    it('reports OK when sources >= maxRequired (24 Plains + 4 {W} cmc 1)', () => {
        const cards = [
            makeCard({
                cardId: 'plains',
                name: 'Plains',
                type_line: 'Basic Land — Plains',
                produced_mana: ['W'],
                allocatedQuantity: 24,
            }),
            makeCard({
                cardId: 'savannah',
                name: 'Savannah Lions',
                type_line: 'Creature — Cat',
                mana_cost: '{W}',
                cmc: 1,
                allocatedQuantity: 4,
            }),
        ]
        const out = calculateKarstenAnalysis(cards, 60)
        expect(out.W.sources).toBe(24)
        expect(out.W.maxRequired).toBe(14) // {W} cmc 1 → 14 sources
        expect(out.W.status).toBe('ok')
        expect(out.W.totalCount).toBe(1)
        expect(out.W.failingCount).toBe(0)
    })

    it('reports critical when 1 spell {W}{W}{W} cmc 3 has only 14 W sources', () => {
        const cards = [
            makeCard({
                cardId: 'plains',
                name: 'Plains',
                type_line: 'Basic Land — Plains',
                produced_mana: ['W'],
                allocatedQuantity: 14,
            }),
            makeCard({
                cardId: 'crusade',
                name: 'Crusade',
                type_line: 'Enchantment',
                mana_cost: '{W}{W}{W}',
                cmc: 3,
                allocatedQuantity: 1,
            }),
        ]
        const out = calculateKarstenAnalysis(cards, 60)
        expect(out.W.sources).toBe(14)
        expect(out.W.maxRequired).toBe(23) // {W}{W}{W} cmc 3 → 23 sources
        expect(out.W.status).toBe('critical') // 14/23 = 0.61 < 0.85
        expect(out.W.failingCount).toBe(1)
    })

    it('reports OK for the user case: many low-CMC {U} (49 absolute, 23 sources)', () => {
        // Reproduces Rafael's scenario: lots of cheap U spells, threshold for each is low
        const cards: HydratedDeckCard[] = [
            // 23 Islands
            makeCard({
                cardId: 'island',
                name: 'Island',
                type_line: 'Basic Land — Island',
                produced_mana: ['U'],
                allocatedQuantity: 23,
            }),
            // 49 cheap blue spells, each cmc 1, pips 1 (e.g. Brainstorm-like)
            makeCard({
                cardId: 'cheap-u',
                name: 'Cheap Blue Spell',
                type_line: 'Instant',
                mana_cost: '{U}',
                cmc: 1,
                allocatedQuantity: 49,
            }),
        ]
        const out = calculateKarstenAnalysis(cards, 60)
        expect(out.U.sources).toBe(23)
        expect(out.U.maxRequired).toBe(14) // Cheapest spells need only 14 sources
        // 23 sources >= 14 required → OK (NOT critical like the old formula)
        expect(out.U.status).toBe('ok')
        expect(out.U.failingCount).toBe(0)
    })

    it('reports tight when sources are between 0.85x and 1x of maxRequired', () => {
        const cards = [
            makeCard({
                cardId: 'plains',
                name: 'Plains',
                type_line: 'Basic Land — Plains',
                produced_mana: ['W'],
                allocatedQuantity: 12, // 12/14 = 0.857 → tight
            }),
            makeCard({
                cardId: 'savannah',
                name: 'Savannah Lions',
                type_line: 'Creature',
                mana_cost: '{W}',
                cmc: 1,
                allocatedQuantity: 4,
            }),
        ]
        const out = calculateKarstenAnalysis(cards, 60)
        expect(out.W.status).toBe('tight')
    })

    it('handles MDFC Shatterskull-style: front-face cost contributes demand', () => {
        const cards = [
            makeCard({
                cardId: 'mountain',
                name: 'Mountain',
                type_line: 'Basic Land — Mountain',
                produced_mana: ['R'],
                allocatedQuantity: 19,
            }),
            makeCard({
                cardId: 'shatterskull',
                name: 'Shatterskull Smashing',
                type_line: 'Sorcery // Land',
                mana_cost: '{X}{R}{R}',
                cmc: 3,
                produced_mana: ['R'],
                allocatedQuantity: 1,
            }),
        ]
        const out = calculateKarstenAnalysis(cards, 60)
        // Shatterskull contributes 1 R source AND demand for {R}{R} cmc 3 → 19 sources
        expect(out.R.sources).toBe(20) // 19 mountains + 1 from MDFC back face
        expect(out.R.maxRequired).toBe(19) // {X}{R}{R} cmc 3, pips 2 → 19 (60-card)
        expect(out.R.status).toBe('ok')
    })

    it('does not crash when card has no mana_cost (not yet hydrated)', () => {
        const cards = [
            makeCard({
                name: 'Mystery',
                type_line: 'Creature',
                cmc: 3,
                allocatedQuantity: 1,
            }),
        ]
        const out = calculateKarstenAnalysis(cards, 60)
        // No mana_cost → contributes nothing to demand
        expect(out.W.spellChecks).toHaveLength(0)
        expect(out.W.status).toBe('noDemand')
    })

    it('reports noLands when demand exists but no sources', () => {
        const cards = [
            makeCard({
                name: 'Lightning Bolt',
                type_line: 'Instant',
                mana_cost: '{R}',
                cmc: 1,
                allocatedQuantity: 4,
            }),
        ]
        const out = calculateKarstenAnalysis(cards, 60)
        expect(out.R.sources).toBe(0)
        expect(out.R.maxRequired).toBe(14)
        expect(out.R.status).toBe('noLands')
    })

    it('escalates thresholds in Commander mode (99-card)', () => {
        const cards = [
            makeCard({
                name: 'Counterspell',
                type_line: 'Instant',
                mana_cost: '{U}{U}',
                cmc: 2,
                allocatedQuantity: 1,
            }),
        ]
        const sixty = calculateKarstenAnalysis(cards, 60)
        const ninety = calculateKarstenAnalysis(cards, 99)
        expect(sixty.U.maxRequired).toBe(21)
        expect(ninety.U.maxRequired).toBe(30)
    })

    it('records the maxRequiredCard for the most demanding spell', () => {
        const cards = [
            makeCard({
                cardId: 'bolt',
                name: 'Lightning Bolt',
                type_line: 'Instant',
                mana_cost: '{R}',
                cmc: 1,
                allocatedQuantity: 4,
            }),
            makeCard({
                cardId: 'vortex',
                name: 'Sulfuric Vortex',
                type_line: 'Enchantment',
                mana_cost: '{R}{R}{R}',
                cmc: 3,
                allocatedQuantity: 1,
            }),
        ]
        const out = calculateKarstenAnalysis(cards, 60)
        expect(out.R.maxRequiredCard?.name).toBe('Sulfuric Vortex')
    })

    it('lists each unique spell as one spellCheck (allocatedQuantity does not duplicate)', () => {
        const cards = [
            makeCard({
                cardId: 'bolt',
                name: 'Lightning Bolt',
                type_line: 'Instant',
                mana_cost: '{R}',
                cmc: 1,
                allocatedQuantity: 4, // 4 copies but 1 spellCheck entry
            }),
        ]
        const out = calculateKarstenAnalysis(cards, 60)
        expect(out.R.spellChecks).toHaveLength(1)
        expect(out.R.totalCount).toBe(1)
    })

    it('counts hybrid spell {R/W} as demand for both colors', () => {
        const cards = [
            makeCard({
                cardId: 'mountain',
                name: 'Mountain',
                type_line: 'Land',
                produced_mana: ['R'],
                allocatedQuantity: 14,
            }),
            makeCard({
                cardId: 'plains',
                name: 'Plains',
                type_line: 'Land',
                produced_mana: ['W'],
                allocatedQuantity: 14,
            }),
            makeCard({
                cardId: 'charm',
                name: 'Boros Charm',
                type_line: 'Instant',
                mana_cost: '{R/W}{R/W}',
                cmc: 2,
                allocatedQuantity: 4,
            }),
        ]
        const out = calculateKarstenAnalysis(cards, 60)
        // Hybrid contributes 2 pips to BOTH R and W per casting
        expect(out.R.maxRequired).toBe(21) // 2 pips on cmc 2
        expect(out.W.maxRequired).toBe(21)
        // 14 sources of each, threshold 21 → critical
        expect(out.R.status).toBe('critical')
        expect(out.W.status).toBe('critical')
    })
})
