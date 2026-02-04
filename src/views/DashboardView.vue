<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import MatchCard from '../components/matches/MatchCard.vue'
import HelpTooltip from '../components/ui/HelpTooltip.vue'
import { getAvatarUrlForUser } from '../utils/avatar'
import { useCollectionStore } from '../stores/collection'
import { usePreferencesStore } from '../stores/preferences'
import { useAuthStore } from '../stores/auth'
import { useMatchesStore } from '../stores/matches'
import { usePriceMatchingStore } from '../stores/priceMatchingHelper'
import { useDecksStore } from '../stores/decks'
import { addDoc, collection, deleteDoc, doc, getDocs } from 'firebase/firestore'
import { useToastStore } from '../stores/toast'
import { useConfirmStore } from '../stores/confirm'
import { useI18n } from '../composables/useI18n'
import { db } from '../services/firebase'
import {
  findCardsMatchingPreferences,
  findPreferencesMatchingCards,
  type PublicCard,
  type PublicPreference,
} from '../services/publicCards'
import { getCardSuggestions, searchCards } from '../services/scryfall'

const collectionStore = useCollectionStore()
const preferencesStore = usePreferencesStore()
const authStore = useAuthStore()
const matchesStore = useMatchesStore()
const priceMatching = usePriceMatchingStore()
const decksStore = useDecksStore()
const toastStore = useToastStore()
const confirmStore = useConfirmStore()
const { t } = useI18n()

const loading = ref(false)
const syncing = ref(false)
const calculatedMatches = ref<any[]>([])
const progressCurrent = ref(0)
const progressTotal = ref(0)
const totalUsers = ref(0)

// Format last sync time
const formatLastSync = (date: Date): string => {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)

  if (diffMins < 1) return t('dashboard.justNow')
  if (diffMins < 60) return t('dashboard.minutesAgo', { mins: diffMins })
  if (diffHours < 24) return t('dashboard.hoursAgo', { hours: diffHours })
  return date.toLocaleDateString()
}

// ========== CLEAR DATA PROGRESS STATE ==========
type ClearDataStep = 'cards' | 'preferences' | 'matches_nuevos' | 'matches_guardados' | 'matches_eliminados' | 'contactos' | 'decks'

interface ClearDataState {
  status: 'in_progress' | 'complete' | 'error'
  completedSteps: ClearDataStep[]
  currentStep: ClearDataStep | null
  errors: number
}

const CLEAR_DATA_STORAGE_KEY = 'cranial_clear_data_progress'
const clearDataProgress = ref<ClearDataState | null>(null)

const ALL_CLEAR_STEPS: ClearDataStep[] = ['cards', 'preferences', 'matches_nuevos', 'matches_guardados', 'matches_eliminados', 'contactos', 'decks']

const saveClearDataState = (state: ClearDataState) => {
  try {
    localStorage.setItem(CLEAR_DATA_STORAGE_KEY, JSON.stringify(state))
    clearDataProgress.value = state
  } catch (e) {
    console.warn('[ClearData] Failed to save state:', e)
  }
}

