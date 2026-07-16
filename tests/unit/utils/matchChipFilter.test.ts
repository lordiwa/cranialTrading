import {
  MATCH_CHIP_IDS,
  buildMatchChipSummaries,
  selectMatchesForChip,
  isValidMatchChip,
  defaultExpandedGroupIds,
  sumPotentialValue,
  type MatchChipBuckets,
} from '@/utils/matchChipFilter'

describe('matchChipFilter', () => {
  describe('MATCH_CHIP_IDS', () => {
    it('exposes the 4 chip ids in display order', () => {
      expect(MATCH_CHIP_IDS).toEqual(['new', 'sent', 'saved', 'deleted'])
    })
  })

  describe('isValidMatchChip', () => {
    it('accepts the 4 known chip ids', () => {
      expect(isValidMatchChip('new')).toBe(true)
      expect(isValidMatchChip('sent')).toBe(true)
      expect(isValidMatchChip('saved')).toBe(true)
      expect(isValidMatchChip('deleted')).toBe(true)
    })

    it('rejects unknown values (e.g. stale route query params)', () => {
      expect(isValidMatchChip('contacts')).toBe(false)
      expect(isValidMatchChip('')).toBe(false)
      expect(isValidMatchChip('NEW')).toBe(false)
    })
  })

  describe('buildMatchChipSummaries', () => {
    const buckets: MatchChipBuckets<number> = {
      new: [1, 2, 3],
      sent: [1],
      saved: [],
      deleted: [1, 2],
    }

    it('returns one summary per chip, in MATCH_CHIP_IDS order', () => {
      const summaries = buildMatchChipSummaries(buckets)
      expect(summaries.map(s => s.id)).toEqual(['new', 'sent', 'saved', 'deleted'])
    })

    it('counts each bucket by length', () => {
      const summaries = buildMatchChipSummaries(buckets)
      expect(summaries).toEqual([
        { id: 'new', count: 3 },
        { id: 'sent', count: 1 },
        { id: 'saved', count: 0 },
        { id: 'deleted', count: 2 },
      ])
    })

    it('handles all-empty buckets', () => {
      const empty: MatchChipBuckets<number> = { new: [], sent: [], saved: [], deleted: [] }
      expect(buildMatchChipSummaries(empty).every(s => s.count === 0)).toBe(true)
    })
  })

  describe('selectMatchesForChip', () => {
    const buckets: MatchChipBuckets<string> = {
      new: ['n1', 'n2'],
      sent: ['s1'],
      saved: [],
      deleted: ['d1'],
    }

    it('returns the matching bucket for each chip id', () => {
      expect(selectMatchesForChip('new', buckets)).toEqual(['n1', 'n2'])
      expect(selectMatchesForChip('sent', buckets)).toEqual(['s1'])
      expect(selectMatchesForChip('saved', buckets)).toEqual([])
      expect(selectMatchesForChip('deleted', buckets)).toEqual(['d1'])
    })

    it('does not mutate the source buckets', () => {
      const result = selectMatchesForChip('new', buckets)
      result.push('mutated')
      expect(buckets.new).toEqual(['n1', 'n2'])
    })
  })

  describe('defaultExpandedGroupIds', () => {
    it('returns an empty set for an empty group list', () => {
      expect(defaultExpandedGroupIds([]).size).toBe(0)
    })

    it('expands only the first group id', () => {
      const result = defaultExpandedGroupIds(['userA', 'userB', 'userC'])
      expect(result.size).toBe(1)
      expect(result.has('userA')).toBe(true)
      expect(result.has('userB')).toBe(false)
    })

    it('handles a single-group list', () => {
      const result = defaultExpandedGroupIds(['onlyUser'])
      expect([...result]).toEqual(['onlyUser'])
    })
  })

  describe('sumPotentialValue', () => {
    it('returns 0 for an empty list', () => {
      expect(sumPotentialValue([])).toBe(0)
    })

    it('sums theirTotalValue across matches', () => {
      expect(sumPotentialValue([
        { theirTotalValue: 100 },
        { theirTotalValue: 40.5 },
        { theirTotalValue: 9.5 },
      ])).toBe(150)
    })

    it('treats missing theirTotalValue as 0', () => {
      expect(sumPotentialValue([{ theirTotalValue: 20 }, {}, { theirTotalValue: 5 }])).toBe(25)
    })
  })
})
