import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'
import { useExchangeCartStore } from '@/stores/exchangeCart'
import type { ExchangeCartItem } from '@/types/exchangeCart'

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

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
