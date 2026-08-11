<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { type SimpleMatch, useMatchesStore } from '../stores/matches'
import { useBuyRequestsStore } from '../stores/buyRequests'
import { useContactsStore } from '../stores/contacts'
import { useCollectionStore } from '../stores/collection'
import { usePreferencesStore } from '../stores/preferences'
import { useAuthStore } from '../stores/auth'
import { usePriceMatchingStore } from '../stores/priceMatchingHelper'
import { useToastStore } from '../stores/toast'
import { useConfirmStore } from '../stores/confirm'
import { useI18n } from '../composables/useI18n'
import { formatDate } from '../utils/formatDate'
import { db } from '../services/firestore'
import { addDoc, collection, deleteDoc, doc, getDocs } from 'firebase/firestore'
import { resolveUsernameToUid } from '../services/userLookup'
import {
  findCardsMatchingPreferences,
  findPreferencesMatchingCards,
} from '../services/publicCards'
import AppContainer from '../components/layout/AppContainer.vue'
import BaseLoader from '../components/ui/BaseLoader.vue'
import BaseModal from '../components/ui/BaseModal.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import MatchCard from '../components/matches/MatchCard.vue'
import BuyRequestCard from '../components/matches/BuyRequestCard.vue'
import SavedContactCard from '../components/contacts/SavedContactCard.vue'
import ChatModal from '../components/chat/ChatModal.vue'
import HelpTooltip from '../components/ui/HelpTooltip.vue'
import IconV2 from '../components/ui/IconV2.vue'
import { getAvatarUrlForUser } from '../utils/avatar'
import { getMatchExpirationDate } from '../utils/matchExpiry'
import { groupMatchesByUser } from '../utils/matchGrouping'
import { matchIdentityKey } from '../utils/matchDedup'
import {
  buildMatchChipSummaries,
  defaultExpandedGroupIds,
  type MatchChipId,
  selectMatchesForChip,
  sumPotentialValue,
} from '../utils/matchChipFilter'
import { getTotalUserCount } from '../services/stats'
import { logSanitizedError } from '../utils/logSanitizedError'
import type { CardCondition, CardStatus } from '../types/card'

const route = useRoute()
const router = useRouter()
const matchesStore = useMatchesStore()
const buyRequestsStore = useBuyRequestsStore()
const contactsStore = useContactsStore()
const collectionStore = useCollectionStore()
const preferencesStore = usePreferencesStore()
const authStore = useAuthStore()
const priceMatching = usePriceMatchingStore()
const toastStore = useToastStore()
const confirmStore = useConfirmStore()
const { t, locale } = useI18n()

// State
// v2 redesign — 6 tabs collapse to 3 primary tabs; the 4 match states (new/sent/
// saved/deleted) become filter chips inside the MATCHES primary tab (F2, see
// cranial-design/prototype/DESIGN-DIRECTION.md §8.2).
type PrimaryTab = 'matches' | 'buyRequests' | 'contacts'
const activeTab = ref<PrimaryTab>('matches')
const activeChip = ref<MatchChipId>('new')
const showOverflowMenu = ref(false)
const overflowMenuRef = ref<HTMLElement | null>(null)
const highlightedMatchId = ref<string | null>(null)
const matchesWithEmails = ref<SimpleMatch[]>([])
const loading = ref(false)

// Match calculation state (ported from DashboardView)
const syncing = ref(false)
const calculatedMatches = ref<SimpleMatch[]>([])
const progressCurrent = ref(0)
const progressTotal = ref(0)
/**
 * Recalculo en segundo plano (perf, reporte 2026-08-07).
 *
 * Antes el recalculo completo corria DENTRO del `loading` de initView, asi que el
 * landing autenticado no mostraba nada hasta terminarlo — aunque los matches ya
 * estaban persistidos en Firestore y listos para pintar. Ahora `loading` cubre solo
 * la carga de lo persistido y este flag gatea el panel de progreso del refresco.
 */
const recalculating = ref(false)
const totalUsers = ref(0)
// SCRUM-71.1: discardedMatchIds = personas BLOQUEADas (filtran todos sus matches).
// discardedMatchKeys = matches descartados individualmente (suprimen SOLO ese match).
const discardedMatchIds = ref<Set<string>>(new Set())
const discardedMatchKeys = ref<Set<string>>(new Set())

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

