import type { Card } from '../types/card'

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
    return updatedCards.filter(card => {
        const isPublicNow = (card.status === 'sale' || card.status === 'trade') && card.public !== false
        return isPublicNow || previouslyPublicIds.has(card.id)
    })
}
