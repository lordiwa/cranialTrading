/**
 * useDeckDeletion — Delete-deck state machine composable.
 *
 * Extracted from CollectionView.vue (Plan 03-B).
 * Owns the delete-deck state machine, localStorage persistence, and all delete entry points.
 *
 * Module-scoped isDeleteRunning persists across component remounts (per D-05).
 */

import { ref, type Ref } from 'vue'
import { cancelPriceFetch } from '../composables/useCollectionTotals'

// ============================================================
// Module-scoped flags (survive remounts — per D-05)
// ============================================================

let isDeleteRunning = false

// ============================================================
// Storage keys (byte-identical to original)
// ============================================================

const DELETE_DECK_STORAGE_KEY = 'cranial_delete_deck_progress'
const IMPORT_STORAGE_KEY = 'cranial_deck_import_progress'

// ============================================================
// Types
// ============================================================

export interface DeleteDeckState {
  deckId: string
  deckName: string
  status: 'deleting_cards' | 'deleting_deck' | 'complete' | 'error'
  deleteCards: boolean
  cardCount: number
  cardIds: string[]
}

export interface UseDeckDeletionOptions {
  decksStore: {
    deleteDeck: (deckId: string, permanent: boolean) => Promise<boolean>
  }
  collectionStore: {
    batchDeleteCards: (cardIds: string[], onProgress?: (percent: number) => void) => Promise<{ deleted: number; failed: number }>
  }
  toastStore: {
    show: (message: string, type: string) => void
  }
  confirmStore: {
    show: (opts: Record<string, unknown>) => Promise<boolean>
  }
  t: (key: string, params?: Record<string, unknown>) => string
  deckFilter: Ref<string>
  selectedDeck?: Ref<{ id: string; name: string; allocations?: { cardId: string }[] } | null>
  isDeletingDeck?: Ref<boolean>
}

// ============================================================
// Composable
// ============================================================

