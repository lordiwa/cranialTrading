import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useCollectionStore } from '../stores/collection'
import { usePreferencesStore } from '../stores/preferences'
import { type MatchCard as MatchCardType, type SimpleMatch, useMatchesStore } from '../stores/matches'
import { usePriceMatchingStore } from '../stores/priceMatchingHelper'
import { useToastStore } from '../stores/toast'
import { useI18n } from './useI18n'
import {
  findCardsMatchingPreferences,
  findPreferencesMatchingCards,
} from '../services/publicCards'
import { groupMatchesByUser, type UserMatchGroup } from '../utils/matchGrouping'
import { getMatchExpirationDate } from '../utils/matchExpiry'
import { getTotalUserCount } from '../services/stats'
import { type CardCondition, type CardStatus } from '../types/card'

/** Calculated match shape produced by the dashboard matching logic */
export interface CalculatedMatch {
  id: string
  otherUserId: string
  otherUsername: string
  otherLocation: string
  otherEmail: string
  myCards: unknown[]
  otherCards: unknown[]
  myTotalValue: number
  theirTotalValue: number
  valueDifference: number
  compatibility: number
  type: 'VENDO' | 'BUSCO' | 'BIDIRECTIONAL' | 'UNIDIRECTIONAL'
  createdAt: Date
  lifeExpiresAt: Date
}

/**
 * Pure function: build a CalculatedMatch from a user's grouped cards/prefs.
 * Extracted from the per-user loop body of the original calculateMatches
 * (DashboardView.vue:697-770). Unit-testable with a mocked priceMatching.
 *
 * Exported separately for unit testing.
 */
