/**
 * Integration Tests - Deck & Binder Deletion with Card Cleanup
 *
 * Tests that deleting a deck or binder can also delete
 * the associated cards from the collection.
 *
 * Run with: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
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
  deleteDoc,
  Timestamp,
} from 'firebase/firestore'

// Validate credentials before running tests
validateTestCredentials()

// ============ HELPERS ============

interface TestDeck {
  id?: string
  name: string
  format: string
  allocations?: any[]
  wishlist?: any[]
}

interface TestBinder {
  id?: string
  name: string
  description?: string
  allocations?: any[]
}

async function createDeck(userId: string, deck: TestDeck): Promise<string> {
  const db = getDb()
  const decksRef = collection(db, 'users', userId, 'decks')

  const docRef = await addDoc(decksRef, {
    name: deck.name,
    format: deck.format,
    description: '',
    colors: [],
    commander: '',
    allocations: deck.allocations || [],
    wishlist: deck.wishlist || [],
    isPublic: false,
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

async function deleteDeck(userId: string, deckId: string): Promise<void> {
  const db = getDb()
  await deleteDoc(doc(db, 'users', userId, 'decks', deckId))
}

async function createBinder(userId: string, binder: TestBinder): Promise<string> {
  const db = getDb()
  const bindersRef = collection(db, 'users', userId, 'binders')

  const docRef = await addDoc(bindersRef, {
    name: binder.name,
    description: binder.description || '',
    allocations: binder.allocations || [],
    thumbnail: '',
    stats: { totalCards: 0, totalPrice: 0 },
    isPublic: true,
    forSale: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })

  return docRef.id
}

async function getBinder(userId: string, binderId: string): Promise<TestBinder | null> {
  const db = getDb()
  const binderDoc = await getDoc(doc(db, 'users', userId, 'binders', binderId))
  if (!binderDoc.exists()) return null
  return { id: binderDoc.id, ...binderDoc.data() } as TestBinder
}

async function deleteBinder(userId: string, binderId: string): Promise<void> {
  const db = getDb()
  await deleteDoc(doc(db, 'users', userId, 'binders', binderId))
}

async function getCard(userId: string, cardId: string): Promise<any | null> {
  const db = getDb()
  const cardDoc = await getDoc(doc(db, 'users', userId, 'cards', cardId))
  if (!cardDoc.exists()) return null
  return { id: cardDoc.id, ...cardDoc.data() }
}

async function cleanupTestData(userId: string): Promise<void> {
  const db = getDb()

  // Clean test decks
  const decksRef = collection(db, 'users', userId, 'decks')
  const decksSnap = await getDocs(decksRef)
  for (const d of decksSnap.docs) {
    if (d.data().name?.startsWith('TEST_DEL_')) {
      await deleteDoc(d.ref)
    }
  }

  // Clean test binders
  const bindersRef = collection(db, 'users', userId, 'binders')
  const bindersSnap = await getDocs(bindersRef)
  for (const b of bindersSnap.docs) {
    if (b.data().name?.startsWith('TEST_DEL_')) {
      await deleteDoc(b.ref)
    }
  }

  // Clean test cards
  const cards = await getUserCards(userId)
  for (const card of cards) {
    if (card.name?.startsWith('TEST_DEL_')) {
      await deleteCard(userId, card.id!)
    }
  }
}

// ============ TESTS ============

describe('Deck & Binder Deletion with Card Cleanup', () => {
  let userAId: string

  beforeAll(async () => {
    console.log('\n🚀 Initializing Firebase for deletion tests...')
    initFirebase()

    const userAResult = await loginAs('userA')
    userAId = userAResult.userId
    console.log(`   User A: ${userAId}`)
    await logout()
  })

  beforeEach(async () => {
    console.log('\n🧹 Cleaning up test data...')
    await loginAs('userA')
    await cleanupTestData(userAId)
    await logout()
  })

  afterAll(async () => {
    console.log('\n🧹 Final cleanup...')
    try {
      await loginAs('userA')
      await cleanupTestData(userAId)
      await logout()
    } catch { /* ignore */ }
  })

  // ================================================================
  // DECK DELETION TESTS
  // ================================================================

  describe('Deck deletion with card cleanup', () => {
    it('should delete deck AND its allocated cards from collection', async () => {
      console.log('\n📝 Test: Delete deck + cards')

      await loginAs('userA')

      // Create cards in collection
      const card1Id = await addCardToCollection(userAId, {
        scryfallId: 'test-del-bolt',
        name: 'TEST_DEL_Lightning Bolt',
        edition: 'M21',
        quantity: 4,
        condition: 'NM',
        foil: false,
        status: 'collection',
        price: 2.50,
      })
      const card2Id = await addCardToCollection(userAId, {
        scryfallId: 'test-del-counter',
        name: 'TEST_DEL_Counterspell',
        edition: 'MH2',
        quantity: 4,
        condition: 'NM',
        foil: false,
        status: 'collection',
        price: 1.00,
      })
      console.log(`   Created cards: ${card1Id}, ${card2Id}`)

      // Create deck with allocations pointing to those cards
      const deckId = await createDeck(userAId, {
        name: 'TEST_DEL_Burn Deck',
        format: 'modern',
        allocations: [
          { cardId: card1Id, quantity: 4, isInSideboard: false, addedAt: Timestamp.now() },
          { cardId: card2Id, quantity: 4, isInSideboard: false, addedAt: Timestamp.now() },
        ],
      })
      console.log(`   Created deck: ${deckId}`)

      // Verify cards exist before deletion
      expect(await getCard(userAId, card1Id)).not.toBeNull()
      expect(await getCard(userAId, card2Id)).not.toBeNull()

      // Get card IDs from deck allocations (simulates what handleDeleteDeck does)
      const deck = await getDeck(userAId, deckId)
      expect(deck).not.toBeNull()
      const cardIds = [...new Set((deck!.allocations || []).map((a: any) => a.cardId))]
      expect(cardIds).toHaveLength(2)
      expect(cardIds).toContain(card1Id)
      expect(cardIds).toContain(card2Id)

      // Delete deck
      await deleteDeck(userAId, deckId)
      console.log(`   🗑️ Deleted deck`)

      // Verify deck is gone
      expect(await getDeck(userAId, deckId)).toBeNull()

      // Delete cards (simulates the "SÍ, ELIMINAR CARTAS" flow)
      for (const cardId of cardIds) {
        await deleteCard(userAId, cardId)
      }
      console.log(`   🗑️ Deleted ${cardIds.length} cards`)

      // Verify cards are gone
      expect(await getCard(userAId, card1Id)).toBeNull()
      expect(await getCard(userAId, card2Id)).toBeNull()
      console.log(`   ✅ Deck and cards deleted successfully`)

      await logout()
    })

    it('should delete deck but KEEP cards when user chooses to conserve', async () => {
      console.log('\n📝 Test: Delete deck, keep cards')

      await loginAs('userA')

      // Create card in collection
      const cardId = await addCardToCollection(userAId, {
        scryfallId: 'test-del-keep',
        name: 'TEST_DEL_Keep Card',
        edition: 'M21',
        quantity: 2,
        condition: 'NM',
        foil: false,
        status: 'collection',
        price: 5.00,
      })

      // Create deck with allocation
      const deckId = await createDeck(userAId, {
        name: 'TEST_DEL_Keep Cards Deck',
        format: 'standard',
        allocations: [
          { cardId, quantity: 2, isInSideboard: false, addedAt: Timestamp.now() },
        ],
      })

      // Delete only the deck
      await deleteDeck(userAId, deckId)
      console.log(`   🗑️ Deleted deck (keeping cards)`)

      // Deck should be gone
      expect(await getDeck(userAId, deckId)).toBeNull()

      // Card should still exist
      const card = await getCard(userAId, cardId)
      expect(card).not.toBeNull()
      expect(card.name).toBe('TEST_DEL_Keep Card')
      console.log(`   ✅ Deck deleted, card preserved`)

      await logout()
    })

    it('should correctly extract unique card IDs from deck allocations', async () => {
      console.log('\n📝 Test: Unique card ID extraction from deck')

      await loginAs('userA')

      const cardId = await addCardToCollection(userAId, {
        scryfallId: 'test-del-dup',
        name: 'TEST_DEL_Duplicate Card',
        edition: 'M21',
        quantity: 6,
        condition: 'NM',
        foil: false,
        status: 'collection',
        price: 1.00,
      })

      // Same card in mainboard AND sideboard (duplicate cardId)
      const deckId = await createDeck(userAId, {
        name: 'TEST_DEL_Dup Alloc Deck',
        format: 'modern',
        allocations: [
          { cardId, quantity: 4, isInSideboard: false, addedAt: Timestamp.now() },
          { cardId, quantity: 2, isInSideboard: true, addedAt: Timestamp.now() },
        ],
      })

      const deck = await getDeck(userAId, deckId)
      const cardIds = [...new Set((deck!.allocations || []).map((a: any) => a.cardId))]

      // Should be deduplicated to 1
      expect(cardIds).toHaveLength(1)
      expect(cardIds[0]).toBe(cardId)
      console.log(`   ✅ Correctly deduplicated: 2 allocations → 1 unique card ID`)

      await logout()
    })

    it('should handle deck with no allocations', async () => {
      console.log('\n📝 Test: Delete empty deck')

      await loginAs('userA')

      const deckId = await createDeck(userAId, {
        name: 'TEST_DEL_Empty Deck',
        format: 'modern',
        allocations: [],
      })

      const deck = await getDeck(userAId, deckId)
      const cardIds = [...new Set((deck!.allocations || []).map((a: any) => a.cardId))]
      expect(cardIds).toHaveLength(0)

      await deleteDeck(userAId, deckId)
      expect(await getDeck(userAId, deckId)).toBeNull()
      console.log(`   ✅ Empty deck deleted without errors`)

      await logout()
    })
  })

  // ================================================================
  // BINDER DELETION TESTS
  // ================================================================

  describe('Binder deletion with card cleanup', () => {
    it('should delete binder AND its allocated cards from collection', async () => {
      console.log('\n📝 Test: Delete binder + cards')

      await loginAs('userA')

      // Create cards in collection
      const card1Id = await addCardToCollection(userAId, {
        scryfallId: 'test-del-bcard1',
        name: 'TEST_DEL_Binder Card 1',
        edition: 'M21',
        quantity: 2,
        condition: 'NM',
        foil: false,
        status: 'collection',
        price: 3.00,
      })
      const card2Id = await addCardToCollection(userAId, {
        scryfallId: 'test-del-bcard2',
        name: 'TEST_DEL_Binder Card 2',
        edition: 'MH2',
        quantity: 1,
        condition: 'LP',
        foil: true,
        status: 'trade',
        price: 10.00,
      })
      console.log(`   Created cards: ${card1Id}, ${card2Id}`)

      // Create binder with allocations
      const binderId = await createBinder(userAId, {
        name: 'TEST_DEL_My Binder',
        allocations: [
          { cardId: card1Id, quantity: 2, addedAt: Timestamp.now() },
          { cardId: card2Id, quantity: 1, addedAt: Timestamp.now() },
        ],
      })
      console.log(`   Created binder: ${binderId}`)

      // Verify cards exist
      expect(await getCard(userAId, card1Id)).not.toBeNull()
      expect(await getCard(userAId, card2Id)).not.toBeNull()

      // Extract card IDs from binder allocations (simulates handleDeleteBinder)
      const binder = await getBinder(userAId, binderId)
      expect(binder).not.toBeNull()
      const cardIds = [...new Set((binder!.allocations || []).map((a: any) => a.cardId))]
      expect(cardIds).toHaveLength(2)

      // Delete binder
      await deleteBinder(userAId, binderId)
      console.log(`   🗑️ Deleted binder`)

      // Verify binder is gone
      expect(await getBinder(userAId, binderId)).toBeNull()

      // Delete cards (simulates "SÍ, ELIMINAR CARTAS" flow)
      for (const cardId of cardIds) {
        await deleteCard(userAId, cardId)
      }
      console.log(`   🗑️ Deleted ${cardIds.length} cards`)

      // Verify cards are gone
      expect(await getCard(userAId, card1Id)).toBeNull()
      expect(await getCard(userAId, card2Id)).toBeNull()
      console.log(`   ✅ Binder and cards deleted successfully`)

      await logout()
    })

    it('should delete binder but KEEP cards when user chooses to conserve', async () => {
      console.log('\n📝 Test: Delete binder, keep cards')

      await loginAs('userA')

      const cardId = await addCardToCollection(userAId, {
        scryfallId: 'test-del-bkeep',
        name: 'TEST_DEL_Binder Keep Card',
        edition: 'M21',
        quantity: 3,
        condition: 'NM',
        foil: false,
        status: 'collection',
        price: 2.00,
      })

      const binderId = await createBinder(userAId, {
        name: 'TEST_DEL_Keep Cards Binder',
        allocations: [
          { cardId, quantity: 3, addedAt: Timestamp.now() },
        ],
      })

      // Delete only the binder
      await deleteBinder(userAId, binderId)
      console.log(`   🗑️ Deleted binder (keeping cards)`)

      // Binder should be gone
      expect(await getBinder(userAId, binderId)).toBeNull()

      // Card should still exist
      const card = await getCard(userAId, cardId)
      expect(card).not.toBeNull()
      expect(card.name).toBe('TEST_DEL_Binder Keep Card')
      console.log(`   ✅ Binder deleted, card preserved`)

      await logout()
    })

    it('should correctly extract unique card IDs from binder allocations', async () => {
      console.log('\n📝 Test: Unique card ID extraction from binder')

      await loginAs('userA')

      const card1Id = await addCardToCollection(userAId, {
        scryfallId: 'test-del-buniq1',
        name: 'TEST_DEL_Unique 1',
        edition: 'M21',
        quantity: 4,
        condition: 'NM',
        foil: false,
        status: 'collection',
        price: 1.00,
      })
      const card2Id = await addCardToCollection(userAId, {
        scryfallId: 'test-del-buniq2',
        name: 'TEST_DEL_Unique 2',
        edition: 'M21',
        quantity: 3,
        condition: 'NM',
        foil: false,
        status: 'collection',
        price: 2.00,
      })

      const binderId = await createBinder(userAId, {
        name: 'TEST_DEL_Unique Binder',
        allocations: [
          { cardId: card1Id, quantity: 4, addedAt: Timestamp.now() },
          { cardId: card2Id, quantity: 3, addedAt: Timestamp.now() },
        ],
      })

      const binder = await getBinder(userAId, binderId)
      const cardIds = [...new Set((binder!.allocations || []).map((a: any) => a.cardId))]

      expect(cardIds).toHaveLength(2)
      expect(cardIds).toContain(card1Id)
      expect(cardIds).toContain(card2Id)
      console.log(`   ✅ Correctly extracted ${cardIds.length} unique card IDs`)

      await logout()
    })

    it('should handle binder with no allocations', async () => {
      console.log('\n📝 Test: Delete empty binder')

      await loginAs('userA')

      const binderId = await createBinder(userAId, {
        name: 'TEST_DEL_Empty Binder',
        allocations: [],
      })

      const binder = await getBinder(userAId, binderId)
      const cardIds = [...new Set((binder!.allocations || []).map((a: any) => a.cardId))]
      expect(cardIds).toHaveLength(0)

      await deleteBinder(userAId, binderId)
      expect(await getBinder(userAId, binderId)).toBeNull()
      console.log(`   ✅ Empty binder deleted without errors`)

      await logout()
    })
  })

  // ================================================================
  // CROSS-ENTITY SAFETY TESTS
  // ================================================================

  describe('Cross-entity safety', () => {
    it('should NOT delete cards allocated to other decks when deleting one deck', async () => {
      console.log('\n📝 Test: Card shared across decks')

      await loginAs('userA')

      // Create a card
      const cardId = await addCardToCollection(userAId, {
        scryfallId: 'test-del-shared',
        name: 'TEST_DEL_Shared Card',
        edition: 'M21',
        quantity: 8,
        condition: 'NM',
        foil: false,
        status: 'collection',
        price: 5.00,
      })

      // Create two decks both using the same card
      const deck1Id = await createDeck(userAId, {
        name: 'TEST_DEL_Deck One',
        format: 'modern',
        allocations: [
          { cardId, quantity: 4, isInSideboard: false, addedAt: Timestamp.now() },
        ],
      })
      const deck2Id = await createDeck(userAId, {
        name: 'TEST_DEL_Deck Two',
        format: 'standard',
        allocations: [
          { cardId, quantity: 4, isInSideboard: false, addedAt: Timestamp.now() },
        ],
      })

      // Delete deck1 WITHOUT deleting cards (user chooses "NO, CONSERVAR")
      await deleteDeck(userAId, deck1Id)
      expect(await getDeck(userAId, deck1Id)).toBeNull()

      // Card should still exist for deck2
      const card = await getCard(userAId, cardId)
      expect(card).not.toBeNull()
      console.log(`   ✅ Card preserved when only one deck deleted (conserve mode)`)

      // Deck2 should still reference the card
      const deck2 = await getDeck(userAId, deck2Id)
      expect(deck2).not.toBeNull()
      expect(deck2!.allocations![0].cardId).toBe(cardId)
      console.log(`   ✅ Deck 2 still references the card`)

      await logout()
    })

    it('should NOT delete cards allocated to a binder when deleting a deck (and vice versa)', async () => {
      console.log('\n📝 Test: Card in both deck and binder')

      await loginAs('userA')

      const cardId = await addCardToCollection(userAId, {
        scryfallId: 'test-del-cross',
        name: 'TEST_DEL_Cross Card',
        edition: 'M21',
        quantity: 6,
        condition: 'NM',
        foil: false,
        status: 'collection',
        price: 3.00,
      })

      const deckId = await createDeck(userAId, {
        name: 'TEST_DEL_Cross Deck',
        format: 'modern',
        allocations: [
          { cardId, quantity: 3, isInSideboard: false, addedAt: Timestamp.now() },
        ],
      })

      const binderId = await createBinder(userAId, {
        name: 'TEST_DEL_Cross Binder',
        allocations: [
          { cardId, quantity: 3, addedAt: Timestamp.now() },
        ],
      })

      // Delete the deck only (conserve cards)
      await deleteDeck(userAId, deckId)
      expect(await getDeck(userAId, deckId)).toBeNull()

      // Card should still exist
      expect(await getCard(userAId, cardId)).not.toBeNull()

      // Binder should still exist with its allocation
      const binder = await getBinder(userAId, binderId)
      expect(binder).not.toBeNull()
      expect(binder!.allocations![0].cardId).toBe(cardId)
      console.log(`   ✅ Card and binder preserved after deck deletion`)

      await logout()
    })
  })
})
