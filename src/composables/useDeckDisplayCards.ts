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
        setCode: card.setCode,
        condition: card.condition,
        foil: card.foil,
        price: card.price,
        image: card.image,
        cmc: card.cmc,
        type_line: card.type_line,
        colors: card.colors,
        produced_mana: card.produced_mana,
        rarity: card.rarity,
        power: card.power,
        toughness: card.toughness,
        oracle_text: card.oracle_text,
        keywords: card.keywords,
        legalities: card.legalities,
        full_art: card.full_art,
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

    // ── Merge wishlist alloc copies into owned entries (SCRUM-36) ──────────
    // For each allocation-wishlist card, look for an existing owned entry with
    // the same (scryfallId, edition).  If found, fold its quantity into the
    // owned entry's allocatedQuantity so the grid shows ONE pile per print.
    // Entries that have NO owned counterpart are kept as separate entries but
    // rendered without the amber/opacity styling (isWishlist=false for visual
    // purposes; a separate `wishlistCardId` field lets the remove handler know
    // wishlist copies exist).

    // Build a lookup: key = `${scryfallId}|${edition}` → index in mainboardOwned
    const ownedIndex = new Map<string, number>()
    for (let i = 0; i < mainboardOwned.length; i++) {
      const c = mainboardOwned[i]!
      ownedIndex.set(`${c.scryfallId}|${c.edition}`, i)
    }

    // Also track wishlist alloc entries that have no owned counterpart
    const unpairedWishlistAlloc: HydratedDeckCard[] = []

    for (const { card, alloc } of deckAllocWishlistCards.value) {
      if (alloc.isInSideboard) continue
      const key = `${card.scryfallId}|${card.edition}`
      const idx = ownedIndex.get(key)
      if (idx !== undefined) {
        // Merge: add wishlist quantity to the existing owned entry
        mainboardOwned[idx]!.allocatedQuantity += alloc.quantity
      } else {
        // No owned counterpart — show as a standalone entry (no amber styling)
        unpairedWishlistAlloc.push({
          cardId: card.id,
          scryfallId: card.scryfallId,
          name: card.name,
          edition: card.edition,
          setCode: card.setCode,
          condition: card.condition,
          foil: card.foil,
          price: card.price,
          image: card.image,
          cmc: card.cmc,
          type_line: card.type_line,
          colors: card.colors,
          produced_mana: card.produced_mana,
          rarity: card.rarity,
          power: card.power,
          toughness: card.toughness,
          oracle_text: card.oracle_text,
          keywords: card.keywords,
          legalities: card.legalities,
          full_art: card.full_art,
          allocatedQuantity: alloc.quantity,
          isInSideboard: false,
          notes: alloc.notes,
          addedAt: alloc.addedAt instanceof Date ? alloc.addedAt : new Date(alloc.addedAt),
          isWishlist: false as const,
          availableInCollection: 0,
          totalInCollection: 0,
        })
      }
    }

    // Legacy DeckWishlistItem entries (no cardId) — also merged when possible
    const wishlistDisplay: HydratedDeckCard[] = []
    for (const item of deckMainboardWishlist.value) {
      const key = `${item.scryfallId}|${item.edition}`
      const idx = ownedIndex.get(key)
      if (idx !== undefined) {
        mainboardOwned[idx]!.allocatedQuantity += item.quantity
      } else {
        wishlistDisplay.push({
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
          allocatedQuantity: item.quantity,
          isInSideboard: false,
          notes: item.notes,
          addedAt: item.addedAt,
          isWishlist: false as const,
          availableInCollection: 0,
          totalInCollection: 0,
        })
      }
    }

    return [...commanderDisplay, ...mainboardOwned, ...wishlistDisplay, ...unpairedWishlistAlloc]
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
        setCode: card.setCode,
        condition: card.condition,
        foil: card.foil,
        price: card.price,
        image: card.image,
        cmc: card.cmc,
        type_line: card.type_line,
        colors: card.colors,
        produced_mana: card.produced_mana,
        rarity: card.rarity,
        power: card.power,
        toughness: card.toughness,
        oracle_text: card.oracle_text,
        keywords: card.keywords,
        legalities: card.legalities,
        full_art: card.full_art,
        allocatedQuantity: alloc.quantity,
        isInSideboard: true,
        notes: undefined,
        addedAt: card.createdAt ?? new Date(),
        isWishlist: false as const,
        availableInCollection: card.quantity - alloc.quantity,
        totalInCollection: card.quantity,
      })
    }

    // ── Merge sideboard wishlist alloc copies into owned entries ──────────
    const sbOwnedIndex = new Map<string, number>()
    for (let i = 0; i < sideboardOwned.length; i++) {
      const c = sideboardOwned[i]!
      sbOwnedIndex.set(`${c.scryfallId}|${c.edition}`, i)
    }

    const sbUnpairedWishlistAlloc: HydratedDeckCard[] = []

    for (const { card, alloc } of deckAllocWishlistCards.value) {
      if (!alloc.isInSideboard) continue
      const key = `${card.scryfallId}|${card.edition}`
      const idx = sbOwnedIndex.get(key)
      if (idx !== undefined) {
        sideboardOwned[idx]!.allocatedQuantity += alloc.quantity
      } else {
        sbUnpairedWishlistAlloc.push({
          cardId: card.id,
          scryfallId: card.scryfallId,
          name: card.name,
          edition: card.edition,
          setCode: card.setCode,
          condition: card.condition,
          foil: card.foil,
          price: card.price,
          image: card.image,
          cmc: card.cmc,
          type_line: card.type_line,
          colors: card.colors,
          produced_mana: card.produced_mana,
          rarity: card.rarity,
          power: card.power,
          toughness: card.toughness,
          oracle_text: card.oracle_text,
          keywords: card.keywords,
          legalities: card.legalities,
          full_art: card.full_art,
          allocatedQuantity: alloc.quantity,
          isInSideboard: true,
          notes: alloc.notes,
          addedAt: alloc.addedAt instanceof Date ? alloc.addedAt : new Date(alloc.addedAt),
          isWishlist: false as const,
          availableInCollection: 0,
          totalInCollection: 0,
        })
      }
    }

    // Legacy sideboard wishlist items — merge where possible
    const sbWishlistDisplay: HydratedDeckCard[] = []
    for (const item of deckSideboardWishlist.value) {
      const key = `${item.scryfallId}|${item.edition}`
      const idx = sbOwnedIndex.get(key)
      if (idx !== undefined) {
        sideboardOwned[idx]!.allocatedQuantity += item.quantity
      } else {
        sbWishlistDisplay.push({
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
          allocatedQuantity: item.quantity,
          isInSideboard: true,
          notes: item.notes,
          addedAt: item.addedAt,
          isWishlist: false as const,
          availableInCollection: 0,
          totalInCollection: 0,
        })
      }
    }

    return [...sideboardOwned, ...sbWishlistDisplay, ...sbUnpairedWishlistAlloc]
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

  // Owned counts read directly from allocations (not from display cards) so
  // they are not affected by the wishlist-merge that folds wishlist quantities
  // into the owned entry's allocatedQuantity for visual purposes (SCRUM-36).
  const mainboardOwnedCount = computed(() => {
    if (!selectedDeck.value?.allocations) return 0
    const cardMap = new Map(collectionCards.value.map(c => [c.id, c]))
    let total = 0
    for (const alloc of selectedDeck.value.allocations) {
      if (alloc.isInSideboard) continue
      const card = cardMap.get(alloc.cardId)
      if (!card || card.status === 'wishlist') continue
      // Skip commanders
      if (
        isCommanderFormat.value &&
        commanderNames.value.length > 0 &&
        commanderNames.value.some(n => n.toLowerCase() === card.name.toLowerCase())
      ) continue
      total += alloc.quantity
    }
    return total
  })

  const sideboardOwnedCount = computed(() => {
    if (!selectedDeck.value?.allocations) return 0
    const cardMap = new Map(collectionCards.value.map(c => [c.id, c]))
    let total = 0
    for (const alloc of selectedDeck.value.allocations) {
      if (!alloc.isInSideboard) continue
      const card = cardMap.get(alloc.cardId)
      if (!card || card.status === 'wishlist') continue
      total += alloc.quantity
    }
    return total
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
