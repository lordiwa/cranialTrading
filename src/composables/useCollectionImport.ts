/**
 * useCollectionImport — Import state machine composable.
 *
 * Extracted from CollectionView.vue (Plan 03-B).
 * Owns the import state machine, localStorage persistence, and all import entry points.
 *
 * Module-scoped isImportRunning persists across component remounts (per D-05).
 */

import { ref, type Ref } from 'vue'
import type { CardCondition, CardStatus } from '../types/card'
import type { CreateDeckInput, DeckFormat } from '../types/deck'
import type { CreateBinderInput } from '../types/binder'
import type { ToastType } from '../stores/toast'
import type { ConfirmOptions } from '../stores/confirm'
import { type ScryfallCard, searchCards } from '../services/scryfallCache'
import { cleanCardName, type ParsedCsvCard } from '../utils/cardHelpers'
import {
  buildCollectionCardFromScryfall,
  buildRawCsvCard,
  buildRawMoxfieldCard,
  type ExtractedScryfallData,
  type ImportCardData,
  type MoxfieldImportCard,
  parseTextImportLine,
} from '../utils/importHelpers'
import { cancelPriceFetch } from '../composables/useCollectionTotals'

// ============================================================
// Module-scoped flags (survive remounts — per D-05)
// ============================================================

let isImportRunning = false

// ============================================================
// Storage key (byte-identical to original)
// ============================================================

const IMPORT_STORAGE_KEY = 'cranial_deck_import_progress'

// ============================================================
// Types
// ============================================================

export interface ImportState {
  deckId: string
  deckName: string
  status: 'fetching' | 'processing' | 'saving' | 'allocating' | 'complete' | 'error'
  totalCards: number
  currentCard: number
  cards: Record<string, unknown>[]
  cardMeta: { quantity: number; isInSideboard: boolean }[]
  createdCardIds: string[]
  allocatedCount: number
}

export interface UseCollectionImportOptions {
  collectionStore: {
    importing: boolean
    confirmImport: (cards: ImportCardData[], triggerRefresh?: boolean, onProgress?: (current: number, total: number) => void) => Promise<string[]>
    refreshCards: () => void
    enrichCardsWithMissingMetadata: () => Promise<void>
  }
  decksStore: {
    createDeck: (input: CreateDeckInput) => Promise<string | null>
    loadDecks: () => Promise<void>
    bulkAllocateCardsToDeck: (deckId: string, items: { cardId: string; quantity: number; isInSideboard: boolean }[], onProgress?: (current: number, total: number) => void) => Promise<{ allocated: number }>
  }
  binderStore: {
    createBinder: (input: CreateBinderInput) => Promise<string | null>
    loadBinders: () => Promise<void>
    bulkAllocateCardsToBinder: (binderId: string, items: { cardId: string; quantity: number }[]) => Promise<number>
  }
  toastStore: {
    show: (message: string, type?: ToastType, persistent?: boolean) => number
    showProgress: (message: string, progress: number) => { update: (progress: number, message?: string) => void; complete: (message?: string) => void; error: (message?: string) => void }
  }
  confirmStore: {
    show: (opts: ConfirmOptions) => Promise<boolean>
  }
  t: (key: string, params?: Record<string, string | number>) => string
  deckFilter: Ref<string>
  binderFilter: Ref<string>
  statusFilter: Ref<string>
  viewMode?: Ref<string>
  showImportDeckModal?: Ref<boolean>
  showImportBinderModal?: Ref<boolean>
}

// ============================================================
// Composable
// ============================================================

