import type { ScryfallCard } from '@/services/scryfall'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockGetCardsByIds = vi.fn<[], Promise<ScryfallCard[]>>()

vi.mock('@/services/scryfall', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/scryfall')>()
  return {
    ...actual,
    getCardsByIds: (...args: unknown[]) => mockGetCardsByIds(...(args as [])),
  }
})

// Import AFTER the mock is set up
import {
  detectEtbTappedLands,
  isEtbTappedOracle,
  __resetTappedLandsCache,
} from '@/services/manaCurveLands'

// ── isEtbTappedOracle ──────────────────────────────────────────────────────────

describe('isEtbTappedOracle', () => {
  it('detects "Enters tapped."', () => {
    expect(isEtbTappedOracle('Enters tapped.')).toBe(true)
  })

  it('detects "enters the battlefield tapped"', () => {
    expect(isEtbTappedOracle('enters the battlefield tapped')).toBe(true)
  })

  it('detects ETB tapped across multiple lines', () => {
    expect(isEtbTappedOracle('Enters tapped.\n{T}: Add {G}.')).toBe(true)
  })

  it('returns false when "unless" follows tapped within the window (Glacial Fortress style)', () => {
    expect(
      isEtbTappedOracle('Enters tapped unless you control two or more other lands.')
    ).toBe(false)
  })

  it('returns false for Glacial Fortress (checkland)', () => {
    expect(
      isEtbTappedOracle(
        'Glacial Fortress enters the battlefield tapped unless you control a Plains or Island.'
      )
    ).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isEtbTappedOracle('')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isEtbTappedOracle(undefined)).toBe(false)
  })

  it('returns false for oracle text without ETB-tapped phrase', () => {
    expect(
      isEtbTappedOracle(
        'Add one mana of any color. Spend this mana only to cast creature spells.'
      )
    ).toBe(false)
  })

  it('returns true when "unless" appears well after the tapped match (beyond window)', () => {
    // The 'tapped.' match ends; "unless" is in a new sentence > 60 chars away
    const text =
      'This land enters the battlefield tapped. If you control seven or more lands, however, some other effect applies. Later text unless that also.'
    expect(isEtbTappedOracle(text)).toBe(true)
  })
})

// ── detectEtbTappedLands ───────────────────────────────────────────────────────

