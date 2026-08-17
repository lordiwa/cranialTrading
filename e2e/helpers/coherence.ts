/**
 * TASK-240 — the document <-> card_index coherence predicate, on its own.
 *
 * WHY IT IS A MODULE AND NOT AN INLINE BLOCK IN THE SPEC. Two reasons, both
 * from the round-3 review:
 *  - The E2E spec evaluates it twice now (after the merge phase's restore, and
 *    after the final teardown), and a copy-pasted 20-line predicate is how the
 *    two copies drift.
 *  - Its most important branch — "the document survived and its entry
 *    disagrees", the actual merge damage — only fires in E2E when a run really
 *    merges. Living here, every branch is covered deterministically by
 *    tests/unit/e2e-coherence.spec.ts on every `npm run test:unit`, with no
 *    account, no credentials and no timing. That is the difference between a
 *    lock whose main branch is exercised and one that is merely present.
 *
 * Deliberately pure: no Firestore, no admin, no I/O. It takes the two
 * snapshots the caller already has and returns human-readable findings.
 */

/** The parts of an AccountSnapshot this predicate reads. */
export interface CoherenceView {
  quantities: Record<string, number>;
  indexQuantities: Record<string, number>;
  duplicateIndexEntryIds?: string[];
}

/**
 * Returns one string per incoherence among `touched`, empty when all agree.
 *
 * Scoped to the ids the run touched ON PURPOSE. A global comparison reds out
 * for reasons that are not leaks: measured 2026-08-17, the app rebuilt this
 * account's whole card_index during a run of the spec.
 *
 * NOT a general-purpose account auditor:
 *  - An id with no entry before and none after is TASK-234, not the run's
 *    doing, and is passed.
 *  - `q` is written by the app as `data.quantity || 1` (src/stores/collection.ts,
 *    toIndexCard), so a document sitting at quantity 0 could never satisfy
 *    `idxQ === docQ`. Left as-is rather than special-cased: no such document
 *    exists in this account (measured 2026-08-17), and inventing a tolerance
 *    for a state nothing produces would only weaken the lock. If one ever
 *    appears, this is the line that will say so.
 */
export function findIncoherent(
  touched: readonly string[],
  before: CoherenceView,
  after: CoherenceView,
): string[] {
  const duplicated = new Set(after.duplicateIndexEntryIds ?? []);
  return touched.flatMap((id) => {
    // Reported rather than silently resolved: with two entries for one id,
    // `indexQuantities[id]` is whichever chunk happened to be read last, so
    // every verdict below would be a coin flip. TASK-168 makes this a real
    // corruption class, not a hypothetical.
    if (duplicated.has(id)) {
      return [`${id}: appears in MORE THAN ONE card_index entry — coherence for it cannot be decided`];
    }
    const docQ = after.quantities[id];
    const idxQ = after.indexQuantities[id];
    if (docQ === undefined) {
      // Document gone (the `created` path, post-delete): no entry may remain.
      return idxQ === undefined ? [] : [`${id}: document deleted but card_index entry survives with q=${idxQ}`];
    }
    if (idxQ === undefined) {
      // No entry and none before either => TASK-234, not ours. One that
      // existed before and is gone now => we made an invisible card.
      return before.indexQuantities[id] === undefined
        ? []
        : [`${id}: card_index entry vanished (was q=${before.indexQuantities[id]}) while the document survives with quantity=${docQ}`];
    }
    return idxQ === docQ ? [] : [`${id}: doc.quantity=${docQ} but card_index q=${idxQ}`];
  });
}
