/**
 * Public Cards Service
 *
 * Manages denormalized public collections for efficient match queries.
 * Instead of loading ALL users to find matches, we query indexed collections.
 *
 * Collections:
 * - /public_cards/{docId} - Cards available for trade/sale
 * - /public_preferences/{docId} - Cards users are looking for
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Card } from '../types/card'

export interface PublicCard {
  docId: string // Firestore document ID
  cardId: string // matches the user's card document ID
  userId: string
  username: string
  avatarUrl?: string | null
  cardName: string
  scryfallId: string
  status: 'trade' | 'sale'
  price: number
  edition: string
  condition: string
  foil: boolean
  quantity: number
  image: string
  location?: string
  email?: string
  updatedAt: Timestamp
}

export interface PublicPreference {
  docId: string // Firestore document ID
  prefId: string // matches the user's preference document ID
  userId: string
  username: string
  avatarUrl?: string | null
  cardName: string
  scryfallId: string
  maxPrice?: number
  minCondition?: string
  location?: string
  email?: string
  updatedAt: Timestamp
}

/**
 * Sync a single card to public_cards collection
 * Only syncs cards with status 'trade' or 'sale' AND public: true
 */
export async function syncCardToPublic(
  card: Card,
  userId: string,
  username: string,
  userLocation?: string,
  userEmail?: string,
  userAvatarUrl?: string | null
): Promise<void> {
  const publicCardId = `${userId}_${card.id}`
  const publicCardRef = doc(db, 'public_cards', publicCardId)

  // Only publish trade/sale cards that are marked as public
  const isPublicCard = (card.status === 'trade' || card.status === 'sale') && card.public === true

  if (isPublicCard) {
    const publicCard = {
      cardId: card.id,
      userId,
      username,
      avatarUrl: userAvatarUrl || null,
      cardName: card.name,
      scryfallId: card.scryfallId,
      status: card.status as 'trade' | 'sale',
      price: card.price || 0,
      edition: card.edition || '',
      condition: card.condition || 'NM',
      foil: card.foil || false,
      quantity: card.quantity || 1,
      image: card.image || '',
      location: userLocation,
      email: userEmail,
      updatedAt: Timestamp.now(),
    }
    await setDoc(publicCardRef, publicCard)
  } else {
    // Remove from public if not public or status changed
    await deleteDoc(publicCardRef).catch(() => { /* doc may not exist */ })
  }
}

/**
 * Remove a card from public_cards collection
 */
export async function removeCardFromPublic(cardId: string, userId: string): Promise<void> {
  const publicCardId = `${userId}_${cardId}`
  await deleteDoc(doc(db, 'public_cards', publicCardId)).catch(() => { /* doc may not exist */ })
}

/**
 * Sync a preference to public_preferences collection
 */
export async function syncPreferenceToPublic(
  preference: any,
  userId: string,
  username: string,
  userLocation?: string,
  userEmail?: string,
  userAvatarUrl?: string | null
): Promise<void> {
  const publicPrefId = `${userId}_${preference.id}`
  const publicPrefRef = doc(db, 'public_preferences', publicPrefId)

  // Filter out undefined values (Firestore doesn't accept them)
  const publicPref: Record<string, any> = {
    prefId: preference.id,
    userId,
    username,
    avatarUrl: userAvatarUrl || null,
    cardName: preference.cardName || preference.name || '',
    scryfallId: preference.scryfallId || '',
    updatedAt: Timestamp.now(),
  }
  if (preference.maxPrice !== undefined) publicPref.maxPrice = preference.maxPrice
  if (preference.minCondition !== undefined) publicPref.minCondition = preference.minCondition
  if (userLocation) publicPref.location = userLocation
  if (userEmail) publicPref.email = userEmail
  await setDoc(publicPrefRef, publicPref)
}

/**
 * Remove a preference from public_preferences collection
 */
export async function removePreferenceFromPublic(prefId: string, userId: string): Promise<void> {
  const publicPrefId = `${userId}_${prefId}`
  await deleteDoc(doc(db, 'public_preferences', publicPrefId)).catch(() => { /* doc may not exist */ })
}

/**
 * Bulk sync all user's cards to public collection
 * Used on initial setup or when user updates profile
 */
export async function syncAllUserCards(
  cards: Card[],
  userId: string,
  username: string,
  userLocation?: string,
  userEmail?: string,
  userAvatarUrl?: string | null
): Promise<void> {
  // Filter trade/sale cards that are marked as public
  const publicCards = cards.filter(c => (c.status === 'trade' || c.status === 'sale') && c.public === true)

  // First, remove all existing public cards for this user
  const existingQuery = query(
    collection(db, 'public_cards'),
    where('userId', '==', userId)
  )
  const existingDocs = await getDocs(existingQuery)

  // Delete in batches of 400 (Firestore limit is 500)
  const BATCH_SIZE = 400
  const docsToDelete = existingDocs.docs

  for (let i = 0; i < docsToDelete.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = docsToDelete.slice(i, i + BATCH_SIZE)
    chunk.forEach(docSnap => batch.delete(docSnap.ref))
    await batch.commit()
  }

  // Add new cards in batches
  for (let i = 0; i < publicCards.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = publicCards.slice(i, i + BATCH_SIZE)

    for (const card of chunk) {
      const publicCardId = `${userId}_${card.id}`
      const publicCardRef = doc(db, 'public_cards', publicCardId)
      batch.set(publicCardRef, {
        cardId: card.id,
        userId,
        username,
        avatarUrl: userAvatarUrl || null,
        cardName: card.name,
        scryfallId: card.scryfallId,
        status: card.status,
        price: card.price || 0,
        edition: card.edition || '',
        condition: card.condition || 'NM',
        foil: card.foil || false,
        quantity: card.quantity || 1,
        image: card.image || '',
        location: userLocation || '',
        email: userEmail || '',
        updatedAt: Timestamp.now(),
      })
    }
    await batch.commit()
  }
}

