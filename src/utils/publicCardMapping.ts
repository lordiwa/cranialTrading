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
  // TASK-138 AC3: setCode wasn't mapped at all, so exchangeCart's CK price
  // upgrade (exchangeCart.ts:52,76) always fell back to the TCG price for
  // cards added to cart from a public profile. '' (old docs pre-AC3, or a
  // card published with no setCode) maps to undefined so needsEnrichment
  // (cardEnrichment.ts) still treats it as missing and patches it in-memory.
  setCode: pc.setCode || undefined,
  quantity: pc.quantity,
  condition: pc.condition as Card['condition'],
  foil: pc.foil,
  price: pc.price,
  image: pc.image,
  status: pc.status,
  public: true,
  updatedAt: pc.updatedAt && typeof pc.updatedAt.toDate === 'function' ? pc.updatedAt.toDate() : new Date(),
})
