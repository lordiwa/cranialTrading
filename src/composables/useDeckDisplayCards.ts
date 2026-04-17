/**
 * useDeckDisplayCards — pure reactive composable that hydrates a deck's
 * allocations (owned + wishlist) into `DisplayDeckCard` lists for the UI,
 * then optionally applies a text-search filter.
 *
 * All derived state is `computed()` — no lifecycle hooks, no side effects.
 */

import { computed, type ComputedRef, type Ref } from 'vue'
import type { Card } from '../types/card'
import type {
  Deck,
  DeckCardAllocation,
  DisplayDeckCard,
  HydratedDeckCard,
  HydratedWishlistCard,
} from '../types/deck'

interface UseDeckDisplayCardsOptions {
  selectedDeck: ComputedRef<Deck | null>
  collectionCards: ComputedRef<Card[]>
  filterQuery: Ref<string>
}

export function useDeckDisplayCards({
  selectedDeck,
  collectionCards,
  filterQuery,
}: UseDeckDisplayCardsOptions) {
  // ============================================================
  // Commander detection
  // ============================================================
  const isCommanderFormat = computed(() => selectedDeck.value?.format === 'commander')

  const commanderNames = computed((): string[] => {
    if (!selectedDeck.value || !isCommanderFormat.value || !selectedDeck.value.commander) return []
    const names = selectedDeck.value.commander.split(/\s*\/\/\s*|\s*,\s*/)
    return names.map(n => n.trim()).filter(n => n.length > 0)
  })

  // ============================================================
  // Owned cards and wishlist allocations
  // ============================================================
  const deckOwnedCards = computed((): Card[] => {
    if (!selectedDeck.value?.allocations) return []
    const cardMap = new Map(collectionCards.value.map(c => [c.id, c]))
    const seen = new Set<string>()
    const result: Card[] = []
    for (const alloc of selectedDeck.value.allocations) {
      if (seen.has(alloc.cardId)) continue
      seen.add(alloc.cardId)
      const card = cardMap.get(alloc.cardId)
      if (card && card.status !== 'wishlist') result.push(card)
    }
    return result
  })

  const deckAllocWishlistCards = computed((): { card: Card; alloc: DeckCardAllocation }[] => {
    if (!selectedDeck.value?.allocations) return []
    const results: { card: Card; alloc: DeckCardAllocation }[] = []
    for (const alloc of selectedDeck.value.allocations) {
      const card = collectionCards.value.find(c => c.id === alloc.cardId && c.status === 'wishlist')
      if (card) results.push({ card, alloc })
    }
    return results
  })

  const deckMainboardWishlist = computed(() => {
    if (!selectedDeck.value) return []
    return (selectedDeck.value.wishlist ?? []).filter(w => !w.isInSideboard)
  })

  const deckSideboardWishlist = computed(() => {
    if (!selectedDeck.value || isCommanderFormat.value) return []
    return (selectedDeck.value.wishlist ?? []).filter(w => w.isInSideboard)
  })

  // ============================================================
  // Hydrated display cards — mainboard
  // ============================================================
  const mainboardDisplayCards = computed((): DisplayDeckCard[] => {
    if (!selectedDeck.value) return []

    const cardMap = new Map(collectionCards.value.map(c => [c.id, c]))
    const commanderDisplay: HydratedDeckCard[] = []
    const mainboardOwned: HydratedDeckCard[] = []

    for (const alloc of selectedDeck.value.allocations ?? []) {
      if (alloc.isInSideboard) continue
      const card = cardMap.get(alloc.cardId)
      if (!card || card.status === 'wishlist') continue

      const hydratedCard: HydratedDeckCard = {
        cardId: card.id,
        scryfallId: card.scryfallId,
        name: card.name,
        edition: card.edition,
        condition: card.condition,
        foil: card.foil,
        price: card.price,
        image: card.image,
        cmc: card.cmc,
        type_line: card.type_line,
        colors: card.colors,
        produced_mana: card.produced_mana,
        allocatedQuantity: alloc.quantity,
        isInSideboard: false,
        notes: undefined,
        addedAt: card.createdAt ?? new Date(),
        isWishlist: false as const,
        availableInCollection: card.quantity - alloc.quantity,
        totalInCollection: card.quantity,
      }

      const isCommander = isCommanderFormat.value && commanderNames.value.length > 0 &&
        commanderNames.value.some(name => name.toLowerCase() === card.name.toLowerCase())

      if (isCommander) {
        commanderDisplay.push(hydratedCard)
      } else {
        mainboardOwned.push(hydratedCard)
      }
    }

    const wishlistDisplay: HydratedWishlistCard[] = deckMainboardWishlist.value.map(item => ({
      cardId: '',
      scryfallId: item.scryfallId,
      name: item.name,
      edition: item.edition,
      condition: item.condition,
      foil: item.foil,
      price: item.price,
      image: item.image,
      cmc: item.cmc,
      type_line: item.type_line,
      colors: item.colors,
      requestedQuantity: item.quantity,
      allocatedQuantity: item.quantity,
      isInSideboard: false,
      notes: item.notes,
      addedAt: item.addedAt,
      isWishlist: true as const,
      availableInCollection: 0,
      totalInCollection: 0,
    }))

    const ownedByScryfallId = new Map<string, number>()
    for (const c of collectionCards.value) {
      if (c.status !== 'wishlist') {
        ownedByScryfallId.set(c.scryfallId, (ownedByScryfallId.get(c.scryfallId) ?? 0) + c.quantity)
      }
    }

    const allocWishlistDisplay: HydratedWishlistCard[] = deckAllocWishlistCards.value
        .filter(({ alloc }) => !alloc.isInSideboard)
        .map(({ card, alloc }) => ({
          cardId: card.id,
          scryfallId: card.scryfallId,
          name: card.name,
          edition: card.edition,
          condition: card.condition,
          foil: card.foil,
          price: card.price,
          image: card.image,
          cmc: card.cmc,
          type_line: card.type_line,
          colors: card.colors,
          produced_mana: card.produced_mana,
          requestedQuantity: alloc.quantity,
          allocatedQuantity: alloc.quantity,
          isInSideboard: false,
          notes: alloc.notes,
          addedAt: alloc.addedAt instanceof Date ? alloc.addedAt : new Date(alloc.addedAt),
          isWishlist: true as const,
          availableInCollection: 0,
          totalInCollection: ownedByScryfallId.get(card.scryfallId) ?? 0,
        }))

    return [...commanderDisplay, ...mainboardOwned, ...wishlistDisplay, ...allocWishlistDisplay]
  })

  // ============================================================
  // Hydrated display cards — sideboard
  // ============================================================
  const sideboardDisplayCards = computed((): DisplayDeckCard[] => {
    if (!selectedDeck.value || isCommanderFormat.value) return []

    const cardMap = new Map(collectionCards.value.map(c => [c.id, c]))
    const sideboardOwned: HydratedDeckCard[] = []

    for (const alloc of selectedDeck.value.allocations ?? []) {
      if (!alloc.isInSideboard) continue
      const card = cardMap.get(alloc.cardId)
      if (!card || card.status === 'wishlist') continue

      sideboardOwned.push({
        cardId: card.id,
        scryfallId: card.scryfallId,
        name: card.name,
        edition: card.edition,
        condition: card.condition,
        foil: card.foil,
        price: card.price,
        image: card.image,
        cmc: card.cmc,
        type_line: card.type_line,
        colors: card.colors,
        produced_mana: card.produced_mana,
        allocatedQuantity: alloc.quantity,
        isInSideboard: true,
        notes: undefined,
        addedAt: card.createdAt ?? new Date(),
        isWishlist: false as const,
        availableInCollection: card.quantity - alloc.quantity,
        totalInCollection: card.quantity,
      })
    }

    const wishlistDisplay: HydratedWishlistCard[] = deckSideboardWishlist.value.map(item => ({
      cardId: '',
      scryfallId: item.scryfallId,
      name: item.name,
      edition: item.edition,
      condition: item.condition,
      foil: item.foil,
      price: item.price,
      image: item.image,
      cmc: item.cmc,
      type_line: item.type_line,
      colors: item.colors,
      requestedQuantity: item.quantity,
      allocatedQuantity: item.quantity,
      isInSideboard: true,
      notes: item.notes,
      addedAt: item.addedAt,
      isWishlist: true as const,
      availableInCollection: 0,
      totalInCollection: 0,
    }))

    const ownedByScryfallId = new Map<string, number>()
    for (const c of collectionCards.value) {
      if (c.status !== 'wishlist') {
        ownedByScryfallId.set(c.scryfallId, (ownedByScryfallId.get(c.scryfallId) ?? 0) + c.quantity)
      }
    }

    const allocWishlistDisplay: HydratedWishlistCard[] = deckAllocWishlistCards.value
        .filter(({ alloc }) => alloc.isInSideboard)
        .map(({ card, alloc }) => ({
          cardId: card.id,
          scryfallId: card.scryfallId,
          name: card.name,
          edition: card.edition,
          condition: card.condition,
          foil: card.foil,
          price: card.price,
          image: card.image,
          cmc: card.cmc,
          type_line: card.type_line,
          colors: card.colors,
          produced_mana: card.produced_mana,
          requestedQuantity: alloc.quantity,
          allocatedQuantity: alloc.quantity,
          isInSideboard: true,
          notes: alloc.notes,
          addedAt: alloc.addedAt instanceof Date ? alloc.addedAt : new Date(alloc.addedAt),
          isWishlist: true as const,
          availableInCollection: 0,
          totalInCollection: ownedByScryfallId.get(card.scryfallId) ?? 0,
        }))

    return [...sideboardOwned, ...wishlistDisplay, ...allocWishlistDisplay]
  })

  // ============================================================
  // Text-search filtered versions
  // ============================================================
  const filteredMainboardDisplayCards = computed(() => {
    if (!filterQuery.value.trim()) return mainboardDisplayCards.value
    const q = filterQuery.value.toLowerCase()
    return mainboardDisplayCards.value.filter(c =>
      c.name.toLowerCase().includes(q) || c.edition.toLowerCase().includes(q)
    )
  })

  const filteredSideboardDisplayCards = computed(() => {
    if (!filterQuery.value.trim()) return sideboardDisplayCards.value
    const q = filterQuery.value.toLowerCase()
    return sideboardDisplayCards.value.filter(c =>
      c.name.toLowerCase().includes(q) || c.edition.toLowerCase().includes(q)
    )
  })

  // ============================================================
  // Counts
  // ============================================================
  const mainboardOwnedCount = computed(() => {
    return mainboardDisplayCards.value
      .filter(c => !c.isWishlist)
      .reduce((sum, c) => {
        if (isCommanderFormat.value && commanderNames.value.length > 0 &&
          commanderNames.value.some(name => name.toLowerCase() === c.name.toLowerCase())) {
          return sum
        }
        return sum + c.allocatedQuantity
      }, 0)
  })

  const sideboardOwnedCount = computed(() => {
    return sideboardDisplayCards.value
      .filter(c => !c.isWishlist)
      .reduce((sum, c) => sum + c.allocatedQuantity, 0)
  })

  const mainboardWishlistCount = computed(() => {
    const legacy = deckMainboardWishlist.value.reduce((sum, item) => sum + item.quantity, 0)
    const alloc = deckAllocWishlistCards.value
        .filter(({ alloc }) => !alloc.isInSideboard)
        .reduce((sum, { alloc }) => sum + alloc.quantity, 0)
    return legacy + alloc
  })

  const sideboardWishlistCount = computed(() => {
    const legacy = deckSideboardWishlist.value.reduce((sum, item) => sum + item.quantity, 0)
    const alloc = deckAllocWishlistCards.value
        .filter(({ alloc }) => alloc.isInSideboard)
        .reduce((sum, { alloc }) => sum + alloc.quantity, 0)
    return legacy + alloc
  })

  return {
    // Hydrated display
    mainboardDisplayCards,
    sideboardDisplayCards,
    filteredMainboardDisplayCards,
    filteredSideboardDisplayCards,
    // Counts
    mainboardOwnedCount,
    sideboardOwnedCount,
    mainboardWishlistCount,
    sideboardWishlistCount,
    // Supporting derived collections
    deckOwnedCards,
    deckAllocWishlistCards,
    deckMainboardWishlist,
    deckSideboardWishlist,
    // Commander metadata
    isCommanderFormat,
    commanderNames,
  }
}