describe('detectEtbTappedLands', () => {
  beforeEach(() => {
    mockGetCardsByIds.mockReset()
    __resetTappedLandsCache()
  })

  it('returns zero-state without fetching for empty input', async () => {
    const result = await detectEtbTappedLands([])
    expect(result).toEqual({ tappedCount: 0, tappedNames: [] })
    expect(mockGetCardsByIds).not.toHaveBeenCalled()
  })

  it('detects a Guildgate as ETB-tapped', async () => {
    mockGetCardsByIds.mockResolvedValueOnce([
      {
        id: 'guildgate-id',
        name: 'Azorius Guildgate',
        oracle_text: 'Azorius Guildgate enters tapped.\n{T}: Add {W} or {U}.',
      } as ScryfallCard,
    ])
    const result = await detectEtbTappedLands(['guildgate-id'])
    expect(result.tappedCount).toBe(1)
    expect(result.tappedNames).toEqual(['Azorius Guildgate'])
  })

  it('does NOT count Glacial Fortress (checkland with unless clause)', async () => {
    mockGetCardsByIds.mockResolvedValueOnce([
      {
        id: 'glacial-id',
        name: 'Glacial Fortress',
        oracle_text:
          'Glacial Fortress enters the battlefield tapped unless you control a Plains or Island.\n{T}: Add {W} or {U}.',
      } as ScryfallCard,
    ])
    const result = await detectEtbTappedLands(['glacial-id'])
    expect(result.tappedCount).toBe(0)
    expect(result.tappedNames).toEqual([])
  })

  it('caches results: second call with same IDs does not re-fetch', async () => {
    mockGetCardsByIds.mockResolvedValueOnce([
      {
        id: 'guildgate-id',
        name: 'Azorius Guildgate',
        oracle_text: 'Azorius Guildgate enters tapped.',
      } as ScryfallCard,
    ])
    const first = await detectEtbTappedLands(['guildgate-id'])
    const second = await detectEtbTappedLands(['guildgate-id'])
    expect(first.tappedCount).toBe(1)
    expect(second.tappedCount).toBe(1)
    expect(mockGetCardsByIds).toHaveBeenCalledTimes(1)
  })

  it('deduplicates input IDs before fetching', async () => {
    mockGetCardsByIds.mockResolvedValueOnce([
      {
        id: 'guildgate-id',
        name: 'Azorius Guildgate',
        oracle_text: 'Azorius Guildgate enters tapped.',
      } as ScryfallCard,
    ])
    const result = await detectEtbTappedLands(['guildgate-id', 'guildgate-id', 'guildgate-id'])
    expect(result.tappedCount).toBe(1)
    // The single call received only one identifier entry (deduped)
    const callArgs = mockGetCardsByIds.mock.calls[0]?.[0] as { id: string }[] | undefined
    expect(callArgs?.length).toBe(1)
  })

  it('returns zero-state when fetch throws (no rethrow)', async () => {
    mockGetCardsByIds.mockRejectedValueOnce(new Error('network exploded'))
    const result = await detectEtbTappedLands(['any-id'])
    expect(result).toEqual({ tappedCount: 0, tappedNames: [] })
  })

  it('handles mixed tapped + non-tapped lands in one batch', async () => {
    mockGetCardsByIds.mockResolvedValueOnce([
      {
        id: 'guildgate-id',
        name: 'Azorius Guildgate',
        oracle_text: 'Enters tapped.',
      } as ScryfallCard,
      {
        id: 'glacial-id',
        name: 'Glacial Fortress',
        oracle_text:
          'Enters the battlefield tapped unless you control a Plains or Island.',
      } as ScryfallCard,
      {
        id: 'island-id',
        name: 'Island',
        oracle_text: '{T}: Add {U}.',
      } as ScryfallCard,
    ])
    const result = await detectEtbTappedLands(['guildgate-id', 'glacial-id', 'island-id'])
    expect(result.tappedCount).toBe(1)
    expect(result.tappedNames).toEqual(['Azorius Guildgate'])
  })

  it('mixes cached hits with newly-fetched unknowns', async () => {
    // Prime cache with guildgate
    mockGetCardsByIds.mockResolvedValueOnce([
      {
        id: 'guildgate-id',
        name: 'Azorius Guildgate',
        oracle_text: 'Enters tapped.',
      } as ScryfallCard,
    ])
    await detectEtbTappedLands(['guildgate-id'])

    // Second call: guildgate cached, shock new
    mockGetCardsByIds.mockResolvedValueOnce([
      {
        id: 'shock-id',
        name: 'Breeding Pool',
        oracle_text:
          '({T}: Add {G} or {U}.) As Breeding Pool enters the battlefield, you may pay 2 life. If you don\'t, it enters tapped.',
      } as ScryfallCard,
    ])
    const result = await detectEtbTappedLands(['guildgate-id', 'shock-id'])
    // Should have fetched ONLY shock-id on the second call
    const secondCallArgs = mockGetCardsByIds.mock.calls[1]?.[0] as { id: string }[] | undefined
    expect(secondCallArgs?.length).toBe(1)
    expect(secondCallArgs?.[0]?.id).toBe('shock-id')
    // Guildgate is tapped (from cache); Breeding Pool is conditionally tapped — but the
    // phrase "it enters tapped" with no following "unless" in the window → tapped.
    expect(result.tappedCount).toBeGreaterThanOrEqual(1)
    expect(result.tappedNames).toContain('Azorius Guildgate')
  })
})
