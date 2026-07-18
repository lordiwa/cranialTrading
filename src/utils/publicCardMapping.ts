// src/utils/publicCardMapping.ts
//
// Pure, framework-free mapping from a denormalized /public_cards document
// (PublicCard) to the Card shape CollectionGrid, useCardFilter, the exchange
// cart, and the interest flow all expect. Extracted (TASK-136) so
// UserProfileView's paginated public-profile loader never needs to read the
// card owner's private users/{uid}/cards subcollection.

import type { PublicCard } from '../services/publicCards'
import type { Card } from '../types/card'

export const publicCardToCard = (pc: PublicCard): Card => ({
  id: pc.cardId,
  scryfallId: pc.scryfallId,
  name: pc.cardName,
  edition: pc.edition,
  quantity: pc.quantity,
  condition: pc.condition as Card['condition'],
  foil: pc.foil,
  price: pc.price,
  image: pc.image,
  status: pc.status,
  public: true,
  updatedAt: pc.updatedAt && typeof pc.updatedAt.toDate === 'function' ? pc.updatedAt.toDate() : new Date(),
})
