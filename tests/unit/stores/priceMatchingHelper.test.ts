import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'
import { usePriceMatchingStore } from '@/stores/priceMatchingHelper'
import { makeCard, makePreference } from '../helpers/fixtures'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('priceMatchingHelper', () => {
  // ─── calculateCompatibility ────────────────────────────────────────

  describe('calculateCompatibility', () => {
    it('returns 100 for equal values', () => {
      const store = usePriceMatchingStore()
      expect(store.calculateCompatibility(10, 10)).toBe(100)
    })

    it('returns 100 when both values are zero', () => {
      const store = usePriceMatchingStore()
      expect(store.calculateCompatibility(0, 0)).toBe(100)
    })

    it('returns 50 when first value is zero', () => {
      const store = usePriceMatchingStore()
      expect(store.calculateCompatibility(0, 10)).toBe(50)
    })

    it('returns 50 when second value is zero', () => {
      const store = usePriceMatchingStore()
      expect(store.calculateCompatibility(10, 0)).toBe(50)
    })

    it('returns ~90 for close values (10 vs 9)', () => {
      const store = usePriceMatchingStore()
      // diff ratio = (10-9)/10 = 0.1 → (1-0.1)*100 = 90
      expect(store.calculateCompatibility(10, 9)).toBe(90)
    })

    it('returns 10 for far apart values (100 vs 10)', () => {
      const store = usePriceMatchingStore()
      // diff ratio = (100-10)/100 = 0.9 → (1-0.9)*100 = 10
      expect(store.calculateCompatibility(100, 10)).toBe(10)
    })
  })

  // ─── calculateBidirectionalMatch ───────────────────────────────────

  describe('calculateBidirectionalMatch', () => {
    it('returns a valid match when both sides have cards the other wants', () => {
      const store = usePriceMatchingStore()

      const myCards = [makeCard({ id: 'c1', name: 'Lightning Bolt', price: 2, quantity: 3, status: 'trade' })]
      const myPrefs = [makePreference({ name: 'Counterspell', type: 'BUSCO', quantity: 1 })]
      const theirCards = [makeCard({ id: 'c2', name: 'Counterspell', price: 3, quantity: 2, status: 'trade' })]
      const theirPrefs = [makePreference({ name: 'Lightning Bolt', type: 'BUSCO', quantity: 2 })]

      const result = store.calculateBidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)

      expect(result).not.toBeNull()
      expect(result!.matchType).toBe('bidirectional')
      expect(result!.isValid).toBe(true)
      expect(result!.myCardsInfo).toHaveLength(1)
      expect(result!.myCardsInfo[0].name).toBe('Lightning Bolt')
      expect(result!.theirCardsInfo).toHaveLength(1)
      expect(result!.theirCardsInfo[0].name).toBe('Counterspell')
    })

    it('returns null when I have what they want but they lack what I want', () => {
      const store = usePriceMatchingStore()

      const myCards = [makeCard({ id: 'c1', name: 'Lightning Bolt', status: 'trade' })]
      const myPrefs = [makePreference({ name: 'Counterspell', type: 'BUSCO' })]
      const theirCards = [makeCard({ id: 'c2', name: 'Goblin Guide', status: 'trade' })]
      const theirPrefs = [makePreference({ name: 'Lightning Bolt', type: 'BUSCO' })]

      const result = store.calculateBidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)
      expect(result).toBeNull()
    })

    it('returns null when they have what I want but I lack what they want', () => {
      const store = usePriceMatchingStore()

      const myCards = [makeCard({ id: 'c1', name: 'Goblin Guide', status: 'trade' })]
      const myPrefs = [makePreference({ name: 'Counterspell', type: 'BUSCO' })]
      const theirCards = [makeCard({ id: 'c2', name: 'Counterspell', status: 'trade', quantity: 2 })]
      const theirPrefs = [makePreference({ name: 'Lightning Bolt', type: 'BUSCO' })]

      const result = store.calculateBidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)
      expect(result).toBeNull()
    })

    it('returns null when no cards match on either side', () => {
      const store = usePriceMatchingStore()

      const myCards = [makeCard({ id: 'c1', name: 'Llanowar Elves', status: 'collection' })]
      const myPrefs = [makePreference({ name: 'Brainstorm', type: 'BUSCO' })]
      const theirCards = [makeCard({ id: 'c2', name: 'Mountain', status: 'collection' })]
      const theirPrefs = [makePreference({ name: 'Opt', type: 'BUSCO' })]

      const result = store.calculateBidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)
      expect(result).toBeNull()
    })

    it('excludes wishlist cards from my offering', () => {
      const store = usePriceMatchingStore()

      const myCards = [makeCard({ id: 'c1', name: 'Lightning Bolt', status: 'wishlist' })]
      const myPrefs = [makePreference({ name: 'Counterspell', type: 'BUSCO' })]
      const theirCards = [makeCard({ id: 'c2', name: 'Counterspell', status: 'trade', quantity: 1 })]
      const theirPrefs = [makePreference({ name: 'Lightning Bolt', type: 'BUSCO' })]

      const result = store.calculateBidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)
      expect(result).toBeNull()
    })

    it('limits match quantity to the minimum of wanted vs owned', () => {
      const store = usePriceMatchingStore()

      const myCards = [makeCard({ id: 'c1', name: 'Lightning Bolt', quantity: 4, price: 2, status: 'trade' })]
      const myPrefs = [makePreference({ name: 'Counterspell', type: 'BUSCO', quantity: 1 })]
      const theirCards = [makeCard({ id: 'c2', name: 'Counterspell', quantity: 3, price: 3, status: 'trade' })]
      const theirPrefs = [makePreference({ name: 'Lightning Bolt', type: 'BUSCO', quantity: 2 })]

      const result = store.calculateBidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)

      expect(result).not.toBeNull()
      // They want 2, I have 4 → match qty = 2
      expect(result!.myCardsInfo[0].quantity).toBe(2)
      // I want 1, they have 3 → match qty = 1
      expect(result!.theirCardsInfo[0].quantity).toBe(1)
    })

    it('limits match quantity when I BUSCO more than they have', () => {
      const store = usePriceMatchingStore()

      const myCards = [makeCard({ id: 'c1', name: 'Lightning Bolt', quantity: 4, price: 1, status: 'trade' })]
      const myPrefs = [makePreference({ name: 'Counterspell', type: 'BUSCO', quantity: 4 })]
      const theirCards = [makeCard({ id: 'c2', name: 'Counterspell', quantity: 2, price: 1, status: 'trade' })]
      const theirPrefs = [makePreference({ name: 'Lightning Bolt', type: 'BUSCO', quantity: 1 })]

      const result = store.calculateBidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)

      expect(result).not.toBeNull()
      // I want 4, they have 2 → match qty = 2
      expect(result!.theirCardsInfo[0].quantity).toBe(2)
    })

    it('matches case-insensitively', () => {
      const store = usePriceMatchingStore()

      const myCards = [makeCard({ id: 'c1', name: 'lightning bolt', status: 'trade', quantity: 1, price: 2 })]
      const myPrefs = [makePreference({ name: 'counterspell', type: 'BUSCO', quantity: 1 })]
      const theirCards = [makeCard({ id: 'c2', name: 'Counterspell', status: 'trade', quantity: 1, price: 3 })]
      const theirPrefs = [makePreference({ name: 'Lightning Bolt', type: 'BUSCO', quantity: 1 })]

      const result = store.calculateBidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)
      expect(result).not.toBeNull()
      expect(result!.myCardsInfo[0].name).toBe('lightning bolt')
      expect(result!.theirCardsInfo[0].name).toBe('Counterspell')
    })

    it('calculates total value from price * quantity', () => {
      const store = usePriceMatchingStore()

      const myCards = [makeCard({ id: 'c1', name: 'Lightning Bolt', price: 5, quantity: 4, status: 'trade' })]
      const myPrefs = [makePreference({ name: 'Counterspell', type: 'BUSCO', quantity: 3 })]
      const theirCards = [makeCard({ id: 'c2', name: 'Counterspell', price: 3, quantity: 3, status: 'trade' })]
      const theirPrefs = [makePreference({ name: 'Lightning Bolt', type: 'BUSCO', quantity: 2 })]

      const result = store.calculateBidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)

      expect(result).not.toBeNull()
      // They want 2 bolts, I have 4 → qty 2 × $5 = $10
      expect(result!.myTotalValue).toBe(10)
      // I want 3 counterspells, they have 3 → qty 3 × $3 = $9
      expect(result!.theirTotalValue).toBe(9)
    })

    it('returns compatibility 100 for equal total values', () => {
      const store = usePriceMatchingStore()

      const myCards = [makeCard({ id: 'c1', name: 'Lightning Bolt', price: 5, quantity: 2, status: 'trade' })]
      const myPrefs = [makePreference({ name: 'Counterspell', type: 'BUSCO', quantity: 2 })]
      const theirCards = [makeCard({ id: 'c2', name: 'Counterspell', price: 5, quantity: 2, status: 'trade' })]
      const theirPrefs = [makePreference({ name: 'Lightning Bolt', type: 'BUSCO', quantity: 2 })]

      const result = store.calculateBidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)

      expect(result).not.toBeNull()
      expect(result!.compatibility).toBe(100)
    })
  })

  // ─── calculateUnidirectionalMatch ──────────────────────────────────

  describe('calculateUnidirectionalMatch', () => {
    it('returns a valid match when I have what they BUSCO', () => {
      const store = usePriceMatchingStore()

      const myCards = [makeCard({ id: 'c1', name: 'Lightning Bolt', price: 2, quantity: 3, status: 'trade' })]
      const myPrefs: any[] = []
      const theirCards: any[] = []
      const theirPrefs = [makePreference({ name: 'Lightning Bolt', type: 'BUSCO', quantity: 1 })]

      const result = store.calculateUnidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)

      expect(result).not.toBeNull()
      expect(result!.matchType).toBe('unidirectional')
      expect(result!.myCardsInfo).toHaveLength(1)
      expect(result!.myCardsInfo[0].name).toBe('Lightning Bolt')
      expect(result!.theirCardsInfo).toHaveLength(0)
    })

    it('returns a valid match when they have what I BUSCO', () => {
      const store = usePriceMatchingStore()

      const myCards: any[] = []
      const myPrefs = [makePreference({ name: 'Counterspell', type: 'BUSCO', quantity: 1 })]
      const theirCards = [makeCard({ id: 'c2', name: 'Counterspell', price: 3, quantity: 2, status: 'trade' })]
      const theirPrefs: any[] = []

      const result = store.calculateUnidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)

      expect(result).not.toBeNull()
      expect(result!.matchType).toBe('unidirectional')
      expect(result!.theirCardsInfo).toHaveLength(1)
      expect(result!.theirCardsInfo[0].name).toBe('Counterspell')
      expect(result!.myCardsInfo).toHaveLength(0)
    })

    it('returns a valid match with both offerings when both sides match', () => {
      const store = usePriceMatchingStore()

      const myCards = [makeCard({ id: 'c1', name: 'Lightning Bolt', price: 2, quantity: 1, status: 'trade' })]
      const myPrefs = [makePreference({ name: 'Counterspell', type: 'BUSCO', quantity: 1 })]
      const theirCards = [makeCard({ id: 'c2', name: 'Counterspell', price: 3, quantity: 1, status: 'trade' })]
      const theirPrefs = [makePreference({ name: 'Lightning Bolt', type: 'BUSCO', quantity: 1 })]

      const result = store.calculateUnidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)

      expect(result).not.toBeNull()
      expect(result!.myCardsInfo).toHaveLength(1)
      expect(result!.theirCardsInfo).toHaveLength(1)
    })

    it('returns null when neither side matches', () => {
      const store = usePriceMatchingStore()

      const myCards = [makeCard({ id: 'c1', name: 'Llanowar Elves', status: 'collection' })]
      const myPrefs = [makePreference({ name: 'Brainstorm', type: 'BUSCO' })]
      const theirCards = [makeCard({ id: 'c2', name: 'Mountain', status: 'collection' })]
      const theirPrefs = [makePreference({ name: 'Opt', type: 'BUSCO' })]

      const result = store.calculateUnidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)
      expect(result).toBeNull()
    })

    it('excludes wishlist cards from my offering', () => {
      const store = usePriceMatchingStore()

      const myCards = [makeCard({ id: 'c1', name: 'Lightning Bolt', status: 'wishlist' })]
      const myPrefs: any[] = []
      const theirCards: any[] = []
      const theirPrefs = [makePreference({ name: 'Lightning Bolt', type: 'BUSCO' })]

      const result = store.calculateUnidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)
      expect(result).toBeNull()
    })

    it('skips cards with empty name', () => {
      const store = usePriceMatchingStore()

      const myCards = [makeCard({ id: 'c1', name: '', status: 'trade' })]
      const myPrefs: any[] = []
      const theirCards: any[] = []
      const theirPrefs = [makePreference({ name: '', type: 'BUSCO' })]

      const result = store.calculateUnidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)
      expect(result).toBeNull()
    })

    it('limits match quantity to minimum of wanted vs owned', () => {
      const store = usePriceMatchingStore()

      const myCards = [makeCard({ id: 'c1', name: 'Lightning Bolt', quantity: 4, price: 2, status: 'trade' })]
      const myPrefs: any[] = []
      const theirCards: any[] = []
      const theirPrefs = [makePreference({ name: 'Lightning Bolt', type: 'BUSCO', quantity: 2 })]

      const result = store.calculateUnidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)

      expect(result).not.toBeNull()
      // They want 2, I have 4 → qty = 2
      expect(result!.myCardsInfo[0].quantity).toBe(2)
      expect(result!.myTotalValue).toBe(4) // 2 × $2
    })

    it('matches case-insensitively', () => {
      const store = usePriceMatchingStore()

      const myCards = [makeCard({ id: 'c1', name: 'lightning bolt', quantity: 1, price: 2, status: 'trade' })]
      const myPrefs: any[] = []
      const theirCards: any[] = []
      const theirPrefs = [makePreference({ name: 'Lightning Bolt', type: 'BUSCO', quantity: 1 })]

      const result = store.calculateUnidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)
      expect(result).not.toBeNull()
      expect(result!.myCardsInfo[0].name).toBe('lightning bolt')
    })

    it('sets matchType to unidirectional', () => {
      const store = usePriceMatchingStore()

      const myCards = [makeCard({ id: 'c1', name: 'Lightning Bolt', status: 'trade', quantity: 1 })]
      const myPrefs: any[] = []
      const theirCards: any[] = []
      const theirPrefs = [makePreference({ name: 'Lightning Bolt', type: 'BUSCO', quantity: 1 })]

      const result = store.calculateUnidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)
      expect(result).not.toBeNull()
      expect(result!.matchType).toBe('unidirectional')
    })
  })
})
