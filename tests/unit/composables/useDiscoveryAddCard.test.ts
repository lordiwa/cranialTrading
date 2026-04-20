/**
 * TDD tests for useDiscoveryAddCard composable.
 * Orchestrates collectionStore.addCard + decks/binders allocations for Discovery Panel quick-add.
 */
import { ref } from 'vue'
import type { ScryfallCard } from '@/services/scryfall'
import { useDiscoveryAddCard } from '@/composables/useDiscoveryAddCard'

function makePrint(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    id: 'scry-1',
    name: 'Lightning Bolt',
    set: 'mh3',
    set_name: 'Modern Horizons 3',
    image_uris: { small: 'small.png', normal: 'n.png', large: 'l.png' },
    prices: { usd: '0.50', usd_foil: null, eur: null },
    cmc: 1,
    type_line: 'Instant',
    colors: ['R'],
    rarity: 'common',
    ...overrides,
  } as unknown as ScryfallCard
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    collectionStore: {
      addCard: vi.fn().mockResolvedValue('card-new-1'),
      cards: ref([]),
      ...(overrides.collectionStore as object ?? {}),
    },
    decksStore: {
      allocateCardToDeck: vi.fn().mockResolvedValue({ allocated: 1, wishlisted: 0 }),
      ...(overrides.decksStore as object ?? {}),
    },
    bindersStore: {
      allocateCardToBinder: vi.fn().mockResolvedValue(1),
      binders: ref<Array<{ id: string; forSale?: boolean }>>([
        { id: 'binder-1', forSale: false },
      ]),
      ...(overrides.bindersStore as object ?? {}),
    },
    toastStore: { show: vi.fn() },
    t: (k: string, params?: Record<string, string | number>) => (params ? `${k}:${JSON.stringify(params)}` : k),
    selectedDeckId: ref<string | undefined>('deck-1'),
    selectedBinderId: ref<string | undefined>('binder-1'),
  }
}