// ✅ DATOS REALES desde store
const newMatches = computed(() => matchesStore.newMatches)
const sentMatches = computed(() => matchesStore.sentMatches)
const savedMatches = computed(() => matchesStore.savedMatches)
const deletedMatches = computed(() => matchesStore.deletedMatches)

// Primary tabs configuration (3: Matches · Solicitudes · Contactos)
const primaryTabs = computed(() => [
  {
    id: 'matches' as const,
    label: t('matches.primaryTabs.matches'),
    icon: 'swap',
    count: 0,
  },
  {
    id: 'buyRequests' as const,
    label: t('matches.tabs.buyRequests'),
    icon: 'chat',
    count: buyRequestsStore.pendingCount
  },
  {
    // RED hub: Contactos graduates from a separate /contacts page into a tab here.
    id: 'contacts' as const,
    label: t('matches.tabs.contacts'),
    icon: 'user',
    count: contactsStore.contacts.length
  }
])

// Filter chips within the MATCHES primary tab — counts come straight from the
// store's raw arrays (matchChipFilter.ts is pure/tested, see tests/unit/utils/matchChipFilter.test.ts).
const matchChips = computed(() => buildMatchChipSummaries({
  new: newMatches.value,
  sent: sentMatches.value,
  saved: savedMatches.value,
  deleted: deletedMatches.value,
}))

// Group matches by user — v2 redesign always shows the grouped "vitrina" view (no
// manual toggle in the UI, DESIGN-DIRECTION.md §8.2). The flat (ungrouped) branch
// below stays as a dead-code safety net; its removal is deferred to TASK-106.
const groupByUser = ref(true)

// SCRUM-71.4: grupos colapsables. Por defecto TODOS colapsados — un grupo solo
// está expandido si su userId está en este Set. Se trackea POR CHIP (Map keyed by
// MatchChipId) porque cada chip (new/sent/saved/deleted) tiene su propio conjunto de
// grupos — compartir un único Set entre chips pisaba el estado del chip anterior en
// un round-trip new→sent→new, dejando todos los grupos colapsados (review finding).
const expandedGroupsByChip = ref<Map<MatchChipId, Set<string>>>(new Map())
const currentExpandedGroups = computed(() => expandedGroupsByChip.value.get(activeChip.value) ?? new Set<string>())
const isGroupExpanded = (userId: string) => currentExpandedGroups.value.has(userId)
const toggleGroup = (userId: string) => {
  const next = new Set(currentExpandedGroups.value)
  if (next.has(userId)) next.delete(userId)
  else next.add(userId)
  const map = new Map(expandedGroupsByChip.value)
  map.set(activeChip.value, next)
  expandedGroupsByChip.value = map
}

// Current chip's matches — 'saved' reads from matchesWithEmails (email-enriched)
// while chip counts above read from the raw store array (savedMatches).
const currentMatches = computed(() => selectMatchesForChip(activeChip.value, {
  new: newMatches.value,
  sent: sentMatches.value,
  saved: matchesWithEmails.value,
  deleted: deletedMatches.value,
}))

// Potential value stat-chip: sum of what you'd receive across your new matches.
const potentialValue = computed(() => sumPotentialValue(newMatches.value))

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

// v2 redesign — first group expanded by default, rest collapsed (never a screen of
// pure collapsed headers). Applied once per chip the first time its group list becomes
// non-empty, writing only that chip's entry in the map so other chips' expansion state
// (default or user-toggled) survives switching away and back.
const chipsWithDefaultExpansion = ref<Set<MatchChipId>>(new Set())
watch(groupedMatches, (groups) => {
  if (!groups || groups.length === 0) return
  if (chipsWithDefaultExpansion.value.has(activeChip.value)) return
  const map = new Map(expandedGroupsByChip.value)
  map.set(activeChip.value, defaultExpandedGroupIds(groups.map(g => g.userId)))
  expandedGroupsByChip.value = map
  chipsWithDefaultExpansion.value = new Set(chipsWithDefaultExpansion.value).add(activeChip.value)
}, { immediate: true })

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
  return formatDate(date, locale.value)
}