export function buildMatchFromUserGroup(
  myUserId: string,
  otherUserId: string,
  data: UserMatchGroup,
  myCards: any[],
  myPreferences: any[],
  priceMatching: {
    calculateBidirectionalMatch: (...a: any[]) => any
    calculateUnidirectionalMatch: (...a: any[]) => any
  },
): CalculatedMatch | null {
  // Convertir PublicCards a formato esperado por priceMatching
  const theirCards = data.cards.map(c => ({
    id: c.cardId,
    name: c.cardName,
    scryfallId: c.scryfallId,
    price: c.price,
    edition: c.edition,
    condition: c.condition as CardCondition,
    foil: c.foil,
    quantity: c.quantity,
    image: c.image,
    status: c.status as CardStatus,
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
    // Fill required fields for type compatibility
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
    theirPreferences,
  )

  // SI NO HAY BIDIRECCIONAL, INTENTAR UNIDIRECCIONAL
  matchCalc ??= priceMatching.calculateUnidirectionalMatch(
    myCards,
    myPreferences,
    theirCards,
    theirPreferences,
  )

  if (!matchCalc?.isValid) return null

  const createdAt = new Date()
  return {
    id: `${myUserId}_${otherUserId}_${Date.now()}`,
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
    type: matchCalc.matchType === 'bidirectional' ? 'BIDIRECTIONAL' : 'UNIDIRECTIONAL',
    createdAt,
    lifeExpiresAt: getMatchExpirationDate(createdAt),
  }
}

/**
 * useDashboardMatches — orchestrates the calculate / save / discard
 * pipeline for the dashboard match section. Owns its own reactive state
 * (refs returned to the caller).
 *
 * Amendment I — discardedMatchIds is a Ref<Set<string>> keyed by otherUserId
 * (not match.id). Discarding one match blocks ALL future matches with the
 * same user. Plan C's useBlockedUsers must receive this ref as a parameter
 * from the SINGLE useDashboardMatches() instance in DashboardView — calling
 * useDashboardMatches() a second time creates fresh refs and would desync.
 */
export function useDashboardMatches() {
  const authStore = useAuthStore()
  const collectionStore = useCollectionStore()
  const preferencesStore = usePreferencesStore()
  const matchesStore = useMatchesStore()
  const priceMatching = usePriceMatchingStore()
  // AMENDMENT E/M — useConfirmStore intentionally NOT imported:
  // handleDiscardMatch has no confirm modal (MatchCard.vue @discard fires directly).
  const toastStore = useToastStore()
  const { t } = useI18n()

  const calculatedMatches = ref<CalculatedMatch[]>([])
  const loading = ref(false)
  const progressCurrent = ref(0)
  const progressTotal = ref(0)
  const totalUsers = ref(0)
  const discardedMatchIds = ref<Set<string>>(new Set())

  /**
   * Calculate matches by pulling the caller's collection + preferences
   * and running them against the public_cards / public_preferences
   * indexes. Behavior-preserving port of DashboardView calculateMatches
   * (lines 636-792) — DO NOT optimize the algorithm.
   */
  const calculateMatches = async (): Promise<void> => {
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
        createdAt: c.createdAt ?? new Date(),
      }))
      const foundMatches: CalculatedMatch[] = []

      console.info('Iniciando calculo de matches (optimizado)...')
      console.info(`Mis cartas: ${myCards.length}, Mi wishlist: ${myWishlist.length}`)

      // PASO 1: Buscar cartas que coincidan con mi wishlist (lo que BUSCO)
      progressTotal.value = 2
      progressCurrent.value = 1

      const myWishlistNames = myWishlist.map(c => c.name).filter(Boolean)
      console.info('Buscando cartas por nombre:', myWishlistNames)

      const matchingCards = await findCardsMatchingPreferences(myWishlist, authStore.user.id)
      console.info(`Encontradas ${matchingCards.length} cartas que busco`)

      // PASO 2: Buscar preferencias que coincidan con mis cartas (VENDO)
      progressCurrent.value = 2

      const myTradeable = myCards.filter(c => c.status === 'trade' || c.status === 'sale')
      const myCardNames = myTradeable.map(c => c.name).filter(Boolean)
      console.info(`Mis cartas para vender (${myTradeable.length}):`, myCardNames)

      const matchingPrefs = await findPreferencesMatchingCards(myCards, authStore.user.id)
      console.info(`Encontradas ${matchingPrefs.length} personas buscando mis cartas`)

      // Agrupar por usuario
      const userMatches = groupMatchesByUser(matchingCards, matchingPrefs)

      // Crear matches por usuario
      progressTotal.value = userMatches.size + 2
      let userIndex = 0

      for (const [otherUserId, data] of userMatches) {
        progressCurrent.value = userIndex + 3
        userIndex++

        const built = buildMatchFromUserGroup(
          authStore.user.id, otherUserId, data, myCards, myPreferences, priceMatching,
        )
        if (built) {
          foundMatches.push(built)
          console.info(`Match con ${data.username}: ${built.compatibility}%`)
        }
      }

      // Ordenar por compatibilidad descendente y filtrar discardados (por otherUserId)
      foundMatches.sort((a, b) => b.compatibility - a.compatibility)
      calculatedMatches.value = foundMatches.filter(m => !discardedMatchIds.value.has(m.otherUserId))

      // Persistir matches en Firestore
      if (foundMatches.length > 0) {
        await matchesStore.persistCalculatedMatches(foundMatches)
      }

      // Reload matches from Firestore to sync store state with what was just written
      await matchesStore.loadAllMatches()

      console.info(`Total de matches: ${foundMatches.length} (de ${userMatches.size} usuarios potenciales)`)
    } catch (error) {
      console.error('Error calculando matches:', error)
    } finally {
      loading.value = false
      progressCurrent.value = 0
      progressTotal.value = 0
    }
  }

  /** Force a recalculation (same as calculateMatches today; kept distinct for UI semantics). */
  const recalculateMatches = async (): Promise<void> => {
    await calculateMatches()
  }

  /**
   * AMENDMENT F — delegates to EXISTING matchesStore.saveMatch(match: SimpleMatch)
   * at stores/matches.ts:395. DO NOT introduce a new addMatch method.
   *
   * PRESERVED LOSSY COERCION from DashboardView:872 —
   * BIDIRECTIONAL + UNIDIRECTIONAL both become BUSCO (existing tech debt).
   * Do NOT "fix" this in Plan B; logged as known issue in SUMMARY.
   *
   * matchesStore.saveMatch already shows the success toast — the composable
   * does NOT need to dispatch a redundant one (preserves DashboardView:868-890
   * behavior exactly).
   */
  const handleSaveMatch = async (match: CalculatedMatch): Promise<void> => {
    const matchToSave: SimpleMatch = {
      id: match.id,
      type: (match.type === 'VENDO' ? 'VENDO' : 'BUSCO'),
      otherUserId: match.otherUserId,
      otherUsername: match.otherUsername,
      otherLocation: match.otherLocation,
      myCards: (match.myCards ?? []) as MatchCardType[],
      otherCards: (match.otherCards ?? []) as MatchCardType[],
      myTotalValue: match.myTotalValue,
      theirTotalValue: match.theirTotalValue,
      valueDifference: match.valueDifference,
      compatibility: match.compatibility,
      createdAt: match.createdAt,
      status: 'nuevo' as const,
    }

    await matchesStore.saveMatch(matchToSave)

    // Remover del dashboard (preserves DashboardView:889 behavior)
    calculatedMatches.value = calculatedMatches.value.filter(m => m.id !== match.id)
  }

  /**
   * AMENDMENT E — signature is (matchId: string), NOT (match: CalculatedMatch).
   * MatchCard's @discard event emits a string id. NO confirm modal (the current
   * DashboardView:892-902 has none).
   *
   * discardedMatchIds.value.add(match.otherUserId) blocks the user from
   * reappearing in the next recalc — Plan C state-sharing contract.
   */
  const handleDiscardMatch = async (matchId: string): Promise<void> => {
    const match = calculatedMatches.value.find(m => m.id === matchId)
    if (!match) return
    // Persist to Firestore matches_eliminados via store method.
    // Store's discardCalculatedMatch also adds to discardedMatchIds via our
    // post-await mutation below (store method does not touch local refs).
    await matchesStore.discardCalculatedMatch(match)
    discardedMatchIds.value.add(match.otherUserId)
    calculatedMatches.value = calculatedMatches.value.filter(m => m.id !== matchId)
    toastStore.show(t('matches.messages.deleted'), 'info')
  }

  // AMENDMENT G — initMatchData SPLIT into two helpers so DashboardView
  // preserves the exact spinner ordering from DashboardView.vue:447-468.

  /** Load the Set of discarded user IDs. Call BEFORE the loading spinner block. */
  const loadDiscardedUserIds = async (): Promise<void> => {
    discardedMatchIds.value = await matchesStore.loadDiscardedUserIds()
  }

  /** Load the total user count. Call INSIDE the loading spinner block. */
  const loadTotalUsers = async (): Promise<void> => {
    // Amendment A — getTotalUserCount fails-closed to 0; consumer clamps.
    totalUsers.value = Math.max(0, (await getTotalUserCount()) - 1)
  }

  // `preferencesStore` is imported so DashboardView's `await preferencesStore.loadPreferences()`
  // still works via the composable's own destructure of the Pinia singleton. It is referenced
  // by buildMatchFromUserGroup consumers indirectly via collectionStore in the view layer.
  void preferencesStore

  return {
    calculatedMatches,
    loading,
    progressCurrent,
    progressTotal,
    totalUsers,
    discardedMatchIds,
    calculateMatches,
    recalculateMatches,
    handleSaveMatch,
    handleDiscardMatch,
    loadDiscardedUserIds, // Amendment G (replaces initMatchData)
    loadTotalUsers,       // Amendment G (replaces initMatchData)
  }
}