describe('useDiscoveryAddCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('addToMainboard (scope: decks)', () => {
    it('adds card to collection and allocates to mainboard', async () => {
      const deps = makeDeps()
      const { addToMainboard } = useDiscoveryAddCard('decks', deps)

      const result = await addToMainboard(makePrint())

      expect(result.ok).toBe(true)
      expect(deps.collectionStore.addCard).toHaveBeenCalledTimes(1)
      expect(deps.collectionStore.addCard).toHaveBeenCalledWith(expect.objectContaining({
        scryfallId: 'scry-1',
        name: 'Lightning Bolt',
        edition: 'Modern Horizons 3',
        setCode: 'mh3',
        quantity: 1,
        condition: 'NM',
        foil: false,
        status: 'collection',
      }))
      expect(deps.decksStore.allocateCardToDeck).toHaveBeenCalledWith(
        'deck-1', 'card-new-1', 1, false
      )
    })

    it('returns ok:false when no selectedDeckId', async () => {
      const deps = makeDeps()
      deps.selectedDeckId.value = undefined
      const { addToMainboard } = useDiscoveryAddCard('decks', deps)

      const result = await addToMainboard(makePrint())

      expect(result.ok).toBe(false)
      expect(deps.collectionStore.addCard).not.toHaveBeenCalled()
      expect(deps.toastStore.show).toHaveBeenCalled()
    })

    it('returns ok:false when addCard fails', async () => {
      const deps = makeDeps()
      deps.collectionStore.addCard = vi.fn().mockResolvedValue(null)
      const { addToMainboard } = useDiscoveryAddCard('decks', deps)

      const result = await addToMainboard(makePrint())

      expect(result.ok).toBe(false)
      expect(deps.decksStore.allocateCardToDeck).not.toHaveBeenCalled()
    })

    it('reuses existing collection card when same print+condition+foil+collection-status exists', async () => {
      const deps = makeDeps({
        collectionStore: {
          addCard: vi.fn().mockResolvedValue('card-new'),
          cards: ref([
            { id: 'card-existing', scryfallId: 'scry-1', condition: 'NM', foil: false, status: 'collection', quantity: 2 },
          ]),
        },
      })
      const { addToMainboard } = useDiscoveryAddCard('decks', deps)

      await addToMainboard(makePrint())

      // Should NOT call addCard — reuse existing card
      expect(deps.collectionStore.addCard).not.toHaveBeenCalled()
      expect(deps.decksStore.allocateCardToDeck).toHaveBeenCalledWith(
        'deck-1', 'card-existing', 1, false
      )
    })
  })

  describe('addToSideboard (scope: decks)', () => {
    it('allocates with isInSideboard=true', async () => {
      const deps = makeDeps()
      const { addToSideboard } = useDiscoveryAddCard('decks', deps)

      const result = await addToSideboard(makePrint())

      expect(result.ok).toBe(true)
      expect(deps.decksStore.allocateCardToDeck).toHaveBeenCalledWith(
        'deck-1', 'card-new-1', 1, true
      )
    })
  })

  describe('addToBinder (scope: binders)', () => {
    it('adds with status=collection when binder.forSale=false', async () => {
      const deps = makeDeps()
      const { addToBinder } = useDiscoveryAddCard('binders', deps)

      const result = await addToBinder(makePrint())

      expect(result.ok).toBe(true)
      expect(deps.collectionStore.addCard).toHaveBeenCalledWith(expect.objectContaining({
        status: 'collection',
      }))
      expect(deps.bindersStore.allocateCardToBinder).toHaveBeenCalledWith(
        'binder-1', 'card-new-1', 1
      )
    })

    it('adds with status=sale when binder.forSale=true', async () => {
      const deps = makeDeps({
        bindersStore: {
          allocateCardToBinder: vi.fn().mockResolvedValue(1),
          binders: ref([{ id: 'binder-1', forSale: true }]),
        },
      })
      const { addToBinder } = useDiscoveryAddCard('binders', deps)

      await addToBinder(makePrint())

      expect(deps.collectionStore.addCard).toHaveBeenCalledWith(expect.objectContaining({
        status: 'sale',
      }))
    })

    it('returns ok:false when no selectedBinderId', async () => {
      const deps = makeDeps()
      deps.selectedBinderId.value = undefined
      const { addToBinder } = useDiscoveryAddCard('binders', deps)

      const result = await addToBinder(makePrint())

      expect(result.ok).toBe(false)
      expect(deps.toastStore.show).toHaveBeenCalled()
    })

    it('returns ok:false when allocation returns 0 (no available copies)', async () => {
      const deps = makeDeps()
      deps.bindersStore.allocateCardToBinder = vi.fn().mockResolvedValue(0)
      const { addToBinder } = useDiscoveryAddCard('binders', deps)

      const result = await addToBinder(makePrint())

      expect(result.ok).toBe(false)
    })
  })

  describe('addToCollection (scope: collection)', () => {
    it('adds with given status, no allocation', async () => {
      const deps = makeDeps()
      const { addToCollection } = useDiscoveryAddCard('collection', deps)

      const result = await addToCollection(makePrint(), 'wishlist')

      expect(result.ok).toBe(true)
      expect(deps.collectionStore.addCard).toHaveBeenCalledWith(expect.objectContaining({
        status: 'wishlist',
        quantity: 1,
        condition: 'NM',
        foil: false,
      }))
      expect(deps.decksStore.allocateCardToDeck).not.toHaveBeenCalled()
      expect(deps.bindersStore.allocateCardToBinder).not.toHaveBeenCalled()
    })

    it('supports sale, trade, collection statuses', async () => {
      const deps = makeDeps()
      const { addToCollection } = useDiscoveryAddCard('collection', deps)

      await addToCollection(makePrint(), 'sale')
      await addToCollection(makePrint(), 'trade')
      await addToCollection(makePrint(), 'collection')

      expect(deps.collectionStore.addCard).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: 'sale' }))
      expect(deps.collectionStore.addCard).toHaveBeenNthCalledWith(2, expect.objectContaining({ status: 'trade' }))
      expect(deps.collectionStore.addCard).toHaveBeenNthCalledWith(3, expect.objectContaining({ status: 'collection' }))
    })
  })

  describe('ScryfallCard → Card mapping', () => {
    it('uses price from prices.usd when numeric', async () => {
      const deps = makeDeps()
      const { addToCollection } = useDiscoveryAddCard('collection', deps)

      await addToCollection(makePrint({ prices: { usd: '1.75', usd_foil: null, eur: null } as never }), 'collection')

      expect(deps.collectionStore.addCard).toHaveBeenCalledWith(expect.objectContaining({
        price: 1.75,
      }))
    })

    it('defaults price to 0 when missing', async () => {
      const deps = makeDeps()
      const { addToCollection } = useDiscoveryAddCard('collection', deps)

      await addToCollection(makePrint({ prices: { usd: null } as never }), 'collection')

      expect(deps.collectionStore.addCard).toHaveBeenCalledWith(expect.objectContaining({
        price: 0,
      }))
    })

    it('uses image_uris.small for image', async () => {
      const deps = makeDeps()
      const { addToCollection } = useDiscoveryAddCard('collection', deps)

      await addToCollection(makePrint({ image_uris: { small: 'http://s.png', normal: 'n.png' } as never }), 'collection')

      expect(deps.collectionStore.addCard).toHaveBeenCalledWith(expect.objectContaining({
        image: 'http://s.png',
      }))
    })

    it('copies cmc, type_line, colors, rarity metadata', async () => {
      const deps = makeDeps()
      const { addToCollection } = useDiscoveryAddCard('collection', deps)

      await addToCollection(makePrint(), 'collection')

      expect(deps.collectionStore.addCard).toHaveBeenCalledWith(expect.objectContaining({
        cmc: 1,
        type_line: 'Instant',
        colors: ['R'],
        rarity: 'common',
      }))
    })
  })
})