// ✅ CARGAR EMAILS para matches guardados
//
// TASK-188: antes esto leia el email del documento /users/{otherUserId}. Ese
// documento es de lectura PUBLICA — el perfil de otro usuario se abre sin
// sesion, y las reglas de Firestore no filtran por campo — asi que una peticion
// anonima se bajaba el email de toda la plataforma. Es el mismo defecto que
// TASK-169 arreglo en public_cards, en otra coleccion. El email ahora se pide a
// contact_info/{uid}, cuya regla exige sesion; este flujo siempre la tiene.
const loadSavedMatchesWithEmails = async () => {
  try {
    const { getContactInfo } = await import('../services/contactInfo')
    const matchesWithData = await Promise.all(
        savedMatches.value.map(async (match) => {
          // getContactInfo no lanza: devuelve null si no existe o si la lectura
          // se deniega. La ausencia es "no hay contacto", nunca un error que
          // corte el listado — igual que antes.
          const contact = await getContactInfo(match.otherUserId)
          return {
            ...match,
            otherEmail: contact?.email ?? '',
          }
        })
    )

    matchesWithEmails.value = matchesWithData
  } catch {
    // ignore
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
      // SCRUM-71.1: el modal de bloqueados solo muestra bloqueos reales, no descartes
      if (data.kind === 'discard') continue

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
    // Look up user by username (deterministic — D-11)
    const result = await resolveUsernameToUid(username)
    if (!result) {
      toastStore.show(t('dashboard.blockedUsersModal.userNotFound'), 'error')
      return
    }
    const foundUserId = result.id
    const userData = result.data

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
      lifeExpiresAt: getMatchExpirationDate(),
      kind: 'block', // SCRUM-71.1: bloqueo explícito de la persona
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

// ========== CALCULATE MATCHES ==========

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

    // PASO 1 y 2: las dos busquedas son independientes entre si (una lee
    // public_cards, la otra public_preferences, y ninguna consume el resultado de
    // la otra), asi que van en paralelo. Encadenarlas duplicaba la fase de red.
    progressTotal.value = 2
    progressCurrent.value = 1

    const [matchingCards, matchingPrefs] = await Promise.all([
      findCardsMatchingPreferences(myWishlist, authStore.user.id),
      findPreferencesMatchingCards(myCards, authStore.user.id),
    ])

    progressCurrent.value = 2

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
          lifeExpiresAt: getMatchExpirationDate(),
        }

        foundMatches.push(match)
      }
    }

    // Ordenar por compatibilidad descendente y filtrar
    // SCRUM-71.1: excluir personas bloqueadas (por userId) Y matches descartados
    // individualmente (por clave de identidad). Descartar un match ya NO bloquea
    // a la persona — solo suprime ese match concreto.
    foundMatches.sort((a, b) => (b.compatibility ?? 0) - (a.compatibility ?? 0))
    calculatedMatches.value = foundMatches.filter(m =>
      !discardedMatchIds.value.has(m.otherUserId) &&
      !discardedMatchKeys.value.has(matchIdentityKey(m))
    )

    // Persistir matches en Firestore
    // SimpleMatch has optional otherLocation/otherEmail but persistCalculatedMatches
    // requires strings — coerce via defaults at the call boundary (preserves behavior:
    // foundMatches always has non-empty otherLocation/otherEmail from data.location/data.email).
    // SCRUM-71.1: persistir SOLO los matches visibles (ya filtrados por bloqueo y
    // descarte). Persistir `foundMatches` crudo re-escribía los descartados y
    // reaparecían tras el recálculo.
    if (calculatedMatches.value.length > 0) {
      await matchesStore.persistCalculatedMatches(
        calculatedMatches.value.map(m => ({
          id: m.id,
          otherUserId: m.otherUserId,
          otherUsername: m.otherUsername,
          otherLocation: m.otherLocation ?? '',
          otherEmail: m.otherEmail ?? '',
          myCards: m.myCards ?? [],
          otherCards: m.otherCards ?? [],
          myTotalValue: m.myTotalValue ?? 0,
          theirTotalValue: m.theirTotalValue ?? 0,
          valueDifference: m.valueDifference ?? 0,
          compatibility: m.compatibility ?? 0,
          type: m.type,
          createdAt: m.createdAt,
          lifeExpiresAt: m.lifeExpiresAt ?? getMatchExpirationDate(),
        }))
      )
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

// v2 redesign — Recalcular + Sincronizar fuse into a single "Actualizar" button
// (F2, DESIGN-DIRECTION.md §8.2). Sync first (push my collection to public data),
// then recalculate matches against everyone else's now-fresher public data.
const refreshing = computed(() => loading.value || syncing.value)
const canRefresh = computed(() =>
  !refreshing.value && (collectionStore.cards.length > 0 || preferencesStore.preferences.length > 0)
)
const handleRefresh = async () => {
  await syncPublicData()
  await calculateMatches()
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
    // SimpleMatch.otherLocation is optional; store requires string — coerce at boundary.
    await matchesStore.discardCalculatedMatch({
      id: calcMatch.id,
      otherUserId: calcMatch.otherUserId,
      otherUsername: calcMatch.otherUsername,
      otherLocation: calcMatch.otherLocation ?? '',
      myCards: calcMatch.myCards ?? [],
      otherCards: calcMatch.otherCards ?? [],
    })
    // SCRUM-71.1: descartar este match concreto (por identidad), NO bloquear a la persona
    discardedMatchKeys.value.add(matchIdentityKey(calcMatch))
    calculatedMatches.value = calculatedMatches.value.filter(m => m.id !== matchId)
    toastStore.show(t('matches.messages.deleted'), 'info')
    return
  }

  // Otherwise use the store for tab-based matches
  const tab = activeChip.value === 'new' ? 'new' : 'saved'
  await matchesStore.discardMatch(matchId, tab)
  await loadSavedMatchesWithEmails()
}