export function useDeckDeletion(opts: UseDeckDeletionOptions) {
  const {
    decksStore,
    collectionStore,
    toastStore,
    confirmStore,
    t,
    deckFilter,
    selectedDeck,
  } = opts

  const deleteDeckProgress = ref<DeleteDeckState | null>(null)
  const isDeletingDeck = ref(false)
  const deleteProgress = ref(0)

  // ============================================================
  // localStorage helpers (verbatim from CollectionView.vue)
  // ============================================================

  const saveDeleteDeckState = (state: DeleteDeckState): void => {
    try {
      localStorage.setItem(DELETE_DECK_STORAGE_KEY, JSON.stringify(state))
      deleteDeckProgress.value = state
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        // Retry after clearing stale import state
        try {
          localStorage.removeItem(IMPORT_STORAGE_KEY)
          localStorage.setItem(DELETE_DECK_STORAGE_KEY, JSON.stringify(state))
          deleteDeckProgress.value = state
          return
        } catch { /* ignore first retry */ }
        // Fallback: save without cardIds (better partial than nothing)
        try {
          const fallback = { ...state, cardIds: [] }
          localStorage.setItem(DELETE_DECK_STORAGE_KEY, JSON.stringify(fallback))
          deleteDeckProgress.value = state
          return
        } catch { /* ignore */ }
      }
      console.warn('[DeleteDeck] Failed to save state:', e)
      deleteDeckProgress.value = state
    }
  }

  const loadDeleteDeckState = (): DeleteDeckState | null => {
    try {
      const saved = localStorage.getItem(DELETE_DECK_STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved) as DeleteDeckState
      }
    } catch (e) {
      console.warn('[DeleteDeck] Failed to load state:', e)
    }
    return null
  }

  const clearDeleteDeckState = (): void => {
    try {
      localStorage.removeItem(DELETE_DECK_STORAGE_KEY)
      deleteDeckProgress.value = null
    } catch (e) {
      console.warn('[DeleteDeck] Failed to clear state:', e)
    }
  }

  // ============================================================
  // Card deletion step (shared logic)
  // ============================================================

  const executeCardDeletionStep = async (
    state: DeleteDeckState,
    isResume: boolean,
    onProgress: (percent: number) => void,
  ): Promise<void> => {
    if (!state.deleteCards || state.cardIds.length === 0) return

    cancelPriceFetch()
    saveDeleteDeckState(state)
    const result = await collectionStore.batchDeleteCards(state.cardIds, (percent) => {
      onProgress(5 + Math.round(percent * 0.8))
    })

    if (result.failed > 0) {
      console.warn(`[DeleteDeck] ${result.failed} cards failed to delete`)
      toastStore.show(t('decks.messages.deletedWithCardWarning', { deleted: result.deleted, failed: result.failed }), 'info')
      if (!isResume) {
        throw new Error(`Card deletion incomplete: ${result.failed} failed`)
      }
    } else {
      toastStore.show(t('decks.messages.deletedWithCards', { count: state.cardIds.length }), 'success')
    }
  }

  // ============================================================
  // Execute delete deck
  // ============================================================

  const executeDeleteDeck = async (state: DeleteDeckState, isResume = false) => {
    // Prevent duplicate executions (only check if not a resume with existing toast)
    if (!isResume && isDeleteRunning) {
      return
    }
    isDeleteRunning = true

    isDeletingDeck.value = true
    deleteProgress.value = 0

    const cardIds = state.cardIds

    // Deselect deck BEFORE deleting cards to avoid reactive cascade
    deckFilter.value = 'all'

    try {
      // Step 1: Delete cards (if pending)
      if (state.status === 'deleting_cards') {
        await executeCardDeletionStep(state, isResume, (percent) => {
          deleteProgress.value = percent
        })
        // Advance to deleting_deck
        state.status = 'deleting_deck'
        saveDeleteDeckState(state)
      }

      // Step 2: Delete the deck document
      if (state.status === 'deleting_deck') {
        deleteProgress.value = 90
        const deckDeleted = await decksStore.deleteDeck(state.deckId, true)
        if (!deckDeleted) {
          throw new Error('Failed to delete deck document')
        }
      }

      if (!state.deleteCards || cardIds.length === 0) {
        toastStore.show(t('decks.messages.deletedCardsKept'), 'success')
      }

      state.status = 'complete'
      deleteProgress.value = 100
      clearDeleteDeckState()

      isDeleteRunning = false
      isDeletingDeck.value = false
      deleteProgress.value = 0
    } catch (err) {
      console.error('[DeleteDeck] Error:', err)
      state.status = 'error'
      saveDeleteDeckState(state)
      toastStore.show(t('decks.messages.deleteError'), 'error')
      isDeleteRunning = false
      isDeletingDeck.value = false
      deleteProgress.value = 0
    }
  }

  // ============================================================
  // Resume incomplete delete
  // ============================================================

  const resumeDeleteDeck = async (savedState: DeleteDeckState) => {
    // Prevent duplicate executions
    if (isDeleteRunning) {
      return
    }

    if (savedState.status === 'complete') {
      clearDeleteDeckState()
      return
    }

    // Ensure cardIds array exists (backwards compat with old state format)
    if (!savedState.cardIds) {
      savedState.cardIds = []
    }

    // On resume after error: retry from the step that failed
    if (savedState.status === 'error') {
      // If we still have cardIds and deleteCards was requested, retry from cards
      savedState.status = savedState.deleteCards && savedState.cardIds.length > 0
        ? 'deleting_cards'
        : 'deleting_deck'
    }

    await executeDeleteDeck(savedState, true)
  }

  // ============================================================
  // Handle delete deck (with confirm modals)
  // ============================================================

  const handleDeleteDeck = async (overrideDeck?: { id: string; name: string; allocations?: { cardId: string }[] }) => {
    const deck = overrideDeck ?? selectedDeck?.value
    if (!deck || isDeletingDeck.value) return

    // Capture references BEFORE any async operation
    const deckId = deck.id
    const deckName = deck.name
    const cardIds = deck.allocations?.length > 0
      ? [...new Set(deck.allocations.map(a => a.cardId))]
      : []

    // First confirmation: delete the deck
    const confirmDelete = await confirmStore.show({
      title: `Eliminar deck`,
      message: `¿Eliminar el deck "${deckName}"?`,
      confirmText: 'ELIMINAR',
      cancelText: 'CANCELAR',
      confirmVariant: 'danger'
    })

    if (!confirmDelete) return

    // Second confirmation: also delete cards from collection
    let deleteCards = false
    if (cardIds.length > 0) {
      deleteCards = await confirmStore.show({
        title: '¿Eliminar cartas también?',
        message: 'SÍ = Eliminar deck y cartas de la colección\nNO = Solo eliminar deck (cartas permanecen)',
        confirmText: 'SÍ, ELIMINAR CARTAS',
        cancelText: 'NO, CONSERVAR',
        confirmVariant: 'danger'
      })
    }

    const state: DeleteDeckState = {
      deckId,
      deckName,
      status: deleteCards && cardIds.length > 0 ? 'deleting_cards' : 'deleting_deck',
      deleteCards,
      cardCount: deleteCards ? cardIds.length : 0,
      cardIds: deleteCards ? cardIds : [],
    }
    saveDeleteDeckState(state)

    await executeDeleteDeck(state)
  }

  // ============================================================
  // Expose
  // ============================================================

  return {
    deleteDeckProgress,
    isDeletingDeck,
    deleteProgress,
    handleDeleteDeck,
    resumeDeleteDeck,
    executeDeleteDeck,
    clearDeleteDeckState,
    loadDeleteDeckState,
    saveDeleteDeckState,
  }
}
