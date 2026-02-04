/**
 * Test Helpers - Firebase utilities for integration testing
 *
 * These helpers allow testing Firebase operations directly without the UI.
 * Simulates what the stores and services do but in a controlled test environment.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User
} from 'firebase/auth'
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  Timestamp,
  type Firestore
} from 'firebase/firestore'

// Test user credentials - loaded from environment variables
// Set these in .env.local or .env.test:
// TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD, TEST_USER_A_USERNAME
// TEST_USER_B_EMAIL, TEST_USER_B_PASSWORD, TEST_USER_B_USERNAME
export const TEST_USERS = {
  userA: {
    email: process.env.TEST_USER_A_EMAIL || '',
    password: process.env.TEST_USER_A_PASSWORD || '',
    username: process.env.TEST_USER_A_USERNAME || 'userA'
  },
  userB: {
    email: process.env.TEST_USER_B_EMAIL || '',
    password: process.env.TEST_USER_B_PASSWORD || '',
    username: process.env.TEST_USER_B_USERNAME || 'userB'
  }
}

// Validate test credentials are set
export function validateTestCredentials() {
  const missing: string[] = []
  if (!TEST_USERS.userA.email) missing.push('TEST_USER_A_EMAIL')
  if (!TEST_USERS.userA.password) missing.push('TEST_USER_A_PASSWORD')
  if (!TEST_USERS.userB.email) missing.push('TEST_USER_B_EMAIL')
  if (!TEST_USERS.userB.password) missing.push('TEST_USER_B_PASSWORD')

  if (missing.length > 0) {
    throw new Error(`Missing test credentials in .env.local: ${missing.join(', ')}`)
  }
}

// Firebase instances
let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

/**
 * Initialize Firebase for tests
 */
export function initFirebase() {
  if (app) return { app, auth: auth!, db: db! }

  const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
  }

  app = initializeApp(firebaseConfig, 'test-app')
  auth = getAuth(app)
  db = getFirestore(app)

  return { app, auth, db }
}

// Cache current user to avoid redundant logins
let currentUserKey: 'userA' | 'userB' | null = null

/**
 * Login as a test user and return their user object.
 * Caches auth state to avoid redundant login calls (reduces rate limit issues).
 */
export async function loginAs(userKey: 'userA' | 'userB'): Promise<{ user: User; userId: string }> {
  const { auth } = initFirebase()

  // If already logged in as this user, return current user
  if (currentUserKey === userKey && auth.currentUser) {
    return {
      user: auth.currentUser,
      userId: auth.currentUser.uid
    }
  }

  // If logged in as different user, logout first
  if (auth.currentUser && currentUserKey !== userKey) {
    await signOut(auth)
    currentUserKey = null
  }

  const credentials = TEST_USERS[userKey]
  const userCredential = await signInWithEmailAndPassword(auth, credentials.email, credentials.password)
  currentUserKey = userKey

  return {
    user: userCredential.user,
    userId: userCredential.user.uid
  }
}

/**
 * Logout current user
 */
export async function logout() {
  const { auth } = initFirebase()
  if (auth.currentUser) {
    await signOut(auth)
    currentUserKey = null
  }
}

/**
 * Force logout (resets cached state)
 */
export async function forceLogout() {
  const { auth } = initFirebase()
  await signOut(auth)
  currentUserKey = null
}

/**
 * Get Firestore instance
 */
export function getDb(): Firestore {
  const { db } = initFirebase()
  return db
}

// ============ CARD OPERATIONS ============

export interface TestCard {
  id?: string
  scryfallId: string
  name: string
  edition: string
  quantity: number
  condition: string
  foil: boolean
  status: 'collection' | 'sale' | 'trade' | 'wishlist'
  price: number
  public?: boolean
}

/**
 * Add a card to a user's collection
 */
export async function addCardToCollection(userId: string, card: TestCard): Promise<string> {
  const db = getDb()
  const cardsRef = collection(db, 'users', userId, 'cards')

  const docRef = await addDoc(cardsRef, {
    ...card,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    public: card.public ?? (card.status === 'sale' || card.status === 'trade')
  })

  return docRef.id
}

/**
 * Delete a card from a user's collection
 */
export async function deleteCard(userId: string, cardId: string): Promise<void> {
  const db = getDb()
  await deleteDoc(doc(db, 'users', userId, 'cards', cardId))
}

/**
 * Get all cards for a user
 */
export async function getUserCards(userId: string): Promise<TestCard[]> {
  const db = getDb()
  const cardsRef = collection(db, 'users', userId, 'cards')
  const snapshot = await getDocs(cardsRef)
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TestCard))
}

// ============ PUBLIC CARDS OPERATIONS ============

/**
 * Sync a card to public_cards collection (simulates collectionStore.syncAllToPublic)
 */
export async function syncCardToPublic(userId: string, username: string, card: TestCard & { id: string }): Promise<void> {
  const db = getDb()

  if (card.status === 'sale' || card.status === 'trade') {
    const publicCardsRef = collection(db, 'public_cards')
    await addDoc(publicCardsRef, {
      odocId: card.id,
      odocPath: `users/${userId}/cards/${card.id}`,
      userId,
      username,
      cardName: card.name.toLowerCase(),
      scryfallId: card.scryfallId,
      edition: card.edition,
      quantity: card.quantity,
      condition: card.condition,
      foil: card.foil,
      status: card.status,
      price: card.price,
      updatedAt: Timestamp.now()
    })
  }

  if (card.status === 'wishlist') {
    const publicPrefsRef = collection(db, 'public_preferences')
    await addDoc(publicPrefsRef, {
      odocId: card.id,
      odocPath: `users/${userId}/cards/${card.id}`,
      userId,
      username,
      cardName: card.name.toLowerCase(),
      minCondition: card.condition,
      updatedAt: Timestamp.now()
    })
  }
}

