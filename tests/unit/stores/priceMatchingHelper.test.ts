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

// ─── perf regression (bug report 2026-08-07: "the site is dead slow") ────────
//
// This helper runs once per CANDIDATE USER on the post-login landing, against the
// full collection (59k cards on a real account). Two costs were found:
//   1. a console.info block that filtered+mapped BOTH full collections four times
//      per call, unstripped in production;
//   2. a nested find/filter inside a loop over the collection, making the work
//      O(myCards x theirPreferences) + O(myPreferences x theirCards).

describe('perf: no debug logging in the hot path', () => {
  it('calculateBidirectionalMatch does not write to console.info', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const store = usePriceMatchingStore()

    store.calculateBidirectionalMatch(
      [makeCard({ id: 'm1', name: 'Sol Ring', status: 'trade', quantity: 1, price: 5 })],
      [makePreference({ name: 'Black Lotus', type: 'BUSCO', quantity: 1 })],
      [makeCard({ id: 't1', name: 'Black Lotus', status: 'trade', quantity: 1, price: 500 })],
      [makePreference({ name: 'Sol Ring', type: 'BUSCO', quantity: 1 })],
    )

    expect(infoSpy).not.toHaveBeenCalled()
  })
})

describe('perf: matching is indexed, not quadratic', () => {
  // Generous bound: a correct indexed implementation runs this in a few ms. The
  // quadratic version does ~30k x 300 = 9M case-insensitive comparisons per call,
  // each allocating two lowercased strings, and blows far past this.
  const BUDGET_MS = 1500

  function bigCollection(n: number, prefix: string) {
    return Array.from({ length: n }, (_, i) =>
      makeCard({ id: `${prefix}-${i}`, name: `${prefix} Card ${i}`, status: 'trade', quantity: 1, price: 1 }))
  }

  function manyPrefs(n: number, prefix: string) {
    return Array.from({ length: n }, (_, i) =>
      makePreference({ name: `${prefix} Card ${i}`, type: 'BUSCO', quantity: 1 }))
  }

  it('calculateBidirectionalMatch handles 30k cards x 300 preferences within budget', () => {
    const store = usePriceMatchingStore()
    const myCards = bigCollection(30_000, 'Mine')
    const theirCards = bigCollection(30_000, 'Theirs')
    const myPrefs = manyPrefs(300, 'Theirs')
    const theirPrefs = manyPrefs(300, 'Mine')

    const started = performance.now()
    const result = store.calculateBidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)
    const elapsed = performance.now() - started

    expect(result).not.toBeNull()
    expect(result!.myCardsInfo).toHaveLength(300)
    expect(result!.theirCardsInfo).toHaveLength(300)
    expect(elapsed).toBeLessThan(BUDGET_MS)
  })

  it('calculateUnidirectionalMatch handles 30k cards x 300 preferences within budget', () => {
    const store = usePriceMatchingStore()
    const myCards = bigCollection(30_000, 'Mine')
    const theirCards = bigCollection(30_000, 'Theirs')
    const myPrefs = manyPrefs(300, 'Theirs')
    const theirPrefs = manyPrefs(300, 'Mine')

    const started = performance.now()
    const result = store.calculateUnidirectionalMatch(myCards, myPrefs, theirCards, theirPrefs)
    const elapsed = performance.now() - started

    expect(result).not.toBeNull()
    expect(elapsed).toBeLessThan(BUDGET_MS)
  })
})

describe('indexing must preserve the existing matching semantics', () => {
  it('uses the FIRST matching BUSCO preference when several share a name', () => {
    const store = usePriceMatchingStore()
    const result = store.calculateBidirectionalMatch(
      [makeCard({ id: 'm1', name: 'Sol Ring', status: 'trade', quantity: 9, price: 5 })],
      [makePreference({ name: 'Black Lotus', type: 'BUSCO', quantity: 1 })],
      [makeCard({ id: 't1', name: 'Black Lotus', status: 'trade', quantity: 1, price: 500 })],
      [
        makePreference({ name: 'Sol Ring', type: 'BUSCO', quantity: 2 }),
        makePreference({ name: 'Sol Ring', type: 'BUSCO', quantity: 7 }),
      ],
    )
    // The first pref (qty 2) wins, not the second and not their sum.
    expect(result!.myCardsInfo).toHaveLength(1)
    expect(result!.myCardsInfo[0].quantity).toBe(2)
  })

  it('ignores a same-named preference whose type is not BUSCO', () => {
    const store = usePriceMatchingStore()
    const result = store.calculateBidirectionalMatch(
      [makeCard({ id: 'm1', name: 'Sol Ring', status: 'trade', quantity: 4, price: 5 })],
      [makePreference({ name: 'Black Lotus', type: 'BUSCO', quantity: 1 })],
      [makeCard({ id: 't1', name: 'Black Lotus', status: 'trade', quantity: 1, price: 500 })],
      [
        makePreference({ name: 'Sol Ring', type: 'VENDO', quantity: 1 }),
        makePreference({ name: 'Sol Ring', type: 'BUSCO', quantity: 3 }),
      ],
    )
    // The VENDO entry must not shadow the BUSCO one.
    expect(result!.myCardsInfo[0].quantity).toBe(3)
  })

  it('returns every printing they own of a card I want, in collection order', () => {
    const store = usePriceMatchingStore()
    const result = store.calculateBidirectionalMatch(
      [makeCard({ id: 'm1', name: 'Sol Ring', status: 'trade', quantity: 1, price: 5 })],
      [makePreference({ name: 'Black Lotus', type: 'BUSCO', quantity: 5 })],
      [
        makeCard({ id: 't1', name: 'Black Lotus', edition: 'Alpha', status: 'trade', quantity: 1, price: 500 }),
        makeCard({ id: 't2', name: 'Black Lotus', edition: 'Beta', status: 'wishlist', quantity: 1, price: 400 }),
        makeCard({ id: 't3', name: 'Black Lotus', edition: 'Unlimited', status: 'sale', quantity: 2, price: 300 }),
      ],
      [makePreference({ name: 'Sol Ring', type: 'BUSCO', quantity: 1 })],
    )
    // t2 is wishlist and must be excluded; order t1 then t3 must be preserved.
    expect(result!.theirCardsInfo.map(c => c.id)).toEqual(['t1', 't3'])
  })
})
