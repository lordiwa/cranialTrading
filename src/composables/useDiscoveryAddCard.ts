import type { Ref } from 'vue'
import type { Card, CardCondition, CardStatus } from '@/types/card'
import type { ScryfallCard } from '@/services/scryfall'

type DiscoveryScope = 'decks' | 'binders' | 'collection'

interface DiscoveryAddDeps {
  collectionStore: {
    addCard: (data: Omit<Card, 'id' | 'updatedAt'>) => Promise<string | null>
    updateCard: (cardId: string, updates: Partial<Card>) => Promise<boolean>
    cards: Ref<Card[]>
  }
  decksStore: {
    allocateCardToDeck: (
      deckId: string,
      cardId: string,
      quantity: number,
      isInSideboard: boolean,
    ) => Promise<{ allocated: number; wishlisted: number }>
  }
  bindersStore: {
    allocateCardToBinder: (binderId: string, cardId: string, quantity: number) => Promise<number>
    binders: Ref<{ id: string; forSale?: boolean }[]>
  }
  toastStore: { show: (msg: string, kind?: 'success' | 'error' | 'info') => void }
  t: (key: string, params?: Record<string, string | number>) => string
  selectedDeckId: Ref<string | undefined>
  selectedBinderId: Ref<string | undefined>
}

export interface ConfirmedAddOptions {
  quantity: number
  condition: CardCondition
  foil: boolean
  isInSideboard: boolean
}

interface AddResult {
  ok: boolean
}

function scryfallToCardData(print: ScryfallCard, status: CardStatus): Omit<Card, 'id' | 'updatedAt'> {
  const priceStr = print.prices?.usd
  const price = priceStr ? Number.parseFloat(priceStr) || 0 : 0

  const image = print.image_uris?.small ?? print.image_uris?.normal ?? ''

  const data: Omit<Card, 'id' | 'updatedAt'> = {
    scryfallId: print.id,
    name: print.name,
    edition: print.set_name,
    quantity: 1,
    condition: 'NM',
    foil: false,
    price,
    image,
    status,
  }
  if (print.set !== undefined) data.setCode = print.set
  if (print.cmc !== undefined) data.cmc = print.cmc
  if (print.type_line !== undefined) data.type_line = print.type_line
  if (print.colors !== undefined) data.colors = print.colors
  if (print.rarity !== undefined) data.rarity = print.rarity
  if (print.power !== undefined) data.power = print.power
  if (print.toughness !== undefined) data.toughness = print.toughness
  if (print.oracle_text !== undefined) data.oracle_text = print.oracle_text
  if (print.keywords !== undefined) data.keywords = print.keywords
  if (print.legalities !== undefined) data.legalities = print.legalities
  if (print.full_art !== undefined) data.full_art = print.full_art
  if (print.produced_mana !== undefined) data.produced_mana = print.produced_mana
  return data
}

function findExistingCard(cards: Card[], scryfallId: string, status: CardStatus): Card | undefined {
  return cards.find(c =>
    c.scryfallId === scryfallId &&
    c.condition === 'NM' &&
    !c.foil &&
    c.status === status,
  )
}

function findExistingCardByCondition(
  cards: Card[],
  scryfallId: string,
  condition: CardCondition,
  foil: boolean,
  status: CardStatus,
): Card | undefined {
  return cards.find(c =>
    c.scryfallId === scryfallId &&
    c.condition === condition &&
    c.foil === foil &&
    c.status === status,
  )
}

