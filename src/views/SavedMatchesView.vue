<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { type SimpleMatch, useMatchesStore } from '../stores/matches'
import { useContactsStore } from '../stores/contacts'
import { useCollectionStore } from '../stores/collection'
import { usePreferencesStore } from '../stores/preferences'
import { useAuthStore } from '../stores/auth'
import { usePriceMatchingStore } from '../stores/priceMatchingHelper'
import { useDecksStore } from '../stores/decks'
import { useToastStore } from '../stores/toast'
import { useConfirmStore } from '../stores/confirm'
import { useI18n } from '../composables/useI18n'
import { db } from '../services/firebase'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore'
import {
  findCardsMatchingPreferences,
  findPreferencesMatchingCards,
  type PublicCard,
  type PublicPreference,
} from '../services/publicCards'
import { notifyMatchUser } from '../services/cloudFunctions'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import BaseModal from '../components/ui/BaseModal.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import MatchCard from '../components/matches/MatchCard.vue'
import SvgIcon from '../components/ui/SvgIcon.vue'
import HelpTooltip from '../components/ui/HelpTooltip.vue'
import { getAvatarUrlForUser } from '../utils/avatar'
import type { CardCondition, CardStatus } from '../types/card'

const route = useRoute()
const router = useRouter()
const matchesStore = useMatchesStore()
const contactsStore = useContactsStore()
const collectionStore = useCollectionStore()
const preferencesStore = usePreferencesStore()
const authStore = useAuthStore()
const priceMatching = usePriceMatchingStore()
const decksStore = useDecksStore()
const toastStore = useToastStore()
const confirmStore = useConfirmStore()
const { t } = useI18n()

// State
const activeTab = ref<'new' | 'sent' | 'saved' | 'deleted'>('new')
const highlightedMatchId = ref<string | null>(null)
const matchesWithEmails = ref<SimpleMatch[]>([])
const loading = ref(false)

// Match calculation state (ported from DashboardView)
const syncing = ref(false)
const calculatedMatches = ref<SimpleMatch[]>([])
const progressCurrent = ref(0)
const progressTotal = ref(0)
const totalUsers = ref(0)
const discardedMatchIds = ref<Set<string>>(new Set())

// Blocked users state
interface BlockedUser {
  odifUserId: string
  username: string
  location?: string
  blockedAt: Date
  docIds: string[]
}
const showBlockedUsersModal = ref(false)
const blockedUsers = ref<BlockedUser[]>([])
const loadingBlockedUsers = ref(false)
const blockUsernameInput = ref('')
const blockingUser = ref(false)

// Clear data state
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

const STEP_LABELS: Record<ClearDataStep, string> = {
  'cards': 'cartas',
  'preferences': 'preferencias',
  'matches_nuevos': 'matches nuevos',
  'matches_guardados': 'matches guardados',
  'matches_eliminados': 'matches eliminados',
  'contactos': 'contactos',
  'decks': 'decks'
}

// ✅ DATOS REALES desde store
const newMatches = computed(() => matchesStore.newMatches)
const sentMatches = computed(() => matchesStore.sentMatches)
const savedMatches = computed(() => matchesStore.savedMatches)
const deletedMatches = computed(() => matchesStore.deletedMatches)

// Tabs configuration
const tabs = computed(() => [
  {
    id: 'new' as const,
    label: t('matches.tabs.new'),
    icon: 'dot',
    count: newMatches.value.length
  },
  {
    id: 'sent' as const,
    label: t('matches.tabs.sent'),
    icon: 'hand',
    count: sentMatches.value.length
  },
  {
    id: 'saved' as const,
    label: t('matches.tabs.saved'),
    icon: 'star',
    count: savedMatches.value.length
  },
  {
    id: 'deleted' as const,
    label: t('matches.tabs.deleted'),
    icon: 'trash',
    count: deletedMatches.value.length
  }
])

// Group matches by user option
const groupByUser = ref(true)

// Current tab matches
const currentMatches = computed(() => {
  switch (activeTab.value) {
    case 'new': return newMatches.value
    case 'sent': return sentMatches.value
    case 'saved': return matchesWithEmails.value
    case 'deleted': return deletedMatches.value
    default: return []
  }
})

