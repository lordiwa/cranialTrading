/**
 * Integration Tests - Messages System
 *
 * Tests the chat/messaging functionality:
 * 1. Conversation creation
 * 2. Message sending
 * 3. Cross-user messaging
 * 4. Conversation listing
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
  getDb,
} from './testHelpers'
import {
  collection,
  doc,
  setDoc,
  getDoc,
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

// ============ MESSAGE HELPERS ============

interface TestConversation {
  id: string
  participantIds: string[]
  participantNames: Record<string, string>
  participantAvatars?: Record<string, string | null>
  lastMessage?: string
  lastMessageTime?: any
  createdAt?: any
}

interface TestMessage {
  id?: string
  senderId: string
  senderUsername: string
  recipientId: string
  content: string
  createdAt?: any
  read?: boolean
}

function getConversationId(userId1: string, userId2: string): string {
  // Sort alphabetically to ensure consistent ID regardless of who initiates
  return [userId1, userId2].sort().join('_')
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
    participantIds: [userId1, userId2].sort(),
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

async function getConversation(conversationId: string): Promise<TestConversation | null> {
  const db = getDb()
  const conversationDoc = await getDoc(doc(db, 'conversations', conversationId))
  if (!conversationDoc.exists()) return null
  return { id: conversationDoc.id, ...conversationDoc.data() } as TestConversation
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

  // Update conversation with last message
  await setDoc(doc(db, 'conversations', conversationId), {
    lastMessage: content,
    lastMessageTime: Timestamp.now(),
  }, { merge: true })

  return docRef.id
}

async function getMessages(conversationId: string): Promise<TestMessage[]> {
  const db = getDb()
  const messagesRef = collection(db, 'conversations', conversationId, 'messages')
  const q = query(messagesRef, orderBy('createdAt', 'asc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TestMessage))
}

async function getUserConversations(userId: string): Promise<TestConversation[]> {
  const db = getDb()
  const conversationsRef = collection(db, 'conversations')
  const q = query(conversationsRef, where('participantIds', 'array-contains', userId))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TestConversation))
}

async function deleteConversation(conversationId: string): Promise<void> {
  const db = getDb()

  // Delete all messages first
  const messagesRef = collection(db, 'conversations', conversationId, 'messages')
  const messagesSnapshot = await getDocs(messagesRef)
  for (const msgDoc of messagesSnapshot.docs) {
    await deleteDoc(msgDoc.ref)
  }

  // Delete conversation
  await deleteDoc(doc(db, 'conversations', conversationId))
}

async function clearTestConversations(userId: string): Promise<void> {
  const conversations = await getUserConversations(userId)
  for (const conv of conversations) {
    // Only delete test conversations (those between our test users)
    if (conv.participantIds.length === 2) {
      await deleteConversation(conv.id)
    }
  }
}

// ============ TESTS ============

describe('Messages System Integration Tests', () => {
  let userAId: string
  let userBId: string

  beforeAll(async () => {
    console.log('\n🚀 Initializing Firebase for messages tests...')
    initFirebase()

    const userAResult = await loginAs('userA')
    userAId = userAResult.userId
    console.log(`   User A: ${userAId}`)
    await logout()

    const userBResult = await loginAs('userB')
    userBId = userBResult.userId
    console.log(`   User B: ${userBId}`)
    await logout()
  })

  beforeEach(async () => {
    console.log('\n🧹 Cleaning up test conversations...')
    await loginAs('userA')
    await clearTestConversations(userAId)
    await logout()
  })

  afterAll(async () => {
    console.log('\n🧹 Final cleanup...')
    try {
      await loginAs('userA')
      await clearTestConversations(userAId)
      await logout()
    } catch { /* ignore */ }
  })

  describe('Conversation Creation', () => {
    it('should create a conversation between two users', async () => {
      console.log('\n📝 Test: Create conversation')

      await loginAs('userA')

      const conversationId = await createConversation(
        userAId,
        TEST_USERS.userA.username,
        userBId,
        TEST_USERS.userB.username
      )

      expect(conversationId).toBeTruthy()
      console.log(`   ✅ Created conversation: ${conversationId}`)

      const conversation = await getConversation(conversationId)
      expect(conversation).toBeDefined()
      expect(conversation?.participantIds).toContain(userAId)
      expect(conversation?.participantIds).toContain(userBId)
      console.log(`   ✅ Conversation has both participants`)

      await logout()
    })

    it('should generate consistent conversation ID regardless of who initiates', async () => {
      console.log('\n📝 Test: Consistent conversation ID')

      await loginAs('userA')

      // User A initiates
      const idFromA = getConversationId(userAId, userBId)

      // User B initiates (simulated)
      const idFromB = getConversationId(userBId, userAId)

      expect(idFromA).toBe(idFromB)
      console.log(`   ✅ Same ID: ${idFromA}`)

      await logout()
    })

    it('should store participant names', async () => {
      console.log('\n📝 Test: Participant names stored')

      await loginAs('userA')

      const conversationId = await createConversation(
        userAId,
        TEST_USERS.userA.username,
        userBId,
        TEST_USERS.userB.username
      )

      const conversation = await getConversation(conversationId)
      expect(conversation?.participantNames[userAId]).toBe(TEST_USERS.userA.username)
      expect(conversation?.participantNames[userBId]).toBe(TEST_USERS.userB.username)
      console.log(`   ✅ Names: ${conversation?.participantNames[userAId]}, ${conversation?.participantNames[userBId]}`)

      await logout()
    })
  })

  describe('Message Sending', () => {
    it('should send a message in a conversation', async () => {
      console.log('\n📝 Test: Send message')

      await loginAs('userA')

      // Create conversation first
      const conversationId = await createConversation(
        userAId,
        TEST_USERS.userA.username,
        userBId,
        TEST_USERS.userB.username
      )

      // Send message
      const messageId = await sendMessage(
        conversationId,
        userAId,
        TEST_USERS.userA.username,
        userBId,
        'Hello from User A!'
      )

      expect(messageId).toBeTruthy()
      console.log(`   ✅ Sent message: ${messageId}`)

      // Verify message exists
      const messages = await getMessages(conversationId)
      expect(messages.length).toBe(1)
      expect(messages[0].content).toBe('Hello from User A!')
      expect(messages[0].senderId).toBe(userAId)
      console.log(`   ✅ Message content verified`)

      await logout()
    })

    it('should update conversation lastMessage on send', async () => {
      console.log('\n📝 Test: Last message updated')

      await loginAs('userA')

      const conversationId = await createConversation(
        userAId,
        TEST_USERS.userA.username,
        userBId,
        TEST_USERS.userB.username
      )

      await sendMessage(
        conversationId,
        userAId,
        TEST_USERS.userA.username,
        userBId,
        'This is the last message'
      )

      const conversation = await getConversation(conversationId)
      expect(conversation?.lastMessage).toBe('This is the last message')
      console.log(`   ✅ lastMessage updated correctly`)

      await logout()
    })

    it('should handle multiple messages in order', async () => {
      console.log('\n📝 Test: Multiple messages in order')

      await loginAs('userA')

      const conversationId = await createConversation(
        userAId,
        TEST_USERS.userA.username,
        userBId,
        TEST_USERS.userB.username
      )

      // Send multiple messages
      await sendMessage(conversationId, userAId, TEST_USERS.userA.username, userBId, 'Message 1')
      await sendMessage(conversationId, userAId, TEST_USERS.userA.username, userBId, 'Message 2')
      await sendMessage(conversationId, userAId, TEST_USERS.userA.username, userBId, 'Message 3')

      const messages = await getMessages(conversationId)
      expect(messages.length).toBe(3)
      expect(messages[0].content).toBe('Message 1')
      expect(messages[1].content).toBe('Message 2')
      expect(messages[2].content).toBe('Message 3')
      console.log(`   ✅ ${messages.length} messages in correct order`)

      await logout()
    })
  })

  describe('Cross-User Messaging', () => {
    it('should allow both users to send messages', async () => {
      console.log('\n📝 Test: Both users send messages')

      // User A creates conversation and sends message
      await loginAs('userA')
      const conversationId = await createConversation(
        userAId,
        TEST_USERS.userA.username,
        userBId,
        TEST_USERS.userB.username
      )
      await sendMessage(conversationId, userAId, TEST_USERS.userA.username, userBId, 'Hi from A!')
      await logout()

      // User B replies
      await loginAs('userB')
      await sendMessage(conversationId, userBId, TEST_USERS.userB.username, userAId, 'Hi from B!')
      await logout()

      // Verify both messages
      await loginAs('userA')
      const messages = await getMessages(conversationId)
      expect(messages.length).toBe(2)

      const fromA = messages.find(m => m.senderId === userAId)
      const fromB = messages.find(m => m.senderId === userBId)

      expect(fromA?.content).toBe('Hi from A!')
      expect(fromB?.content).toBe('Hi from B!')
      console.log(`   ✅ Both users sent and received messages`)

      await logout()
    })

    it('should be visible to both participants', async () => {
      console.log('\n📝 Test: Conversation visible to both')

      await loginAs('userA')
      const conversationId = await createConversation(
        userAId,
        TEST_USERS.userA.username,
        userBId,
        TEST_USERS.userB.username
      )
      await sendMessage(conversationId, userAId, TEST_USERS.userA.username, userBId, 'Test message')
      await logout()

      // Check User A sees it
      await loginAs('userA')
      const userAConvs = await getUserConversations(userAId)
      const convForA = userAConvs.find(c => c.id === conversationId)
      expect(convForA).toBeDefined()
      console.log(`   ✅ User A sees conversation`)
      await logout()

      // Check User B sees it
      await loginAs('userB')
      const userBConvs = await getUserConversations(userBId)
      const convForB = userBConvs.find(c => c.id === conversationId)
      expect(convForB).toBeDefined()
      console.log(`   ✅ User B sees conversation`)

      await logout()
    })
  })

  describe('Message Properties', () => {
    it('should mark messages as unread initially', async () => {
      console.log('\n📝 Test: Messages marked unread')

      await loginAs('userA')

      const conversationId = await createConversation(
        userAId,
        TEST_USERS.userA.username,
        userBId,
        TEST_USERS.userB.username
      )

      await sendMessage(conversationId, userAId, TEST_USERS.userA.username, userBId, 'Unread test')

      const messages = await getMessages(conversationId)
      expect(messages[0].read).toBe(false)
      console.log(`   ✅ Message marked as unread`)

      await logout()
    })

    it('should store sender information', async () => {
      console.log('\n📝 Test: Sender info stored')

      await loginAs('userA')

      const conversationId = await createConversation(
        userAId,
        TEST_USERS.userA.username,
        userBId,
        TEST_USERS.userB.username
      )

      await sendMessage(conversationId, userAId, TEST_USERS.userA.username, userBId, 'Test')

      const messages = await getMessages(conversationId)
      expect(messages[0].senderId).toBe(userAId)
      expect(messages[0].senderUsername).toBe(TEST_USERS.userA.username)
      expect(messages[0].recipientId).toBe(userBId)
      console.log(`   ✅ Sender: ${messages[0].senderUsername}, Recipient: ${messages[0].recipientId}`)

      await logout()
    })
  })
})

describe('Messages Smoke Tests', () => {
  it('should have Firestore access for conversations', async () => {
    console.log('\n🔥 Smoke: Firestore conversations access')
    initFirebase()

    const { userId } = await loginAs('userA')
    const conversations = await getUserConversations(userId)
    expect(Array.isArray(conversations)).toBe(true)
    console.log(`   ✅ Can read conversations (${conversations.length} found)`)

    await logout()
  })
})