/**
 * Get public cards for a user
 */
export async function getPublicCards(userId: string): Promise<any[]> {
  const db = getDb()
  const publicCardsRef = collection(db, 'public_cards')
  const cardsQuery = query(publicCardsRef, where('userId', '==', userId))
  const snapshot = await getDocs(cardsQuery)
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Get public preferences (wishlist) for a user
 */
export async function getPublicPreferences(userId: string): Promise<any[]> {
  const db = getDb()
  const publicPrefsRef = collection(db, 'public_preferences')
  const prefsQuery = query(publicPrefsRef, where('userId', '==', userId))
  const snapshot = await getDocs(prefsQuery)
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
}

/**
 * Clear public cards/preferences for a user
 */
export async function clearPublicData(userId: string): Promise<void> {
  const db = getDb()

  // Clear public_cards
  const publicCardsRef = collection(db, 'public_cards')
  const cardsQuery = query(publicCardsRef, where('userId', '==', userId))
  const cardsSnapshot = await getDocs(cardsQuery)
  for (const docSnap of cardsSnapshot.docs) {
    await deleteDoc(docSnap.ref)
  }

  // Clear public_preferences
  const publicPrefsRef = collection(db, 'public_preferences')
  const prefsQuery = query(publicPrefsRef, where('userId', '==', userId))
  const prefsSnapshot = await getDocs(prefsQuery)
  for (const docSnap of prefsSnapshot.docs) {
    await deleteDoc(docSnap.ref)
  }
}

// ============ MATCH OPERATIONS ============

export interface TestMatch {
  id: string
  otherUserId: string
  otherUsername: string
  myCards: any[]
  otherCards: any[]
  status: string
  type: string
  compatibility: number
}

/**
 * Create a match in a user's matches_nuevos collection
 */
export async function createMatch(userId: string, match: Partial<TestMatch>): Promise<string> {
  const db = getDb()
  const matchesRef = collection(db, 'users', userId, 'matches_nuevos')

  const docRef = await addDoc(matchesRef, {
    ...match,
    status: 'nuevo',
    createdAt: Timestamp.now(),
    lifeExpiresAt: Timestamp.fromDate(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000))
  })

  return docRef.id
}

/**
 * Get matches from a user's matches_nuevos collection
 */
export async function getNewMatches(userId: string): Promise<TestMatch[]> {
  const db = getDb()
  const matchesRef = collection(db, 'users', userId, 'matches_nuevos')
  const snapshot = await getDocs(matchesRef)
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as unknown as TestMatch))
}

/**
 * Get matches from a user's matches_eliminados collection
 */
export async function getDiscardedMatches(userId: string): Promise<TestMatch[]> {
  const db = getDb()
  const matchesRef = collection(db, 'users', userId, 'matches_eliminados')
  const snapshot = await getDocs(matchesRef)
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as unknown as TestMatch))
}

/**
 * Add a match to matches_eliminados (discard)
 */
export async function discardMatch(userId: string, match: Partial<TestMatch>): Promise<string> {
  const db = getDb()
  const discardedRef = collection(db, 'users', userId, 'matches_eliminados')

  const docRef = await addDoc(discardedRef, {
    ...match,
    status: 'eliminado',
    eliminatedAt: Timestamp.now(),
    lifeExpiresAt: Timestamp.fromDate(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000))
  })

  return docRef.id
}

/**
 * Clear all matches for a user (cleanup)
 */
export async function clearAllMatches(userId: string): Promise<void> {
  const db = getDb()
  const collections = ['matches_nuevos', 'matches_guardados', 'matches_eliminados']

  for (const colName of collections) {
    const colRef = collection(db, 'users', userId, colName)
    const snapshot = await getDocs(colRef)
    for (const docSnap of snapshot.docs) {
      await deleteDoc(docSnap.ref)
    }
  }
}

/**
 * Notify another user about a match (simulates matchesStore.notifyOtherUser)
 */
export async function notifyOtherUser(
  fromUserId: string,
  fromUsername: string,
  toUserId: string,
  matchData: {
    myCards: any[]
    otherCards: any[]
    compatibility: number
    type: string
  }
): Promise<string> {
  const db = getDb()
  const recipientRef = collection(db, 'users', toUserId, 'matches_nuevos')

  const matchId = `${toUserId}_${fromUserId}_${Date.now()}`

  const docRef = await addDoc(recipientRef, {
    id: matchId,
    otherUserId: fromUserId,
    otherUsername: fromUsername,
    // Swap cards - what sender offers becomes what recipient receives
    myCards: matchData.otherCards,
    otherCards: matchData.myCards,
    compatibility: matchData.compatibility,
    type: matchData.type,
    status: 'nuevo',
    createdAt: Timestamp.now(),
    lifeExpiresAt: Timestamp.fromDate(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)),
    _notificationOf: matchId
  })

  return docRef.id
}

// ============ CLEANUP ============

/**
 * Full cleanup for a user - removes test data
 */
export async function cleanupTestUser(userId: string): Promise<void> {
  await clearAllMatches(userId)
  await clearPublicData(userId)

  // Delete test cards (cards with name starting with "TEST_")
  const db = getDb()
  const cardsRef = collection(db, 'users', userId, 'cards')
  const snapshot = await getDocs(cardsRef)
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data()
    if (data.name?.startsWith('TEST_')) {
      await deleteDoc(docSnap.ref)
    }
  }
}