const handleTabChange = async (tabId: PrimaryTab) => {
  activeTab.value = tabId
  if (tabId === 'buyRequests') {
    await buyRequestsStore.loadBuyRequests()
  } else if (tabId === 'contacts') {
    contactsStore.loadSavedContacts()
  }
}

const handleChipChange = (chipId: MatchChipId) => {
  activeChip.value = chipId
}

const handleOverflowMenuClickOutside = (e: MouseEvent) => {
  if (overflowMenuRef.value && !overflowMenuRef.value.contains(e.target as Node)) {
    showOverflowMenu.value = false
  }
}

// RED hub — Contactos tab (merged from the former /contacts page)
const showChat = ref(false)
const selectedContact = ref<{ id: string; userId?: string; username: string; email?: string } | null>(null)

const handleContactChat = (contact: { id: string; userId?: string; username: string; email?: string }) => {
  selectedContact.value = contact
  showChat.value = true
}

const closeContactChat = () => {
  showChat.value = false
  selectedContact.value = null
}

const handleDeleteContact = async (contactId: string) => {
  const confirmed = await confirmStore.show({
    title: t('common.actions.delete'),
    message: t('contacts.messages.deleted'),
    confirmText: t('common.actions.delete'),
    cancelText: t('common.actions.cancel'),
    confirmVariant: 'danger'
  })
  if (confirmed) {
    await contactsStore.deleteContact(contactId)
  }
}

// SCRUM-70.2/70.3: acciones sobre buy requests
const handleFulfillBuyRequest = async (requestId: string) => {
  const confirmed = await confirmStore.show({
    title: t('matches.buyRequests.fulfillTitle'),
    message: t('matches.buyRequests.fulfillMessage'),
  })
  if (!confirmed) return
  const res = await buyRequestsStore.fulfillRequest(requestId)
  if (res.ok) {
    toastStore.show(
      res.missing.length > 0
        ? t('matches.buyRequests.fulfilledPartial', { count: res.missing.length })
        : t('matches.buyRequests.fulfilled'),
      res.missing.length > 0 ? 'info' : 'success',
    )
  } else {
    toastStore.show(t('matches.buyRequests.fulfillError'), 'error')
  }
}

const handleDeleteBuyRequest = async (requestId: string) => {
  const confirmed = await confirmStore.show({
    title: t('matches.buyRequests.deleteTitle'),
    message: t('matches.buyRequests.deleteMessage'),
  })
  if (!confirmed) return
  await buyRequestsStore.deleteRequest(requestId)
}

