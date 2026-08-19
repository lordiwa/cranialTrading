/**
 * Regression test: batch update should only sync cards that transition
 * to/from public state (sale/trade), not cards that stay private (collection).
 *
 * Bug: batchSyncCardsToPublic tried to delete public_cards docs for cards
 * that were always 'collection' (never had public_cards docs), causing
 * Firestore permission errors on non-existent documents.
 */
import { makeCard } from '../helpers/fixtures'
import { getCardsNeedingPublicSync, isPossiblyPublicCard } from '../../../src/utils/publicSyncFilter'
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

/**
 * TASK-247 tanda 2c review round 4 (MEDIUM-1): the permissive
 * `public !== false` semantics were already load-bearing INSIDE
 * getCardsNeedingPublicSync above, but lived only as an inline expression —
 * extracted here so stores/collection.ts's updateCard/deleteCard guards
 * (which decide whether to even CALL syncCardToPublic/removeCardFromPublic
 * at all) can share the exact same predicate instead of a third, drifted
 * copy. Deliberately NOT the same predicate as publicCards.ts's
 * isPublicCard (`public === true`, strict) — that one gates the actual
 * publish/write decision (TASK-085's whitelist: a card must be explicitly
 * opted in to be written to the anonymous-readable public_cards), and
 * must stay strict. isPossiblyPublicCard answers a different, permissive
 * question: "could this card be affected by the public-sync machinery at
 * all" — used only to decide whether it's worth even looking, matching how
 * card_index / functions/lib/cardIndexEntry.js already hydrate a missing
 * `public` field (`pb: card.public !== false`). Measured against
 * production (2026-08-19, team-lead review): of 7,374 sale/trade cards,
 * 7 have no `public` field at all across 2 real accounts — legacy data
 * that exists right now, not a hypothetical.
 */
describe('isPossiblyPublicCard', () => {
  it('treats a sale card with public undefined (legacy data, no field at all) as possibly public', () => {
    const card = makeCard({ status: 'sale' }) // makeCard's fixture never sets `public`
    expect(card.public).toBeUndefined()

    expect(isPossiblyPublicCard(card)).toBe(true)
  })

  it('treats a trade card with public undefined as possibly public', () => {
    const card = makeCard({ status: 'trade' })
    expect(isPossiblyPublicCard(card)).toBe(true)
  })

  it('excludes a sale card explicitly marked private (public === false)', () => {
    const card = makeCard({ status: 'sale', public: false })
    expect(isPossiblyPublicCard(card)).toBe(false)
  })

  it('includes a sale card explicitly marked public (public === true)', () => {
    const card = makeCard({ status: 'sale', public: true })
    expect(isPossiblyPublicCard(card)).toBe(true)
  })

  it('excludes a collection-status card regardless of the public field', () => {
    expect(isPossiblyPublicCard(makeCard({ status: 'collection', public: true }))).toBe(false)
    expect(isPossiblyPublicCard(makeCard({ status: 'collection' }))).toBe(false)
  })

  it('excludes a wishlist-status card regardless of the public field', () => {
    expect(isPossiblyPublicCard(makeCard({ status: 'wishlist', public: true }))).toBe(false)
  })
})
