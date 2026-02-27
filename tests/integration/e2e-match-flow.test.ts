/**
 * E2E Integration Test - Complete Match Flow Between Two Users
 *
 * Simulates the full lifecycle of a match:
 * 1. User A adds a card for trade, syncs to public
 * 2. User B adds the same card to wishlist, syncs to public
 * 3. Verify public collections contain the data
 * 4. Simulate match discovery via Firestore queries
 * 5. User B sends "ME INTERESA" (creates shared_match)
 * 6. Verify shared_match visible to both users
 * 7. User A opens conversation and sends message
 * 8. User B replies
 * 9. Verify full conversation
 * 10. Post-trade cleanup: both remove their cards
 * 11. Verify public collections are clean
 *
 * Run with: npm run test:integration -- tests/integration/e2e-match-flow.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  TEST_USERS,
  initFirebase,
  loginAs,
  logout,
  validateTestCredentials,
  getDb,
  addCardToCollection,
  deleteCard,
  syncCardToPublic,
  getPublicCards,
  getPublicPreferences,
  cleanupTestUser,
  createSharedMatch,
  getSharedMatchesForUser,
  deletePublicCardById,
  deletePublicPrefById,
} from './testHelpers'
import {
  collection,
  doc,
  setDoc,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore'

// Validate credentials before running tests
validateTestCredentials()

// ============ INLINE MESSAGING HELPERS ============

function getConversationId(userId1: string, userId2: string): string {
  return [userId1, userId2].sort((a, b) => a.localeCompare(b)).join('_')
}

async function createConversation(
  userId1: string,
  username1: string,
  userId2: string,
  username2: string
): Promise<string> {
  const db = getDb()
  const conversationId = getConversationId(userId1, userId2)
  const conversationRef = doc(db, 'conversations', conversationId)

  await setDoc(conversationRef, {
    id: conversationId,
    participantIds: [userId1, userId2].sort((a, b) => a.localeCompare(b)),
    participantNames: {
      [userId1]: username1,
      [userId2]: username2,
    },
    participantAvatars: {
      [userId1]: null,
      [userId2]: null,
    },
    createdAt: Timestamp.now(),
    lastMessage: '',
    lastMessageTime: Timestamp.now(),
  })

  return conversationId
}

async function sendMessage(
  conversationId: string,
  senderId: string,
  senderUsername: string,
  recipientId: string,
  content: string
): Promise<string> {
  const db = getDb()
  const messagesRef = collection(db, 'conversations', conversationId, 'messages')

  const docRef = await addDoc(messagesRef, {
    senderId,
    senderUsername,
    recipientId,
    content,
    createdAt: Timestamp.now(),
    read: false,
  })

  await setDoc(doc(db, 'conversations', conversationId), {
    lastMessage: content,
    lastMessageTime: Timestamp.now(),
  }, { merge: true })

  return docRef.id
}

async function getMessages(conversationId: string): Promise<any[]> {
  const db = getDb()
  const messagesRef = collection(db, 'conversations', conversationId, 'messages')
  const q = query(messagesRef, orderBy('createdAt', 'asc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
}

async function deleteConversation(conversationId: string): Promise<void> {
  const db = getDb()

  const messagesRef = collection(db, 'conversations', conversationId, 'messages')
  const messagesSnapshot = await getDocs(messagesRef)
  for (const msgDoc of messagesSnapshot.docs) {
    await deleteDoc(msgDoc.ref)
  }

  await deleteDoc(doc(db, 'conversations', conversationId))
}

// ============ TEST DATA ============

const TEST_CARD = {
  name: 'TEST_Lightning Bolt',
  nameLower: 'test_lightning bolt',
  scryfallId: 'test-e2e-bolt-001',
  edition: 'M21',
  quantity: 4,
  condition: 'NM',
  foil: false,
  price: 2.50,
}

// ============ E2E TEST ============

describe('E2E Match Flow', () => {
  let userAId: string
  let userBId: string
  let cardAId: string
  let cardBId: string
  let publicCardDocId: string
  let publicPrefDocId: string
  let sharedMatchId: string
  let conversationId: string

  const usernameA = TEST_USERS.userA.username
  const usernameB = TEST_USERS.userB.username

  beforeAll(async () => {
    console.log('\n🚀 E2E Match Flow: Initializing...')
    initFirebase()

    // Get user IDs
    const userAResult = await loginAs('userA')
    userAId = userAResult.userId
    console.log(`   User A (${usernameA}): ${userAId}`)

    const userBResult = await loginAs('userB')
    userBId = userBResult.userId
    console.log(`   User B (${usernameB}): ${userBId}`)

    // Full cleanup before starting
    console.log('   Cleaning up previous test data...')
    await loginAs('userA')
    await cleanupTestUser(userAId)

    await loginAs('userB')
    await cleanupTestUser(userBId)

    // Clean up any leftover conversation between these users
    const convId = getConversationId(userAId, userBId)
    try { await deleteConversation(convId) } catch { /* may not exist */ }

    await logout()
    console.log('   ✅ Cleanup complete\n')
  }, 60000)

  afterAll(async () => {
    console.log('\n🧹 E2E Match Flow: Final cleanup...')
    try {
      await loginAs('userA')
      await cleanupTestUser(userAId)

      await loginAs('userB')
      await cleanupTestUser(userBId)

      // Clean conversation
      const convId = getConversationId(userAId, userBId)
      try { await deleteConversation(convId) } catch { /* ignore */ }

      await logout()
    } catch (e) {
      console.error('   Cleanup error:', e)
    }
    console.log('   ✅ Final cleanup complete')
  }, 60000)

  // ── Step 1 ──────────────────────────────────────────────
  it('Step 1: User A adds card for trade and syncs to public', async () => {
    console.log('\n📝 Step 1: User A adds card for trade')

    await loginAs('userA')

    cardAId = await addCardToCollection(userAId, {
      ...TEST_CARD,
      status: 'trade',
    })
    expect(cardAId).toBeTruthy()
    console.log(`   ✅ Card added to collection: ${cardAId}`)

    await syncCardToPublic(userAId, usernameA, {
      ...TEST_CARD,
      id: cardAId,
      status: 'trade',
    })
    console.log(`   ✅ Card synced to public_cards`)
  }, 30000)

  // ── Step 2 ──────────────────────────────────────────────
  it('Step 2: User B adds same card to wishlist and syncs to public', async () => {
    console.log('\n📝 Step 2: User B adds card to wishlist')

    await loginAs('userB')

    cardBId = await addCardToCollection(userBId, {
      ...TEST_CARD,
      status: 'wishlist',
    })
    expect(cardBId).toBeTruthy()
    console.log(`   ✅ Card added to collection: ${cardBId}`)

    await syncCardToPublic(userBId, usernameB, {
      ...TEST_CARD,
      id: cardBId,
      status: 'wishlist',
    })
    console.log(`   ✅ Card synced to public_preferences`)
  }, 30000)

  // ── Step 3 ──────────────────────────────────────────────
  it('Step 3: Verify public collections contain the data', async () => {
    console.log('\n📝 Step 3: Verify public collections')

    await loginAs('userA')

    // Check User A's public_cards
    const publicCards = await getPublicCards(userAId)
    const testCard = publicCards.find((c: any) => c.cardName === TEST_CARD.nameLower)
    expect(testCard).toBeDefined()
    expect(testCard.status).toBe('trade')
    expect(testCard.userId).toBe(userAId)
    publicCardDocId = testCard.id
    console.log(`   ✅ public_cards doc found: ${publicCardDocId}`)

    // Check User B's public_preferences
    const publicPrefs = await getPublicPreferences(userBId)
    const testPref = publicPrefs.find((p: any) => p.cardName === TEST_CARD.nameLower)
    expect(testPref).toBeDefined()
    expect(testPref.userId).toBe(userBId)
    publicPrefDocId = testPref.id
    console.log(`   ✅ public_preferences doc found: ${publicPrefDocId}`)
  }, 30000)

  // ── Step 4 ──────────────────────────────────────────────
  it('Step 4: Simulate match discovery via Firestore queries', async () => {
    console.log('\n📝 Step 4: Simulate match discovery')

    await loginAs('userB')
    const db = getDb()

    // Query public_cards for the card name (excluding self)
    const publicCardsRef = collection(db, 'public_cards')
    const cardsQuery = query(
      publicCardsRef,
      where('cardName', '==', TEST_CARD.nameLower)
    )
    const cardsSnapshot = await getDocs(cardsQuery)
    const matchingCards = cardsSnapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter((c: any) => c.userId !== userBId)

    expect(matchingCards.length).toBeGreaterThan(0)
    console.log(`   ✅ Found ${matchingCards.length} public_cards matching "${TEST_CARD.nameLower}" (not User B)`)

    // Query public_preferences for the card name (excluding self)
    const publicPrefsRef = collection(db, 'public_preferences')
    const prefsQuery = query(
      publicPrefsRef,
      where('cardName', '==', TEST_CARD.nameLower)
    )
    const prefsSnapshot = await getDocs(prefsQuery)
    const matchingPrefs = prefsSnapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter((p: any) => p.userId !== userAId)

    expect(matchingPrefs.length).toBeGreaterThan(0)
    console.log(`   ✅ Found ${matchingPrefs.length} public_preferences matching "${TEST_CARD.nameLower}" (not User A)`)

    // The fundamental match condition: same card name across both collections
    expect(matchingCards[0].cardName).toBe(matchingPrefs[0].cardName)
    console.log(`   ✅ Match condition verified: cardName overlap exists`)
  }, 30000)

  // ── Step 5 ──────────────────────────────────────────────
  it('Step 5: User B sends "ME INTERESA" (creates shared_match)', async () => {
    console.log('\n📝 Step 5: User B sends "ME INTERESA"')

    await loginAs('userB')

    sharedMatchId = await createSharedMatch({
      senderId: userBId,
      senderUsername: usernameB,
      receiverId: userAId,
      receiverUsername: usernameA,
      card: {
        name: TEST_CARD.name,
        edition: TEST_CARD.edition,
        condition: TEST_CARD.condition,
        price: TEST_CARD.price,
      },
      senderStatus: 'interested',
      status: 'pending',
    })

    expect(sharedMatchId).toBeTruthy()
    console.log(`   ✅ Shared match created: ${sharedMatchId}`)
  }, 30000)

  // ── Step 6 ──────────────────────────────────────────────
  it('Step 6: Verify shared_match visible to both users', async () => {
    console.log('\n📝 Step 6: Verify shared_match visibility')

    // User A sees the match (as receiver)
    await loginAs('userA')
    const matchesA = await getSharedMatchesForUser(userAId)
    const matchForA = matchesA.find((m: any) => m.id === sharedMatchId)
    expect(matchForA).toBeDefined()
    expect(matchForA.receiverId).toBe(userAId)
    expect(matchForA.senderId).toBe(userBId)
    expect(matchForA.status).toBe('pending')
    console.log(`   ✅ User A sees shared_match as receiver (status: ${matchForA.status})`)

    // User B sees the match (as sender)
    await loginAs('userB')
    const matchesB = await getSharedMatchesForUser(userBId)
    const matchForB = matchesB.find((m: any) => m.id === sharedMatchId)
    expect(matchForB).toBeDefined()
    expect(matchForB.senderStatus).toBe('interested')
    console.log(`   ✅ User B sees shared_match as sender (senderStatus: ${matchForB.senderStatus})`)
  }, 30000)

  // ── Step 7 ──────────────────────────────────────────────
  it('Step 7: User A creates conversation and sends message', async () => {
    console.log('\n📝 Step 7: User A creates conversation')

    await loginAs('userA')

    conversationId = await createConversation(
      userAId, usernameA,
      userBId, usernameB
    )
    expect(conversationId).toBeTruthy()
    console.log(`   ✅ Conversation created: ${conversationId}`)

    const msgId = await sendMessage(
      conversationId,
      userAId, usernameA, userBId,
      'Tengo el Lightning Bolt que buscas, te interesa?'
    )
    expect(msgId).toBeTruthy()
    console.log(`   ✅ Message sent: ${msgId}`)
  }, 30000)

  // ── Step 8 ──────────────────────────────────────────────
  it('Step 8: User B responds in conversation', async () => {
    console.log('\n📝 Step 8: User B responds')

    await loginAs('userB')

    const msgId = await sendMessage(
      conversationId,
      userBId, usernameB, userAId,
      'Perfecto! Que quieres a cambio?'
    )
    expect(msgId).toBeTruthy()
    console.log(`   ✅ Reply sent: ${msgId}`)
  }, 30000)

  // ── Step 9 ──────────────────────────────────────────────
  it('Step 9: Verify full conversation with both messages', async () => {
    console.log('\n📝 Step 9: Verify conversation')

    await loginAs('userA')

    const messages = await getMessages(conversationId)
    expect(messages.length).toBe(2)
    console.log(`   ✅ ${messages.length} messages found`)

    // First message from User A
    expect(messages[0].senderId).toBe(userAId)
    expect(messages[0].content).toBe('Tengo el Lightning Bolt que buscas, te interesa?')
    console.log(`   ✅ Message 1: "${messages[0].content}" (from ${messages[0].senderUsername})`)

    // Second message from User B
    expect(messages[1].senderId).toBe(userBId)
    expect(messages[1].content).toBe('Perfecto! Que quieres a cambio?')
    console.log(`   ✅ Message 2: "${messages[1].content}" (from ${messages[1].senderUsername})`)

    // Verify conversation metadata
    const db = getDb()
    const convSnap = await getDocs(query(
      collection(db, 'conversations'),
      where('participantIds', 'array-contains', userAId)
    ))
    const conv = convSnap.docs.find(d => d.id === conversationId)
    expect(conv).toBeDefined()
    const convData = conv!.data()
    expect(convData.participantIds).toContain(userAId)
    expect(convData.participantIds).toContain(userBId)
    console.log(`   ✅ Conversation has both participants`)
  }, 30000)

  // ── Step 10 ─────────────────────────────────────────────
  it('Step 10: Post-trade — both users remove their cards', async () => {
    console.log('\n📝 Step 10: Post-trade cleanup')

    // User A removes their trade card
    await loginAs('userA')
    await deletePublicCardById(publicCardDocId)
    console.log(`   ✅ User A removed public_cards doc: ${publicCardDocId}`)
    await deleteCard(userAId, cardAId)
    console.log(`   ✅ User A removed collection card: ${cardAId}`)

    // User B removes their wishlist card
    await loginAs('userB')
    await deletePublicPrefById(publicPrefDocId)
    console.log(`   ✅ User B removed public_preferences doc: ${publicPrefDocId}`)
    await deleteCard(userBId, cardBId)
    console.log(`   ✅ User B removed collection card: ${cardBId}`)
  }, 30000)

  // ── Step 11 ─────────────────────────────────────────────
  it('Step 11: Verify public collections are clean', async () => {
    console.log('\n📝 Step 11: Verify public collections are clean')

    await loginAs('userA')

    // User A should have no test card in public_cards
    const publicCards = await getPublicCards(userAId)
    const testCard = publicCards.find((c: any) => c.cardName === TEST_CARD.nameLower)
    expect(testCard).toBeUndefined()
    console.log(`   ✅ User A's public_cards: no test card found`)

    // User B should have no test pref in public_preferences
    const publicPrefs = await getPublicPreferences(userBId)
    const testPref = publicPrefs.find((p: any) => p.cardName === TEST_CARD.nameLower)
    expect(testPref).toBeUndefined()
    console.log(`   ✅ User B's public_preferences: no test preference found`)

    console.log('\n🎉 E2E Match Flow: ALL STEPS PASSED!')
  }, 30000)
})