const handleSeenBuyRequest = (requestId: string) => {
  void buyRequestsStore.markSeen(requestId)
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
  // SCRUM-71.4: si el match está en un grupo colapsado, expandirlo antes de hacer scroll
  if (groupByUser.value) {
    const target = currentMatches.value.find(m => m.docId === matchId || m.id === matchId)
    if (target) {
      const map = new Map(expandedGroupsByChip.value)
      map.set(activeChip.value, new Set(currentExpandedGroups.value).add(target.otherUserId))
      expandedGroupsByChip.value = map
    }
  }
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
    activeTab.value = 'matches'
    activeChip.value = 'new'
    void scrollToMatch(matchId)
    void router.replace({ query: { ...route.query, match: undefined } })
  }
})

// RED hub: the former /contacts route redirects here with ?tab=contacts — open the Contactos tab
watch(() => route.query.tab, (tab) => {
  if (tab === 'contacts') {
    activeTab.value = 'contacts'
    contactsStore.loadSavedContacts()
  }
}, { immediate: true })

// ✅ CARGAR DATOS AL MONTAR
const initView = async () => {
  if (!authStore.user) return

  // SCRUM-71.1: cargar por separado personas bloqueadas y matches descartados
  ;[discardedMatchIds.value, discardedMatchKeys.value] = await Promise.all([
    matchesStore.loadBlockedUserIds(),
    matchesStore.loadDiscardedMatchKeys(),
  ])

  loading.value = true
  try {
    // Cargar datos en paralelo
    contactsStore.loadSavedContacts()
    await Promise.all([
      matchesStore.loadAllMatches(),
      collectionStore.loadCollection(),
      preferencesStore.loadPreferences(),
      buyRequestsStore.loadBuyRequests(), // SCRUM-70.2
    ])
  } finally {
    // Los matches YA persistidos estan en el store: pintar ahora. Todo lo que sigue
    // enriquece o refresca lo que ya se ve, asi que no debe gatear el render — antes
    // el recalculo completo corria aca dentro y dejaba la pantalla vacia durante
    // toda la fase mas cara del landing.
    loading.value = false
  }

  void refreshInBackground()
}

/**
 * Enriquecido + recalculo posteriores al primer render. Nunca gatean `loading`.
 * Se traga sus errores a proposito: es un refresco de algo que el usuario ya esta
 * viendo, y como es fire-and-forget una excepcion aqui seria un unhandled rejection.
 */
const refreshInBackground = async () => {
  try {
    // Solo decora filas ya renderizadas con el email del otro usuario.
    await loadSavedMatchesWithEmails()

    // Contar usuarios totales
    totalUsers.value = Math.max(0, (await getTotalUserCount()) - 1) // Excluir al usuario actual

    // Calcular matches si tiene cartas o preferencias
    if (collectionStore.cards.length > 0 || preferencesStore.preferences.length > 0) {
      recalculating.value = true
      try {
        await calculateMatches()
      } finally {
        recalculating.value = false
      }
    }
  } catch (error) {
    logSanitizedError('[SavedMatchesView] background refresh failed', error)
  }
}

onMounted(() => {
  void initView().then(() => {
    const matchId = route.query.match
    if (matchId && typeof matchId === 'string') {
      activeTab.value = 'matches'
      activeChip.value = 'new'
      void scrollToMatch(matchId)
      void router.replace({ query: { ...route.query, match: undefined } })
    }
  })
  document.addEventListener('click', handleOverflowMenuClickOutside)
})

onUnmounted(() => {
  contactsStore.stopListeningContacts()
  document.removeEventListener('click', handleOverflowMenuClickOutside)
})
</script>