// Grouped matches by user
const groupedMatches = computed(() => {
  if (!groupByUser.value) return null

  const groups: Record<string, { username: string; userId: string; avatarUrl?: string; location?: string; matches: SimpleMatch[] }> = {}

  for (const match of currentMatches.value) {
    const key = match.otherUserId
    // eslint-disable-next-line security/detect-object-injection
    groups[key] ??= {
      username: match.otherUsername,
      userId: match.otherUserId,
      avatarUrl: match.otherAvatarUrl ?? undefined,
      location: match.otherLocation,
      matches: []
    }
    // eslint-disable-next-line security/detect-object-injection
    groups[key].matches.push(match)
  }

  return Object.values(groups).sort((a, b) => b.matches.length - a.matches.length)
})

// Today's matches (for bulk action)
const todaysNewMatches = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return newMatches.value.filter(m => {
    const created = m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt)
    return created >= today
  })
})

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

// ✅ CARGAR EMAILS para matches guardados
const loadSavedMatchesWithEmails = async () => {
  try {
    const matchesWithData = await Promise.all(
        savedMatches.value.map(async (match) => {
          try {
            const userRef = doc(db, 'users', match.otherUserId)
            const userSnap = await getDoc(userRef)

            if (userSnap.exists()) {
              const userData = userSnap.data() as Record<string, unknown>
              return {
                ...match,
                otherEmail: (userData.email as string) ?? '',
              }
            }
          } catch (err) {
            console.error(`Error cargando email para ${match.otherUserId}:`, err)
          }

          return {
            ...match,
            otherEmail: '',
          }
        })
    )

    matchesWithEmails.value = matchesWithData
  } catch {
    // ignore
  }
}

// ========== DISCARDED MATCHES ==========

const loadDiscardedMatches = async () => {
  if (!authStore.user) return

  try {
    const discardedRef = collection(db, 'users', authStore.user.id, 'matches_eliminados')
    const snapshot = await getDocs(discardedRef)

    const ids = new Set<string>()
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() as Record<string, unknown>
      if (data.otherUserId) {
        ids.add(data.otherUserId as string)
      }
    }
    discardedMatchIds.value = ids
  } catch (err) {
    console.error('Error loading discarded matches:', err)
    discardedMatchIds.value = new Set()
  }
}

const discardMatchToFirestore = async (match: SimpleMatch) => {
  if (!authStore.user) return

  try {
    const discardedRef = collection(db, 'users', authStore.user.id, 'matches_eliminados')
    await addDoc(discardedRef, {
      id: match.id,
      otherUserId: match.otherUserId,
      otherUsername: match.otherUsername,
      otherLocation: match.otherLocation,
      myCards: match.myCards ?? [],
      otherCards: match.otherCards ?? [],
      status: 'eliminado',
      eliminatedAt: new Date(),
      lifeExpiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    })

    discardedMatchIds.value.add(match.otherUserId)

    const nuevosRef = collection(db, 'users', authStore.user.id, 'matches_nuevos')
    const nuevosSnapshot = await getDocs(nuevosRef)
    for (const docSnap of nuevosSnapshot.docs) {
      const data = docSnap.data() as Record<string, unknown>
      if (data.id === match.id || data.otherUserId === match.otherUserId) {
        await deleteDoc(docSnap.ref)
      }
    }
  } catch (err) {
    console.error('Error discarding match:', err)
  }
}

// ========== SYNC PUBLIC DATA ==========

const syncPublicData = async () => {
  if (!authStore.user) return

  syncing.value = true
  try {
    await collectionStore.syncAllToPublic()
    console.info('Datos sincronizados a colecciones publicas')
  } catch (error) {
    console.error('Error sincronizando datos publicos:', error)
  } finally {
    syncing.value = false
  }
}

// ========== BLOCKED USERS ==========

const loadBlockedUsers = async () => {
  if (!authStore.user) return

  loadingBlockedUsers.value = true
  try {
    const discardedRef = collection(db, 'users', authStore.user.id, 'matches_eliminados')
    const snapshot = await getDocs(discardedRef)

    const userMap = new Map<string, BlockedUser>()

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() as Record<string, unknown>
      const otherUserId = data.otherUserId as string | undefined
      if (!otherUserId) continue

      if (!userMap.has(otherUserId)) {
        const eliminatedAt = data.eliminatedAt
        let blockedDate: Date
        if (eliminatedAt && typeof eliminatedAt === 'object' && 'toDate' in eliminatedAt && typeof (eliminatedAt as { toDate: () => Date }).toDate === 'function') {
          blockedDate = (eliminatedAt as { toDate: () => Date }).toDate()
        } else {
          blockedDate = new Date()
        }
        userMap.set(otherUserId, {
          odifUserId: otherUserId,
          username: (data.otherUsername as string) ?? 'Unknown',
          location: data.otherLocation as string | undefined,
          blockedAt: blockedDate,
          docIds: []
        })
      }
      const existing = userMap.get(otherUserId)
      if (existing) {
        existing.docIds.push(docSnap.id)
      }
    }

    blockedUsers.value = Array.from(userMap.values()).sort((a, b) =>
      b.blockedAt.getTime() - a.blockedAt.getTime()
    )
  } catch (err) {
    console.error('Error loading blocked users:', err)
    blockedUsers.value = []
  } finally {
    loadingBlockedUsers.value = false
  }
}

