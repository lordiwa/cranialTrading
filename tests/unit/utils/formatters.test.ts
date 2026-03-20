import { formatPrice, formatPercent, formatDollarChange } from '@/utils/formatters'

describe('formatters', () => {
  describe('formatPrice', () => {
    it('formats a normal price', () => {
      expect(formatPrice(1.5)).toBe('$1.50')
    })

    it('formats zero', () => {
      expect(formatPrice(0)).toBe('$0.00')
    })

    it('formats a large price', () => {
      expect(formatPrice(123.456)).toBe('$123.46')
    })
  })

  describe('formatPercent', () => {
    it('formats positive with + sign', () => {
      expect(formatPercent(50)).toBe('+50.0%')
    })

    it('formats negative without + sign', () => {
      expect(formatPercent(-25.5)).toBe('-25.5%')
    })

    it('formats zero without sign', () => {
      expect(formatPercent(0)).toBe('0.0%')
    })
  })

  describe('formatDollarChange', () => {
    it('formats positive: +$X.XX', () => {
      expect(formatDollarChange(0.50)).toBe('+$0.50')
    })

    it('formats negative: -$X.XX (sign before dollar)', () => {
      expect(formatDollarChange(-0.50)).toBe('-$0.50')
    })

    it('formats zero as $0.00', () => {
      expect(formatDollarChange(0)).toBe('$0.00')
    })

    it('formats large positive', () => {
      expect(formatDollarChange(12.34)).toBe('+$12.34')
    })

    it('formats large negative', () => {
      expect(formatDollarChange(-99.99)).toBe('-$99.99')
    })
  })
})
