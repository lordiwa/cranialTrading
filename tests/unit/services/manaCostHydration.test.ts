import type { ScryfallCard } from '@/services/scryfall'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockGetCardsByIds = vi.fn<[], Promise<ScryfallCard[]>>()

vi.mock('@/services/scryfallCache', () => ({
    getCardsByIds: (...args: unknown[]) => mockGetCardsByIds(...(args as [])),
}))

// Import AFTER the mock is set up
import {
    hydrateManaCosts,
    __resetManaCostCache,
} from '@/services/manaCostHydration'

describe('hydrateManaCosts', () => {
    beforeEach(() => {
        mockGetCardsByIds.mockReset()
        __resetManaCostCache()
    })

    it('returns empty map without fetching for empty input', async () => {
        const result = await hydrateManaCosts([])
        expect(result.size).toBe(0)
        expect(mockGetCardsByIds).not.toHaveBeenCalled()
    })

    it('returns empty map for input with only falsy IDs', async () => {
        const result = await hydrateManaCosts(['', '', ''])
        expect(result.size).toBe(0)
        expect(mockGetCardsByIds).not.toHaveBeenCalled()
    })

    it('hydrates mana_cost from a single fetched card', async () => {
        mockGetCardsByIds.mockResolvedValueOnce([
            { id: 'bolt-id', name: 'Lightning Bolt', mana_cost: '{R}' } as ScryfallCard,
        ])
        const result = await hydrateManaCosts(['bolt-id'])
        expect(result.get('bolt-id')).toBe('{R}')
    })

    it('caches results: second call with same IDs does not re-fetch', async () => {
        mockGetCardsByIds.mockResolvedValueOnce([
            { id: 'bolt-id', name: 'Lightning Bolt', mana_cost: '{R}' } as ScryfallCard,
        ])
        const first = await hydrateManaCosts(['bolt-id'])
        const second = await hydrateManaCosts(['bolt-id'])
        expect(first.get('bolt-id')).toBe('{R}')
        expect(second.get('bolt-id')).toBe('{R}')
        expect(mockGetCardsByIds).toHaveBeenCalledTimes(1)
    })

    it('deduplicates input IDs before fetching', async () => {
        mockGetCardsByIds.mockResolvedValueOnce([
            { id: 'bolt-id', name: 'Lightning Bolt', mana_cost: '{R}' } as ScryfallCard,
        ])
        await hydrateManaCosts(['bolt-id', 'bolt-id', 'bolt-id'])
        const callArgs = mockGetCardsByIds.mock.calls[0]?.[0] as { id: string }[] | undefined
        expect(callArgs?.length).toBe(1)
    })

    it('returns empty map when fetch throws (no rethrow)', async () => {
        mockGetCardsByIds.mockRejectedValueOnce(new Error('network down'))
        const result = await hydrateManaCosts(['any-id'])
        expect(result.size).toBe(0)
    })

    it('seeds empty string for IDs Scryfall does not return so we never re-fetch them', async () => {
        // Fetch returns nothing for unknown-id
        mockGetCardsByIds.mockResolvedValueOnce([])
        await hydrateManaCosts(['unknown-id'])
        // Second call should NOT trigger another fetch
        await hydrateManaCosts(['unknown-id'])
        expect(mockGetCardsByIds).toHaveBeenCalledTimes(1)
    })

    it('handles cards with empty/missing mana_cost (lands)', async () => {
        mockGetCardsByIds.mockResolvedValueOnce([
            { id: 'plains-id', name: 'Plains', mana_cost: '' } as ScryfallCard,
        ])
        const result = await hydrateManaCosts(['plains-id'])
        expect(result.get('plains-id')).toBe('')
    })

    it('falls back to card_faces[0].mana_cost for MDFCs (top-level mana_cost is empty)', async () => {
        mockGetCardsByIds.mockResolvedValueOnce([
            {
                id: 'shatterskull-id',
                name: 'Shatterskull Smashing',
                mana_cost: '',
                card_faces: [
                    { mana_cost: '{X}{R}{R}' },
                    { mana_cost: '' },
                ],
            } as unknown as ScryfallCard,
        ])
        const result = await hydrateManaCosts(['shatterskull-id'])
        expect(result.get('shatterskull-id')).toBe('{X}{R}{R}')
    })

    it('mixes cached hits with newly-fetched unknowns', async () => {
        mockGetCardsByIds.mockResolvedValueOnce([
            { id: 'bolt-id', name: 'Lightning Bolt', mana_cost: '{R}' } as ScryfallCard,
        ])
        await hydrateManaCosts(['bolt-id'])

        mockGetCardsByIds.mockResolvedValueOnce([
            { id: 'counter-id', name: 'Counterspell', mana_cost: '{U}{U}' } as ScryfallCard,
        ])
        const result = await hydrateManaCosts(['bolt-id', 'counter-id'])
        // Second call should fetch ONLY counter-id
        const secondCallArgs = mockGetCardsByIds.mock.calls[1]?.[0] as { id: string }[] | undefined
        expect(secondCallArgs?.length).toBe(1)
        expect(secondCallArgs?.[0]?.id).toBe('counter-id')
        expect(result.get('bolt-id')).toBe('{R}')
        expect(result.get('counter-id')).toBe('{U}{U}')
    })
})
