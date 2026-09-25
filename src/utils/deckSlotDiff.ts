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

export interface DeckRowAllocation {
  deckId: string
  cardId: string
  mb: number
  sb: number
}

// TASK-318 H7: computeDeckSlotOps aggregates ALL related rows' allocations
// into one total, then reallocates that total onto a SINGLE ownedCardId
// (collection ?? sale ?? trade ?? wishlist — whichever status comes first).
// That's correct when there is only one destination row, but when a save
// migrates MULTIPLE statuses at once (e.g. NM sale x3 + NM trade x2, both
// allocated to the same deck), the combined 5 landed entirely on the sale
// row (quantity 3) — 3 fit, the leftover 2 overflowed into a NEW WISHLIST
// row via allocateCardToDeck's owned/wishlist split, because the sale row
// itself only ever had 3 copies. The trade allocation was never migrated to
// the LP trade row at all.
//
// This is the per-row alternative: given each row's OWN allocation on a
// deck (mb/sb) and a map from that row's id to where its identity migrated
// TO (same status, via idsByStatus), move each row's allocation directly —
// no aggregation, so nothing can overflow. A row whose mapped id is itself
// (already at the destination, or no change) is a no-op. Used ONLY when the
// target total for a deck exactly equals the original total (no allocation
// edit in the modal) AND the identity changed — see CardDetailModal.vue.
export const computeDeckMigrationOps = (
  rows: readonly DeckRowAllocation[],
  idByCardId: ReadonlyMap<string, string>,
): DeckSlotOp[] => {
  const ops: DeckSlotOp[] = []
  for (const row of rows) {
    const mappedId = idByCardId.get(row.cardId) ?? row.cardId
    if (mappedId === row.cardId) continue
    if (row.mb > 0) {
      ops.push({ type: 'deallocate', deckId: row.deckId, cardId: row.cardId, isInSideboard: false })
      ops.push({ type: 'allocate', deckId: row.deckId, cardId: mappedId, quantity: row.mb, isInSideboard: false })
    }
    if (row.sb > 0) {
      ops.push({ type: 'deallocate', deckId: row.deckId, cardId: row.cardId, isInSideboard: true })
      ops.push({ type: 'allocate', deckId: row.deckId, cardId: mappedId, quantity: row.sb, isInSideboard: true })
    }
  }
  return ops
}
