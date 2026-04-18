import { buildManaCurve, hypergeomAtLeast } from '../../../src/utils/manaCurve'

// ============================================================================
// hypergeomAtLeast — P(X >= k) in a hypergeometric(N, L, n) draw
// ============================================================================

describe('hypergeomAtLeast', () => {
  // Standard hypergeometric P(X >= k). Plan's reference values (0.6447, 0.9637) came
  // from a Karsten-style mulligan-adjusted table, NOT plain hypergeometric — the plan's
  // own formula hints (logC sum i=k..min(n,L)) produce the exact values used below.
  // Deviation documented in SUMMARY.
  it('returns ~0.7887 for 60/24 deck, turn 3 on-play (9 cards seen, need >=3 lands)', () => {
    const p = hypergeomAtLeast(60, 24, 9, 3)
    expect(p).toBeCloseTo(0.7887, 3)
  })

  it('returns ~0.9784 for 60/24 deck, turn 1 on-play (7 cards seen, need >=1 land)', () => {
    const p = hypergeomAtLeast(60, 24, 7, 1)
    expect(p).toBeCloseTo(0.9784, 3)
  })

  it('returns exactly 1 when k <= 0 (trivially true)', () => {
    expect(hypergeomAtLeast(60, 24, 9, 0)).toBe(1)
  })

  it('returns 0 when k > L (more successes needed than exist in population)', () => {
    expect(hypergeomAtLeast(60, 24, 9, 25)).toBe(0)
  })

  it('returns 0 when k > n (cannot draw k successes in n picks)', () => {
    expect(hypergeomAtLeast(60, 24, 9, 10)).toBe(0)
  })

  it('returns 0 when there are no lands (L = 0) and k >= 1', () => {
    expect(hypergeomAtLeast(60, 0, 9, 1)).toBe(0)
  })

  it('returns 1 for an all-lands deck (L = N) when k >= 1', () => {
    expect(hypergeomAtLeast(60, 60, 9, 1)).toBe(1)
  })

  it('produces a finite value in [0, 1] for a 250-card / 100-land deck on turn 15 (factorial overflow guard)', () => {
    const p = hypergeomAtLeast(250, 100, 7 + 14, 15)
    expect(Number.isFinite(p)).toBe(true)
    expect(p).toBeGreaterThanOrEqual(0)
    expect(p).toBeLessThanOrEqual(1)
  })
})

// ============================================================================
// buildManaCurve — bucketize cards by CMC and compute per-bucket probabilities
// ============================================================================

