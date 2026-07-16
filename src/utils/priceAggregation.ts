/**
 * TASK-114: CK-first aggregate math shared by the Collection hero (CollectionView)
 * and the Binder footer (BinderView). Card Kingdom retail is the primary price
 * source; a card's own `price` (TCGPlayer) is the fallback whenever the CK price
 * hasn't loaded yet or isn't available for that card. Kept pure (no Vue/Firebase)
 * so it can be unit tested directly.
 */

export interface CkFirstEntry {
  price: number
  quantity: number
}

/** Per-unit price: CK retail if present and finite, otherwise the entry's own (TCG) price. */
export function ckFirstUnitPrice(entry: CkFirstEntry, ckPrice: number | null | undefined): number {
  const value = ckPrice !== null && ckPrice !== undefined && Number.isFinite(ckPrice) ? ckPrice : entry.price
  return Number.isFinite(value) ? value : 0
}

/**
 * Sums quantity * ckFirstUnitPrice over a list of entries. `getCkPrice` looks up
 * each entry's Card Kingdom retail price (null/undefined when not yet fetched or
 * unavailable — falls back to entry.price). Never produces NaN: a single
 * priceless/unfetched entry, or one with a non-finite quantity, only zeroes its
 * own contribution, not the whole sum.
 */
export function sumCkFirst<T extends CkFirstEntry>(
  entries: T[],
  getCkPrice: (entry: T) => number | null | undefined
): number {
  return entries.reduce((sum, entry) => {
    const quantity = Number.isFinite(entry.quantity) ? entry.quantity : 0
    return sum + ckFirstUnitPrice(entry, getCkPrice(entry)) * quantity
  }, 0)
}