const unblockUser = async (user: BlockedUser) => {
  if (!authStore.user) return

  try {
    for (const docId of user.docIds) {
      await deleteDoc(doc(db, 'users', authStore.user.id, 'matches_eliminados', docId))
    }

    discardedMatchIds.value.delete(user.odifUserId)
    blockedUsers.value = blockedUsers.value.filter(u => u.odifUserId !== user.odifUserId)

    toastStore.show(t('dashboard.userUnblocked', { username: user.username }), 'success')
    await calculateMatches()
  } catch (err) {
    console.error('Error unblocking user:', err)
    toastStore.show(t('dashboard.unblockError'), 'error')
  }
}

const openBlockedUsersModal = async () => {
  showBlockedUsersModal.value = true
  await loadBlockedUsers()
}

const handleBlockByUsername = async () => {
  if (!authStore.user || !blockUsernameInput.value.trim()) return

  const username = blockUsernameInput.value.trim().toLowerCase()

  if (username === authStore.user.username?.toLowerCase()) {
    toastStore.show(t('dashboard.blockedUsersModal.cannotBlockSelf'), 'error')
    return
  }

  blockingUser.value = true
  try {
    // Look up user by username
    const usersRef = collection(db, 'users')
    const q = query(usersRef, where('username', '==', username), limit(1))
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      toastStore.show(t('dashboard.blockedUsersModal.userNotFound'), 'error')
      return
    }

    const userDoc = snapshot.docs[0]
    if (!userDoc) return
    const foundUserId = userDoc.id
    const userData = userDoc.data() as Record<string, unknown>

    // Check if already blocked
    if (discardedMatchIds.value.has(foundUserId)) {
      toastStore.show(t('dashboard.blockedUsersModal.alreadyBlocked'), 'info')
      blockUsernameInput.value = ''
      return
    }

    // Create block record in matches_eliminados
    const discardedRef = collection(db, 'users', authStore.user.id, 'matches_eliminados')
    await addDoc(discardedRef, {
      otherUserId: foundUserId,
      otherUsername: (userData.username as string) ?? username,
      otherLocation: (userData.location as string) ?? '',
      status: 'eliminado',
      eliminatedAt: new Date(),
      lifeExpiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    })

    discardedMatchIds.value.add(foundUserId)
    blockUsernameInput.value = ''
    toastStore.show(t('dashboard.blockedUsersModal.userBlocked', { username: (userData.username as string) ?? username }), 'success')

    // Refresh blocked users list and recalculate matches
    await loadBlockedUsers()
    await calculateMatches()
  } catch (err) {
    console.error('Error blocking user:', err)
    toastStore.show(t('dashboard.blockedUsersModal.blockError'), 'error')
  } finally {
    blockingUser.value = false
  }
}

// ========== CLEAR DATA ==========

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
      return JSON.parse(saved) as ClearDataState
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

  // eslint-disable-next-line security/detect-object-injection
  const colName = collectionMap[step]
  try {
    const colRef = collection(db, 'users', userId, colName)
    const snapshot = await getDocs(colRef)
    for (const docItem of snapshot.docs) {
      await deleteDoc(doc(db, 'users', userId, colName, docItem.id))
    }
    return true
  } catch (e) {
    console.error(`Error borrando ${step}:`, e)
    return false
  }
}

