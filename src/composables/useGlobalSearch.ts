import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCollectionStore } from '../stores/collection'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import { useI18n } from './useI18n'
import { type ScryfallCard, searchCards } from '../services/scryfall'
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../services/firebase'
import type { Card } from '../types/card'
import { getMatchExpirationDate } from '../utils/matchExpiry'

export interface PublicCardResult {
  id: string
  cardId?: string
  scryfallId?: string
  cardName?: string
  cardNameLower?: string
  edition?: string
  userId?: string
  username?: string
  location?: string
  avatarUrl?: string
  quantity?: number
  condition?: string
  foil?: boolean
  price?: number
  image?: string
  status?: string
}

export function useGlobalSearch() {
  const router = useRouter()
  const collectionStore = useCollectionStore()
  const authStore = useAuthStore()
  const toastStore = useToastStore()
  const { t } = useI18n()

  const searchQuery = ref('')
  const isOpen = ref(false)
  const loading = ref(false)
  const activeTab = ref<'collection' | 'users' | 'scryfall'>('collection')

  // Results
  const collectionResults = ref<Card[]>([])
  const usersResults = ref<PublicCardResult[]>([])
  const scryfallResults = ref<ScryfallCard[]>([])

  // Debounced search
  let searchTimeout: ReturnType<typeof setTimeout> | null = null

  const handleInput = () => {
    if (searchTimeout) clearTimeout(searchTimeout)

    if (searchQuery.value.length < 2) {
      clearResults()
      return
    }

    searchTimeout = setTimeout(() => {
      void performSearch()
    }, 300)
  }

  const clearResults = () => {
    collectionResults.value = []
    usersResults.value = []
    scryfallResults.value = []
  }

  const performSearch = async () => {
    if (searchQuery.value.length < 2) return

    loading.value = true
    isOpen.value = true

    const q = searchQuery.value.toLowerCase()

    try {
      searchCollection(q)
      await Promise.all([
        searchUsers(q),
        searchScryfall(q)
      ])

      // Auto-select first tab with results
      if (collectionResults.value.length > 0) {
        activeTab.value = 'collection'
      } else if (usersResults.value.length > 0) {
        activeTab.value = 'users'
      } else if (scryfallResults.value.length > 0) {
        activeTab.value = 'scryfall'
      }
    } finally {
      loading.value = false
    }
  }

  const searchCollection = (q: string) => {
    collectionResults.value = collectionStore.cards
      .filter(card => card.name.toLowerCase().includes(q))
      .slice(0, 8)
  }

  const searchUsers = async (searchQ: string) => {
    if (!authStore.user) return

    try {
      const publicCardsRef = collection(db, 'public_cards')
      const q = query(
        publicCardsRef,
        where('cardNameLower', '>=', searchQ),
        where('cardNameLower', '<=', searchQ + '\uf8ff')
      )
      const snapshot = await getDocs(q)

      usersResults.value = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as PublicCardResult))
        .filter((card: PublicCardResult) => card.userId !== authStore.user?.id)
        .slice(0, 8)
    } catch {
      try {
        const publicCardsRef = collection(db, 'public_cards')
        const snapshot = await getDocs(publicCardsRef)
        usersResults.value = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as PublicCardResult))
          .filter((card: PublicCardResult) =>
            card.cardName?.toLowerCase().includes(searchQ) &&
            card.userId !== authStore.user?.id
          )
          .slice(0, 8)
      } catch (error) {
        console.error('Error searching users:', error)
        usersResults.value = []
      }
    }
  }

  const searchScryfall = async (q: string) => {
    try {
      const results = await searchCards(q)
      scryfallResults.value = results.slice(0, 8)
    } catch {
      scryfallResults.value = []
    }
  }

  const totalResults = computed(() =>
    collectionResults.value.length + usersResults.value.length + scryfallResults.value.length
  )

  const clearSearch = () => {
    searchQuery.value = ''
    clearResults()
    isOpen.value = false
  }

  // Navigation
  const goToCollection = (card: Card) => {
    isOpen.value = false
    searchQuery.value = ''
    void router.push({ path: '/collection', query: { search: card.name } })
  }

  const goToUserCard = (card: PublicCardResult) => {
    isOpen.value = false
    searchQuery.value = ''
    void router.push(`/@${card.username}`)
  }

  const goToScryfall = (card: ScryfallCard) => {
    isOpen.value = false
    searchQuery.value = ''
    void router.push({ path: '/collection', query: { addCard: card.name } })
  }

  // ME INTERESA
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
    searchQuery,
    isOpen,
    loading,
    activeTab,
    collectionResults,
    usersResults,
    scryfallResults,
    handleInput,
    performSearch,
    clearResults,
    clearSearch,
    totalResults,
    goToCollection,
    goToUserCard,
    goToScryfall,
    sentInterestIds,
    sendingInterest,
    sendInterestFromSearch,
  }
}
