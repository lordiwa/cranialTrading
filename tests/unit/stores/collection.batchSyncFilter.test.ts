/**
 * Regression test: batch update should only sync cards that transition
 * to/from public state (sale/trade), not cards that stay private (collection).
 *
 * Bug: batchSyncCardsToPublic tried to delete public_cards docs for cards
 * that were always 'collection' (never had public_cards docs), causing
 * Firestore permission errors on non-existent documents.
 */
import { makeCard } from '../helpers/fixtures'
import { getCardsNeedingPublicSync } from '../../../src/utils/publicSyncFilter'
import type { Card } from '../../../src/types/card'

describe('getCardsNeedingPublicSync', () => {
  it('excludes cards that were collection and stay collection', () => {
    const cards = [
      makeCard({ id: 'c1', status: 'collection' }),
      makeCard({ id: 'c2', status: 'collection' }),
    ]
    const updatedCards = cards.map(c => ({ ...c, public: false }))
    const previouslyPublicIds = new Set<string>()

    const result = getCardsNeedingPublicSync(updatedCards, previouslyPublicIds)
    expect(result).toEqual([])
  })

  it('includes cards transitioning from sale/trade to collection (need delete)', () => {
    const previouslyPublicIds = new Set(['c1', 'c2'])
    const updatedCards: Card[] = [
      makeCard({ id: 'c1', status: 'collection' }),
      makeCard({ id: 'c2', status: 'collection' }),
    ]

    const result = getCardsNeedingPublicSync(updatedCards, previouslyPublicIds)
    expect(result).toHaveLength(2)
    expect(result.map(c => c.id)).toEqual(['c1', 'c2'])
  })

  it('includes cards transitioning to sale/trade (need set)', () => {
    const previouslyPublicIds = new Set<string>()
    const updatedCards: Card[] = [
      makeCard({ id: 'c1', status: 'sale' }),
      makeCard({ id: 'c2', status: 'trade' }),
    ]

    const result = getCardsNeedingPublicSync(updatedCards, previouslyPublicIds)
    expect(result).toHaveLength(2)
  })

  it('includes cards that stay sale/trade (need update)', () => {
    const previouslyPublicIds = new Set(['c1'])
    const updatedCards: Card[] = [
      makeCard({ id: 'c1', status: 'sale' }),
    ]

    const result = getCardsNeedingPublicSync(updatedCards, previouslyPublicIds)
    expect(result).toHaveLength(1)
  })

  it('handles mixed batch: only syncs relevant cards', () => {
    // c1: collection → collection (skip)
    // c2: sale → collection (sync - was public)
    // c3: collection → sale (sync - now public)
    // c4: collection → collection (skip)
    const previouslyPublicIds = new Set(['c2'])
    const updatedCards: Card[] = [
      makeCard({ id: 'c1', status: 'collection' }),
      makeCard({ id: 'c2', status: 'collection' }),
      makeCard({ id: 'c3', status: 'sale' }),
      makeCard({ id: 'c4', status: 'collection' }),
    ]

    const result = getCardsNeedingPublicSync(updatedCards, previouslyPublicIds)
    expect(result).toHaveLength(2)
    expect(result.map(c => c.id).sort()).toEqual(['c2', 'c3'])
  })

  it('excludes sale/trade cards marked as private (public === false)', () => {
    const previouslyPublicIds = new Set<string>()
    const updatedCards: Card[] = [
      makeCard({ id: 'c1', status: 'sale', public: false } as Partial<Card>),
    ]

    // Card is sale but explicitly private — not "public now"
    // But it wasn't previously public either, so no sync needed
    const result = getCardsNeedingPublicSync(updatedCards, previouslyPublicIds)
    expect(result).toEqual([])
  })

  it('includes previously public card even if now private sale', () => {
    // Was sale+public, now sale+private — needs sync to DELETE from public_cards
    const previouslyPublicIds = new Set(['c1'])
    const updatedCards: Card[] = [
      makeCard({ id: 'c1', status: 'sale', public: false } as Partial<Card>),
    ]

    const result = getCardsNeedingPublicSync(updatedCards, previouslyPublicIds)
    expect(result).toHaveLength(1)
  })
})
