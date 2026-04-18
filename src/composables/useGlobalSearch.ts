import { computed, ref, watch } from 'vue'
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

  const totalResults = computed(() =>
    collectionResults.value.length + usersResults.value.length + scryfallResults.value.length
  )

  // ── Keyboard nav state (D-05, D-20) ─────────────────────────────────────────
  const highlightedIndex = ref(-1)
  const activeDescendantId = ref<string | null>(null)

  // ── Live region state (D-12, D-15) ───────────────────────────────────────────
  const ariaLiveMessage = ref('')
  let liveRegionTimeout: ReturnType<typeof setTimeout> | null = null

  // ── isExpanded — popup actually rendered (D-06 Pitfall 1) ────────────────────
  const isExpanded = computed(() =>
    isOpen.value && (loading.value || totalResults.value > 0)
  )

  // ── Helper: which results array is currently active ───────────────────────────
  const getActiveResults = (): Array<Card | PublicCardResult | ScryfallCard> => {
    if (activeTab.value === 'collection') return collectionResults.value
    if (activeTab.value === 'users') return usersResults.value
    return scryfallResults.value
  }

  // ── Debounced live-region update (D-12) ──────────────────────────────────────
  const scheduleLiveRegionUpdate = (message: string): void => {
    if (liveRegionTimeout) clearTimeout(liveRegionTimeout)
    liveRegionTimeout = setTimeout(() => {
      ariaLiveMessage.value = message
    }, 500)
  }

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

    // Immediate "searching" announcement (no debounce — user needs instant feedback per D-13)
    ariaLiveMessage.value = t('header.search.searching')

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
      // Schedule count announcement after load completes (D-14, Pitfall 4)
      const count = getActiveResults().length
      const countKey = count === 1
        ? 'header.search.resultsCountSingular'
        : 'header.search.resultsCount'
      scheduleLiveRegionUpdate(
        t(countKey, { count, tabName: t(`header.search.tabNames.${activeTab.value}`) })
      )
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

  const clearSearch = () => {
    searchQuery.value = ''
    clearResults()
    isOpen.value = false
  }

  // Navigation (Enter-key path — invoked by selectHighlighted)
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

  // ── Keyboard movement (D-02 — wrap + home/end) ───────────────────────────────
  const moveHighlight = (direction: 'up' | 'down' | 'home' | 'end'): void => {
    const results = getActiveResults()
    if (results.length === 0) {
      highlightedIndex.value = -1
      activeDescendantId.value = null
      return
    }
    if (direction === 'home') {
      highlightedIndex.value = 0
    } else if (direction === 'end') {
      highlightedIndex.value = results.length - 1
    } else if (direction === 'down') {
      highlightedIndex.value = highlightedIndex.value >= results.length - 1
        ? 0
        : highlightedIndex.value + 1
    } else {
      // up
      highlightedIndex.value = highlightedIndex.value <= 0
        ? results.length - 1
        : highlightedIndex.value - 1
    }
    activeDescendantId.value = `option-${activeTab.value}-${highlightedIndex.value}`
  }

  // ── Enter key handler (D-03) ──────────────────────────────────────────────────
  const selectHighlighted = (): void => {
    const results = getActiveResults()
    if (highlightedIndex.value < 0 || highlightedIndex.value >= results.length) {
      void router.push({ path: '/search', query: { q: searchQuery.value } })
      isOpen.value = false
      searchQuery.value = ''
      return
    }
    if (activeTab.value === 'collection') {
      goToCollection(results[highlightedIndex.value] as Card)
    } else if (activeTab.value === 'users') {
      goToUserCard(results[highlightedIndex.value] as PublicCardResult)
    } else {
      goToScryfall(results[highlightedIndex.value] as ScryfallCard)
    }
  }

  // ── Route resolvers for :to= binding on RouterLink (D-21) ────────────────────
  // Templates bind :to="resolve...(card)" for Cmd+click / middle-click support.
  // Do NOT use @click.prevent on RouterLink — per D-09 correction, .prevent sets
  // defaultPrevented=true which causes RouterLink's guardEvent to skip router.push
  // on normal left-clicks. Use @click="sideEffect" without .prevent.
  const resolveCollectionRoute = (card: Card) => ({
    path: '/collection',
    query: { search: card.name },
  })

  const resolveUserRoute = (card: PublicCardResult): string =>
    `/@${card.username ?? ''}`

  const resolveScryfallRoute = (card: ScryfallCard) => ({
    path: '/collection',
    query: { addCard: card.name },
  })

  // ── Reset highlight + announce count when tab switches (Pitfall 6, D-14) ─────
  watch(activeTab, () => {
    highlightedIndex.value = -1
    activeDescendantId.value = null
    const count = getActiveResults().length
    const countKey = count === 1
      ? 'header.search.resultsCountSingular'
      : 'header.search.resultsCount'
    scheduleLiveRegionUpdate(
      t(countKey, { count, tabName: t(`header.search.tabNames.${activeTab.value}`) })
    )
  })

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
    // Plan 04-01 additions: keyboard nav + live region + route resolvers
    highlightedIndex,
    activeDescendantId,
    ariaLiveMessage,
    isExpanded,
    moveHighlight,
    selectHighlighted,
    scheduleLiveRegionUpdate,
    resolveCollectionRoute,
    resolveUserRoute,
    resolveScryfallRoute,
  }
}
