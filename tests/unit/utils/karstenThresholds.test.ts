import { karstenSourcesNeeded } from '@/utils/karstenThresholds'

describe('karstenSourcesNeeded — 60-card', () => {
    it('returns 14 for {U} cmc 1, pips 1', () => {
        expect(karstenSourcesNeeded(1, 1, 60)).toBe(14)
    })

    it('returns 13 for {1}{U} cmc 2, pips 1', () => {
        expect(karstenSourcesNeeded(2, 1, 60)).toBe(13)
    })

    it('returns 21 for {U}{U} cmc 2, pips 2', () => {
        expect(karstenSourcesNeeded(2, 2, 60)).toBe(21)
    })

    it('returns 18 for {2}{U}{U} cmc 4, pips 2', () => {
        expect(karstenSourcesNeeded(4, 2, 60)).toBe(18)
    })

    it('returns 23 for {U}{U}{U} cmc 3, pips 3', () => {
        expect(karstenSourcesNeeded(3, 3, 60)).toBe(23)
    })

    it('returns 9 for {6}{U} cmc 7, pips 1', () => {
        expect(karstenSourcesNeeded(7, 1, 60)).toBe(9)
    })
})

describe('karstenSourcesNeeded — 99-card (Commander)', () => {
    it('is higher than 60-card for the same spell', () => {
        const sixty = karstenSourcesNeeded(2, 2, 60)
        const ninety = karstenSourcesNeeded(2, 2, 99)
        expect(ninety).toBeGreaterThan(sixty)
    })

    it('returns 21 for {U} cmc 1, pips 1 (Commander)', () => {
        expect(karstenSourcesNeeded(1, 1, 99)).toBe(21)
    })

    it('returns 30 for {U}{U} cmc 2, pips 2 (Commander)', () => {
        expect(karstenSourcesNeeded(2, 2, 99)).toBe(30)
    })
})

describe('karstenSourcesNeeded — fallbacks', () => {
    it('CMC 8 falls back to CMC 7 threshold', () => {
        const seven = karstenSourcesNeeded(7, 1, 60)
        const eight = karstenSourcesNeeded(8, 1, 60)
        expect(eight).toBe(seven)
    })

    it('CMC 0 (free spells) treated as CMC 1', () => {
        const one = karstenSourcesNeeded(1, 1, 60)
        const zero = karstenSourcesNeeded(0, 1, 60)
        expect(zero).toBe(one)
    })

    it('Pips 4 falls back to pips 3 + 2 sources', () => {
        const three = karstenSourcesNeeded(4, 3, 60)
        const four = karstenSourcesNeeded(4, 4, 60)
        expect(four).toBe(three + 2)
    })

    it('Pips 5 falls back to pips 3 + 4 sources', () => {
        const three = karstenSourcesNeeded(4, 3, 60)
        const five = karstenSourcesNeeded(4, 5, 60)
        expect(five).toBe(three + 4)
    })

    it('Pips 0 returns 0 (no demand)', () => {
        expect(karstenSourcesNeeded(3, 0, 60)).toBe(0)
    })
})