const executeClearData = async (startFromState?: ClearDataState, progressToast?: ReturnType<typeof toastStore.showProgress>) => {
  if (!authStore.user) return

  loading.value = true
  const userId = authStore.user.id

  const state: ClearDataState = startFromState ?? {
    status: 'in_progress',
    completedSteps: [],
    currentStep: null,
    errors: 0
  }

  const progress = progressToast ?? toastStore.showProgress('Borrando datos...', 0)

  const remainingSteps = ALL_CLEAR_STEPS.filter(step => !state.completedSteps.includes(step))
  const totalSteps = ALL_CLEAR_STEPS.length

  for (const step of remainingSteps) {
    state.currentStep = step
    saveClearDataState(state)

    const currentStepIndex = state.completedSteps.length
    const percent = Math.round((currentStepIndex / totalSteps) * 100)
    // eslint-disable-next-line security/detect-object-injection
    progress.update(percent, `Borrando ${STEP_LABELS[step]}...`)

    const success = await deleteCollectionStep(userId, step)

    if (success) {
      state.completedSteps.push(step)
    } else {
      state.errors++
    }
    saveClearDataState(state)
  }

  collectionStore.clear()
  preferencesStore.clear()
  decksStore.clear()
  calculatedMatches.value = []

  state.status = 'complete'
  state.currentStep = null
  saveClearDataState(state)

  loading.value = false

  if (state.errors > 0) {
    progress.error(`Borrado con ${state.errors} error(es)`)
  } else {
    progress.complete('Todos los datos borrados')
  }

  setTimeout(() => {
    clearClearDataState()
    globalThis.location.reload()
  }, 2000)
}

const resumeClearData = async (savedState: ClearDataState) => {
  if (savedState.status === 'complete') {
    clearClearDataState()
    return
  }

  const initialProgress = Math.round((savedState.completedSteps.length / ALL_CLEAR_STEPS.length) * 100)
  const progress = toastStore.showProgress('Continuando borrado de datos...', initialProgress)

  await executeClearData(savedState, progress)
}

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

// ========== CALCULATE MATCHES ==========

const groupMatchesByUser = (matchingCards: PublicCard[], matchingPrefs: PublicPreference[]) => {
  const userMatches = new Map<string, {
    cards: PublicCard[],
    prefs: PublicPreference[],
    username: string,
    location: string,
    email: string
  }>()

  for (const card of matchingCards) {
    if (!userMatches.has(card.userId)) {
      userMatches.set(card.userId, {
        cards: [],
        prefs: [],
        username: card.username,
        location: card.location ?? 'Unknown',
        email: card.email ?? ''
      })
    }
    const existing = userMatches.get(card.userId)
    if (existing) existing.cards.push(card)
  }

  for (const pref of matchingPrefs) {
    if (!userMatches.has(pref.userId)) {
      userMatches.set(pref.userId, {
        cards: [],
        prefs: [],
        username: pref.username,
        location: pref.location ?? 'Unknown',
        email: pref.email ?? ''
      })
    }
    const existing = userMatches.get(pref.userId)
    if (existing) existing.prefs.push(pref)
  }

  return userMatches
}

