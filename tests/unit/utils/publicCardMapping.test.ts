/**
 * TASK-136: pure mapping from a denormalized /public_cards document to the
 * Card shape CollectionGrid / useCardFilter / cart / interest flows expect.
 * Extracted so UserProfileView's paginated loader has a testable seam
 * without mounting the whole view (no view-level unit tests exist in this
 * project — see tests/unit directory layout).
 */
import { publicCardToCard } from '../../../src/utils/publicCardMapping'
import type { PublicCard } from '../../../src/services/publicCards'

const fixedDate = new Date('2026-07-17T12:00:00Z')
const fakeTimestamp = { toDate: () => fixedDate } as unknown as PublicCard['updatedAt']

function makePublicCard(overrides: Partial<PublicCard> = {}): PublicCard {
  return {
    docId: 'user-1_card-1',
    cardId: 'card-1',
    userId: 'user-1',
    username: 'alice',
    cardName: 'Lightning Bolt',
    cardNameLower: 'lightning bolt',
    scryfallId: 'scry-1',
    status: 'sale',
    price: 2.5,
    edition: 'Limited Edition Alpha',
    condition: 'NM',
    foil: false,
    quantity: 3,
    image: 'https://img/bolt.jpg',
    updatedAt: fakeTimestamp,
    ...overrides,
  }
}

describe('publicCardToCard', () => {
  it('maps cardId to id (matches the owner card doc id used by cart/interest flows)', () => {
    const card = publicCardToCard(makePublicCard({ cardId: 'card-42' }))
    expect(card.id).toBe('card-42')
  })

  it('preserves scryfallId, name, edition, and status verbatim', () => {
    const card = publicCardToCard(makePublicCard({
      scryfallId: 'scry-42', cardName: 'Sol Ring', edition: 'Commander 2021', status: 'trade',
    }))
    expect(card.scryfallId).toBe('scry-42')
    expect(card.name).toBe('Sol Ring')
    expect(card.edition).toBe('Commander 2021')
    expect(card.status).toBe('trade')
  })

  it('preserves quantity, condition, foil and price verbatim', () => {
    const card = publicCardToCard(makePublicCard({ quantity: 5, condition: 'LP', foil: true, price: 10 }))
    expect(card.quantity).toBe(5)
    expect(card.condition).toBe('LP')
    expect(card.foil).toBe(true)
    expect(card.price).toBe(10)
  })

  it('marks the mapped card as public — it can only ever have come from the public collection', () => {
    const card = publicCardToCard(makePublicCard())
    expect(card.public).toBe(true)
  })

  it('never produces a collection or wishlist status — PublicCard.status is only sale|trade by construction', () => {
    const card = publicCardToCard(makePublicCard({ status: 'trade' }))
    expect(['sale', 'trade']).toContain(card.status)
  })

  it('converts the Firestore Timestamp to a Date via toDate()', () => {
    const card = publicCardToCard(makePublicCard())
    expect(card.updatedAt).toEqual(fixedDate)
  })

  it('falls back to a Date when updatedAt is missing or malformed (defensive, e.g. bad test/mock data)', () => {
    const card = publicCardToCard(makePublicCard({ updatedAt: undefined as unknown as PublicCard['updatedAt'] }))
    expect(card.updatedAt).toBeInstanceOf(Date)
  })
})
