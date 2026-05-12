// SCRUM-40 (QA gap): pure helper for the per-binder slot diff used by CardDetailModal save.
// Each (scryfallId, condition, foil) variant has 1 slot per binder (binders have no mb/sb).
// The store's allocateCardToBinder caps at available collection quantity, so the modal
// must save STATUS changes (collection quantity) BEFORE binder allocations.
//
// Mirrors deckSlotDiff.ts shape; kept separate because binders don't have mb/sb.

export type BinderSlotOp =
  | { type: 'deallocate'; binderId: string; cardId: string }
  | { type: 'allocate'; binderId: string; cardId: string; quantity: number }

export const buildOriginalBinderSlots = (
  relatedCardIds: readonly string[],
  binderAllocsByCardId: ReadonlyMap<string, readonly { binderId: string; quantity: number }[]>,
): Map<string, number> => {
  const map = new Map<string, number>()
  for (const cardId of relatedCardIds) {
    const allocs = binderAllocsByCardId.get(cardId)
    if (!allocs) continue
    for (const a of allocs) {
      map.set(a.binderId, (map.get(a.binderId) ?? 0) + a.quantity)
    }
  }
  return map
}

interface ComputeArgs {
  binders: readonly { binderId: string }[]
  originalSlots: ReadonlyMap<string, number>
  targetSlots: Readonly<Record<string, number>>
  relatedCardIds: readonly string[]
  ownedCardId: string | null
}

export const computeBinderSlotOps = ({
  binders,
  originalSlots,
  targetSlots,
  relatedCardIds,
  ownedCardId,
}: ComputeArgs): BinderSlotOp[] => {
  const ops: BinderSlotOp[] = []
  for (const { binderId } of binders) {
    // eslint-disable-next-line security/detect-object-injection
    const target = targetSlots[binderId] ?? 0
    const orig = originalSlots.get(binderId) ?? 0
    if (target === orig) continue

    if (orig > 0) {
      for (const cardId of relatedCardIds) {
        ops.push({ type: 'deallocate', binderId, cardId })
      }
    }

    if (target > 0 && ownedCardId) {
      ops.push({ type: 'allocate', binderId, cardId: ownedCardId, quantity: target })
    }
  }
  return ops
}