const calculateMatches = async () => {
  if (!authStore.user) return

  loading.value = true
  progressCurrent.value = 0
  progressTotal.value = 0
  calculatedMatches.value = []

  try {
    const myCards = collectionStore.cards
    const myWishlist = myCards.filter(c => c.status === 'wishlist')
    const myPreferences = myWishlist.map(c => ({
      id: c.id,
      name: c.name,
      cardName: c.name,
      scryfallId: c.scryfallId,
      maxPrice: c.price ?? 0,
      minCondition: c.condition,
      type: 'BUSCO' as const,
      quantity: c.quantity ?? 1,
      condition: c.condition,
      edition: c.edition,
      image: c.image,
      createdAt: c.createdAt ?? new Date(),
    }))
    const foundMatches: SimpleMatch[] = []

    // PASO 1: Buscar cartas que coincidan con mi wishlist (lo que BUSCO)
    progressTotal.value = 2
    progressCurrent.value = 1

    const matchingCards = await findCardsMatchingPreferences(myWishlist, authStore.user.id)

    // PASO 2: Buscar preferencias que coincidan con mis cartas (VENDO)
    progressCurrent.value = 2

    const matchingPrefs = await findPreferencesMatchingCards(myCards, authStore.user.id)

    // Agrupar por usuario
    const userMatches = groupMatchesByUser(matchingCards, matchingPrefs)

    // Crear matches por usuario
    progressTotal.value = userMatches.size + 2
    let userIndex = 0

    for (const [otherUserId, data] of userMatches) {
      progressCurrent.value = userIndex + 3
      userIndex++

      const theirCards = data.cards.map(c => ({
        id: c.cardId,
        name: c.cardName,
        scryfallId: c.scryfallId,
        price: c.price,
        edition: c.edition,
        condition: c.condition as unknown as CardCondition,
        foil: c.foil,
        quantity: c.quantity,
        image: c.image,
        status: c.status as unknown as CardStatus,
        updatedAt: c.updatedAt?.toDate() ?? new Date(),
        createdAt: c.updatedAt?.toDate() ?? new Date(),
      }))

      const theirPreferences = data.prefs.map(p => ({
        id: p.prefId,
        name: p.cardName,
        cardName: p.cardName,
        scryfallId: p.scryfallId,
        maxPrice: p.maxPrice,
        minCondition: p.minCondition,
        type: 'BUSCO' as const,
        quantity: 1,
        condition: 'NM' as const,
        edition: '',
        image: '',
        createdAt: p.updatedAt?.toDate() ?? new Date(),
      }))

      // INTENTAR MATCH BIDIRECCIONAL PRIMERO
      let matchCalc = priceMatching.calculateBidirectionalMatch(
          myCards,
          myPreferences,
          theirCards,
          theirPreferences
      )

      // SI NO HAY BIDIRECCIONAL, INTENTAR UNIDIRECCIONAL
      matchCalc ??= priceMatching.calculateUnidirectionalMatch(
          myCards,
          myPreferences,
          theirCards,
          theirPreferences
      )

      if (matchCalc?.isValid) {
        const match = {
          id: `${authStore.user.id}_${otherUserId}_${Date.now()}`,
          otherUserId,
          otherUsername: data.username,
          otherLocation: data.location,
          otherEmail: data.email,
          myCards: matchCalc.myCardsInfo ?? [],
          otherCards: matchCalc.theirCardsInfo ?? [],
          myTotalValue: matchCalc.myTotalValue,
          theirTotalValue: matchCalc.theirTotalValue,
          valueDifference: matchCalc.valueDifference,
          compatibility: matchCalc.compatibility,
          type: (matchCalc.matchType === 'bidirectional' ? 'BIDIRECTIONAL' : 'UNIDIRECTIONAL') as unknown as 'VENDO',
          createdAt: new Date(),
          lifeExpiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        }

        foundMatches.push(match)
      }
    }

    // Ordenar por compatibilidad descendente y filtrar discardados
    foundMatches.sort((a, b) => (b.compatibility ?? 0) - (a.compatibility ?? 0))
    calculatedMatches.value = foundMatches.filter(m => !discardedMatchIds.value.has(m.otherUserId))

    // Persistir matches en Firestore
    if (foundMatches.length > 0) {
      await saveMatchesToFirebase(foundMatches)
    }

    // Reload matches from Firestore to sync store state with what was just written
    await matchesStore.loadAllMatches()
  } catch (error) {
    console.error('Error calculando matches:', error)
  } finally {
    loading.value = false
    progressCurrent.value = 0
    progressTotal.value = 0
  }
}

const saveMatchesToFirebase = async (matches: SimpleMatch[]) => {
  if (!authStore.user) return

  try {
    const matchesRef = collection(db, 'users', authStore.user.id, 'matches_nuevos')

    // Only delete self-calculated matches, preserve notification docs from other users
    // (notification docs have _notificationOf field set by the cloud function)
    const existingSnapshot = await getDocs(matchesRef)
    for (const docSnap of existingSnapshot.docs) {
      if (!(docSnap.data() as Record<string, unknown>)._notificationOf) {
        await deleteDoc(doc(db, 'users', authStore.user.id, 'matches_nuevos', docSnap.id))
      }
    }

    // Guardar los nuevos y notificar
    for (const match of matches) {
      await addDoc(matchesRef, {
        id: match.id,
        otherUserId: match.otherUserId,
        otherUsername: match.otherUsername,
        otherLocation: match.otherLocation,
        otherEmail: match.otherEmail,
        myCards: match.myCards ?? [],
        otherCards: match.otherCards ?? [],
        myTotalValue: match.myTotalValue,
        theirTotalValue: match.theirTotalValue,
        valueDifference: match.valueDifference,
        compatibility: match.compatibility,
        type: match.type,
        status: 'nuevo',
        createdAt: match.createdAt,
        lifeExpiresAt: match.lifeExpiresAt,
      })

      try {
        await notifyMatchUser({
          targetUserId: match.otherUserId,
          matchId: match.id,
          fromUserId: authStore.user.id,
          fromUsername: authStore.user.username,
          fromLocation: authStore.user.location,
          fromAvatarUrl: authStore.user.avatarUrl,
          myCards: (match.myCards ?? []) as unknown as Record<string, unknown>[],
          otherCards: (match.otherCards ?? []) as unknown as Record<string, unknown>[],
          myTotalValue: match.myTotalValue,
          theirTotalValue: match.theirTotalValue,
          valueDifference: match.valueDifference,
          compatibility: match.compatibility ?? 0,
          type: match.type as 'BIDIRECTIONAL' | 'UNIDIRECTIONAL',
        })
      } catch (notifyErr) {
        console.warn(`Could not notify ${match.otherUsername}:`, notifyErr)
      }
    }
  } catch (err) {
    console.error('Error guardando matches:', err)
  }
}

