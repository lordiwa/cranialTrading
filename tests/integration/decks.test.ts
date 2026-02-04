/**
 * Integration Tests - Deck System
 *
 * Tests deck functionality:
 * 1. CRUD operations (create, read, update, delete)
 * 2. Card allocations to decks
 * 3. Wishlist management
 * 4. Stats calculation
 *
 * Run with: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  TEST_USERS,
  initFirebase,
  loginAs,
  logout,
  validateTestCredentials,
  addCardToCollection,
  deleteCard,
  getUserCards,
  getDb,
} from './testHelpers'
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore'

// Validate credentials before running tests
validateTestCredentials()

// ============ DECK HELPERS ============

interface TestDeck {
  id?: string
  name: string
  format: string
  description?: string
  colors?: string[]
  commander?: string
  allocations?: any[]
  wishlist?: any[]
  isPublic?: boolean
}

async function createDeck(userId: string, deck: TestDeck): Promise<string> {
  const db = getDb()
  const decksRef = collection(db, 'users', userId, 'decks')

  const docRef = await addDoc(decksRef, {
    name: deck.name,
    format: deck.format,
    description: deck.description || '',
    colors: deck.colors || [],
    commander: deck.commander || '',
    allocations: deck.allocations || [],
    wishlist: deck.wishlist || [],
    isPublic: deck.isPublic ?? false,
    thumbnail: '',
    stats: {
      totalCards: 0,
      sideboardCards: 0,
      ownedCards: 0,
      wishlistCards: 0,
      avgPrice: 0,
      totalPrice: 0,
      completionPercentage: 100,
    },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })

  return docRef.id
}

async function getDeck(userId: string, deckId: string): Promise<TestDeck | null> {
  const db = getDb()
  const deckDoc = await getDoc(doc(db, 'users', userId, 'decks', deckId))
  if (!deckDoc.exists()) return null
  return { id: deckDoc.id, ...deckDoc.data() } as TestDeck
}

async function getUserDecks(userId: string): Promise<TestDeck[]> {
  const db = getDb()
  const decksRef = collection(db, 'users', userId, 'decks')
  const snapshot = await getDocs(decksRef)
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TestDeck))
}

async function deleteDeck(userId: string, deckId: string): Promise<void> {
  const db = getDb()
  await deleteDoc(doc(db, 'users', userId, 'decks', deckId))
}

async function updateDeckAllocations(userId: string, deckId: string, allocations: any[]): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, 'users', userId, 'decks', deckId), {
    allocations,
    updatedAt: Timestamp.now(),
  })
}

async function updateDeckWishlist(userId: string, deckId: string, wishlist: any[]): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, 'users', userId, 'decks', deckId), {
    wishlist,
    updatedAt: Timestamp.now(),
  })
}

async function clearTestDecks(userId: string): Promise<void> {
  const decks = await getUserDecks(userId)
  for (const deck of decks) {
    if (deck.name?.startsWith('TEST_')) {
      await deleteDeck(userId, deck.id!)
    }
  }
}

// ============ TESTS ============

describe('Deck System Integration Tests', () => {
  let userAId: string

  beforeAll(async () => {
    console.log('\n🚀 Initializing Firebase for deck tests...')
    initFirebase()

    const userAResult = await loginAs('userA')
    userAId = userAResult.userId
    console.log(`   User A: ${userAId}`)
    await logout()
  })

  beforeEach(async () => {
    console.log('\n🧹 Cleaning up test data...')
    await loginAs('userA')
    await clearTestDecks(userAId)
    // Clean test cards
    const cards = await getUserCards(userAId)
    for (const card of cards) {
      if (card.name?.startsWith('TEST_')) {
        await deleteCard(userAId, card.id!)
      }
    }
    await logout()
  })

  afterAll(async () => {
    console.log('\n🧹 Final cleanup...')
    try {
      await loginAs('userA')
      await clearTestDecks(userAId)
      await logout()
    } catch { /* ignore */ }
  })

  describe('Deck CRUD Operations', () => {
    it('should create a deck', async () => {
      console.log('\n📝 Test: Create deck')

      await loginAs('userA')

      const deckId = await createDeck(userAId, {
        name: 'TEST_Modern Burn',
        format: 'modern',
        description: 'Fast aggro deck',
        colors: ['R'],
      })

      expect(deckId).toBeTruthy()
      console.log(`   ✅ Created deck: ${deckId}`)

      const deck = await getDeck(userAId, deckId)
      expect(deck).toBeDefined()
      expect(deck?.name).toBe('TEST_Modern Burn')
      expect(deck?.format).toBe('modern')
      expect(deck?.colors).toContain('R')
      console.log(`   ✅ Deck retrieved successfully`)

      await logout()
    })

    it('should update a deck', async () => {
      console.log('\n📝 Test: Update deck')

      await loginAs('userA')

      const deckId = await createDeck(userAId, {
        name: 'TEST_Draft Deck',
        format: 'standard',
      })

      // Update the deck
      const db = getDb()
      await updateDoc(doc(db, 'users', userAId, 'decks', deckId), {
        name: 'TEST_Updated Deck',
        format: 'commander',
        colors: ['U', 'B'],
        updatedAt: Timestamp.now(),
      })

      const deck = await getDeck(userAId, deckId)
      expect(deck?.name).toBe('TEST_Updated Deck')
      expect(deck?.format).toBe('commander')
      expect(deck?.colors).toEqual(['U', 'B'])
      console.log(`   ✅ Deck updated successfully`)

      await logout()
    })

    it('should delete a deck', async () => {
      console.log('\n📝 Test: Delete deck')

      await loginAs('userA')

      const deckId = await createDeck(userAId, {
        name: 'TEST_To Delete',
        format: 'vintage',
      })
      console.log(`   ✅ Created deck: ${deckId}`)

      await deleteDeck(userAId, deckId)
      console.log(`   🗑️ Deleted deck`)

      const deck = await getDeck(userAId, deckId)
      expect(deck).toBeNull()
      console.log(`   ✅ Deletion verified`)

      await logout()
    })

    it('should handle multiple decks', async () => {
      console.log('\n📝 Test: Multiple decks')

      await loginAs('userA')

      const formats = ['modern', 'commander', 'standard', 'vintage']
      for (const format of formats) {
        await createDeck(userAId, {
          name: `TEST_${format.charAt(0).toUpperCase() + format.slice(1)} Deck`,
          format,
        })
      }

      const decks = await getUserDecks(userAId)
      const testDecks = decks.filter(d => d.name?.startsWith('TEST_'))

      expect(testDecks.length).toBeGreaterThanOrEqual(4)
      console.log(`   ✅ Created ${testDecks.length} test decks`)

      await logout()
    })
  })

  describe('Card Allocations', () => {
    it('should allocate a card to a deck', async () => {
      console.log('\n📝 Test: Allocate card to deck')

      await loginAs('userA')

      // Create a card in collection
      const cardId = await addCardToCollection(userAId, {
        scryfallId: 'test-bolt-123',
        name: 'TEST_Lightning Bolt',
        edition: 'M21',
        quantity: 4,
        condition: 'NM',
        foil: false,
        status: 'collection',
        price: 2.50,
      })
      console.log(`   ✅ Created card: ${cardId}`)

      // Create a deck
      const deckId = await createDeck(userAId, {
        name: 'TEST_Burn Deck',
        format: 'modern',
      })
      console.log(`   ✅ Created deck: ${deckId}`)

      // Allocate card to deck
      const allocation = {
        cardId,
        quantity: 4,
        isInSideboard: false,
        addedAt: Timestamp.now(),
      }
      await updateDeckAllocations(userAId, deckId, [allocation])
      console.log(`   📦 Allocated 4x Lightning Bolt to deck`)

      // Verify allocation
      const deck = await getDeck(userAId, deckId)
      expect(deck?.allocations?.length).toBe(1)
      expect(deck?.allocations?.[0].cardId).toBe(cardId)
      expect(deck?.allocations?.[0].quantity).toBe(4)
      console.log(`   ✅ Allocation verified`)

      await logout()
    })

    it('should allocate cards to sideboard', async () => {
      console.log('\n📝 Test: Allocate card to sideboard')

      await loginAs('userA')

      const cardId = await addCardToCollection(userAId, {
        scryfallId: 'test-rip-123',
        name: 'TEST_Rest in Peace',
        edition: 'RTR',
        quantity: 3,
        condition: 'NM',
        foil: false,
        status: 'collection',
        price: 5.00,
      })

      const deckId = await createDeck(userAId, {
        name: 'TEST_Control Deck',
        format: 'modern',
      })

      // Allocate to sideboard
      const allocation = {
        cardId,
        quantity: 2,
        isInSideboard: true,
        addedAt: Timestamp.now(),
      }
      await updateDeckAllocations(userAId, deckId, [allocation])

      const deck = await getDeck(userAId, deckId)
      expect(deck?.allocations?.[0].isInSideboard).toBe(true)
      console.log(`   ✅ Sideboard allocation verified`)

      await logout()
    })

    it('should handle multiple allocations in one deck', async () => {
      console.log('\n📝 Test: Multiple allocations')

      await loginAs('userA')

      // Create multiple cards
      const card1Id = await addCardToCollection(userAId, {
        scryfallId: 'test-card1-123',
        name: 'TEST_Card One',
        edition: 'M21',
        quantity: 4,
        condition: 'NM',
        foil: false,
        status: 'collection',
        price: 1.00,
      })

      const card2Id = await addCardToCollection(userAId, {
        scryfallId: 'test-card2-123',
        name: 'TEST_Card Two',
        edition: 'M21',
        quantity: 4,
        condition: 'NM',
        foil: false,
        status: 'collection',
        price: 2.00,
      })

      const deckId = await createDeck(userAId, {
        name: 'TEST_Multi Card Deck',
        format: 'standard',
      })

      // Allocate both cards
      const allocations = [
        { cardId: card1Id, quantity: 4, isInSideboard: false, addedAt: Timestamp.now() },
        { cardId: card2Id, quantity: 4, isInSideboard: false, addedAt: Timestamp.now() },
      ]
      await updateDeckAllocations(userAId, deckId, allocations)

      const deck = await getDeck(userAId, deckId)
      expect(deck?.allocations?.length).toBe(2)
      console.log(`   ✅ Multiple allocations (${deck?.allocations?.length} cards) verified`)

      await logout()
    })
  })

  describe('Wishlist Management', () => {
    it('should add card to deck wishlist', async () => {
      console.log('\n📝 Test: Add card to deck wishlist')

      await loginAs('userA')

      const deckId = await createDeck(userAId, {
        name: 'TEST_Wishlist Deck',
        format: 'commander',
      })

      // Add wishlist item (card user doesn't own yet)
      const wishlistItem = {
        scryfallId: 'test-lotus-123',
        name: 'Black Lotus',
        edition: 'LEA',
        quantity: 1,
        isInSideboard: false,
        price: 100000,
        image: 'https://example.com/lotus.jpg',
        condition: 'NM',
        foil: false,
        addedAt: Timestamp.now(),
      }
      await updateDeckWishlist(userAId, deckId, [wishlistItem])

      const deck = await getDeck(userAId, deckId)
      expect(deck?.wishlist?.length).toBe(1)
      expect(deck?.wishlist?.[0].name).toBe('Black Lotus')
      console.log(`   ✅ Wishlist item added`)

      await logout()
    })

    it('should handle mixed allocations and wishlist', async () => {
      console.log('\n📝 Test: Mixed allocations and wishlist')

      await loginAs('userA')

      // Card user owns
      const ownedCardId = await addCardToCollection(userAId, {
        scryfallId: 'test-owned-123',
        name: 'TEST_Owned Card',
        edition: 'M21',
        quantity: 2,
        condition: 'NM',
        foil: false,
        status: 'collection',
        price: 5.00,
      })

      const deckId = await createDeck(userAId, {
        name: 'TEST_Mixed Deck',
        format: 'modern',
      })

      // Add allocation (owned)
      await updateDeckAllocations(userAId, deckId, [
        { cardId: ownedCardId, quantity: 2, isInSideboard: false, addedAt: Timestamp.now() },
      ])

      // Add wishlist (not owned)
      await updateDeckWishlist(userAId, deckId, [
        {
          scryfallId: 'test-wanted-123',
          name: 'Wanted Card',
          edition: 'MH2',
          quantity: 4,
          isInSideboard: false,
          price: 50.00,
          condition: 'NM',
          foil: false,
          addedAt: Timestamp.now(),
        },
      ])

      const deck = await getDeck(userAId, deckId)
      expect(deck?.allocations?.length).toBe(1)
      expect(deck?.wishlist?.length).toBe(1)
      console.log(`   ✅ Mixed deck: ${deck?.allocations?.length} owned, ${deck?.wishlist?.length} wishlist`)

      await logout()
    })
  })

  describe('Deck Formats', () => {
    it('should support all deck formats', async () => {
      console.log('\n📝 Test: All deck formats')

      await loginAs('userA')

      const formats = ['vintage', 'modern', 'commander', 'standard', 'custom']

      for (const format of formats) {
        const deckId = await createDeck(userAId, {
          name: `TEST_${format} Format`,
          format,
        })
        const deck = await getDeck(userAId, deckId)
        expect(deck?.format).toBe(format)
      }

      console.log(`   ✅ All ${formats.length} formats supported`)

      await logout()
    })
  })
})

describe('Deck Smoke Tests', () => {
  it('should have Firestore access for decks', async () => {
    console.log('\n🔥 Smoke: Firestore deck access')
    initFirebase()

    const { userId } = await loginAs('userA')
    const decks = await getUserDecks(userId)
    expect(Array.isArray(decks)).toBe(true)
    console.log(`   ✅ Can read decks collection (${decks.length} decks)`)

    await logout()
  })
})