export function useDiscoveryAddCard(scope: DiscoveryScope, deps: DiscoveryAddDeps) {
  // Serialize add operations so rapid clicks queue rather than race.
  // Each click waits for the previous one to finish before starting its
  // Firestore write — this ensures availability calculations are always
  // based on committed state (SCRUM-36 RC-2).
  let pendingAdd: Promise<AddResult> = Promise.resolve({ ok: true })

  const ensureCollectionCard = async (print: ScryfallCard, status: CardStatus): Promise<string | null> => {
    const existing = findExistingCard(deps.collectionStore.cards.value, print.id, status)
    if (existing) {
      // Auto-grow collection quantity by 1 so the allocation has an available
      // copy to use. Without this, the second and subsequent MB clicks see
      // available=0 (all copies already allocated) and silently fall to
      // wishlist instead of mainboard (SCRUM-36 RC-1).
      await deps.collectionStore.updateCard(existing.id, { quantity: existing.quantity + 1 })
      return existing.id
    }
    return deps.collectionStore.addCard(scryfallToCardData(print, status))
  }

  // Wrap an async operation in the serialization queue.
  // Each queued call starts only after the previous one resolves, so
  // availability calculations in allocateCardToDeck always see committed state.
  const enqueue = (op: () => Promise<AddResult>): Promise<AddResult> => {
    pendingAdd = pendingAdd.then(() => op()).catch(() => op())
    return pendingAdd
  }

  const addToMainboard = (print: ScryfallCard): Promise<AddResult> =>
    enqueue(async () => {
      if (scope !== 'decks' || !deps.selectedDeckId.value) {
        deps.toastStore.show(deps.t('discovery.messages.noActiveTarget'), 'info')
        return { ok: false }
      }
      const cardId = await ensureCollectionCard(print, 'collection')
      if (!cardId) return { ok: false }
      const result = await deps.decksStore.allocateCardToDeck(deps.selectedDeckId.value, cardId, 1, false)
      if (result.allocated === 0 && result.wishlisted === 0) {
        deps.toastStore.show(deps.t('discovery.messages.addError'), 'error')
        return { ok: false }
      }
      deps.toastStore.show(deps.t('discovery.messages.addedToMainboard', { name: print.name }), 'success')
      return { ok: true }
    })

  const addToSideboard = (print: ScryfallCard): Promise<AddResult> =>
    enqueue(async () => {
      if (scope !== 'decks' || !deps.selectedDeckId.value) {
        deps.toastStore.show(deps.t('discovery.messages.noActiveTarget'), 'info')
        return { ok: false }
      }
      const cardId = await ensureCollectionCard(print, 'collection')
      if (!cardId) return { ok: false }
      const result = await deps.decksStore.allocateCardToDeck(deps.selectedDeckId.value, cardId, 1, true)
      if (result.allocated === 0 && result.wishlisted === 0) {
        deps.toastStore.show(deps.t('discovery.messages.addError'), 'error')
        return { ok: false }
      }
      deps.toastStore.show(deps.t('discovery.messages.addedToSideboard', { name: print.name }), 'success')
      return { ok: true }
    })

  const addToBinder = (print: ScryfallCard): Promise<AddResult> =>
    enqueue(async () => {
      if (scope !== 'binders' || !deps.selectedBinderId.value) {
        deps.toastStore.show(deps.t('discovery.messages.noActiveTarget'), 'info')
        return { ok: false }
      }
      const binder = deps.bindersStore.binders.value.find(b => b.id === deps.selectedBinderId.value)
      const status: CardStatus = binder?.forSale ? 'sale' : 'collection'
      const cardId = await ensureCollectionCard(print, status)
      if (!cardId) return { ok: false }
      const allocated = await deps.bindersStore.allocateCardToBinder(deps.selectedBinderId.value, cardId, 1)
      if (allocated === 0) {
        deps.toastStore.show(deps.t('discovery.messages.addError'), 'error')
        return { ok: false }
      }
      deps.toastStore.show(deps.t('discovery.messages.addedToBinder', { name: print.name }), 'success')
      return { ok: true }
    })

  const addToCollection = async (print: ScryfallCard, status: CardStatus): Promise<AddResult> => {
    const cardId = await ensureCollectionCard(print, status)
    if (!cardId) return { ok: false }
    deps.toastStore.show(deps.t('discovery.messages.addedToCollection', { name: print.name }), 'success')
    return { ok: true }
  }

  /**
   * Modal-confirmed add to deck board (mainboard or sideboard).
   *
   * Called by DeckView after the user confirms quantity/condition/foil in
   * DiscoveryAddConfirmModal.  Finds or creates the collection card with the
   * exact condition+foil the user chose, then allocates the confirmed quantity
   * to the deck in a single atomic call.  Uses the serialisation queue so it
   * never races with other pending operations (SCRUM-36 RC-2).
   */
  const addToMainboardConfirmed = (
    print: ScryfallCard,
    opts: ConfirmedAddOptions,
  ): Promise<AddResult> =>
    enqueue(async () => {
      if (scope !== 'decks' || !deps.selectedDeckId.value) {
        deps.toastStore.show(deps.t('discovery.messages.noActiveTarget'), 'info')
        return { ok: false }
      }

      // Find an existing collection card that exactly matches condition + foil.
      // If none exists, create one with the full Scryfall metadata.
      const existing = findExistingCardByCondition(
        deps.collectionStore.cards.value,
        print.id,
        opts.condition,
        opts.foil,
        'collection',
      )

      let cardId: string | null
      if (existing) {
        // Grow the collection quantity so the allocation has enough copies.
        await deps.collectionStore.updateCard(existing.id, {
          quantity: existing.quantity + opts.quantity,
        })
        cardId = existing.id
      } else {
        // Create a new collection card with user-chosen condition / foil / qty.
        const data = scryfallToCardData(print, 'collection')
        cardId = await deps.collectionStore.addCard({
          ...data,
          quantity: opts.quantity,
          condition: opts.condition,
          foil: opts.foil,
        })
      }

      if (!cardId) return { ok: false }

      const result = await deps.decksStore.allocateCardToDeck(
        deps.selectedDeckId.value,
        cardId,
        opts.quantity,
        opts.isInSideboard,
      )

      if (result.allocated === 0 && result.wishlisted === 0) {
        deps.toastStore.show(deps.t('discovery.messages.addError'), 'error')
        return { ok: false }
      }

      const msgKey = opts.isInSideboard
        ? 'discovery.messages.addedToSideboard'
        : 'discovery.messages.addedToMainboard'
      deps.toastStore.show(deps.t(msgKey, { name: print.name }), 'success')
      return { ok: true }
    })

  return {
    addToMainboard,
    addToSideboard,
    addToBinder,
    addToCollection,
    addToMainboardConfirmed,
  }
}