describe('buildManaCurve', () => {
  it('returns a sensible empty state when given an empty card list', () => {
    const result = buildManaCurve([], { deckSize: 0, landCount: 0 })
    expect(result.buckets).toEqual([
      { cmc: 0, count: 0, pOnPlay: 1, pOnDraw: 1 }
    ])
    expect(result.totalCards).toBe(0)
    expect(result.landCount).toBe(0)
    expect(result.maxCmc).toBe(0)
  })

  it('covers every integer CMC from 0 to maxCmc with no gaps', () => {
    const cards = [
      { cmc: 1, type_line: 'Creature', allocatedQuantity: 4 },
      { cmc: 5, type_line: 'Creature', allocatedQuantity: 2 },
    ]
    const result = buildManaCurve(cards, { deckSize: 60, landCount: 24 })
    const cmcs = result.buckets.map(b => b.cmc)
    expect(cmcs).toEqual([0, 1, 2, 3, 4, 5])
    // No gaps: empty buckets should still appear with count = 0
    expect(result.buckets[2].count).toBe(0) // CMC 2
    expect(result.buckets[3].count).toBe(0) // CMC 3
    expect(result.buckets[4].count).toBe(0) // CMC 4
  })

  it('counts lands in both landCount and in bucket 0', () => {
    const cards = [
      { cmc: 0, type_line: 'Basic Land — Forest', allocatedQuantity: 24 },
      { cmc: 2, type_line: 'Creature — Elf', allocatedQuantity: 4 },
    ]
    const result = buildManaCurve(cards, { deckSize: 60, landCount: 24 })
    expect(result.landCount).toBe(24)
    // bucket 0 should include the 24 lands
    const bucket0 = result.buckets.find(b => b.cmc === 0)
    expect(bucket0?.count).toBe(24)
  })

  it('detects lands case-insensitively via type_line containing "Land"', () => {
    const cards = [
      { cmc: 0, type_line: 'LAND', allocatedQuantity: 5 },
      { cmc: 0, type_line: 'Land — Plains', allocatedQuantity: 10 },
      { cmc: 0, type_line: 'Artifact Land', allocatedQuantity: 2 },
    ]
    const result = buildManaCurve(cards, { deckSize: 60, landCount: 17 })
    expect(result.landCount).toBe(17)
  })

  it('produces pOnPlay ≈ 0.7887 at CMC 3 for 60/24 deck (turn 3 on-play = 9 cards — standard hypergeometric)', () => {
    const cards = [
      { cmc: 1, type_line: 'Creature', allocatedQuantity: 4 },
      { cmc: 2, type_line: 'Creature', allocatedQuantity: 4 },
      { cmc: 3, type_line: 'Creature', allocatedQuantity: 4 },
      { cmc: 4, type_line: 'Creature', allocatedQuantity: 4 },
      { cmc: 5, type_line: 'Creature', allocatedQuantity: 4 },
    ]
    const result = buildManaCurve(cards, { deckSize: 60, landCount: 24 })
    const bucket3 = result.buckets.find(b => b.cmc === 3)
    expect(bucket3).toBeDefined()
    expect(bucket3!.pOnPlay).toBeCloseTo(0.7887, 3)
  })

  it('CMC 0 shows probability 1.0 for both on-play and on-draw', () => {
    const cards = [
      { cmc: 0, type_line: 'Basic Land', allocatedQuantity: 24 },
      { cmc: 1, type_line: 'Creature', allocatedQuantity: 4 },
    ]
    const result = buildManaCurve(cards, { deckSize: 60, landCount: 24 })
    const bucket0 = result.buckets.find(b => b.cmc === 0)
    expect(bucket0?.pOnPlay).toBe(1)
    expect(bucket0?.pOnDraw).toBe(1)
  })

  it('on-draw sees one more card than on-play at each CMC >= 1', () => {
    const cards = [
      { cmc: 2, type_line: 'Creature', allocatedQuantity: 4 },
    ]
    const result = buildManaCurve(cards, { deckSize: 60, landCount: 24 })
    const bucket2 = result.buckets.find(b => b.cmc === 2)
    expect(bucket2).toBeDefined()
    // on-draw >= on-play because more cards seen
    expect(bucket2!.pOnDraw).toBeGreaterThanOrEqual(bucket2!.pOnPlay)
  })

  it('pOnPlay at CMC k uses 7 + (k - 1) cards seen', () => {
    // On-play turn 1: 7 cards; standard hypergeom(60, 24, 7, 1) ≈ 0.9784
    const cards = [{ cmc: 1, type_line: 'Creature', allocatedQuantity: 1 }]
    const result = buildManaCurve(cards, { deckSize: 60, landCount: 24 })
    const bucket1 = result.buckets.find(b => b.cmc === 1)
    expect(bucket1!.pOnPlay).toBeCloseTo(0.9784, 3)
  })

  it('pOnDraw at CMC k uses 7 + k cards seen', () => {
    // On-draw turn 1: 8 cards seen; hypergeom(60, 24, 8, 1)
    const cards = [{ cmc: 1, type_line: 'Creature', allocatedQuantity: 1 }]
    const result = buildManaCurve(cards, { deckSize: 60, landCount: 24 })
    const bucket1 = result.buckets.find(b => b.cmc === 1)
    // on-draw probability matches manual hypergeom
    const expected = hypergeomAtLeast(60, 24, 8, 1)
    expect(bucket1!.pOnDraw).toBeCloseTo(expected, 6)
  })

  it('totalCards is the sum of allocatedQuantity across all cards', () => {
    const cards = [
      { cmc: 1, type_line: 'Creature', allocatedQuantity: 4 },
      { cmc: 2, type_line: 'Instant', allocatedQuantity: 3 },
      { cmc: 0, type_line: 'Land', allocatedQuantity: 24 },
    ]
    const result = buildManaCurve(cards, { deckSize: 60, landCount: 24 })
    expect(result.totalCards).toBe(4 + 3 + 24)
  })

  it('treats undefined cmc as 0 for bucketing', () => {
    const cards = [
      { cmc: undefined as unknown as number, type_line: 'Land — Wastes', allocatedQuantity: 3 },
    ]
    const result = buildManaCurve(cards, { deckSize: 60, landCount: 3 })
    const bucket0 = result.buckets.find(b => b.cmc === 0)
    expect(bucket0?.count).toBe(3)
  })

  it('maxCmc reflects the deck’s real max CMC, not a fixed ceiling', () => {
    const cards = [
      { cmc: 7, type_line: 'Creature', allocatedQuantity: 1 },
    ]
    const result = buildManaCurve(cards, { deckSize: 60, landCount: 24 })
    expect(result.maxCmc).toBe(7)
    // 0..7 inclusive = 8 buckets
    expect(result.buckets).toHaveLength(8)
  })
})
