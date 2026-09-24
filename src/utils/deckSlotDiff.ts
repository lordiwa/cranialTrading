// SCRUM-35 D2: pure helper for the per-deck mb/sb slot diff used by CardDetailModal save.
// Each (scryfallId, condition, foil) variant in a deck has 2 slots: mainboard and sideboard.
// The store's allocateCardToDeck handles owned/wishlist split internally — the modal only
// needs to express totals per slot.

export interface DeckSlot {
  mb: number
  sb: number
}

export type DeckSlotOp =
  | { type: 'deallocate'; deckId: string; cardId: string; isInSideboard: boolean }
  | { type: 'allocate'; deckId: string; cardId: string; quantity: number; isInSideboard: boolean }

export const buildOriginalSlots = (
  relatedCardIds: readonly string[],
  allocsByCardId: ReadonlyMap<string, readonly { deckId: string; quantity: number; isInSideboard: boolean }[]>,
): Map<string, DeckSlot> => {
  const map = new Map<string, DeckSlot>()
  for (const cardId of relatedCardIds) {
    const allocs = allocsByCardId.get(cardId)
    if (!allocs) continue
    for (const a of allocs) {
      const cur = map.get(a.deckId) ?? { mb: 0, sb: 0 }
      if (a.isInSideboard) cur.sb += a.quantity
      else cur.mb += a.quantity
      map.set(a.deckId, cur)
    }
  }
  return map
}

interface ComputeArgs {
  decks: readonly { deckId: string }[]
  originalSlots: ReadonlyMap<string, DeckSlot>
  targetSlots: Readonly<Record<string, DeckSlot>>
  relatedCardIds: readonly string[]
  ownedCardId: string | null
  // TASK-318: when the card's identity (scryfallId/condition/foil) changed on
  // save, the allocation stays correct in QUANTITY but stale in CARD ID — it
  // still points at the row that just got deleted/replaced. Without this flag,
  // a board whose target === original (the user didn't touch allocations,
  // only the condition dropdown) emits no ops at all, so the deck/binder keeps
  // referencing a dangling cardId. When true, every board with orig>0 or
  // target>0 is force-migrated (deallocate the old id(s), reallocate onto
  // ownedCardId) even if the quantity itself didn't change.
  identityChanged?: boolean
}

const ZERO: DeckSlot = { mb: 0, sb: 0 }

export const computeDeckSlotOps = ({
  decks,
  originalSlots,
  targetSlots,
  relatedCardIds,
  ownedCardId,
  identityChanged = false,
}: ComputeArgs): DeckSlotOp[] => {
  const ops: DeckSlotOp[] = []
  for (const { deckId } of decks) {
    // eslint-disable-next-line security/detect-object-injection
    const target = targetSlots[deckId] ?? ZERO
    const orig = originalSlots.get(deckId) ?? ZERO

    for (const board of ['mb', 'sb'] as const) {
      const targetQty = target[board]
      const origQty = orig[board]
      const mustMigrate = identityChanged && (origQty > 0 || targetQty > 0)
      if (targetQty === origQty && !mustMigrate) continue

      const isInSideboard = board === 'sb'

      if (origQty > 0) {
        for (const cardId of relatedCardIds) {
          ops.push({ type: 'deallocate', deckId, cardId, isInSideboard })
        }
      }

      if (targetQty > 0 && ownedCardId) {
        ops.push({ type: 'allocate', deckId, cardId: ownedCardId, quantity: targetQty, isInSideboard })
      }
    }
  }
  return ops
}