export function useCollectionImport(opts: UseCollectionImportOptions) {
  const {
    collectionStore,
    decksStore,
    binderStore,
    toastStore,
    t,
    deckFilter,
    binderFilter,
    viewMode,
    showImportDeckModal,
    showImportBinderModal,
  } = opts

  const importProgress = ref<ImportState | null>(null)

  // ============================================================
  // localStorage helpers
  // ============================================================

  const saveImportState = (state: ImportState): void => {
    try {
      // Don't persist cards/cardMeta arrays — they're too large for localStorage
      const { cards: _c, cardMeta: _m, ...lightweight } = state
      localStorage.setItem(IMPORT_STORAGE_KEY, JSON.stringify({
        ...lightweight,
        cards: [],
        cardMeta: [],
      }))
      importProgress.value = state
    } catch (e) {
      console.warn('[Import] Failed to save state to localStorage:', e)
    }
  }

  const loadImportState = (): ImportState | null => {
    try {
      const saved = localStorage.getItem(IMPORT_STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved) as ImportState
      }
    } catch (e) {
      console.warn('[Import] Failed to load state from localStorage:', e)
    }
    return null
  }

  const clearImportState = (): void => {
    try {
      localStorage.removeItem(IMPORT_STORAGE_KEY)
      importProgress.value = null
    } catch (e) {
      console.warn('[Import] Failed to clear state from localStorage:', e)
    }
  }

  // ============================================================
  // Progress helpers
  // ============================================================

  /** Check if a deck is currently importing */
  const isDeckImporting = (deckId: string): boolean => {
    return importProgress.value?.deckId === deckId &&
           importProgress.value?.status !== 'complete' &&
           importProgress.value?.status !== 'error'
  }

  /** Get import progress percentage for a deck */
  const getImportProgress = (deckId: string): number => {
    if (importProgress.value?.deckId !== deckId) return 100
    if (importProgress.value.status === 'complete') return 100
    if (importProgress.value.totalCards === 0) return 0
    return Math.round((importProgress.value.currentCard / importProgress.value.totalCards) * 100)
  }

  // ============================================================
  // Scryfall helpers (non-pure — side effects OK in composable)
  // ============================================================

  /** Extract the normal image URL from a Scryfall card object */
  const extractScryfallImage = (card: ScryfallCard | null | undefined): string => {
    return card?.image_uris?.normal ?? card?.card_faces?.[0]?.image_uris?.normal ?? ''
  }

  /** Extract all relevant card data fields from a Scryfall result */
  const extractScryfallCardData = (card: ScryfallCard): ExtractedScryfallData => {
    return {
      scryfallId: card.id,
      image: extractScryfallImage(card),
      price: card.prices?.usd ? Number.parseFloat(card.prices.usd) : 0,
      edition: card.set_name,
      setCode: card.set.toUpperCase(),
      cmc: card.cmc,
      type_line: card.type_line,
      colors: card.colors ?? [],
      rarity: card.rarity,
      power: card.power,
      toughness: card.toughness,
      oracle_text: card.oracle_text,
      keywords: card.keywords ?? [],
      legalities: card.legalities,
      full_art: card.full_art ?? false,
      produced_mana: card.produced_mana,
    }
  }

  const _applySearchResultToCard = (cardData: ImportCardData, results: ScryfallCard[]) => {
    const printWithPrice = results.find(r =>
      r.prices?.usd && Number.parseFloat(r.prices.usd) > 0 &&
      (r.image_uris?.normal ?? r.card_faces?.[0]?.image_uris?.normal)
    ) ?? results.find(r => r.prices?.usd && Number.parseFloat(r.prices.usd) > 0)

    if (printWithPrice?.prices?.usd) {
      Object.assign(cardData, extractScryfallCardData(printWithPrice))
      return
    }

    if (results.length === 0 || cardData.image) return
    const anyPrint = results[0]
    if (!anyPrint) return

    const extracted = extractScryfallCardData(anyPrint)
    cardData.image = extracted.image
    if (!cardData.scryfallId) cardData.scryfallId = extracted.scryfallId
    if (cardData.edition === 'Unknown') cardData.edition = extracted.setCode
    cardData.cmc = extracted.cmc
    cardData.type_line = extracted.type_line
    cardData.colors = extracted.colors
    cardData.rarity = extracted.rarity
    cardData.power = extracted.power
    cardData.toughness = extracted.toughness
    cardData.oracle_text = extracted.oracle_text
    cardData.keywords = extracted.keywords
    cardData.legalities = extracted.legalities
    cardData.full_art = extracted.full_art
  }

  // @ts-expect-error — unused after progressive import refactor
  const _enrichCardsWithFallbackSearch = async (collectionCardsToAdd: ImportCardData[], cardsNeedingSearch: number[]) => {
    for (const idx of cardsNeedingSearch) {
      // eslint-disable-next-line security/detect-object-injection
      const cardData = collectionCardsToAdd[idx]
      if (!cardData) continue
      try {
        const results = await searchCards(`!"${cardData.name}"`)
        _applySearchResultToCard(cardData, results)
      } catch (e) {
        console.warn(`[Import] Failed to search for "${cardData.name}":`, e)
      }
    }
  }

  /** Helper: Search for a card on Scryfall */
  const fetchCardFromScryfall = async (cardName: string, setCode?: string): Promise<ExtractedScryfallData | null> => {
    try {
      const cleanName = cleanCardName(cardName)
      if (setCode) {
        const results = await searchCards(`"${cleanName}" e:${setCode}`)
        const card = results[0]
        if (card) {
          const extracted = extractScryfallCardData(card)
          if (extracted.price > 0 && extracted.image) {
            return extracted
          }
        }
      }
      const allResults = await searchCards(`!"${cleanName}"`)
      if (allResults.length > 0) {
        const printWithPrice = allResults.find(r =>
          r.prices?.usd && Number.parseFloat(r.prices.usd) > 0 &&
          (r.image_uris?.normal ?? r.card_faces?.[0]?.image_uris?.normal)
        ) ?? allResults.find(r => r.prices?.usd && Number.parseFloat(r.prices.usd) > 0) ?? allResults[0]
        if (!printWithPrice) return null
        return extractScryfallCardData(printWithPrice)
      }
    } catch (_e) {
      console.warn(`No se pudo obtener datos de Scryfall para: ${cardName}`)
    }
    return null
  }

  // ============================================================
  // Import entry points
  // ============================================================

  /** Import deck from text list */
  const handleImport = async (opts2: {
    deckText: string, condition: CardCondition, includeSideboard: boolean,
    deckName?: string, makePublic?: boolean, format?: DeckFormat, commander?: string, status?: CardStatus,
  }) => {
    const { deckText, condition, includeSideboard, deckName, makePublic, format, commander, status } = opts2
    const finalDeckName = deckName ?? `Deck${Date.now()}`
    if (showImportDeckModal) showImportDeckModal.value = false
    toastStore.show(t('common.import.importing', { name: finalDeckName }), 'info')

    const lines = deckText.split('\n').filter(l => l.trim())
    const collectionCardsToAdd: ImportCardData[] = []
    let inSideboard = false

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (trimmed.toLowerCase().includes('sideboard')) { inSideboard = true; continue }

      const parsed = parseTextImportLine(trimmed)
      if (!parsed) continue
      if (inSideboard && !includeSideboard) continue

      const scryfallData = await fetchCardFromScryfall(parsed.cardName, parsed.setCode ?? undefined)
      const cardData = buildCollectionCardFromScryfall({
        cardName: parsed.cardName, quantity: parsed.quantity, condition, isFoil: parsed.isFoil, setCode: parsed.setCode,
        scryfallData, status, makePublic: makePublic ?? false, isInSideboard: inSideboard,
      })
      collectionCardsToAdd.push(cardData)
    }

    const deckId = await decksStore.createDeck({
      name: finalDeckName,
      format: format ?? 'custom',
      description: '',
      colors: [],
      commander: commander ?? '',
    })

    if (collectionCardsToAdd.length > 0) {
      await collectionStore.confirmImport(collectionCardsToAdd)

      if (deckId) {
        // Upstream handles card-to-deck allocation via exact match; no items mapped here
        await decksStore.bulkAllocateCardsToDeck(deckId, [])
      }
    }

    toastStore.show(t('common.import.deckComplete', { name: finalDeckName, count: collectionCardsToAdd.length }), 'success')
    if (deckId && deckFilter) {
      deckFilter.value = deckId
    }
    if (viewMode) viewMode.value = 'decks'
  }

  /** Import deck from Moxfield (optimized with batch API and progress tracking) */
  const handleImportDirect = async (
    cards: MoxfieldImportCard[],
    deckName: string | undefined,
    condition: CardCondition,
    makePublic?: boolean,
    format?: DeckFormat,
    commander?: string,
    status?: CardStatus
  ) => {
    // Prevent duplicate executions
    if (isImportRunning) {
      return
    }
    isImportRunning = true

    const finalDeckName = deckName ?? `Deck${Date.now()}`
    if (showImportDeckModal) showImportDeckModal.value = false

    // Create progress toast
    const progressToast = toastStore.showProgress(t('common.import.importing', { name: finalDeckName }), 0)

    try {
      collectionStore.importing = true

      // PASO 1: Create deck first
      progressToast.update(5, t('common.import.creatingDeck', { name: finalDeckName }))
      const deckId = await decksStore.createDeck({
        name: finalDeckName,
        format: format ?? 'custom',
        description: '',
        colors: [],
        commander: commander ?? '',
      })

      if (!deckId) {
        progressToast.error(t('common.import.errorCreatingDeck'))
        isImportRunning = false
        return
      }

      // Initialize import state
      const initialState: ImportState = {
        deckId,
        deckName: finalDeckName,
        status: 'fetching',
        totalCards: cards.length,
        currentCard: 0,
        cards: [],
        cardMeta: [],
        createdCardIds: [],
        allocatedCount: 0,
      }
      saveImportState(initialState)

      // Switch to decks mode to show progress
      if (viewMode) viewMode.value = 'decks'
      deckFilter.value = deckId

      // Cancel price fetch to free write stream
      cancelPriceFetch()

      // PASO 2: Build raw cards (no Scryfall fetch — enrichment in background)
      progressToast.update(15, t('common.import.processing'))
      saveImportState({ ...initialState, status: 'processing' })

      const collectionCardsToAdd: ImportCardData[] = []
      const cardMeta: { quantity: number; isInSideboard: boolean }[] = []

      for (let i = 0; i < cards.length; i++) {
        // eslint-disable-next-line security/detect-object-injection
        const card = cards[i]
        if (!card) continue
        collectionCardsToAdd.push(buildRawMoxfieldCard(card, condition, status, makePublic ?? false))
        cardMeta.push({
          quantity: card.quantity,
          isInSideboard: card.isInSideboard ?? false
        })

        if (i % 100 === 0) {
          const processPercent = 15 + Math.round((i / cards.length) * 25)
          progressToast.update(processPercent, t('common.import.processingProgress', { current: i + 1, total: cards.length }))
        }
      }

      // PASO 3: Import cards to collection
      progressToast.update(45, t('common.import.saving', { count: collectionCardsToAdd.length }))
      saveImportState({
        deckId,
        deckName: finalDeckName,
        status: 'saving',
        totalCards: cards.length,
        currentCard: 0,
        cards: [],
        cardMeta,
        createdCardIds: [],
        allocatedCount: 0,
      })

      let allocatedCount = 0
      if (collectionCardsToAdd.length > 0) {
        const createdCardIds = await collectionStore.confirmImport(collectionCardsToAdd, true, (current, total) => {
          const pct = 45 + Math.round((current / total) * 25)
          progressToast.update(pct, t('common.import.savingProgress', { current, total }))
        })
        collectionCardsToAdd.length = 0

        // PASO 4: Allocate cards to deck
        progressToast.update(75, t('common.import.allocatingToDeck'))
        const bulkItems = createdCardIds
          .map((cardId, i) => {
            // eslint-disable-next-line security/detect-object-injection
            const meta = cardMeta[i]
            return cardId && meta ? { cardId, quantity: meta.quantity, isInSideboard: meta.isInSideboard } : null
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)

        progressToast.update(80, t('common.import.allocatingToDeckCount', { count: bulkItems.length }))
        const bulkResult = await decksStore.bulkAllocateCardsToDeck(deckId, bulkItems)
        allocatedCount = bulkResult.allocated
      }

      await decksStore.loadDecks()

      saveImportState({
        deckId,
        deckName: finalDeckName,
        status: 'complete',
        totalCards: cards.length,
        currentCard: cards.length,
        cards: [],
        cardMeta: [],
        createdCardIds: [],
        allocatedCount,
      })

      setTimeout(() => {
        clearImportState()
        isImportRunning = false
      }, 2000)

      progressToast.complete(t('common.import.deckComplete', { name: finalDeckName, count: allocatedCount }))

      // Trigger reactive cascade
      collectionStore.refreshCards()
      collectionStore.importing = false

      // Background enrichment
      collectionStore.enrichCardsWithMissingMetadata().catch((err: unknown) => {
        console.warn('[Import] Background enrichment failed:', err)
      })
    } catch (error) {
      console.error('[Import] Error during import:', error)
      collectionStore.importing = false
      if (importProgress.value) {
        saveImportState({ ...importProgress.value, status: 'error' })
      }
      progressToast.error(t('common.import.errorDeck'))
      isImportRunning = false
    }
  }

  /** Import deck from CSV (ManaBox batch) */
  const handleImportCsv = async (
    cards: ParsedCsvCard[],
    deckName?: string,
    makePublic?: boolean,
    format?: DeckFormat,
    commander?: string,
    status?: CardStatus
  ) => {
    const finalDeckName = deckName ?? `CSV Import ${Date.now()}`
    if (showImportDeckModal) showImportDeckModal.value = false
    collectionStore.importing = true

    const progressToast = toastStore.showProgress(t('common.import.importing', { name: finalDeckName }), 0)

    try {
      progressToast.update(5, t('common.import.creatingDeck', { name: finalDeckName }))
      const deckId = await decksStore.createDeck({
        name: finalDeckName,
        format: format ?? 'custom',
        description: '',
        colors: [],
        commander: commander ?? '',
      })

      if (!deckId) {
        progressToast.error(t('common.import.errorCreatingDeck'))
        collectionStore.importing = false
        return
      }

      if (viewMode) viewMode.value = 'decks'
      deckFilter.value = deckId

      cancelPriceFetch()

      progressToast.update(15, t('common.import.processing'))
      const collectionCardsToAdd: ImportCardData[] = []
      const cardMeta: { quantity: number; isInSideboard: boolean }[] = []

      for (let i = 0; i < cards.length; i++) {
        // eslint-disable-next-line security/detect-object-injection
        const card = cards[i]
        if (!card) continue
        collectionCardsToAdd.push(buildRawCsvCard(card, status, makePublic ?? false))
        cardMeta.push({ quantity: card.quantity, isInSideboard: false })

        if (i % 100 === 0) {
          const pct = 15 + Math.round((i / cards.length) * 25)
          progressToast.update(pct, t('common.import.processingProgress', { current: i + 1, total: cards.length }))
        }
      }

      progressToast.update(45, t('common.import.saving', { count: collectionCardsToAdd.length }))
      let allocatedCount = 0

      if (collectionCardsToAdd.length > 0) {
        const createdCardIds = await collectionStore.confirmImport(collectionCardsToAdd, true, (current, total) => {
          const pct = 45 + Math.round((current / total) * 25)
          progressToast.update(pct, t('common.import.savingProgress', { current, total }))
        })
        collectionCardsToAdd.length = 0

        progressToast.update(75, t('common.import.allocatingToDeck'))

        const bulkItems = createdCardIds
          .map((cardId, i) => {
            // eslint-disable-next-line security/detect-object-injection
            const meta = cardMeta[i]
            return cardId && meta ? { cardId, quantity: meta.quantity, isInSideboard: meta.isInSideboard } : null
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)

        const bulkResult = await decksStore.bulkAllocateCardsToDeck(deckId, bulkItems, (current, total) => {
          const pct = 75 + Math.round((current / total) * 20)
          progressToast.update(pct, t('common.import.allocatingProgress', { current, total }))
        })
        allocatedCount = bulkResult.allocated
      }

      await decksStore.loadDecks()
      progressToast.complete(t('common.import.deckComplete', { name: finalDeckName, count: allocatedCount }))

      collectionStore.refreshCards()
      collectionStore.importing = false

      collectionStore.enrichCardsWithMissingMetadata().catch((err: unknown) => {
        console.warn('[CSV Import] Background enrichment failed:', err)
      })
    } catch (error) {
      console.error('[CSV Import] Error:', error)
      collectionStore.importing = false
      progressToast.error(t('common.import.errorCsv'))
    }
  }

  /** Import binder from text list */
  const handleImportBinder = async (opts2: {
    deckText: string, condition: CardCondition, includeSideboard: boolean,
    deckName?: string, makePublic?: boolean, format?: DeckFormat, commander?: string, status?: CardStatus,
  }) => {
    const { deckText, condition, includeSideboard, deckName, makePublic, status } = opts2
    const finalName = deckName ?? `Binder${Date.now()}`
    if (showImportBinderModal) showImportBinderModal.value = false
    toastStore.show(t('common.import.importing', { name: finalName }), 'info')

    const lines = deckText.split('\n').filter(l => l.trim())
    const collectionCardsToAdd: ImportCardData[] = []
    let inSideboard = false

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (trimmed.toLowerCase().includes('sideboard')) { inSideboard = true; continue }

      const parsed = parseTextImportLine(trimmed)
      if (!parsed) continue
      if (inSideboard && !includeSideboard) continue

      const scryfallData = await fetchCardFromScryfall(parsed.cardName, parsed.setCode ?? undefined)
      const cardData = buildCollectionCardFromScryfall({
        cardName: parsed.cardName, quantity: parsed.quantity, condition, isFoil: parsed.isFoil, setCode: parsed.setCode,
        scryfallData, status, makePublic: makePublic ?? false, isInSideboard: false,
      })
      collectionCardsToAdd.push(cardData)
    }

    const binderId = await binderStore.createBinder({ name: finalName, description: '' })

    if (collectionCardsToAdd.length > 0) {
      await collectionStore.confirmImport(collectionCardsToAdd)

      if (binderId) {
        const bulkItems: { cardId: string; quantity: number }[] = []
        await binderStore.bulkAllocateCardsToBinder(binderId, bulkItems)
      }
    }

    toastStore.show(t('common.import.binderComplete', { name: finalName, count: collectionCardsToAdd.length }), 'success')
    if (binderId) {
      if (viewMode) viewMode.value = 'binders'
      binderFilter.value = binderId
    }
  }

  /** Import binder from Moxfield (batch API) */
  const handleImportBinderDirect = async (
    cards: MoxfieldImportCard[],
    deckName: string | undefined,
    condition: CardCondition,
    makePublic?: boolean,
    _format?: DeckFormat,
    _commander?: string,
    status?: CardStatus
  ) => {
    const finalName = deckName ?? `Binder${Date.now()}`
    if (showImportBinderModal) showImportBinderModal.value = false
    collectionStore.importing = true

    const progressToast = toastStore.showProgress(t('common.import.importing', { name: finalName }), 0)

    try {
      if (viewMode) viewMode.value = 'binders'

      cancelPriceFetch()

      progressToast.update(15, t('common.import.processing'))
      const collectionCardsToAdd: ImportCardData[] = []

      for (let i = 0; i < cards.length; i++) {
        // eslint-disable-next-line security/detect-object-injection
        const card = cards[i]
        if (!card) continue
        collectionCardsToAdd.push(buildRawMoxfieldCard(card, condition, status, makePublic ?? false))

        if (i % 100 === 0) {
          const processPercent = 15 + Math.round((i / cards.length) * 25)
          progressToast.update(processPercent, t('common.import.processingProgress', { current: i + 1, total: cards.length }))
        }
      }

      progressToast.update(45, t('common.import.saving', { count: collectionCardsToAdd.length }))
      let allocatedCount = 0

      if (collectionCardsToAdd.length > 0) {
        const createdCardIds = await collectionStore.confirmImport(collectionCardsToAdd, true, (current, total) => {
          const pct = 45 + Math.round((current / total) * 25)
          progressToast.update(pct, t('common.import.savingProgress', { current, total }))
        })
        progressToast.update(75, t('common.import.allocatingToBinder'))

        const bulkItems = createdCardIds
          .map((cardId, i) => {
            // eslint-disable-next-line security/detect-object-injection
            const meta = collectionCardsToAdd[i]
            return cardId && meta ? { cardId, quantity: meta.quantity } : null
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)

        // Split into multiple binders if >35k to stay under Firestore 1MB doc limit
        const MAX_PER_BINDER = 35000
        if (bulkItems.length > MAX_PER_BINDER) {
          const totalBinders = Math.ceil(bulkItems.length / MAX_PER_BINDER)
          for (let b = 0; b < totalBinders; b++) {
            const binderName = `${finalName} ${b + 1}/${totalBinders}`
            const chunk = bulkItems.slice(b * MAX_PER_BINDER, (b + 1) * MAX_PER_BINDER)
            const chunkBinderId = await binderStore.createBinder({ name: binderName, description: '' })
            if (chunkBinderId) {
              allocatedCount += await binderStore.bulkAllocateCardsToBinder(chunkBinderId, chunk)
            }
            progressToast.update(75 + Math.round(((b + 1) / totalBinders) * 20), t('common.import.allocatingToBinderCount', { count: allocatedCount }))
          }
        } else {
          const binderId = await binderStore.createBinder({ name: finalName, description: '' })
          if (binderId) {
            allocatedCount = await binderStore.bulkAllocateCardsToBinder(binderId, bulkItems)
          }
        }
        collectionCardsToAdd.length = 0
      }

      await binderStore.loadBinders()
      progressToast.complete(t('common.import.binderComplete', { name: finalName, count: allocatedCount }))

      collectionStore.refreshCards()
      collectionStore.importing = false

      collectionStore.enrichCardsWithMissingMetadata().catch((err: unknown) => {
        console.warn('[Binder Import] Background enrichment failed:', err)
      })
    } catch (error) {
      console.error('[Binder Import] Error:', error)
      collectionStore.importing = false
      progressToast.error(t('common.import.errorBinder'))
    }
  }

  /** Import binder from CSV */
  const handleImportBinderCsv = async (
    cards: ParsedCsvCard[],
    deckName?: string,
    makePublic?: boolean,
    _format?: DeckFormat,
    _commander?: string,
    status?: CardStatus
  ) => {
    const finalName = deckName ?? `Binder CSV ${Date.now()}`
    if (showImportBinderModal) showImportBinderModal.value = false
    collectionStore.importing = true

    const progressToast = toastStore.showProgress(t('common.import.importing', { name: finalName }), 0)

    try {
      if (viewMode) viewMode.value = 'binders'

      cancelPriceFetch()

      progressToast.update(15, t('common.import.processing'))
      const collectionCardsToAdd: ImportCardData[] = []

      for (let i = 0; i < cards.length; i++) {
        // eslint-disable-next-line security/detect-object-injection
        const card = cards[i]
        if (!card) continue
        collectionCardsToAdd.push(buildRawCsvCard(card, status, makePublic ?? false))

        if (i % 100 === 0) {
          const pct = 15 + Math.round((i / cards.length) * 25)
          progressToast.update(pct, t('common.import.processingProgress', { current: i + 1, total: cards.length }))
        }
      }

      progressToast.update(45, t('common.import.saving', { count: collectionCardsToAdd.length }))
      let allocatedCount = 0

      if (collectionCardsToAdd.length > 0) {
        const createdCardIds = await collectionStore.confirmImport(collectionCardsToAdd, true, (current, total) => {
          const pct = 45 + Math.round((current / total) * 25)
          progressToast.update(pct, t('common.import.savingProgress', { current, total }))
        })
        progressToast.update(75, t('common.import.allocatingToBinder'))

        const bulkItems = createdCardIds
          .map((cardId, i) => {
            // eslint-disable-next-line security/detect-object-injection
            const meta = collectionCardsToAdd[i]
            return cardId && meta ? { cardId, quantity: meta.quantity } : null
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)

        const MAX_PER_BINDER = 35000
        if (bulkItems.length > MAX_PER_BINDER) {
          const totalBinders = Math.ceil(bulkItems.length / MAX_PER_BINDER)
          for (let b = 0; b < totalBinders; b++) {
            const binderName = `${finalName} ${b + 1}/${totalBinders}`
            const chunk = bulkItems.slice(b * MAX_PER_BINDER, (b + 1) * MAX_PER_BINDER)
            const chunkBinderId = await binderStore.createBinder({ name: binderName, description: '' })
            if (chunkBinderId) {
              allocatedCount += await binderStore.bulkAllocateCardsToBinder(chunkBinderId, chunk)
            }
            progressToast.update(75 + Math.round(((b + 1) / totalBinders) * 20), t('common.import.allocatingToBinderCount', { count: allocatedCount }))
          }
        } else {
          const binderId = await binderStore.createBinder({ name: finalName, description: '' })
          if (binderId) {
            allocatedCount = await binderStore.bulkAllocateCardsToBinder(binderId, bulkItems)
          }
        }
        collectionCardsToAdd.length = 0
      }

      await binderStore.loadBinders()
      progressToast.complete(t('common.import.binderComplete', { name: finalName, count: allocatedCount }))

      collectionStore.refreshCards()
      collectionStore.importing = false

      collectionStore.enrichCardsWithMissingMetadata().catch((err: unknown) => {
        console.warn('[Binder CSV Import] Background enrichment failed:', err)
      })
    } catch (error) {
      console.error('[Binder CSV Import] Error:', error)
      collectionStore.importing = false
      progressToast.error(t('common.import.errorCsv'))
    }
  }

  // ============================================================
  // Resume import
  // ============================================================

  const resumeImport = async (savedState: ImportState) => {
    // Prevent duplicate executions
    if (isImportRunning) {
      return
    }

    // Restore state in memory
    importProgress.value = savedState

    // Already complete — just clean up
    if (savedState.status === 'complete') {
      setTimeout(() => { clearImportState() }, 2000)
      return
    }

    // Error state — notify and clear
    if (savedState.status === 'error') {
      toastStore.show(t('common.import.resumeFailed', { name: savedState.deckName }), 'error')
      clearImportState()
      return
    }

    // Mark as running
    isImportRunning = true

    // Switch to decks mode and select the deck
    if (viewMode) viewMode.value = 'decks'
    deckFilter.value = savedState.deckId

    // Calculate initial progress for resume
    let initialProgress = 0
    if (savedState.status === 'allocating' && savedState.createdCardIds.length > 0) {
      initialProgress = 60 + Math.round((savedState.currentCard / savedState.createdCardIds.length) * 35)
    } else if (savedState.status === 'saving') {
      initialProgress = 50
    } else if (savedState.status === 'processing') {
      initialProgress = 25 + Math.round((savedState.currentCard / savedState.totalCards) * 20)
    }

    const progressToast = toastStore.showProgress(
      t('common.import.resuming', { name: savedState.deckName }),
      initialProgress
    )

    try {
      if (savedState.status === 'allocating' && savedState.createdCardIds.length > 0) {
        const startIndex = savedState.currentCard
        const remaining = savedState.createdCardIds.slice(startIndex)

        const bulkItems = remaining
          .map((cardId, i) => {
            const meta = savedState.cardMeta[startIndex + i]
            return cardId && meta ? { cardId, quantity: meta.quantity, isInSideboard: meta.isInSideboard } : null
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)

        progressToast.update(65, t('common.import.allocatingToDeckCount', { count: bulkItems.length }))
        const bulkResult = await decksStore.bulkAllocateCardsToDeck(savedState.deckId, bulkItems)
        const allocatedCount = savedState.allocatedCount + bulkResult.allocated

        await decksStore.loadDecks()
        saveImportState({ ...savedState, status: 'complete', currentCard: savedState.totalCards, allocatedCount })
        setTimeout(() => {
          clearImportState()
          isImportRunning = false
        }, 2000)
        progressToast.complete(t('common.import.resumeComplete', { name: savedState.deckName, count: allocatedCount }))

      } else if (savedState.status === 'saving' && savedState.cards.length > 0) {
        progressToast.update(55, t('common.import.saving', { count: savedState.cards.length }))

        const createdCardIds = await collectionStore.confirmImport(savedState.cards as unknown as ImportCardData[], true, (current, total) => {
          const pct = 55 + Math.round((current / total) * 5)
          progressToast.update(pct, t('common.import.savingProgress', { current, total }))
        })
        progressToast.update(60, t('common.import.allocatingToDeck'))

        saveImportState({
          ...savedState,
          status: 'allocating',
          totalCards: createdCardIds.length,
          currentCard: 0,
          createdCardIds,
        })

        const bulkItems = createdCardIds
          .map((cardId, i) => {
            // eslint-disable-next-line security/detect-object-injection
            const meta = savedState.cardMeta[i]
            return cardId && meta ? { cardId, quantity: meta.quantity, isInSideboard: meta.isInSideboard } : null
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)

        progressToast.update(65, t('common.import.allocatingToDeckCount', { count: bulkItems.length }))
        const bulkResult = await decksStore.bulkAllocateCardsToDeck(savedState.deckId, bulkItems)
        const allocatedCount = bulkResult.allocated

        await decksStore.loadDecks()
        saveImportState({ ...savedState, status: 'complete', currentCard: savedState.totalCards, allocatedCount })
        setTimeout(() => {
          clearImportState()
          isImportRunning = false
        }, 2000)
        progressToast.complete(t('common.import.resumeComplete', { name: savedState.deckName, count: allocatedCount }))

      } else {
        // For other states (fetching, processing), clear and notify
        progressToast.error(t('common.import.resumeIncomplete'))
        clearImportState()
        isImportRunning = false
      }
    } catch (error) {
      console.error('[Import] Error resuming import:', error)
      saveImportState({ ...savedState, status: 'error' })
      progressToast.error(t('common.import.resumeError'))
      isImportRunning = false
    }
  }

  // ============================================================
  // Expose
  // ============================================================

  return {
    importProgress,
    isDeckImporting,
    getImportProgress,
    handleImport,
    handleImportDirect,
    handleImportCsv,
    handleImportBinder,
    handleImportBinderDirect,
    handleImportBinderCsv,
    resumeImport,
    clearImportState,
    loadImportState,
    saveImportState,
    isImportRunning: () => isImportRunning,
  }
}
