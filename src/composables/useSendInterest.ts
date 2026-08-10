/**
 * ME INTERESA — send an interest (shared_match) for another user's public card.
 *
 * Extracted from useGlobalSearch (TASK-075) so both the header search and the
 * /search results page share a single implementation. Dedup rule: an existing
 * shared_match with the same sender/receiver/scryfallId/edition marks the card
 * as sent without creating a new document.
 */

import { ref } from 'vue'
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../services/firestore'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import { useI18n } from './useI18n'
import { getMatchExpirationDate } from '../utils/matchExpiry'
import type { PublicCardResult } from '../services/publicCardSearch'

export function useSendInterest() {
  const authStore = useAuthStore()
  const toastStore = useToastStore()
  const { t } = useI18n()

  const sentInterestIds = ref<Set<string>>(new Set())
  const sendingInterest = ref(false)

  const sendInterestFromSearch = async (card: PublicCardResult) => {
    if (!authStore.user || sentInterestIds.value.has(card.id) || sendingInterest.value) return

    sendingInterest.value = true
    try {
      const scryfallId = card.scryfallId ?? ''
      const edition = card.edition ?? ''

      const sharedMatchesRef = collection(db, 'shared_matches')
      const existingQuery = query(
        sharedMatchesRef,
        where('senderId', '==', authStore.user.id),
        where('receiverId', '==', card.userId),
        where('card.scryfallId', '==', scryfallId)
      )
      const existingSnapshot = await getDocs(existingQuery)

      const hasDuplicate = existingSnapshot.docs.some(docSnap => {
        const data = docSnap.data() as Record<string, unknown>
        const cardField = data.card as Record<string, unknown> | undefined
        return cardField?.edition === edition
      })

      if (hasDuplicate) {
        sentInterestIds.value.add(card.id)
        toastStore.show(t('dashboard.interest.sent', { username: card.username ?? '' }), 'info')
        return
      }

      const cardData = {
        id: card.cardId ?? card.id,
        scryfallId,
        name: card.cardName ?? '',
        edition,
        quantity: card.quantity ?? 1,
        condition: card.condition ?? 'NM',
        foil: card.foil ?? false,
        price: card.price ?? 0,
        image: card.image ?? '',
        status: card.status ?? 'sale',
      }

      const totalValue = (card.price ?? 0) * (card.quantity ?? 1)

      const sharedMatchPayload = {
        senderId: authStore.user.id,
        senderUsername: authStore.user.username,
        senderLocation: authStore.user.location ?? '',
        senderEmail: authStore.user.email ?? '',
        receiverId: card.userId,
        receiverUsername: card.username ?? '',
        receiverLocation: card.location ?? '',
        card: cardData,
        cardType: card.status ?? 'sale',
        totalValue,
        status: 'pending',
        senderStatus: 'interested',
        receiverStatus: 'new',
        createdAt: new Date(),
        lifeExpiresAt: getMatchExpirationDate(),
      }

      await addDoc(sharedMatchesRef, sharedMatchPayload)

      sentInterestIds.value.add(card.id)
      toastStore.show(t('dashboard.interest.sent', { username: card.username ?? '' }), 'success')
    } catch (error) {
      console.error('Error sending interest:', error)
      toastStore.show(t('dashboard.interest.error'), 'error')
    } finally {
      sendingInterest.value = false
    }
  }

  return {
    sentInterestIds,
    sendingInterest,
    sendInterestFromSearch,
  }
}
