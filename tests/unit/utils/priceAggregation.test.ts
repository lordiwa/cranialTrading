import { ckFirstUnitPrice, sumCkFirst } from '@/utils/priceAggregation'

describe('priceAggregation (TASK-114 CK-first aggregate math)', () => {
  describe('ckFirstUnitPrice', () => {
    it('uses the CK price when present', () => {
      expect(ckFirstUnitPrice({ price: 5, quantity: 1 }, 12)).toBe(12)
    })

    it('falls back to entry.price when CK price is undefined', () => {
      expect(ckFirstUnitPrice({ price: 5, quantity: 1 }, undefined)).toBe(5)
    })

    it('falls back to entry.price when CK price is null (mtgjson "no data")', () => {
      expect(ckFirstUnitPrice({ price: 5, quantity: 1 }, null)).toBe(5)
    })

    it('treats CK price of 0 as a valid CK value (not missing)', () => {
      expect(ckFirstUnitPrice({ price: 5, quantity: 1 }, 0)).toBe(0)
    })

    it('never returns NaN when both CK and entry.price are missing/invalid', () => {
      expect(ckFirstUnitPrice({ price: Number.NaN, quantity: 1 }, undefined)).toBe(0)
      expect(ckFirstUnitPrice({ price: undefined as unknown as number, quantity: 1 }, undefined)).toBe(0)
    })
  })

  describe('sumCkFirst', () => {
    it('returns 0 for an empty collection', () => {
      expect(sumCkFirst([], () => 10)).toBe(0)
    })

    it('sums quantity-weighted CK prices when all entries have CK data', () => {
      const entries = [
        { price: 1, quantity: 2, ck: 10 },
        { price: 1, quantity: 3, ck: 5 },
      ]
      // 2*10 + 3*5 = 35
      expect(sumCkFirst(entries, e => e.ck)).toBe(35)
    })

    it('falls back to TCG price per-entry when CK is missing for some entries (mixed)', () => {
      const entries = [
        { price: 4, quantity: 1, ck: 10 as number | undefined }, // CK: 10
        { price: 4, quantity: 1, ck: undefined }, // fallback: 4
      ]
      // 1*10 + 1*4 = 14
      expect(sumCkFirst(entries, e => e.ck)).toBe(14)
    })

    it('sums pure TCG prices when no entry has CK data (all-missing)', () => {
      const entries = [
        { price: 3, quantity: 2 },
        { price: 7, quantity: 1 },
      ]
      // 2*3 + 1*7 = 13
      expect(sumCkFirst(entries, () => undefined)).toBe(13)
    })

    it('does not let a single NaN-poisoned entry (missing price after import) zero out the whole sum', () => {
      const entries = [
        { price: Number.NaN, quantity: 1 },
        { price: 5, quantity: 2 },
      ]
      // poisoned entry contributes 0, second contributes 10
      expect(sumCkFirst(entries, () => undefined)).toBe(10)
    })
  })
})
