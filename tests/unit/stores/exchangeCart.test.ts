import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'
import { useExchangeCartStore } from '@/stores/exchangeCart'
import type { ExchangeCartItem } from '@/types/exchangeCart'
import { getCardPrices } from '@/services/mtgjson'

vi.mock('@/services/mtgjson', () => ({
  getCardPrices: vi.fn(),
}))

const mockGetCardPrices = vi.mocked(getCardPrices)

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

// Flush the fire-and-forget CK lookup promise chain (addItem does not await it).
async function flushCKLookup() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

function makeItem(overrides: Partial<ExchangeCartItem> = {}): ExchangeCartItem {
  return {
    scryfallId: 'scry-1',
    cardId: 'card-1',
    name: 'Lightning Bolt',
    edition: 'M21',
    quantity: 1,
    maxQuantity: 4,
    condition: 'NM',
    foil: false,
    price: 1.5,
    image: 'https://example.com/bolt.jpg',
    status: 'collection',
    ...overrides,
  }
}

let mockStorage: Record<string, string> = {}

beforeEach(() => {
  mockStorage = {}
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => mockStorage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value }),
    removeItem: vi.fn((key: string) => { delete mockStorage[key] }),
    clear: vi.fn(() => { mockStorage = {} }),
    length: 0,
    key: vi.fn(() => null),
  })
  setActivePinia(createPinia())
  // Default: no CK data — keeps non-CK tests deterministic on the captured TCG price.
  mockGetCardPrices.mockReset()
  mockGetCardPrices.mockResolvedValue(null)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('exchangeCart store', () => {
  // ─── addItem ─────────────────────────────────────────────────────────

  describe('addItem', () => {
    it('adds a new item to a new cart', () => {
      const store = useExchangeCartStore()
      const item = makeItem()
      store.addItem('alice', item)

      const cart = store.getCart('alice')
      expect(cart).not.toBeNull()
      expect(cart!.items).toHaveLength(1)
      expect(cart!.items[0].name).toBe('Lightning Bolt')
      expect(cart!.username).toBe('alice')
    })

    it('creates cart with 7-day expiry', () => {
      const now = 1000000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem())

      const cart = store.getCart('alice')
      expect(cart!.createdAt).toBe(now)
      expect(cart!.expiresAt).toBe(now + SEVEN_DAYS)
    })

    it('increments quantity on duplicate (same scryfallId + cardId)', () => {
      const store = useExchangeCartStore()
      const item = makeItem({ quantity: 1, maxQuantity: 4 })
      store.addItem('alice', item)
      store.addItem('alice', item)

      const cart = store.getCart('alice')
      expect(cart!.items).toHaveLength(1)
      expect(cart!.items[0].quantity).toBe(2)
    })

    it('caps quantity at maxQuantity', () => {
      const store = useExchangeCartStore()
      const item = makeItem({ quantity: 1, maxQuantity: 2 })
      store.addItem('alice', item)
      store.addItem('alice', item)
      store.addItem('alice', item) // should not exceed 2

      const cart = store.getCart('alice')
      expect(cart!.items[0].quantity).toBe(2)
    })
  })

  // ─── removeItem ──────────────────────────────────────────────────────

  describe('removeItem', () => {
    it('removes an item by scryfallId + cardId', () => {
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem())
      store.removeItem('alice', 'scry-1', 'card-1')

      const cart = store.getCart('alice')
      expect(cart).toBeNull()
    })

    it('is a no-op if item not found', () => {
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem())
      store.removeItem('alice', 'nonexistent', 'nope')

      const cart = store.getCart('alice')
      expect(cart!.items).toHaveLength(1)
    })

    it('removes entire cart if last item is removed', () => {
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem())
      store.removeItem('alice', 'scry-1', 'card-1')

      expect(store.getCart('alice')).toBeNull()
    })
  })

  // ─── updateItemQuantity ──────────────────────────────────────────────

  describe('updateItemQuantity', () => {
    it('updates the quantity of an item', () => {
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem({ maxQuantity: 4 }))
      store.updateItemQuantity('alice', 'scry-1', 'card-1', 3)

      const cart = store.getCart('alice')
      expect(cart!.items[0].quantity).toBe(3)
    })

    it('clamps quantity to maxQuantity', () => {
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem({ maxQuantity: 4 }))
      store.updateItemQuantity('alice', 'scry-1', 'card-1', 10)

      const cart = store.getCart('alice')
      expect(cart!.items[0].quantity).toBe(4)
    })

    it('clamps quantity to minimum of 1', () => {
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem())
      store.updateItemQuantity('alice', 'scry-1', 'card-1', -5)

      const cart = store.getCart('alice')
      expect(cart!.items[0].quantity).toBe(1)
    })

    it('removes item if quantity is set to 0', () => {
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem())
      store.updateItemQuantity('alice', 'scry-1', 'card-1', 0)

      expect(store.getCart('alice')).toBeNull()
    })
  })

  // ─── getCart ─────────────────────────────────────────────────────────

  describe('getCart', () => {
    it('returns the cart for a given username', () => {
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem())

      const cart = store.getCart('alice')
      expect(cart).not.toBeNull()
      expect(cart!.username).toBe('alice')
    })

    it('returns null if cart does not exist', () => {
      const store = useExchangeCartStore()
      expect(store.getCart('nobody')).toBeNull()
    })

    it('returns null and cleans up if cart is expired', () => {
      const now = 1000000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem())

      // Advance time past expiry
      vi.spyOn(Date, 'now').mockReturnValue(now + SEVEN_DAYS + 1)
      expect(store.getCart('alice')).toBeNull()
    })
  })

  // ─── getCartItemCount ────────────────────────────────────────────────

  describe('getCartItemCount', () => {
    it('returns total distinct items in cart', () => {
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem({ scryfallId: 'a', cardId: '1' }))
      store.addItem('alice', makeItem({ scryfallId: 'b', cardId: '2' }))

      expect(store.getCartItemCount('alice')).toBe(2)
    })

    it('returns 0 for empty or missing cart', () => {
      const store = useExchangeCartStore()
      expect(store.getCartItemCount('nobody')).toBe(0)
    })
  })

  // ─── getCartTotalValue ───────────────────────────────────────────────

  describe('getCartTotalValue', () => {
    it('returns sum of price * quantity for all items', () => {
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem({ scryfallId: 'a', cardId: '1', price: 2, quantity: 3, maxQuantity: 5 }))
      store.addItem('alice', makeItem({ scryfallId: 'b', cardId: '2', price: 5, quantity: 1, maxQuantity: 5 }))

      // 2*3 + 5*1 = 11
      expect(store.getCartTotalValue('alice')).toBe(11)
    })

    it('returns 0 for empty or missing cart', () => {
      const store = useExchangeCartStore()
      expect(store.getCartTotalValue('nobody')).toBe(0)
    })

    it('handles items with price 0', () => {
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem({ price: 0, quantity: 3 }))

      expect(store.getCartTotalValue('alice')).toBe(0)
    })
  })

  // ─── clearCart ───────────────────────────────────────────────────────

  describe('clearCart', () => {
    it('removes the cart for a username', () => {
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem())
      store.clearCart('alice')

      expect(store.getCart('alice')).toBeNull()
    })

    it('persists the removal to localStorage', () => {
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem())
      store.clearCart('alice')

      const stored = JSON.parse(mockStorage['cranial_exchange_carts'] || '{}')
      expect(stored.carts['alice']).toBeUndefined()
    })
  })

  // ─── isItemInCart ────────────────────────────────────────────────────

  describe('isItemInCart', () => {
    it('returns true if item exists in cart', () => {
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem({ scryfallId: 'a', cardId: '1' }))

      expect(store.isItemInCart('alice', 'a', '1')).toBe(true)
    })

    it('returns false if item does not exist', () => {
      const store = useExchangeCartStore()
      expect(store.isItemInCart('alice', 'a', '1')).toBe(false)
    })
  })

  // ─── localStorage persistence ────────────────────────────────────────

  describe('localStorage persistence', () => {
    it('saves to localStorage on every mutation', () => {
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem())

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'cranial_exchange_carts',
        expect.any(String)
      )
    })

    it('loads from localStorage on init', () => {
      const now = Date.now()
      const preloaded = {
        carts: {
          alice: {
            username: 'alice',
            items: [makeItem()],
            createdAt: now,
            expiresAt: now + SEVEN_DAYS,
          },
        },
      }
      mockStorage['cranial_exchange_carts'] = JSON.stringify(preloaded)

      // New pinia + store should load from localStorage
      setActivePinia(createPinia())
      const store = useExchangeCartStore()
      const cart = store.getCart('alice')
      expect(cart).not.toBeNull()
      expect(cart!.items).toHaveLength(1)
    })

    it('handles corrupted localStorage data gracefully', () => {
      mockStorage['cranial_exchange_carts'] = 'not-valid-json'

      setActivePinia(createPinia())
      const store = useExchangeCartStore()
      // Should not throw, should start with empty carts
      expect(store.getCart('alice')).toBeNull()
    })
  })

  // ─── CK reference-price lookup (TASK-119, REVERTIDO por TASK-298) ────
  //
  // TASK-119 hacía que este lookup PISARA item.price ("el carrito es efímero
  // y el monto es indicativo"). TASK-298 (wargaming 2026-09-15, WG-008) mató
  // esa premisa: el carrito persiste un BuyRequest real sobre el que el
  // vendedor actúa (fulfillRequest descuenta inventario), así que el precio
  // de la transacción tiene que ser SIEMPRE el que el vendedor publicó. El
  // retail de CK ahora solo puebla el campo aparte y rotulado
  // `ckReferencePrice` — nunca `item.price`. Ver docs/DECISIONES-DE-PRODUCTO.md.

  describe('CK reference-price lookup (item.price nunca se pisa — TASK-298)', () => {
    it('captures the seller price immediately, before the CK lookup resolves', () => {
      // Never-resolving lookup — proves addItem does not await it.
      mockGetCardPrices.mockReturnValue(new Promise(() => {}))
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem({ price: 3.5 }))

      const cart = store.getCart('alice')
      expect(cart!.items[0].price).toBe(3.5)
    })

    // AC2 + AC1 (equivalente determinista): el precio de la línea del
    // carrito nunca cambia solo — ni en t=0 ni después de que el lookup CK
    // resuelve. Hoy (bug) esto reddena: priceAfterResolve queda en 9.99.
    it('AC1/AC2: el precio de la línea NO cambia solo entre t=0 y post-resolución del lookup CK', async () => {
      mockGetCardPrices.mockResolvedValue({
        cardKingdom: { retail: 9.99, retailFoil: null, buylist: null, buylistFoil: null },
      })
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem({ price: 3.5, quantity: 2, maxQuantity: 5 }))

      const priceAtT0 = store.getCart('alice')!.items[0].price
      await flushCKLookup()
      const priceAfterResolve = store.getCart('alice')!.items[0].price

      expect(priceAtT0).toBe(3.5)
      expect(priceAfterResolve).toBe(3.5)
      expect(store.getCartTotalValue('alice')).toBe(7) // 3.5 * 2, nunca 9.99 * 2
    })

    it('AC4: guarda el retail de CK en el campo aparte ckReferencePrice, sin tocar item.price', async () => {
      mockGetCardPrices.mockResolvedValue({
        cardKingdom: { retail: 9.99, retailFoil: null, buylist: null, buylistFoil: null },
      })
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem({ price: 3.5 }))
      await flushCKLookup()

      const item = store.getCart('alice')!.items[0]
      expect(item.price).toBe(3.5)
      expect(item.ckReferencePrice).toBe(9.99)
    })

    it('passes setCode through to getCardPrices for the CK lookup', async () => {
      mockGetCardPrices.mockResolvedValue(null)
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem({ scryfallId: 'scry-9' }), 'MH2')
      await flushCKLookup()

      expect(mockGetCardPrices).toHaveBeenCalledWith('scry-9', 'MH2')
    })

    it('leaves ckReferencePrice unset when CK has no data for the card (returns null)', async () => {
      mockGetCardPrices.mockResolvedValue(null)
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem({ price: 3.5 }))
      await flushCKLookup()

      const item = store.getCart('alice')!.items[0]
      expect(item.price).toBe(3.5)
      expect(item.ckReferencePrice).toBeUndefined()
    })

    it('leaves ckReferencePrice unset when the CK lookup rejects', async () => {
      mockGetCardPrices.mockRejectedValue(new Error('network down'))
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem({ price: 3.5 }))
      await flushCKLookup()

      const item = store.getCart('alice')!.items[0]
      expect(item.price).toBe(3.5)
      expect(item.ckReferencePrice).toBeUndefined()
    })

    it('leaves ckReferencePrice unset when CK retail is null for that print', async () => {
      mockGetCardPrices.mockResolvedValue({
        cardKingdom: { retail: null, retailFoil: null, buylist: null, buylistFoil: null },
      })
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem({ price: 3.5 }))
      await flushCKLookup()

      const item = store.getCart('alice')!.items[0]
      expect(item.price).toBe(3.5)
      expect(item.ckReferencePrice).toBeUndefined()
    })

    it('prefers CK retailFoil for foil items when populating ckReferencePrice', async () => {
      mockGetCardPrices.mockResolvedValue({
        cardKingdom: { retail: 5, retailFoil: 12.5, buylist: null, buylistFoil: null },
      })
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem({ foil: true, price: 3.5 }))
      await flushCKLookup()

      const item = store.getCart('alice')!.items[0]
      expect(item.price).toBe(3.5)
      expect(item.ckReferencePrice).toBe(12.5)
    })

    it('leaves ckReferencePrice unset for foil items when retailFoil is unavailable (does not fall back to non-foil retail)', async () => {
      mockGetCardPrices.mockResolvedValue({
        cardKingdom: { retail: 5, retailFoil: null, buylist: null, buylistFoil: null },
      })
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem({ foil: true, price: 3.5 }))
      await flushCKLookup()

      const item = store.getCart('alice')!.items[0]
      expect(item.price).toBe(3.5)
      expect(item.ckReferencePrice).toBeUndefined()
    })

    it('leaves ckReferencePrice unset when CK retail resolves to 0', async () => {
      mockGetCardPrices.mockResolvedValue({
        cardKingdom: { retail: 0, retailFoil: null, buylist: null, buylistFoil: null },
      })
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem({ price: 3.5 }))
      await flushCKLookup()

      const item = store.getCart('alice')!.items[0]
      expect(item.price).toBe(3.5)
      expect(item.ckReferencePrice).toBeUndefined()
    })

    it('does not resurrect an item removed from the cart before the lookup resolves', async () => {
      let resolveLookup: (value: unknown) => void = () => {}
      mockGetCardPrices.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve }))
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem({ price: 3.5 }))
      store.removeItem('alice', 'scry-1', 'card-1')

      resolveLookup({ cardKingdom: { retail: 9.99, retailFoil: null, buylist: null, buylistFoil: null } })
      await flushCKLookup()

      expect(store.getCart('alice')).toBeNull()
    })
  })

  // ─── cleanExpiredCarts ───────────────────────────────────────────────

  describe('cleanExpiredCarts', () => {
    it('removes carts older than 7 days', () => {
      const now = 1000000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem())

      // Advance past expiry
      vi.spyOn(Date, 'now').mockReturnValue(now + SEVEN_DAYS + 1)
      store.cleanExpiredCarts()

      // Bypass getCart's own expiry check — directly check internal state
      expect(store.getCartItemCount('alice')).toBe(0)
    })

    it('keeps valid (non-expired) carts', () => {
      const now = 1000000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      const store = useExchangeCartStore()
      store.addItem('alice', makeItem())

      // Still within 7-day window
      vi.spyOn(Date, 'now').mockReturnValue(now + SEVEN_DAYS - 1)
      store.cleanExpiredCarts()

      expect(store.getCart('alice')).not.toBeNull()
    })
  })
})
