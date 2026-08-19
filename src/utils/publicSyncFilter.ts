import type { Card } from '../types/card'

/**
 * Permissive check: could this card be affected by the public-sync
 * machinery at all — sale/trade status AND not EXPLICITLY marked private
 * (`public !== false`, not `public === true`).
 *
 * TASK-247 tanda 2c review round 4 (MEDIUM-1): extracted out of this
 * file's own getCardsNeedingPublicSync (previously an inline expression)
 * so stores/collection.ts's updateCard/deleteCard guards can share the
 * exact same predicate instead of drifting a third copy. Deliberately NOT
 * the same predicate as services/publicCards.ts's isPublicCard
 * (`public === true`, strict) — that one gates the actual publish/write
 * decision (TASK-085's whitelist: a card must be explicitly opted in to be
 * written to the anonymous-readable public_cards collection) and must
 * stay strict for that reason. This one answers a different, permissive
 * question — "should the public-sync machinery even look at this card".
 *
 * A strict guard here reintroduces the exact ghost-card bug this review
 * chain closed for the delete path (HIGH-2): measured against production,
 * 7 of 7,374 real sale/trade cards have no `public` field at all, and
 * depending on which load path (server-side index vs. the raw Firestore-
 * doc fallback loader) hydrated that card locally, the SAME card can read
 * as `public: true` or `public: undefined` — a strict `=== true` guard
 * would skip removeCardFromPublic/syncCardToPublic for the `undefined`
 * case, permanently orphaning its public_cards doc.
 */
export function isPossiblyPublicCard(card: Card): boolean {
    return (card.status === 'sale' || card.status === 'trade') && card.public !== false
}

/**
 * Determine which cards need public_cards sync after a batch update.
 *
 * Only cards that transition to/from "public" state need syncing:
 * - Cards that are now public (sale/trade + not explicitly private)
 * - Cards that WERE public before the update (need delete from public_cards)
 *
 * Cards that were always 'collection' and stay 'collection' are excluded,
 * preventing batch.delete() on non-existent public_cards documents.
 */
export function getCardsNeedingPublicSync(
    updatedCards: Card[],
    previouslyPublicIds: Set<string>,
): Card[] {
    return updatedCards.filter(card => isPossiblyPublicCard(card) || previouslyPublicIds.has(card.id))
}
