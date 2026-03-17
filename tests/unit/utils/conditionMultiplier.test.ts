import { getConditionMultiplier, getConditionAdjustedPrice } from '@/utils/conditionMultiplier'
import type { CardCondition } from '@/types/card'

describe('conditionMultiplier', () => {
  describe('getConditionMultiplier', () => {
    it('returns 1.0 for Mint condition', () => {
      expect(getConditionMultiplier('M')).toBe(1.0)
    })

    it('returns 1.0 for Near Mint condition', () => {
      expect(getConditionMultiplier('NM')).toBe(1.0)
    })

    it('returns 0.85 for Lightly Played condition', () => {
      expect(getConditionMultiplier('LP')).toBe(0.85)
    })

    it('returns 0.70 for Moderately Played condition', () => {
      expect(getConditionMultiplier('MP')).toBe(0.70)
    })

    it('returns 0.50 for Heavily Played condition', () => {
      expect(getConditionMultiplier('HP')).toBe(0.50)
    })

    it('returns 0.30 for Poor condition', () => {
      expect(getConditionMultiplier('PO')).toBe(0.30)
    })

    it('defaults to 1.0 for unknown condition', () => {
      expect(getConditionMultiplier('XX' as CardCondition)).toBe(1.0)
    })
  })

  describe('getConditionAdjustedPrice', () => {
    it('returns full price for NM cards', () => {
      expect(getConditionAdjustedPrice(10.00, 'NM')).toBe(10.00)
    })

    it('applies 85% multiplier for LP cards', () => {
      expect(getConditionAdjustedPrice(10.00, 'LP')).toBe(8.50)
    })

    it('applies 70% multiplier for MP cards', () => {
      expect(getConditionAdjustedPrice(10.00, 'MP')).toBe(7.00)
    })

    it('applies 50% multiplier for HP cards', () => {
      expect(getConditionAdjustedPrice(10.00, 'HP')).toBe(5.00)
    })

    it('applies 30% multiplier for PO cards', () => {
      expect(getConditionAdjustedPrice(10.00, 'PO')).toBe(3.00)
    })

    it('handles zero price', () => {
      expect(getConditionAdjustedPrice(0, 'LP')).toBe(0)
    })

    it('rounds to 2 decimal places', () => {
      // 3.33 * 0.85 = 2.8305 → 2.83
      expect(getConditionAdjustedPrice(3.33, 'LP')).toBe(2.83)
    })
  })
})
