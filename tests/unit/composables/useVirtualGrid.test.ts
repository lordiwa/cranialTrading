import { chunkIntoRows, shouldLoadMore } from '@/composables/useVirtualGrid'
import { makeCard } from '../helpers/fixtures'

describe('shouldLoadMore', () => {
  const THRESHOLD = 1000

  it('returns false when scroll is far from bottom', () => {
    // scrollOffset=0, totalSize=5000, viewportHeight=800, threshold=1000
    // remaining = 5000 - (0 + 800) = 4200, which is > 1000
    expect(shouldLoadMore(0, 5000, 800, THRESHOLD)).toBe(false)
  })

  it('returns true when scroll position is within threshold of bottom', () => {
    // scrollOffset=3500, totalSize=5000, viewportHeight=800, threshold=1000
    // remaining = 5000 - (3500 + 800) = 700, which is <= 1000
    expect(shouldLoadMore(3500, 5000, 800, THRESHOLD)).toBe(true)
  })

  it('returns true when exactly at the threshold boundary', () => {
    // scrollOffset=3200, totalSize=5000, viewportHeight=800, threshold=1000
    // remaining = 5000 - (3200 + 800) = 1000, which is <= 1000
    expect(shouldLoadMore(3200, 5000, 800, THRESHOLD)).toBe(true)
  })

  it('returns true when scrolled past the bottom', () => {
    // scrollOffset=5000, totalSize=5000, viewportHeight=800, threshold=1000
    // remaining = 5000 - (5000 + 800) = -800, which is <= 1000
    expect(shouldLoadMore(5000, 5000, 800, THRESHOLD)).toBe(true)
  })

  it('returns false when totalSize is 0 (no content)', () => {
    expect(shouldLoadMore(0, 0, 800, THRESHOLD)).toBe(false)
  })

  it('returns false when scrollOffset is null', () => {
    expect(shouldLoadMore(null, 5000, 800, THRESHOLD)).toBe(false)
  })

  it('returns false when viewportHeight is 0', () => {
    expect(shouldLoadMore(0, 5000, 0, THRESHOLD)).toBe(false)
  })

  it('returns true when content is shorter than viewport + threshold', () => {
    // totalSize=500, viewportHeight=800 — content fits in viewport
    // remaining = 500 - (0 + 800) = -300, which is <= 1000
    // But totalSize > 0 and viewportHeight > 0
    expect(shouldLoadMore(0, 500, 800, THRESHOLD)).toBe(true)
  })
})

describe('chunkIntoRows', () => {
  it('returns empty array for empty cards', () => {
    expect(chunkIntoRows([], 3)).toEqual([])
  })

  it('chunks cards into rows of given column count', () => {
    const cards = [
      makeCard({ id: 'a' }),
      makeCard({ id: 'b' }),
      makeCard({ id: 'c' }),
      makeCard({ id: 'd' }),
      makeCard({ id: 'e' }),
    ]
    const rows = chunkIntoRows(cards, 2)
    expect(rows).toHaveLength(3)
    expect(rows[0].map(c => c.id)).toEqual(['a', 'b'])
    expect(rows[1].map(c => c.id)).toEqual(['c', 'd'])
    expect(rows[2].map(c => c.id)).toEqual(['e'])
  })

  it('handles exact multiple of column count', () => {
    const cards = Array.from({ length: 6 }, (_, i) => makeCard({ id: `card-${i}` }))
    const rows = chunkIntoRows(cards, 3)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveLength(3)
    expect(rows[1]).toHaveLength(3)
  })

  it('handles single card', () => {
    const cards = [makeCard({ id: 'solo' })]
    const rows = chunkIntoRows(cards, 5)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveLength(1)
  })

  it('handles column count of 1', () => {
    const cards = [makeCard({ id: 'a' }), makeCard({ id: 'b' })]
    const rows = chunkIntoRows(cards, 1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveLength(1)
    expect(rows[1]).toHaveLength(1)
  })
})