/**
 * Bulk sync all user's preferences to public collection
 */
export async function syncAllUserPreferences(
  preferences: any[],
  userId: string,
  username: string,
  userLocation?: string,
  userEmail?: string,
  userAvatarUrl?: string | null
): Promise<void> {
  // First, remove all existing public preferences for this user
  const existingQuery = query(
    collection(db, 'public_preferences'),
    where('userId', '==', userId)
  )
  const existingDocs = await getDocs(existingQuery)

  // Delete in batches of 400
  const BATCH_SIZE = 400
  const docsToDelete = existingDocs.docs

  for (let i = 0; i < docsToDelete.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = docsToDelete.slice(i, i + BATCH_SIZE)
    chunk.forEach(docSnap => batch.delete(docSnap.ref))
    await batch.commit()
  }

  // Add preferences in batches
  for (let i = 0; i < preferences.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = preferences.slice(i, i + BATCH_SIZE)

    for (const pref of chunk) {
      const publicPrefId = `${userId}_${pref.id}`
      const publicPrefRef = doc(db, 'public_preferences', publicPrefId)
      // Filter out undefined values (Firestore doesn't accept them)
      const data: Record<string, any> = {
        prefId: pref.id,
        userId,
        username,
        avatarUrl: userAvatarUrl || null,
        cardName: pref.cardName || pref.name || '',
        scryfallId: pref.scryfallId || '',
        updatedAt: Timestamp.now(),
      }
      if (pref.maxPrice !== undefined) data.maxPrice = pref.maxPrice
      if (pref.minCondition !== undefined) data.minCondition = pref.minCondition
      if (userLocation) data.location = userLocation
      if (userEmail) data.email = userEmail
      batch.set(publicPrefRef, data)
    }
    await batch.commit()
  }
}

/**
 * Find public cards that match user's preferences (BUSCO matches)
 * Returns cards from other users that I'm looking for
 * Matches by card NAME (any printing), not exact scryfallId
 */
export async function findCardsMatchingPreferences(
  preferences: any[],
  excludeUserId: string
): Promise<PublicCard[]> {
  if (preferences.length === 0) {
    return []
  }

  // Get unique card names from preferences
  const cardNames = [...new Set(
    preferences
      .map(p => p.cardName || p.name || '')
      .filter(name => name && name.length > 0)
  )]

  if (cardNames.length === 0) {
    return []
  }

  // Firestore 'in' query limited to 30 items, so chunk if needed
  const chunks: string[][] = []
  for (let i = 0; i < cardNames.length; i += 30) {
    chunks.push(cardNames.slice(i, i + 30))
  }

  const results: PublicCard[] = []

  for (const chunk of chunks) {
    const q = query(
      collection(db, 'public_cards'),
      where('cardName', 'in', chunk)
    )
    const snapshot = await getDocs(q)

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as PublicCard
      if (data.userId !== excludeUserId) {
        results.push({ ...data, docId: docSnap.id })
      }
    })
  }

  return results
}

/**
 * Find public preferences that match user's cards (VENDO matches)
 * Returns preferences from other users for cards I have
 * Matches by card NAME (any printing), not exact scryfallId
 */
export async function findPreferencesMatchingCards(
  cards: Card[],
  excludeUserId: string
): Promise<PublicPreference[]> {
  const tradeableCards = cards.filter(c => c.status === 'trade' || c.status === 'sale')
  if (tradeableCards.length === 0) return []

  // Get unique card names from tradeable cards
  const cardNames = [...new Set(
    tradeableCards
      .map(c => c.name)
      .filter(name => name && name.length > 0)
  )]

  if (cardNames.length === 0) return []

  // Firestore 'in' query limited to 30 items, so chunk if needed
  const chunks: string[][] = []
  for (let i = 0; i < cardNames.length; i += 30) {
    chunks.push(cardNames.slice(i, i + 30))
  }

  const results: PublicPreference[] = []

  for (const chunk of chunks) {
    const q = query(
      collection(db, 'public_preferences'),
      where('cardName', 'in', chunk)
    )
    const snapshot = await getDocs(q)

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as PublicPreference
      if (data.userId !== excludeUserId) {
        results.push({ ...data, docId: docSnap.id })
      }
    })
  }

  return results
}

/**
 * Get all public cards for a specific user (for bidirectional matching)
 */
export async function getUserPublicCards(userId: string): Promise<PublicCard[]> {
  const q = query(
    collection(db, 'public_cards'),
    where('userId', '==', userId)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => ({ ...d.data(), docId: d.id } as PublicCard))
}

/**
 * Get all public preferences for a specific user (for bidirectional matching)
 */
export async function getUserPublicPreferences(userId: string): Promise<PublicPreference[]> {
  const q = query(
    collection(db, 'public_preferences'),
    where('userId', '==', userId)
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => ({ ...d.data(), docId: d.id } as PublicPreference))
}