<template>
  <AppContainer>
    <div>
      <!-- Header (v2 redesign — stat-chips + unified Actualizar, F2 DESIGN-DIRECTION.md §8.2) -->
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-lg md:mb-xl">
        <div>
          <p class="font-display text-[11px] font-bold tracking-[.18em] uppercase text-neon mb-1">{{ t('matches.header.kicker') }}</p>
          <h1 class="font-display text-h2 md:text-h1 font-bold text-silver flex items-center gap-sm">
            {{ t('matches.title') }}
            <HelpTooltip
                :text="t('help.tooltips.matches.compatibility')"
                :title="t('help.titles.compatibility')"
            />
          </h1>
          <div class="flex flex-wrap gap-2.5 mt-3.5">
            <div class="flex flex-col gap-0.5 px-4 py-2.5 bg-surface-1 border border-line rounded-lg">
              <span class="font-display font-tnum text-[26px] font-bold leading-none text-neon">{{ newMatches.length }}</span>
              <span class="text-[11px] tracking-[.08em] uppercase text-silver-30 font-semibold">{{ t('matches.header.newMatches') }}</span>
            </div>
            <div class="flex flex-col gap-0.5 px-4 py-2.5 bg-surface-1 border border-line rounded-lg">
              <span class="font-display font-tnum text-[20px] font-bold leading-none text-silver">${{ potentialValue.toFixed(0) }}</span>
              <span class="text-[11px] tracking-[.08em] uppercase text-silver-30 font-semibold">{{ t('matches.header.potentialValue') }}</span>
            </div>
            <div class="flex flex-col gap-0.5 px-4 py-2.5 bg-surface-1 border border-line rounded-lg">
              <span class="font-display font-tnum text-[20px] font-bold leading-none text-silver">{{ totalUsers }}</span>
              <span class="text-[11px] tracking-[.08em] uppercase text-silver-30 font-semibold">{{ t('matches.header.activeTraders') }}</span>
            </div>
          </div>
        </div>

        <!-- Head tools: unified refresh + overflow menu -->
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1">
            <button
                type="button"
                class="inline-flex items-center gap-2 min-h-9 px-3.5 rounded-md border border-line-strong text-silver-70 text-tiny font-bold uppercase tracking-wide transition-all duration-200 ease-v2 hover:border-silver-30 hover:text-silver hover:bg-surface-1 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="!canRefresh"
                @click="handleRefresh"
            >
              <IconV2 name="sync" :size="16" :class="{ 'animate-spin': refreshing }" />
              {{ refreshing ? t('matches.actions.refreshing') : t('matches.actions.refresh') }}
            </button>
            <HelpTooltip :text="t('help.tooltips.dashboard.refreshMatches')" :title="t('help.titles.refreshMatches')" />
          </div>
          <span v-if="collectionStore.lastSyncAt" class="text-tiny text-silver-30 whitespace-nowrap">
            {{ formatLastSync(collectionStore.lastSyncAt) }}
          </span>

          <div ref="overflowMenuRef" class="relative">
            <button
                type="button"
                class="w-10 h-10 inline-flex items-center justify-center rounded-md text-silver-50 hover:text-silver hover:bg-surface-2 transition-colors"
                :aria-label="t('matches.menu.moreOptions')"
                aria-haspopup="menu"
                :aria-expanded="showOverflowMenu"
                @click="showOverflowMenu = !showOverflowMenu"
            >
              <IconV2 name="dots" :size="20" />
            </button>
            <div
                v-if="showOverflowMenu"
                role="menu"
                class="absolute top-[calc(100%+8px)] right-0 min-w-[200px] bg-[#0b0b0b] border border-line-strong rounded-md shadow-strong p-1.5 z-50"
            >
              <button
                  type="button"
                  role="menuitem"
                  class="flex w-full items-center gap-2.5 min-h-10 px-2.5 rounded text-small text-silver-70 hover:bg-surface-2 hover:text-silver transition-colors"
                  @click="showOverflowMenu = false; openBlockedUsersModal()"
              >
                <IconV2 name="block" :size="18" />
                {{ t('dashboard.blockedUsers') }}
                <span class="ml-auto font-display font-tnum text-tiny text-silver-50">{{ discardedMatchIds.size }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Progress bar -->
      <div v-if="recalculating && progressTotal > 0" class="bg-primary border border-neon p-4 mb-6 rounded-none">
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

      <!-- Primary tabs: MATCHES · SOLICITUDES · CONTACTOS -->
      <!-- No role="tab"/"tablist": plain buttons, same ARIA shape as before (v1) —
           e2e/pages/navigation.page.ts and matches.page.ts locate these via getByRole('button'). -->
      <nav class="flex gap-0.5 border-b border-line mb-5 overflow-x-auto" :aria-label="t('matches.primaryTabs.nav')">
        <button
            v-for="tab in primaryTabs"
            :key="tab.id"
            type="button"
            :aria-current="activeTab === tab.id ? 'page' : undefined"
            :class="[
              'relative inline-flex items-center gap-2 px-4 py-3 text-tiny font-bold uppercase tracking-wide whitespace-nowrap border-b-2 transition-colors duration-200 ease-v2',
              activeTab === tab.id ? 'text-neon border-neon' : 'text-silver-50 border-transparent hover:text-silver'
            ]"
            @click="handleTabChange(tab.id)"
        >
          <IconV2 :name="tab.icon" :size="17" />
          {{ tab.label }}
          <span v-if="tab.count > 0" class="font-display font-tnum text-[13px] font-semibold text-silver-50">{{ tab.count }}</span>
        </button>
      </nav>

      <!-- Filter chips (within MATCHES): Nuevos · Enviados · Guardados · Eliminados -->
      <div v-if="activeTab === 'matches'" class="flex flex-wrap gap-2 mb-5">
        <button
            v-for="chip in matchChips"
            :key="chip.id"
            type="button"
            :class="[
              'inline-flex items-center gap-2 min-h-9 px-3.5 rounded-full text-small font-semibold border transition-all duration-200 ease-v2',
              activeChip === chip.id ? 'text-neon bg-neon-10 border-neon-40' : 'text-silver-50 bg-surface-1 border-line hover:text-silver hover:border-line-strong'
            ]"
            @click="handleChipChange(chip.id)"
        >
          {{ t(`matches.tabs.${chip.id}`) }}
          <span class="font-display font-tnum font-bold">{{ chip.count }}</span>
        </button>
      </div>

      <!-- Bulk action (Matches / Nuevos only) -->
      <div v-if="activeTab === 'matches' && activeChip === 'new' && todaysNewMatches.length > 0" class="flex justify-end mb-4">
        <BaseButton size="small" @click="handleSaveAllToday">
          {{ t('matches.controls.saveAllToday', { count: todaysNewMatches.length }) }}
        </BaseButton>
      </div>

      <!-- Buy Requests tab (SCRUM-70.2) -->
      <div v-if="activeTab === 'buyRequests'" class="space-y-4">
        <div v-if="buyRequestsStore.loading" class="flex justify-center items-center py-xl">
          <BaseLoader size="large" />
        </div>
        <div
            v-else-if="buyRequestsStore.buyRequests.length === 0"
            class="border border-silver-30 p-6 md:p-8 text-center rounded-none"
        >
          <p class="text-body text-silver-70">{{ t('matches.buyRequests.empty.title') }}</p>
          <p class="text-small text-silver-50 mt-2">{{ t('matches.buyRequests.empty.message') }}</p>
        </div>
        <BuyRequestCard
            v-for="req in buyRequestsStore.buyRequests"
            v-else
            :key="req.id"
            :request="req"
            @seen="handleSeenBuyRequest"
            @fulfill="handleFulfillBuyRequest"
            @delete="handleDeleteBuyRequest"
        />
      </div>

      <!-- Contactos tab (RED hub merge) -->
      <div v-else-if="activeTab === 'contacts'">
        <div v-if="contactsStore.loading" class="flex justify-center items-center py-xl">
          <BaseLoader size="large" />
        </div>
        <div
            v-else-if="contactsStore.contacts.length === 0"
            class="border border-silver-30 p-6 md:p-8 text-center"
        >
          <p class="text-body text-silver-70">{{ t('contacts.empty.title') }}</p>
          <p class="text-small text-silver-50 mt-2">{{ t('contacts.empty.message') }}</p>
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
          <SavedContactCard
              v-for="contact in contactsStore.contacts"
              :key="contact.id"
              :contact="contact"
              @delete="handleDeleteContact"
              @chat="handleContactChat"
          />
        </div>
      </div>

      <!-- Loading state (no progress bar) -->
      <div v-else-if="loading && progressTotal === 0" class="flex justify-center items-center py-xl">
        <BaseLoader size="large" />
      </div>

      <!-- Empty state -->
      <div v-else-if="currentMatches.length === 0 && !loading" class="border border-silver-30 p-6 md:p-8 text-center rounded-none">
        <p class="text-body text-silver-70">
          {{ activeChip === 'new' ? t('matches.empty.new.title') :
            activeChip === 'sent' ? t('matches.empty.sent.title') :
            activeChip === 'saved' ? t('matches.empty.saved.title') :
                t('matches.empty.deleted.title') }}
        </p>
        <p class="text-small text-silver-50 mt-2">
          {{ activeChip === 'new' ? t('matches.empty.new.message') :
            activeChip === 'sent' ? t('matches.empty.sent.message') :
            activeChip === 'saved' ? t('matches.empty.saved.message') :
                t('matches.empty.deleted.message') }}
        </p>
      </div>

      <!-- Matches list - Grouped by user -->
      <div v-else-if="groupByUser && groupedMatches" class="space-y-3.5">
        <div
            v-for="group in groupedMatches"
            :key="group.userId"
            class="border border-line rounded-lg overflow-hidden"
        >
          <!-- Group header (SCRUM-71.4: colapsable; v2 surface tokens F2 §8.2) -->
          <div class="bg-surface-2 flex items-center gap-2 border-b border-line pr-3">
            <button
                type="button"
                class="flex-1 flex items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-inset"
                :aria-expanded="isGroupExpanded(group.userId)"
                :aria-controls="`group-body-${group.userId}`"
                :aria-label="isGroupExpanded(group.userId)
                  ? t('matches.controls.collapseGroup', { username: group.username })
                  : t('matches.controls.expandGroup', { username: group.username })"
                @click="toggleGroup(group.userId)"
            >
              <IconV2 :name="isGroupExpanded(group.userId) ? 'chev-d' : 'chev-r'" :size="18" class="text-silver-50 flex-shrink-0" />
              <img
                  :src="getAvatarUrlForUser(group.username, 32, group.avatarUrl)"
                  alt=""
                  class="w-8 h-8 rounded-full flex-shrink-0"
              />
              <span class="flex-1 min-w-0">
                <span class="block font-display text-body font-bold text-neon truncate">@{{ group.username }}</span>
                <span v-if="group.location" class="block text-tiny text-silver-50">{{ group.location }}</span>
              </span>
              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-3 text-tiny text-silver-70 whitespace-nowrap">
                <span class="font-display font-tnum font-bold text-neon">{{ group.matches.length }}</span>
                {{ t('matches.controls.matchesCount') }}
              </span>
            </button>
            <router-link
                :to="`/@${group.username}`"
                class="text-tiny text-neon hover:underline whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon rounded px-1"
            >
              {{ t('matches.controls.viewProfile') }}
            </router-link>
          </div>

          <!-- Group matches -->
          <div
              v-show="isGroupExpanded(group.userId)"
              :id="`group-body-${group.userId}`"
              class="p-4 space-y-4"
          >
            <div
                v-for="(match, idx) in group.matches"
                :key="match.docId || match.id"
                :data-match-id="match.docId || match.id"
                :class="{ 'ring-2 ring-neon rounded-none transition-all duration-500': highlightedMatchId === (match.docId || match.id) }"
            >
              <MatchCard
                  :match="match"
                  :match-index="idx + 1"
                  :tab="activeChip"
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
            :class="{ 'ring-2 ring-neon rounded-none transition-all duration-500': highlightedMatchId === (match.docId || match.id) }"
        >
          <MatchCard
              :match="match"
              :match-index="idx + 1"
              :tab="activeChip"
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
              class="flex-1 px-3 py-2 bg-primary border border-silver-30 rounded text-silver text-small placeholder-silver-50 focus:border-neon focus:outline-none focus-visible:ring-2 focus-visible:ring-neon focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
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
                class="flex items-center justify-between p-3 border border-silver-30 rounded-none"
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

    <!-- Chat modal for Contactos tab -->
    <ChatModal
        :show="showChat"
        :other-user-id="selectedContact?.userId || ''"
        :other-username="selectedContact?.username || ''"
        @close="closeContactChat"
    />
  </AppContainer>
</template>
