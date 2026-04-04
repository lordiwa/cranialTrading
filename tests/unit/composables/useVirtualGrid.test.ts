import { chunkIntoRows } from '@/composables/useVirtualGrid'
import { makeCard } from '../helpers/fixtures'

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
