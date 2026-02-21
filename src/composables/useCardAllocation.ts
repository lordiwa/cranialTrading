import { computed } from 'vue'
import { useBindersStore } from '../stores/binders'
import { useCollectionStore } from '../stores/collection'
import { useDecksStore } from '../stores/decks'
import type { Card, CardCondition, CardWithAllocation, DeckAllocation } from '../types/card'

export interface AllocationSummary {
    card: Card
    owned: number
    allocated: number
    available: number
    allocations: DeckAllocation[]
}

export interface CardMatchCriteria {
    scryfallId: string
    edition?: string
    condition?: CardCondition
    foil?: boolean
}

export function useCardAllocation() {
    const bindersStore = useBindersStore()
    const collectionStore = useCollectionStore()
    const decksStore = useDecksStore()

    /**
     * Memoized allocation index - builds once when decks/binders change, O(1) lookups after
     * Key: cardId, Value: array of DeckAllocation
     */
    const allocationIndex = computed((): Map<string, DeckAllocation[]> => {
        const index = new Map<string, DeckAllocation[]>()

        for (const deck of decksStore.decks) {
            if (!deck.allocations) continue

            for (const alloc of deck.allocations) {
                const existing = index.get(alloc.cardId) || []
                existing.push({
                    deckId: deck.id,
                    deckName: deck.name,
                    quantity: alloc.quantity,
                    isInSideboard: alloc.isInSideboard,
                })
                index.set(alloc.cardId, existing)
            }
        }

        for (const binder of bindersStore.binders) {
            if (!binder.allocations) continue

            for (const alloc of binder.allocations) {
                const existing = index.get(alloc.cardId) || []
                existing.push({
                    deckId: binder.id,
                    deckName: binder.name,
                    quantity: alloc.quantity,
                    isInSideboard: false,
                })
                index.set(alloc.cardId, existing)
            }
        }

        return index
    })

    /**
     * Get all allocations for a specific card across all decks
     * Now uses memoized index for O(1) lookup instead of O(decks × allocations)
     */
    const getAllocationsForCard = (cardId: string): DeckAllocation[] => {
        return allocationIndex.value.get(cardId) || []
    }

    /**
     * Get total allocated quantity for a card
     */
    const getTotalAllocated = (cardId: string): number => {
        return getAllocationsForCard(cardId).reduce((sum, a) => sum + a.quantity, 0)
    }

    /**
     * Get available quantity for a card (owned - allocated)
     */
    const getAvailableQuantity = (cardId: string): number => {
        const card = collectionStore.cards.find(c => c.id === cardId)
        if (!card) return 0
        return Math.max(0, card.quantity - getTotalAllocated(cardId))
    }

    /**
     * Get full allocation summary for a card
     */
    const getCardAllocationSummary = (cardId: string): AllocationSummary | null => {
        const card = collectionStore.cards.find(c => c.id === cardId)
        if (!card) return null

        const allocations = getAllocationsForCard(cardId)
        const totalAllocated = allocations.reduce((sum, a) => sum + a.quantity, 0)

        return {
            card,
            owned: card.quantity,
            allocated: totalAllocated,
            available: Math.max(0, card.quantity - totalAllocated),
            allocations,
        }
    }

    /**
     * Find collection cards matching Scryfall criteria
     * Used when adding a card to a deck - check if we already own it
     */
    const findMatchingCollectionCards = (criteria: CardMatchCriteria): CardWithAllocation[] => {
        return collectionStore.cards
            .filter(card => {
                // Must match scryfallId
                if (card.scryfallId !== criteria.scryfallId) return false

                // Optional: match edition
                if (criteria.edition && card.edition !== criteria.edition) return false

                // Optional: match condition
                if (criteria.condition && card.condition !== criteria.condition) return false

                // Optional: match foil
                if (criteria.foil !== undefined && card.foil !== criteria.foil) return false

                return true
            })
            .map(card => {
                const allocations = getAllocationsForCard(card.id)
                const allocatedQuantity = allocations.reduce((sum, a) => sum + a.quantity, 0)
                return {
                    ...card,
                    allocatedQuantity,
                    availableQuantity: Math.max(0, card.quantity - allocatedQuantity),
                    allocations,
                }
            })
    }

    /**
     * Find any collection card with the same scryfallId (any condition/edition)
     * Returns all variants of the card in the collection
     */
    const findCardVariants = (scryfallId: string): CardWithAllocation[] => {
        return collectionStore.cards
            .filter(card => card.scryfallId === scryfallId)
            .map(card => {
                const allocations = getAllocationsForCard(card.id)
                const allocatedQuantity = allocations.reduce((sum, a) => sum + a.quantity, 0)
                return {
                    ...card,
                    allocatedQuantity,
                    availableQuantity: Math.max(0, card.quantity - allocatedQuantity),
                    allocations,
                }
            })
    }

    /**
     * Check if reducing a card's quantity would affect deck allocations
     */
    const checkQuantityReduction = (cardId: string, newQuantity: number): {
        canReduce: boolean
        currentAllocated: number
        excessAmount: number
        affectedDecks: DeckAllocation[]
    } => {
        const allocations = getAllocationsForCard(cardId)
        const currentAllocated = allocations.reduce((sum, a) => sum + a.quantity, 0)
        const excessAmount = Math.max(0, currentAllocated - newQuantity)

        return {
            canReduce: newQuantity >= currentAllocated,
            currentAllocated,
            excessAmount,
            affectedDecks: excessAmount > 0 ? allocations : [],
        }
    }

    /**
     * Get all cards with their allocation data
     */
    const cardsWithAllocations = computed((): CardWithAllocation[] => {
        return collectionStore.cards.map(card => {
            const allocations = getAllocationsForCard(card.id)
            const allocatedQuantity = allocations.reduce((sum, a) => sum + a.quantity, 0)
            return {
                ...card,
                allocatedQuantity,
                availableQuantity: Math.max(0, card.quantity - allocatedQuantity),
                allocations,
            }
        })
    })

    return {
        getAllocationsForCard,
        getTotalAllocated,
        getAvailableQuantity,
        getCardAllocationSummary,
        findMatchingCollectionCards,
        findCardVariants,
        checkQuantityReduction,
        cardsWithAllocations,
    }
}
