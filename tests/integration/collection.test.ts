/**
 * Integration Tests - Collection System
 *
 * Tests the card collection functionality:
 * 1. CRUD operations (add, read, update, delete)
 * 2. Public sync (cards appear in public_cards when status is trade/sale)
 * 3. Wishlist sync (cards appear in public_preferences when status is wishlist)
 * 4. Batch operations work correctly
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
  getUserCards,
  deleteCard,
  syncCardToPublic,
  clearPublicData,
  getPublicCards,
  getPublicPreferences,
  getDb,
  type TestCard,
} from './testHelpers'
import {
  doc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore'

// Validate credentials before running tests
validateTestCredentials()

describe('Collection System Integration Tests', () => {
  let userAId: string

  beforeAll(async () => {
    console.log('\n🚀 Initializing Firebase for collection tests...')
    initFirebase()

    const userAResult = await loginAs('userA')
    userAId = userAResult.userId
    console.log(`   User A: ${userAId}`)
    await logout()
  })

  beforeEach(async () => {
    console.log('\n🧹 Cleaning up test data...')
    await loginAs('userA')
    await clearPublicData(userAId)
    // Delete test cards (cards with name starting with "TEST_")
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
      await clearPublicData(userAId)
      const cards = await getUserCards(userAId)
      for (const card of cards) {
        if (card.name?.startsWith('TEST_')) {
          await deleteCard(userAId, card.id!)
        }
      }
      await logout()
    } catch { /* ignore */ }
  })

  describe('Card CRUD Operations', () => {
    it('should add a card to collection', async () => {
      console.log('\n📝 Test: Add card to collection')

      await loginAs('userA')

      const testCard: TestCard = {
        scryfallId: 'test-scryfall-123',
        name: 'TEST_Lightning Bolt',
        edition: 'M21',
        quantity: 4,
        condition: 'NM',
        foil: false,
        status: 'collection',
        price: 2.50,
      }

      const cardId = await addCardToCollection(userAId, testCard)
      expect(cardId).toBeTruthy()
      console.log(`   ✅ Created card: ${cardId}`)

      // Verify card exists
      const cards = await getUserCards(userAId)
      const createdCard = cards.find(c => c.id === cardId)

      expect(createdCard).toBeDefined()
      expect(createdCard?.name).toBe('TEST_Lightning Bolt')
      expect(createdCard?.quantity).toBe(4)
      expect(createdCard?.condition).toBe('NM')
      console.log(`   ✅ Card retrieved successfully`)

      await logout()
    })

    it('should update a card', async () => {
      console.log('\n📝 Test: Update card')

      await loginAs('userA')

      // Create a card first
      const cardId = await addCardToCollection(userAId, {
        scryfallId: 'test-update-123',
        name: 'TEST_Counterspell',
        edition: 'ICE',
        quantity: 2,
        condition: 'LP',
        foil: false,
        status: 'collection',
        price: 1.00,
      })

      // Update the card
      const db = getDb()
      await updateDoc(doc(db, 'users', userAId, 'cards', cardId), {
        quantity: 4,
        condition: 'NM',
        price: 3.50,
        updatedAt: Timestamp.now(),
      })
      console.log(`   ✅ Updated card: ${cardId}`)

      // Verify update
      const cards = await getUserCards(userAId)
      const updatedCard = cards.find(c => c.id === cardId)

      expect(updatedCard?.quantity).toBe(4)
      expect(updatedCard?.condition).toBe('NM')
      expect(updatedCard?.price).toBe(3.50)
      console.log(`   ✅ Update verified`)

      await logout()
    })

    it('should delete a card', async () => {
      console.log('\n📝 Test: Delete card')

      await loginAs('userA')

      // Create a card first
      const cardId = await addCardToCollection(userAId, {
        scryfallId: 'test-delete-123',
        name: 'TEST_Doom Blade',
        edition: 'M12',
        quantity: 1,
        condition: 'MP',
        foil: false,
        status: 'collection',
        price: 0.50,
      })
      console.log(`   ✅ Created card: ${cardId}`)

      // Delete the card
      await deleteCard(userAId, cardId)
      console.log(`   🗑️ Deleted card`)

      // Verify deletion
      const cards = await getUserCards(userAId)
      const deletedCard = cards.find(c => c.id === cardId)

      expect(deletedCard).toBeUndefined()
      console.log(`   ✅ Deletion verified`)

      await logout()
    })

    it('should handle multiple cards', async () => {
      console.log('\n📝 Test: Multiple cards')

      await loginAs('userA')

      // Create 5 cards
      const cardNames = [
        'TEST_Sol Ring',
        'TEST_Mana Crypt',
        'TEST_Chrome Mox',
        'TEST_Mox Diamond',
        'TEST_Lions Eye Diamond',
      ]

      for (const name of cardNames) {
        await addCardToCollection(userAId, {
          scryfallId: `test-${name.replace(/\s/g, '-').toLowerCase()}`,
          name,
          edition: 'VMA',
          quantity: 1,
          condition: 'NM',
          foil: false,
          status: 'collection',
          price: 100,
        })
      }

      const cards = await getUserCards(userAId)
      const testCards = cards.filter(c => c.name?.startsWith('TEST_'))

      expect(testCards.length).toBeGreaterThanOrEqual(5)
      console.log(`   ✅ Created ${testCards.length} test cards`)

      await logout()
    })
  })

  describe('Public Sync - Trade/Sale Cards', () => {
    it('should sync trade card to public_cards', async () => {
      console.log('\n📝 Test: Sync trade card to public_cards')

      await loginAs('userA')

      // Create a TRADE card
      const cardId = await addCardToCollection(userAId, {
        scryfallId: 'test-trade-sync-123',
        name: 'TEST_Black Lotus',
        edition: 'LEA',
        quantity: 1,
        condition: 'HP',
        foil: false,
        status: 'trade',
        price: 50000,
        public: true,
      })
      console.log(`   ✅ Created trade card: ${cardId}`)

      // Sync to public
      await syncCardToPublic(userAId, TEST_USERS.userA.username, {
        id: cardId,
        scryfallId: 'test-trade-sync-123',
        name: 'TEST_Black Lotus',
        edition: 'LEA',
        quantity: 1,
        condition: 'HP',
        foil: false,
        status: 'trade',
        price: 50000,
      })
      console.log(`   📤 Synced to public`)

      // Verify in public_cards
      const publicCards = await getPublicCards(userAId)
      const syncedCard = publicCards.find(c => c.cardName === 'test_black lotus')

      expect(syncedCard).toBeDefined()
      expect(syncedCard?.status).toBe('trade')
      expect(syncedCard?.price).toBe(50000)
      console.log(`   ✅ Card found in public_cards`)

      await logout()
    })

    it('should sync sale card to public_cards', async () => {
      console.log('\n📝 Test: Sync sale card to public_cards')

      await loginAs('userA')

      const cardId = await addCardToCollection(userAId, {
        scryfallId: 'test-sale-sync-123',
        name: 'TEST_Ancestral Recall',
        edition: 'LEB',
        quantity: 1,
        condition: 'NM',
        foil: false,
        status: 'sale',
        price: 7500,
        public: true,
      })

      await syncCardToPublic(userAId, TEST_USERS.userA.username, {
        id: cardId,
        scryfallId: 'test-sale-sync-123',
        name: 'TEST_Ancestral Recall',
        edition: 'LEB',
        quantity: 1,
        condition: 'NM',
        foil: false,
        status: 'sale',
        price: 7500,
      })

      const publicCards = await getPublicCards(userAId)
      const syncedCard = publicCards.find(c => c.cardName === 'test_ancestral recall')

      expect(syncedCard).toBeDefined()
      expect(syncedCard?.status).toBe('sale')
      console.log(`   ✅ Sale card found in public_cards`)

      await logout()
    })

    it('should NOT sync collection card to public_cards', async () => {
      console.log('\n📝 Test: Collection card should NOT appear in public_cards')

      await loginAs('userA')

      const cardId = await addCardToCollection(userAId, {
        scryfallId: 'test-collection-123',
        name: 'TEST_Time Walk',
        edition: 'LEA',
        quantity: 1,
        condition: 'NM',
        foil: false,
        status: 'collection', // NOT trade or sale
        price: 10000,
      })

      // Try to sync (should not create public entry)
      await syncCardToPublic(userAId, TEST_USERS.userA.username, {
        id: cardId,
        scryfallId: 'test-collection-123',
        name: 'TEST_Time Walk',
        edition: 'LEA',
        quantity: 1,
        condition: 'NM',
        foil: false,
        status: 'collection',
        price: 10000,
      })

      const publicCards = await getPublicCards(userAId)
      const syncedCard = publicCards.find(c => c.cardName === 'test_time walk')

      expect(syncedCard).toBeUndefined()
      console.log(`   ✅ Collection card correctly NOT in public_cards`)

      await logout()
    })
  })

  describe('Public Sync - Wishlist Cards', () => {
    it('should sync wishlist card to public_preferences', async () => {
      console.log('\n📝 Test: Sync wishlist card to public_preferences')

      await loginAs('userA')

      const cardId = await addCardToCollection(userAId, {
        scryfallId: 'test-wishlist-123',
        name: 'TEST_Mox Sapphire',
        edition: 'LEA',
        quantity: 1,
        condition: 'LP',
        foil: false,
        status: 'wishlist',
        price: 8000,
        public: true,
      })

      await syncCardToPublic(userAId, TEST_USERS.userA.username, {
        id: cardId,
        scryfallId: 'test-wishlist-123',
        name: 'TEST_Mox Sapphire',
        edition: 'LEA',
        quantity: 1,
        condition: 'LP',
        foil: false,
        status: 'wishlist',
        price: 8000,
      })

      const preferences = await getPublicPreferences(userAId)
      const syncedPref = preferences.find(p => p.cardName === 'test_mox sapphire')

      expect(syncedPref).toBeDefined()
      expect(syncedPref?.minCondition).toBe('LP')
      console.log(`   ✅ Wishlist card found in public_preferences`)

      await logout()
    })
  })

  describe('Card Status Transitions', () => {
    it('should update public_cards when status changes from collection to trade', async () => {
      console.log('\n📝 Test: Status transition collection → trade')

      await loginAs('userA')

      // Create as collection
      const cardId = await addCardToCollection(userAId, {
        scryfallId: 'test-transition-123',
        name: 'TEST_Timetwister',
        edition: 'LEA',
        quantity: 1,
        condition: 'NM',
        foil: false,
        status: 'collection',
        price: 15000,
      })
      console.log(`   ✅ Created as collection card`)

      // Verify NOT in public
      let publicCards = await getPublicCards(userAId)
      expect(publicCards.find(c => c.cardName === 'test_timetwister')).toBeUndefined()
      console.log(`   ✅ Not in public_cards initially`)

      // Update to trade
      const db = getDb()
      await updateDoc(doc(db, 'users', userAId, 'cards', cardId), {
        status: 'trade',
        public: true,
        updatedAt: Timestamp.now(),
      })

      // Sync to public
      await syncCardToPublic(userAId, TEST_USERS.userA.username, {
        id: cardId,
        scryfallId: 'test-transition-123',
        name: 'TEST_Timetwister',
        edition: 'LEA',
        quantity: 1,
        condition: 'NM',
        foil: false,
        status: 'trade',
        price: 15000,
      })

      // Verify NOW in public
      publicCards = await getPublicCards(userAId)
      const syncedCard = publicCards.find(c => c.cardName === 'test_timetwister')
      expect(syncedCard).toBeDefined()
      expect(syncedCard?.status).toBe('trade')
      console.log(`   ✅ Now appears in public_cards after status change`)

      await logout()
    })
  })
})

describe('Collection Smoke Tests', () => {
  it('should have Firestore access', async () => {
    console.log('\n🔥 Smoke: Firestore access')
    initFirebase()

    await loginAs('userA')
    const cards = await getUserCards((await loginAs('userA')).userId)
    expect(Array.isArray(cards)).toBe(true)
    console.log(`   ✅ Can read cards collection (${cards.length} cards)`)

    await logout()
  })
})