// ========== MATCH ACTIONS ==========

const handleSaveMatch = async (match: SimpleMatch) => {
  await matchesStore.saveMatch(match)
  await loadSavedMatchesWithEmails()
}

const handleDiscardMatch = async (matchId: string) => {
  // Check if this is a calculated match (from the engine)
  const calcMatch: SimpleMatch | undefined = calculatedMatches.value.find(m => m.id === matchId)
  if (calcMatch) {
    await discardMatchToFirestore(calcMatch)
    calculatedMatches.value = calculatedMatches.value.filter(m => m.id !== matchId)
    toastStore.show(t('matches.messages.deleted'), 'info')
    return
  }

  // Otherwise use the store for tab-based matches
  const tab = activeTab.value === 'new' ? 'new' : 'saved'
  await matchesStore.discardMatch(matchId, tab)
  await loadSavedMatchesWithEmails()
}

const handleTabChange = (tabId: 'new' | 'sent' | 'saved' | 'deleted') => {
  activeTab.value = tabId
}

// Bulk save all today's matches
const handleSaveAllToday = async () => {
  for (const match of todaysNewMatches.value) {
    await matchesStore.saveMatch(match)
  }
  await loadSavedMatchesWithEmails()
}

// Scroll to a specific match by ID
const scrollToMatch = async (matchId: string) => {
  highlightedMatchId.value = matchId
  await nextTick()
  setTimeout(() => {
    const el = document.querySelector(`[data-match-id="${matchId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => { highlightedMatchId.value = null }, 2500)
    }
  }, 100)
}

// Watch for match query param
watch(() => route.query.match, (matchId) => {
  if (matchId && typeof matchId === 'string') {
    activeTab.value = 'new'
    void scrollToMatch(matchId)
    void router.replace({ query: { ...route.query, match: undefined } })
  }
})

// ✅ CARGAR DATOS AL MONTAR
onMounted(async () => {
  if (!authStore.user) return

  // Check for incomplete clear data operation and resume if needed
  const savedClearState = loadClearDataState()
  if (savedClearState?.status === 'in_progress') {
    void resumeClearData(savedClearState)
    return
  } else if (savedClearState?.status === 'complete') {
    clearClearDataState()
  }

  // Load discarded matches from Firestore
  await loadDiscardedMatches()

  loading.value = true
  try {
    // Cargar datos en paralelo
    contactsStore.loadSavedContacts()
    await Promise.all([
      matchesStore.loadAllMatches(),
      collectionStore.loadCollection(),
      preferencesStore.loadPreferences(),
    ])

    await loadSavedMatchesWithEmails()

    // Contar usuarios totales
    const usersRef = collection(db, 'users')
    const usersSnapshot = await getDocs(usersRef)
    totalUsers.value = usersSnapshot.docs.length - 1

    // Calcular matches si tiene cartas o preferencias
    if (collectionStore.cards.length > 0 || preferencesStore.preferences.length > 0) {
      await calculateMatches()
    }
  } finally {
    loading.value = false
  }

  // Handle initial match query param
  const matchId = route.query.match
  if (matchId && typeof matchId === 'string') {
    activeTab.value = 'new'
    await scrollToMatch(matchId)
    void router.replace({ query: { ...route.query, match: undefined } })
  }
})

onUnmounted(() => {
  contactsStore.stopListeningContacts()
})
</script>

<template>
  <AppContainer>
    <div>
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-lg md:mb-xl">
        <div>
          <h1 class="text-h2 md:text-h1 font-bold text-silver mb-sm flex items-center gap-sm">
            {{ t('matches.title') }}
            <HelpTooltip
                :text="t('help.tooltips.matches.compatibility')"
                :title="t('help.titles.compatibility')"
            />
          </h1>
          <p class="text-small md:text-body text-silver-70">
            {{ t('matches.subtitle') }}
          </p>
        </div>

        <!-- Action buttons -->
        <div class="flex flex-col md:flex-row gap-2">
          <div class="flex items-center gap-1">
            <BaseButton
                variant="secondary"
                size="small"
                @click="calculateMatches"
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
          <div class="flex items-center gap-1">
            <BaseButton
                variant="secondary"
                size="small"
                @click="openBlockedUsersModal"
                class="w-full md:w-auto"
            >
              {{ t('dashboard.blockedUsers') }} ({{ discardedMatchIds.size }})
            </BaseButton>
            <HelpTooltip :text="t('help.tooltips.dashboard.blockedUsers')" :title="t('help.titles.blockedUsers')" />
          </div>
          <BaseButton
              variant="secondary"
              size="small"
              @click="clearAllData"
              class="w-full md:w-auto text-rust border-rust hover:bg-rust/10"
          >
            {{ t('dashboard.clearData.title') }}
          </BaseButton>
        </div>
      </div>

      <!-- Last sync indicator -->
      <p v-if="collectionStore.lastSyncAt" class="text-tiny text-silver-50 mb-4">
        {{ t('dashboard.lastSync') }}: {{ formatLastSync(collectionStore.lastSyncAt) }}
      </p>

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

      <!-- Tabs -->
      <div class="flex flex-wrap gap-sm md:gap-md mb-lg md:mb-xl border-b border-silver-20">
        <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="handleTabChange(tab.id)"
            :class="[
            'pb-md border-b-2 transition-fast whitespace-nowrap font-bold text-small md:text-body flex items-center gap-sm',
            activeTab === tab.id
              ? 'border-neon text-neon'
              : 'border-transparent text-silver-70 hover:text-silver'
          ]"
        >
          <SvgIcon :name="tab.icon" size="small" />
          <span>{{ tab.label }}</span>
          <HelpTooltip
              :text="tab.id === 'new' ? t('help.tooltips.matches.tabNew') :
                     tab.id === 'sent' ? t('help.tooltips.matches.tabSent') :
                     tab.id === 'saved' ? t('help.tooltips.matches.tabSaved') :
                     t('help.tooltips.matches.tabDeleted')"
              :title="tab.id === 'new' ? t('help.titles.tabNew') :
                      tab.id === 'sent' ? t('help.titles.tabSent') :
                      tab.id === 'saved' ? t('help.titles.tabSaved') :
                      t('help.titles.tabDeleted')"
          />
          <span v-if="tab.count > 0" class="text-tiny bg-neon text-primary px-sm py-xs font-bold rounded-sm">
            {{ tab.count }}
          </span>
        </button>
      </div>

      <!-- Controls bar -->
      <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
        <!-- Group toggle -->
        <label class="flex items-center gap-2 cursor-pointer">
          <input
              v-model="groupByUser"
              type="checkbox"
              class="w-4 h-4 accent-neon"
          />
          <span class="text-small text-silver-70">{{ t('matches.controls.groupByUser') }}</span>
        </label>

        <!-- Bulk action -->
        <BaseButton
            v-if="activeTab === 'new' && todaysNewMatches.length > 0"
            size="small"
            @click="handleSaveAllToday"
        >
          {{ t('matches.controls.saveAllToday', { count: todaysNewMatches.length }) }}
        </BaseButton>
      </div>

      <!-- Loading state (no progress bar) -->
      <div v-if="loading && progressTotal === 0" class="flex justify-center items-center py-xl">
        <BaseLoader size="large" />
      </div>

      <!-- Empty state -->
      <div v-else-if="currentMatches.length === 0 && !loading" class="border border-silver-30 p-6 md:p-8 text-center rounded-md">
        <p class="text-body text-silver-70">
          {{ activeTab === 'new' ? t('matches.empty.new.title') :
            activeTab === 'sent' ? t('matches.empty.sent.title') :
            activeTab === 'saved' ? t('matches.empty.saved.title') :
                t('matches.empty.deleted.title') }}
        </p>
        <p class="text-small text-silver-50 mt-2">
          {{ activeTab === 'new' ? t('matches.empty.new.message') :
            activeTab === 'sent' ? t('matches.empty.sent.message') :
            activeTab === 'saved' ? t('matches.empty.saved.message') :
                t('matches.empty.deleted.message') }}
        </p>
      </div>

      <!-- Matches list - Grouped by user -->
      <div v-else-if="groupByUser && groupedMatches" class="space-y-8">
        <div
            v-for="group in groupedMatches"
            :key="group.userId"
            class="border border-silver-30 rounded-md overflow-hidden"
        >
          <!-- Group header -->
          <div class="bg-silver-5 px-4 py-3 flex items-center gap-3 border-b border-silver-20">
            <img
                :src="getAvatarUrlForUser(group.username, 32, group.avatarUrl)"
                alt=""
                class="w-8 h-8 rounded-full"
            />
            <div class="flex-1">
              <router-link
                  :to="`/@${group.username}`"
                  class="text-body font-bold text-neon hover:underline"
              >
                @{{ group.username }}
              </router-link>
              <p v-if="group.location" class="text-tiny text-silver-50">{{ group.location }}</p>
            </div>
            <span class="text-small text-silver-70">
              {{ group.matches.length }} {{ t('matches.controls.matchesCount') }}
            </span>
          </div>

          <!-- Group matches -->
          <div class="p-4 space-y-4">
            <div
                v-for="(match, idx) in group.matches"
                :key="match.docId || match.id"
                :data-match-id="match.docId || match.id"
                :class="{ 'ring-2 ring-neon rounded-md transition-all duration-500': highlightedMatchId === (match.docId || match.id) }"
            >
              <MatchCard
                  :match="match"
                  :match-index="idx + 1"
                  :tab="activeTab"
                  @save="handleSaveMatch"
                  @discard="handleDiscardMatch"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Matches list - Flat (no grouping) -->
      <div v-else class="space-y-md">
        <div
            v-for="(match, idx) in currentMatches"
            :key="match.docId || match.id"
            :data-match-id="match.docId || match.id"
            :class="{ 'ring-2 ring-neon rounded-md transition-all duration-500': highlightedMatchId === (match.docId || match.id) }"
        >
          <MatchCard
              :match="match"
              :match-index="idx + 1"
              :tab="activeTab"
              @save="handleSaveMatch"
              @discard="handleDiscardMatch"
          />
        </div>
      </div>
    </div>

    <!-- Blocked Users Modal -->
    <BaseModal
        :show="showBlockedUsersModal"
        :title="t('dashboard.blockedUsersModal.title')"
        @close="showBlockedUsersModal = false"
    >
      <div class="min-w-[300px]">
        <!-- Block by username input -->
        <div class="flex gap-2 mb-4">
          <input
              v-model="blockUsernameInput"
              type="text"
              :placeholder="t('dashboard.blockedUsersModal.usernamePlaceholder')"
              class="flex-1 px-3 py-2 bg-primary border border-silver-30 rounded text-silver text-small placeholder-silver-50 focus:border-neon focus:outline-none"
              @keyup.enter="handleBlockByUsername"
              :disabled="blockingUser"
          />
          <BaseButton
              size="small"
              :disabled="!blockUsernameInput.trim() || blockingUser"
              @click="handleBlockByUsername"
          >
            {{ t('dashboard.blockedUsersModal.block') }}
          </BaseButton>
        </div>

        <!-- Blocked users list -->
        <div class="max-h-[350px] overflow-y-auto">
          <div v-if="loadingBlockedUsers" class="flex justify-center py-8">
            <BaseLoader />
          </div>

          <div v-else-if="blockedUsers.length === 0" class="text-center py-8 text-silver-50">
            {{ t('dashboard.blockedUsersModal.noBlocked') }}
          </div>

          <div v-else class="space-y-3">
            <div
                v-for="user in blockedUsers"
                :key="user.odifUserId"
                class="flex items-center justify-between p-3 border border-silver-30 rounded-md"
            >
              <div class="flex items-center gap-3">
                <img
                    :src="getAvatarUrlForUser(user.odifUserId)"
                    :alt="user.username"
                    class="w-10 h-10 rounded-full object-cover"
                />
                <div>
                  <p class="text-silver font-medium">{{ user.username }}</p>
                  <p v-if="user.location" class="text-tiny text-silver-50">{{ user.location }}</p>
                </div>
              </div>
              <BaseButton
                  variant="secondary"
                  size="small"
                  @click="unblockUser(user)"
              >
                {{ t('dashboard.blockedUsersModal.unblock') }}
              </BaseButton>
            </div>
          </div>
        </div>
      </div>
    </BaseModal>
  </AppContainer>
</template>
