import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MATCH_LIFETIME_DAYS, getMatchExpirationDate } from '@/utils/matchExpiry'

describe('matchExpiry', () => {
  describe('MATCH_LIFETIME_DAYS', () => {
    it('is 15', () => {
      expect(MATCH_LIFETIME_DAYS).toBe(15)
    })
  })

  describe('getMatchExpirationDate', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('with no argument, returns 15 calendar days from now', () => {
      vi.setSystemTime(new Date('2024-06-01T10:00:00Z'))
      const result = getMatchExpirationDate()
      expect(result.getUTCDate()).toBe(16)
      expect(result.getUTCMonth()).toBe(5) // June
    })

    it('handles month boundary (Jan 20 → Feb 4)', () => {
      const from = new Date('2024-01-20T12:00:00Z')
      const result = getMatchExpirationDate(from)
      expect(result.getUTCDate()).toBe(4)
      expect(result.getUTCMonth()).toBe(1) // February
    })

    it('handles leap year (Feb 15 2024 → Mar 1 2024)', () => {
      const from = new Date('2024-02-15T12:00:00Z')
      const result = getMatchExpirationDate(from)
      expect(result.getUTCDate()).toBe(1)
      expect(result.getUTCMonth()).toBe(2) // March
    })

    it('uses calendar-day arithmetic (not +ms) so DST does not shift the date', () => {
      // First Sunday of Nov 2024 = Nov 3 (US DST end). At 01:30 local,
      // adding 15 * 86400000 ms would shift the wall-clock day by 1 hour
      // and could land on Nov 17 02:30 instead of Nov 18 01:30 local.
      const from = new Date(2024, 10, 3, 1, 30) // Nov 3, 01:30 local
      const result = getMatchExpirationDate(from)
      expect(result.getDate()).toBe(18)
    })

    it('does not mutate the input Date', () => {
      const from = new Date('2024-06-01T00:00:00Z')
      const snapshot = from.getTime()
      getMatchExpirationDate(from)
      expect(from.getTime()).toBe(snapshot)
    })
  })
})
