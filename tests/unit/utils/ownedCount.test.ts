import { describe, it, expect } from 'vitest'
import { buildOwnedCountMap } from '@/utils/ownedCount'

describe('buildOwnedCountMap', () => {
  it('returns empty map for empty input', () => {
    const map = buildOwnedCountMap([])
    expect(map.size).toBe(0)
  })

  it('maps a single card to its quantity', () => {
    const map = buildOwnedCountMap([{ name: 'Black Lotus', quantity: 4 }])
    expect(map.size).toBe(1)
    expect(map.get('black lotus')).toBe(4)
  })

  it('coalesces case-insensitive duplicates by summing quantities', () => {
    const map = buildOwnedCountMap([
      { name: 'Black Lotus', quantity: 3 },
      { name: 'BLACK LOTUS', quantity: 2 },
    ])
    expect(map.size).toBe(1)
    expect(map.get('black lotus')).toBe(5)
  })

  it('preserves distinct names in separate keys', () => {
    const map = buildOwnedCountMap([
      { name: 'Lotus', quantity: 1 },
      { name: 'Mox', quantity: 2 },
    ])
    expect(map.size).toBe(2)
    expect(map.get('lotus')).toBe(1)
    expect(map.get('mox')).toBe(2)
  })

  it('keeps zero-quantity entries in the map (preserves presence info)', () => {
    const map = buildOwnedCountMap([{ name: 'Mox', quantity: 0 }])
    expect(map.get('mox')).toBe(0)
  })

  it('handles 10000 cards in under 50ms', () => {
    const cards = Array.from({ length: 10_000 }, (_, i) => ({
      name: `Card${i % 500}`,
      quantity: 1,
    }))
    const t0 = performance.now()
    buildOwnedCountMap(cards)
    const elapsed = performance.now() - t0
    expect(elapsed).toBeLessThan(50)
  })
})