const loadClearDataState = (): ClearDataState | null => {
  try {
    const saved = localStorage.getItem(CLEAR_DATA_STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (e) {
    console.warn('[ClearData] Failed to load state:', e)
  }
  return null
}

const clearClearDataState = () => {
  try {
    localStorage.removeItem(CLEAR_DATA_STORAGE_KEY)
    clearDataProgress.value = null
  } catch (e) {
    console.warn('[ClearData] Failed to clear state:', e)
  }
}

// Discarded matches (persisted in Firestore matches_eliminados)
const discardedMatchIds = ref<Set<string>>(new Set())

// Card search
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const searching = ref(false)
const searchedOnce = ref(false)
const sentInterestIds = ref<Set<string>>(new Set())

// Auto-suggest
const suggestions = ref<string[]>([])
const showSuggestions = ref(false)
const suggestLoading = ref(false)

// Scryfall fallback results (when no public_cards found)
const scryfallResults = ref<any[]>([])
const showScryfallFallback = ref(false)

/**
 * Load discarded match IDs from Firestore matches_eliminados
 * This ensures discarded matches don't reappear after refresh
 */
const loadDiscardedMatches = async () => {
  if (!authStore.user) return

  try {
    const discardedRef = collection(db, 'users', authStore.user.id, 'matches_eliminados')
    const snapshot = await getDocs(discardedRef)

    const ids = new Set<string>()
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data()
      // Track by otherUserId to prevent matches with same user from reappearing
      if (data.otherUserId) {
        ids.add(data.otherUserId)
      }
    }
    discardedMatchIds.value = ids
  } catch (err) {
    console.error('Error loading discarded matches:', err)
    discardedMatchIds.value = new Set()
  }
}

/**
 * Discard a match by moving it to matches_eliminados in Firestore
 */
const discardMatchToFirestore = async (match: any) => {
  if (!authStore.user) return

  try {
    const discardedRef = collection(db, 'users', authStore.user.id, 'matches_eliminados')
    await addDoc(discardedRef, {
      id: match.id,
      otherUserId: match.otherUserId,
      otherUsername: match.otherUsername,
      otherLocation: match.otherLocation,
      myCards: match.myCards || [],
      otherCards: match.otherCards || [],
      status: 'eliminado',
      eliminatedAt: new Date(),
      lifeExpiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    })

    // Track by otherUserId to prevent future matches with same user
    discardedMatchIds.value.add(match.otherUserId)

    // Also remove from matches_nuevos if it exists there
    const nuevosRef = collection(db, 'users', authStore.user.id, 'matches_nuevos')
    const nuevosSnapshot = await getDocs(nuevosRef)
    for (const docSnap of nuevosSnapshot.docs) {
      const data = docSnap.data()
      if (data.id === match.id || data.otherUserId === match.otherUserId) {
        await deleteDoc(docSnap.ref)
      }
    }
  } catch (err) {
    console.error('Error discarding match:', err)
  }
}

/**
 * Sincronizar datos a colecciones públicas para matches optimizados
 */
const syncPublicData = async () => {
  if (!authStore.user) return

  syncing.value = true
  try {
    // collectionStore ahora sincroniza tanto sale/trade como wishlist
    await collectionStore.syncAllToPublic()
    console.log('✅ Datos sincronizados a colecciones públicas')
  } catch (error) {
    console.error('Error sincronizando datos públicos:', error)
  } finally {
    syncing.value = false
  }
}

onMounted(async () => {
  if (!authStore.user) return

  // Check for incomplete clear data operation and resume if needed
  const savedClearState = loadClearDataState()
  if (savedClearState?.status === 'in_progress') {
    resumeClearData(savedClearState)
    return // Don't load other data, we're clearing everything
  } else if (savedClearState?.status === 'complete') {
    clearClearDataState()
  }

  // Load discarded matches from Firestore
  await loadDiscardedMatches()

  loading.value = true
  try {
    // Cargar datos del usuario
    await Promise.all([
      collectionStore.loadCollection(),
      preferencesStore.loadPreferences(),
    ])

    // Contar usuarios totales
    const usersRef = collection(db, 'users')
    const usersSnapshot = await getDocs(usersRef)
    totalUsers.value = usersSnapshot.docs.length - 1 // Excluir al usuario actual

    // ✅ CORREGIDO: Calcular matches si tiene CARTAS O PREFERENCIAS
    // Antes: Solo si tenía preferencias
    // Ahora: Si tiene cartas (para VENDER) O preferencias (para BUSCAR)
    if (collectionStore.cards.length > 0 || preferencesStore.preferences.length > 0) {
      await calculateMatches()
    }
  } finally {
    loading.value = false
  }
})

/**
 * Helper: Delete a single collection step
 */
const deleteCollectionStep = async (userId: string, step: ClearDataStep): Promise<boolean> => {
  const collectionMap: Record<ClearDataStep, string> = {
    'cards': 'cards',
    'preferences': 'preferences',
    'matches_nuevos': 'matches_nuevos',
    'matches_guardados': 'matches_guardados',
    'matches_eliminados': 'matches_eliminados',
    'contactos': 'contactos_guardados',
    'decks': 'decks'
  }

  const colName = collectionMap[step]
  try {
    const colRef = collection(db, 'users', userId, colName)
    const snapshot = await getDocs(colRef)
    for (const docItem of snapshot.docs) {
      await deleteDoc(doc(db, 'users', userId, colName, docItem.id))
    }
    console.log(`🗑️ ${snapshot.docs.length} ${step} borrados`)
    return true
  } catch (e) {
    console.error(`Error borrando ${step}:`, e)
    return false
  }
}

// Step labels for progress display
const STEP_LABELS: Record<ClearDataStep, string> = {
  'cards': 'cartas',
  'preferences': 'preferencias',
  'matches_nuevos': 'matches nuevos',
  'matches_guardados': 'matches guardados',
  'matches_eliminados': 'matches eliminados',
  'contactos': 'contactos',
  'decks': 'decks'
}

/**
 * Execute clear data with progress tracking (can resume)
 */
const executeClearData = async (startFromState?: ClearDataState, progressToast?: ReturnType<typeof toastStore.showProgress>) => {
  if (!authStore.user) return

  loading.value = true
  const userId = authStore.user.id

  // Initialize or use existing state
  const state: ClearDataState = startFromState || {
    status: 'in_progress',
    completedSteps: [],
    currentStep: null,
    errors: 0
  }

  // Create progress toast if not provided
  const progress = progressToast || toastStore.showProgress('Borrando datos...', 0)

  // Get remaining steps
  const remainingSteps = ALL_CLEAR_STEPS.filter(step => !state.completedSteps.includes(step))
  const totalSteps = ALL_CLEAR_STEPS.length

  for (const step of remainingSteps) {
    state.currentStep = step
    saveClearDataState(state)

    // Update progress toast
    const currentStepIndex = state.completedSteps.length
    const percent = Math.round((currentStepIndex / totalSteps) * 100)
    progress.update(percent, `Borrando ${STEP_LABELS[step]}...`)

    const success = await deleteCollectionStep(userId, step)

    if (success) {
      state.completedSteps.push(step)
    } else {
      state.errors++
    }
    saveClearDataState(state)
  }

  // Clear local stores
  collectionStore.clear()
  preferencesStore.clear()
  decksStore.clear()
  calculatedMatches.value = []

  // Mark as complete
  state.status = 'complete'
  state.currentStep = null
  saveClearDataState(state)

  loading.value = false

  // Update progress toast to complete
  if (state.errors > 0) {
    progress.error(`Borrado con ${state.errors} error(es)`)
  } else {
    progress.complete('Todos los datos borrados')
  }

  // Wait a moment for user to see the result, then reload
  setTimeout(() => {
    clearClearDataState()
    globalThis.location.reload()
  }, 2000)
}

/**
 * Resume incomplete clear data operation
 */
const resumeClearData = async (savedState: ClearDataState) => {
  console.log('[ClearData] Resuming clear operation, completed:', savedState.completedSteps)

  if (savedState.status === 'complete') {
    clearClearDataState()
    return
  }

  // Calculate initial progress for resume
  const initialProgress = Math.round((savedState.completedSteps.length / ALL_CLEAR_STEPS.length) * 100)
  const progress = toastStore.showProgress('Continuando borrado de datos...', initialProgress)

  await executeClearData(savedState, progress)
}

/**
 * TEMPORAL: Borrar todos los datos del usuario (cartas, preferencias, matches)
 */
const clearAllData = async () => {
  if (!authStore.user) return

  const confirmed = await confirmStore.show({
    title: t('dashboard.clearData.title'),
    message: t('dashboard.clearData.message'),
    confirmText: t('dashboard.clearData.confirm'),
    cancelText: t('common.actions.cancel'),
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  await executeClearData()
}

// Export to avoid unused warning (can be called from dev tools)
if (import.meta.env.DEV) {
  (globalThis as any).__clearAllData = clearAllData
}

/**
 * OPTIMIZED: Calcular matches usando colecciones públicas indexadas
 * En vez de O(n) usuarios, hace queries directas por scryfallId
 */
const calculateMatches = async () => {
  if (!authStore.user) return

  loading.value = true
  progressCurrent.value = 0
  progressTotal.value = 0
  calculatedMatches.value = []

  try {
    const myCards = collectionStore.cards
    // Usar cartas con status 'wishlist' como lista de búsqueda (en lugar de preferencias)
    const myWishlist = myCards.filter(c => c.status === 'wishlist')
    // Convert wishlist cards to Preference format for matching functions
    const myPreferences = myWishlist.map(c => ({
      id: c.id,
      name: c.name,
      cardName: c.name,
      scryfallId: c.scryfallId,
      maxPrice: c.price || 0,
      minCondition: c.condition,
      type: 'BUSCO' as const,
      quantity: c.quantity || 1,
      condition: c.condition,
      edition: c.edition,
      image: c.image,
      createdAt: c.createdAt || new Date(),
    }))
    const foundMatches: any[] = []

    console.log('🔍 Iniciando cálculo de matches (optimizado)...')
    console.log(`Mis cartas: ${myCards.length}, Mi wishlist: ${myWishlist.length}`)

    // PASO 1: Buscar cartas que coincidan con mi wishlist (lo que BUSCO)
    progressTotal.value = 2
    progressCurrent.value = 1

    // Debug: mostrar qué nombres estamos buscando
    const myWishlistNames = myWishlist.map(c => c.name).filter(Boolean)
    console.log(`🔍 Buscando cartas por nombre:`, myWishlistNames)

    const matchingCards = await findCardsMatchingPreferences(myWishlist, authStore.user.id)
    console.log(`📦 Encontradas ${matchingCards.length} cartas que busco`)

    // PASO 2: Buscar preferencias que coincidan con mis cartas (VENDO)
    progressCurrent.value = 2

    // Debug: mostrar qué nombres tengo para vender
    const myTradeable = myCards.filter(c => c.status === 'trade' || c.status === 'sale')
    const myCardNames = myTradeable.map(c => c.name).filter(Boolean)
    console.log(`🏷️ Mis cartas para vender (${myTradeable.length}):`, myCardNames)

    const matchingPrefs = await findPreferencesMatchingCards(myCards, authStore.user.id)
    console.log(`🔎 Encontradas ${matchingPrefs.length} personas buscando mis cartas`)

    // Agrupar por usuario
    const userMatches = new Map<string, {
      cards: PublicCard[],
      prefs: PublicPreference[],
      username: string,
      location: string,
      email: string
    }>()

    // Procesar cartas encontradas
    for (const card of matchingCards) {
      if (!userMatches.has(card.userId)) {
        userMatches.set(card.userId, {
          cards: [],
          prefs: [],
          username: card.username,
          location: card.location || 'Unknown',
          email: card.email || ''
        })
      }
      userMatches.get(card.userId)!.cards.push(card)
    }

    // Procesar preferencias encontradas
    for (const pref of matchingPrefs) {
      if (!userMatches.has(pref.userId)) {
        userMatches.set(pref.userId, {
          cards: [],
          prefs: [],
          username: pref.username,
          location: pref.location || 'Unknown',
          email: pref.email || ''
        })
      }
      userMatches.get(pref.userId)!.prefs.push(pref)
    }

    // Crear matches por usuario
    progressTotal.value = userMatches.size + 2
    let userIndex = 0

    for (const [otherUserId, data] of userMatches) {
      progressCurrent.value = userIndex + 3
      userIndex++

      // Convertir PublicCards a formato esperado por priceMatching
      const theirCards = data.cards.map(c => ({
        id: c.cardId,
        name: c.cardName,
        scryfallId: c.scryfallId,
        price: c.price,
        edition: c.edition,
        condition: c.condition as any,
        foil: c.foil,
        quantity: c.quantity,
        image: c.image,
        status: c.status as any,
        updatedAt: c.updatedAt?.toDate() || new Date(),
        createdAt: c.updatedAt?.toDate() || new Date(),
      }))

      const theirPreferences = data.prefs.map(p => ({
        id: p.prefId,
        name: p.cardName,
        cardName: p.cardName,
        scryfallId: p.scryfallId,
        maxPrice: p.maxPrice,
        minCondition: p.minCondition,
        // Fill required fields for type compatibility
        type: 'BUSCO' as const,
        quantity: 1,
        condition: 'NM' as const,
        edition: '',
        image: '',
        createdAt: p.updatedAt?.toDate() || new Date(),
      }))

      // INTENTAR MATCH BIDIRECCIONAL PRIMERO
      let matchCalc = priceMatching.calculateBidirectionalMatch(
          myCards,
          myPreferences,
          theirCards,
          theirPreferences
      )

      // SI NO HAY BIDIRECCIONAL, INTENTAR UNIDIRECCIONAL
      if (!matchCalc) {
        matchCalc = priceMatching.calculateUnidirectionalMatch(
            myCards,
            myPreferences,
            theirCards,
            theirPreferences
        )
      }

      if (matchCalc?.isValid) {
        const match = {
          id: `${authStore.user.id}_${otherUserId}_${Date.now()}`,
          otherUserId,
          otherUsername: data.username,
          otherLocation: data.location,
          otherEmail: data.email,
          myCards: matchCalc.myCardsInfo || [],
          otherCards: matchCalc.theirCardsInfo || [],
          myTotalValue: matchCalc.myTotalValue,
          theirTotalValue: matchCalc.theirTotalValue,
          valueDifference: matchCalc.valueDifference,
          compatibility: matchCalc.compatibility,
          type: matchCalc.matchType === 'bidirectional' ? 'BIDIRECTIONAL' : 'UNIDIRECTIONAL',
          createdAt: new Date(),
          lifeExpiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        }

        foundMatches.push(match)
        console.log(`✅ Match con ${data.username}: ${matchCalc.compatibility}%`)
      }
    }

    // Ordenar por compatibilidad descendente y filtrar discardados (por otherUserId)
    foundMatches.sort((a, b) => b.compatibility - a.compatibility)
    calculatedMatches.value = foundMatches.filter(m => !discardedMatchIds.value.has(m.otherUserId))

    // Persistir matches en Firestore
    if (foundMatches.length > 0) {
      await saveMatchesToFirebase(foundMatches)
    }

    console.log(`✅ Total de matches: ${foundMatches.length} (de ${userMatches.size} usuarios potenciales)`)
  } catch (error) {
    console.error('Error calculando matches:', error)
  } finally {
    loading.value = false
    progressCurrent.value = 0
    progressTotal.value = 0
  }
}

/**
 * CAMBIO 3: Guardar matches en Firestore
 * Limpia los matches_nuevos existentes antes de guardar los nuevos
 * Also notifies the other user so they see the match too (Bug #2 fix)
 */
const saveMatchesToFirebase = async (matches: any[]) => {
  if (!authStore.user) return

  try {
    const matchesRef = collection(db, 'users', authStore.user.id, 'matches_nuevos')

    // Primero limpiar matches_nuevos existentes para evitar duplicados
    const existingSnapshot = await getDocs(matchesRef)
    for (const docSnap of existingSnapshot.docs) {
      await deleteDoc(doc(db, 'users', authStore.user.id, 'matches_nuevos', docSnap.id))
    }

    // Ahora guardar los nuevos y notificar al otro usuario
    for (const match of matches) {
      await addDoc(matchesRef, {
        id: match.id,
        otherUserId: match.otherUserId,
        otherUsername: match.otherUsername,
        otherLocation: match.otherLocation,
        otherEmail: match.otherEmail,
        myCards: match.myCards || [],
        otherCards: match.otherCards || [],
        myTotalValue: match.myTotalValue,
        theirTotalValue: match.theirTotalValue,
        valueDifference: match.valueDifference,
        compatibility: match.compatibility,
        type: match.type,
        status: 'nuevo',
        createdAt: match.createdAt,
        lifeExpiresAt: match.lifeExpiresAt,
      })

      // Notify the other user so they see the match in their dashboard
      // This creates a reciprocal entry in the other user's matches_nuevos
      await matchesStore.notifyOtherUser({
        id: match.id,
        otherUserId: match.otherUserId,
        otherUsername: match.otherUsername,
        otherLocation: match.otherLocation,
        // Swap cards - what I offer becomes what they receive
        myCards: match.otherCards || [],
        otherCards: match.myCards || [],
        myTotalValue: match.theirTotalValue,
        theirTotalValue: match.myTotalValue,
        valueDifference: -match.valueDifference,
        compatibility: match.compatibility,
        type: match.type,
        status: 'nuevo',
        createdAt: match.createdAt,
      } as any, 'INTERESADO')
    }

    console.log(`💾 ${matches.length} matches guardados en Firestore (${existingSnapshot.docs.length} anteriores eliminados)`)
  } catch (err) {
    console.error('Error guardando matches:', err)
  }
}

/**
 * CAMBIO 3: Integrar con matches.ts store
 */
const handleSaveMatch = async (match: any) => {
  // Convertir match a formato SimpleMatch del store
  const matchToSave = {
    id: match.id,
    type: (match.type === 'VENDO' ? 'VENDO' : 'BUSCO'),
    otherUserId: match.otherUserId,
    otherUsername: match.otherUsername,
    otherLocation: match.otherLocation,
    myCard: match.myCard,
    otherCard: match.otherCard,
    myPreference: match.myPreference,
    otherPreference: match.otherPreference,
    createdAt: match.createdAt,
    status: 'nuevo' as const,
  }

  await matchesStore.saveMatch(matchToSave as any)

  // Remover del dashboard
  calculatedMatches.value = calculatedMatches.value.filter(m => m.id !== match.id)
}

const handleDiscardMatch = async (matchId: string) => {
  // Find the match by ID
  const match = calculatedMatches.value.find(m => m.id === matchId)
  if (!match) return

  // Save to Firestore matches_eliminados for persistence
  await discardMatchToFirestore(match)
  // Remove from UI
  calculatedMatches.value = calculatedMatches.value.filter(m => m.id !== matchId)
  toastStore.show(t('matches.messages.deleted'), 'info')
}

const recalculateMatches = async () => {
  await calculateMatches()
}

// Handle search input for auto-suggest
const handleSearchInput = async () => {
  const query = searchQuery.value.trim()

  if (query.length < 2) {
    suggestions.value = []
    showSuggestions.value = false
    return
  }

  suggestLoading.value = true
  try {
    const results = await getCardSuggestions(query)
    suggestions.value = results.slice(0, 8)
    showSuggestions.value = suggestions.value.length > 0
  } catch (err) {
    console.error('Error getting suggestions:', err)
    suggestions.value = []
  } finally {
    suggestLoading.value = false
  }
}

// Select a suggestion from dropdown
const selectSuggestion = (cardName: string) => {
  searchQuery.value = cardName
  showSuggestions.value = false
  suggestions.value = []
  searchPublicCards()
}

// Hide suggestions with delay (for click events)
const hideSuggestionsDelayed = () => {
  setTimeout(() => {
    showSuggestions.value = false
  }, 200)
}

// Search for cards in public_cards collection, fallback to Scryfall if none found
const searchPublicCards = async () => {
  if (!searchQuery.value.trim() || !authStore.user) return

  // Hide suggestions
  showSuggestions.value = false
  suggestions.value = []

  searching.value = true
  searchedOnce.value = true
  searchResults.value = []
  scryfallResults.value = []
  showScryfallFallback.value = false

  try {
    const publicCardsRef = collection(db, 'public_cards')
    const snapshot = await getDocs(publicCardsRef)

    const searchLower = searchQuery.value.toLowerCase()
    const results = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter((card: any) =>
        card.cardName?.toLowerCase().includes(searchLower) &&
        card.userId !== authStore.user!.id // Exclude own cards
      )
      .slice(0, 20) // Limit results

    searchResults.value = results

    // If no results from other users, search Scryfall as fallback
    if (results.length === 0) {
      const scryfallCards = await searchCards(searchQuery.value)
      if (scryfallCards.length > 0) {
        scryfallResults.value = scryfallCards.slice(0, 12)
        showScryfallFallback.value = true
      }
    }
  } catch (error) {
    console.error('Search error:', error)
  } finally {
    searching.value = false
  }
}

// Add card to wishlist from Scryfall results
const addToWishlist = async (card: any) => {
  if (!authStore.user) return

  // Get the image URL (handle split cards)
  let imageUrl = card.image_uris?.normal || ''
  if (!imageUrl && card.card_faces?.[0]?.image_uris) {
    imageUrl = card.card_faces[0].image_uris.normal || ''
  }

  const cardData = {
    name: card.name,
    scryfallId: card.id,
    edition: card.set?.toUpperCase() || '',
    quantity: 1,
    condition: 'NM' as const,
    foil: false,
    price: card.prices?.usd ? Number.parseFloat(card.prices.usd) : 0,
    image: imageUrl,
    status: 'wishlist' as const,
    public: true,
  }

  const cardId = await collectionStore.addCard(cardData)
  if (cardId) {
    toastStore.show(t('dashboard.wishlist.added', { name: card.name }), 'success')
    // Remove from scryfall results to show it was added
    scryfallResults.value = scryfallResults.value.filter(c => c.id !== card.id)
    if (scryfallResults.value.length === 0) {
      showScryfallFallback.value = false
    }
  }
}

// Send interest from search result
const sendInterestFromSearch = async (card: any) => {
  if (!authStore.user || sentInterestIds.value.has(card.id)) return

  try {
    const MATCH_LIFETIME_DAYS = 15
    const getExpirationDate = () => {
      const date = new Date()
      date.setDate(date.getDate() + MATCH_LIFETIME_DAYS)
      return date
    }

    const cardData = {
      id: card.cardId || card.id,
      scryfallId: card.scryfallId || '',
      name: card.cardName || '',
      edition: card.edition || '',
      quantity: card.quantity || 1,
      condition: card.condition || 'NM',
      foil: card.foil || false,
      price: card.price || 0,
      image: card.image || '',
      status: card.status || 'sale',
    }

    const totalValue = (card.price || 0) * (card.quantity || 1)

    const sharedMatchPayload = {
      senderId: authStore.user.id,
      senderUsername: authStore.user.username,
      senderLocation: authStore.user.location || '',
      senderEmail: authStore.user.email || '',
      receiverId: card.userId,
      receiverUsername: card.username || '',
      receiverLocation: card.location || '',
      card: cardData,
      cardType: card.status || 'sale',
      totalValue,
      status: 'pending',
      senderStatus: 'interested',
      receiverStatus: 'new',
      createdAt: new Date(),
      lifeExpiresAt: getExpirationDate(),
    }

    const sharedMatchesRef = collection(db, 'shared_matches')
    await addDoc(sharedMatchesRef, sharedMatchPayload)

    sentInterestIds.value.add(card.id)
    toastStore.show(t('dashboard.interest.sent', { username: card.username }), 'success')
  } catch (error) {
    console.error('Error sending interest:', error)
    toastStore.show(t('dashboard.interest.error'), 'error')
  }
}
</script>

<template>
  <AppContainer>
    <div>
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div class="flex items-center gap-2 mb-2">
            <h1 class="text-h2 md:text-h1 font-bold text-silver">{{ t('dashboard.title') }}</h1>
            <HelpTooltip :text="t('help.tooltips.dashboard.matchesFound')" :title="t('help.titles.matchesFound')" />
          </div>
          <p class="text-small md:text-body text-silver-70">
            {{ calculatedMatches.length }} {{ t('dashboard.matchesFound') }}
          </p>
        </div>

        <div class="flex flex-col md:flex-row gap-2">
          <div class="flex items-center gap-1">
            <BaseButton
                variant="secondary"
                size="small"
                @click="recalculateMatches"
                :disabled="loading || (collectionStore.cards.length === 0 && preferencesStore.preferences.length === 0)"
                class="w-full md:w-auto"
            >
              {{ loading ? t('dashboard.calculating') : t('dashboard.recalculate') }}
            </BaseButton>
            <HelpTooltip :text="t('help.tooltips.dashboard.recalculate')" :title="t('help.titles.recalculate')" />
          </div>
          <div class="flex items-center gap-1">
            <BaseButton
                variant="secondary"
                size="small"
                @click="syncPublicData"
                :disabled="syncing"
                class="w-full md:w-auto"
            >
              {{ syncing ? t('dashboard.syncing') : t('dashboard.sync') }}
            </BaseButton>
            <HelpTooltip :text="t('help.tooltips.dashboard.sync')" :title="t('help.titles.sync')" />
          </div>
        </div>
        <!-- Last sync indicator -->
        <p v-if="collectionStore.lastSyncAt" class="text-tiny text-silver-50 mt-2 md:mt-0 md:text-right">
          {{ t('dashboard.lastSync') }}: {{ formatLastSync(collectionStore.lastSyncAt) }}
        </p>
      </div>

      <!-- Card Search Section -->
      <div class="border border-silver-30 p-4 mb-6 rounded-md">
        <div class="flex items-center gap-2 mb-3">
          <h3 class="text-body font-bold text-silver">{{ t('dashboard.searchOthers.title') }}</h3>
          <HelpTooltip :text="t('help.tooltips.dashboard.searchOthers')" :title="t('help.titles.searchOthers')" />
        </div>
        <div class="relative mb-4">
          <div class="flex gap-2">
            <div class="flex-1 relative">
              <input
                  v-model="searchQuery"
                  type="text"
                  :placeholder="t('dashboard.searchOthers.placeholder')"
                  class="w-full bg-primary border border-silver-30 px-3 py-2 text-small text-silver placeholder-silver-50 focus:border-neon focus:outline-none rounded"
                  @input="handleSearchInput"
                  @keyup.enter="searchPublicCards"
                  @blur="hideSuggestionsDelayed"
              />
              <!-- Auto-suggest dropdown -->
              <div
                  v-if="showSuggestions && suggestions.length > 0"
                  class="absolute top-full left-0 right-0 bg-primary border border-silver-30 mt-1 max-h-48 overflow-y-auto z-20 rounded"
              >
                <div
                    v-for="suggestion in suggestions"
                    :key="suggestion"
                    @mousedown.prevent="selectSuggestion(suggestion)"
                    class="px-4 py-2 hover:bg-silver-10 cursor-pointer text-small text-silver border-b border-silver-30 transition-all"
                >
                  {{ suggestion }}
                </div>
              </div>
            </div>
            <BaseButton size="small" @click="searchPublicCards" :disabled="searching || !searchQuery.trim()">
              {{ searching ? '...' : t('dashboard.searchOthers.search') }}
            </BaseButton>
          </div>
        </div>

        <!-- Search Results with Images -->
        <div v-if="searchResults.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-96 overflow-y-auto">
          <div
              v-for="card in searchResults"
              :key="card.id"
              class="bg-silver-5 border border-silver-20 p-2 hover:border-neon transition-all rounded"
          >
            <!-- Card Image -->
            <div class="aspect-[3/4] bg-secondary mb-2 overflow-hidden">
              <img
                  v-if="card.image"
                  :src="card.image"
                  :alt="card.cardName"
                  class="w-full h-full object-cover"
                  loading="lazy"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-tiny text-silver-50">
                {{ t('dashboard.searchOthers.noImage') }}
              </div>
            </div>
            <!-- Card Info -->
            <p class="text-tiny font-bold text-silver truncate" :title="card.cardName">{{ card.cardName }}</p>
            <p class="text-tiny text-silver-70 truncate">{{ card.edition || 'N/A' }} • {{ card.condition }}</p>
            <p class="text-tiny text-neon font-bold">${{ card.price?.toFixed(2) || '0.00' }}</p>
            <p class="text-tiny text-silver-50 truncate flex items-center gap-1">
              <img
                  :src="getAvatarUrlForUser(card.username, 16, card.avatarUrl)"
                  alt=""
                  class="w-4 h-4 rounded-full"
              />
              @{{ card.username }}
            </p>
            <!-- Interest Button -->
            <button
                v-if="!sentInterestIds.has(card.id)"
                @click="sendInterestFromSearch(card)"
                class="w-full mt-2 px-2 py-1 bg-neon-10 border border-neon text-neon text-tiny font-bold hover:bg-neon-20 transition-all rounded"
            >
              {{ t('dashboard.searchOthers.interested') }}
            </button>
            <span v-else class="block w-full mt-2 text-center text-tiny text-silver-50 py-1">{{ t('dashboard.searchOthers.sent') }}</span>
          </div>
        </div>
        <!-- Scryfall Fallback: No users have this card, but it exists -->
        <div v-else-if="showScryfallFallback && scryfallResults.length > 0">
          <p class="text-tiny text-silver-50 mb-3">
            {{ t('dashboard.searchOthers.noOwners') }}
          </p>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-96 overflow-y-auto">
            <div
                v-for="card in scryfallResults"
                :key="card.id"
                class="bg-silver-5 border border-silver-20 p-2 hover:border-neon transition-all rounded"
            >
              <!-- Card Image -->
              <div class="aspect-[3/4] bg-secondary mb-2 overflow-hidden">
                <img
                    v-if="card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small"
                    :src="card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small"
                    :alt="card.name"
                    class="w-full h-full object-cover"
                    loading="lazy"
                />
                <div v-else class="w-full h-full flex items-center justify-center text-tiny text-silver-50">
                  {{ t('dashboard.searchOthers.noImage') }}
                </div>
              </div>
              <!-- Card Info -->
              <p class="text-tiny font-bold text-silver truncate" :title="card.name">{{ card.name }}</p>
              <p class="text-tiny text-silver-70">{{ card.set?.toUpperCase() }}</p>
              <p class="text-tiny text-neon font-bold">${{ card.prices?.usd || 'N/A' }}</p>
              <p class="text-tiny text-silver-50 italic">{{ t('dashboard.searchOthers.noOwner') }}</p>
              <!-- Add to Wishlist Button -->
              <button
                  @click="addToWishlist(card)"
                  class="w-full mt-2 px-2 py-1 bg-rust/20 border border-rust text-rust text-tiny font-bold hover:bg-rust/30 transition-all rounded"
              >
                {{ t('dashboard.searchOthers.addToWishlist') }}
              </button>
            </div>
          </div>
        </div>
        <p v-else-if="searchQuery && !searching && searchedOnce && !showScryfallFallback" class="text-tiny text-silver-50">
          {{ t('dashboard.searchOthers.notFound') }}
        </p>
      </div>

      <!-- Progress bar -->
      <div v-if="loading && progressTotal > 0" class="bg-primary border border-neon p-4 mb-6 rounded-md">
        <div class="flex items-center justify-between mb-2">
          <p class="text-small text-neon font-bold">{{ t('dashboard.calculatingMatches.title') }}</p>
          <p class="text-tiny text-silver-70">{{ progressCurrent }} / {{ progressTotal }}</p>
        </div>
        <div class="w-full h-2 bg-silver-20">
          <div
              class="h-full bg-neon transition-all duration-300"
              :style="{ width: `${(progressCurrent / progressTotal) * 100}%` }"
          ></div>
        </div>
      </div>

      <!-- Loading state -->
      <div v-if="loading && progressTotal === 0" class="text-center py-16">
        <BaseLoader size="large" />
        <p class="text-body text-silver-70 mt-4">{{ t('dashboard.calculatingMatches.loading') }}</p>
      </div>

      <!-- No data warning -->
      <div v-else-if="collectionStore.cards.length === 0 && preferencesStore.preferences.length === 0" class="border border-silver-30 p-8 md:p-12 text-center rounded-md">
        <p class="text-h3 text-silver-70 mb-2">{{ t('dashboard.empty.noCardsOrPrefs') }}</p>
        <p class="text-body text-silver-50 mb-6">
          {{ t('dashboard.empty.addCardsOrPrefs') }}
        </p>
        <RouterLink to="/collection">
          <BaseButton>{{ t('dashboard.empty.viewCollection') }}</BaseButton>
        </RouterLink>
      </div>

      <!-- No matches state -->
      <div v-else-if="calculatedMatches.length === 0 && !loading" class="border border-silver-30 p-8 md:p-12 text-center rounded-md">
        <p class="text-h3 text-silver-70 mb-2">{{ t('dashboard.empty.noMatches') }}</p>
        <p class="text-body text-silver-50">
          {{ t('dashboard.empty.usersInPlatform', { count: totalUsers }) }}
        </p>
      </div>

      <!-- Matches grid -->
      <div v-else class="space-y-md">
        <MatchCard
            v-for="match in calculatedMatches"
            :key="match.id"
            :match="match"
            tab="new"
            @save="handleSaveMatch"
            @discard="handleDiscardMatch"
        />
      </div>
    </div>
  </AppContainer>
</template>