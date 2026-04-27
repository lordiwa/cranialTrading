import type { Card, CardCondition, CardStatus } from '../types/card'

export interface CardIdentity {
  scryfallId: string
  edition: string
  condition: CardCondition
  foil: boolean
}

export type StatusDistribution = Record<CardStatus, number>

export interface CardOperation {
  type: 'create' | 'update' | 'delete'
  status: CardStatus
  cardId?: string
  quantity: number
}

export const STATUS_ORDER: readonly CardStatus[] = ['collection', 'sale', 'trade', 'wishlist'] as const

const sameIdentity = (card: Pick<Card, 'scryfallId' | 'edition' | 'condition' | 'foil'>, identity: CardIdentity): boolean =>
  card.scryfallId === identity.scryfallId &&
  card.edition === identity.edition &&
  card.condition === identity.condition &&
  card.foil === identity.foil

// SCRUM-35 D: relaxed identity ignoring edition string. scryfallId uniquely identifies
// a print in real MTG data, so two rows sharing scryfallId+condition+foil are the same
// physical card variant. Edition string can differ accidentally when stale card_index v2
// served uppercase setCode ("ECL") instead of canonical set_name ("Lorwyn Eclipsed"),
// which fragmented the identity match and caused duplicate rows on save.
const samePrint = (card: Pick<Card, 'scryfallId' | 'condition' | 'foil'>, identity: CardIdentity): boolean =>
  card.scryfallId === identity.scryfallId &&
  card.condition === identity.condition &&
  card.foil === identity.foil

export const findCardByIdentity = (
  cards: readonly Card[],
  status: CardStatus,
  identity: CardIdentity,
): Card | undefined => cards.find(c => c.status === status && sameIdentity(c, identity))

export const findCardByPrint = (
  cards: readonly Card[],
  status: CardStatus,
  identity: CardIdentity,
): Card | undefined => cards.find(c => c.status === status && samePrint(c, identity))

export const findPrintMatches = (
  cards: readonly Card[],
  status: CardStatus,
  identity: CardIdentity,
): Card[] => cards.filter(c => c.status === status && samePrint(c, identity))

export const buildOriginalDistribution = (
  cards: readonly Card[],
  identity: CardIdentity,
): StatusDistribution => {
  const dist: StatusDistribution = { collection: 0, sale: 0, trade: 0, wishlist: 0 }
  for (const c of cards) {
    if (sameIdentity(c, identity)) dist[c.status] += c.quantity
  }
  return dist
}

// SCRUM-35 D: self-healing diff. For each status:
//   1. Collect ALL print-matching rows (by scryfallId+condition+foil), including
//      legacy duplicates whose edition string differs from canonical.
//   2. Pick canonical = the row whose edition matches identity.edition; else first match.
//   3. Emit `delete` for every non-canonical dupe.
//   4. Emit `update` on canonical when quantity OR edition needs to change. The caller
//      (applyStatusOperations) writes cardData.edition (canonical set_name), which
//      heals the row in-place.
//   5. Emit `create` only when no print match exists in this status.
export const computeStatusOperations = (
  newDistribution: StatusDistribution,
  identity: CardIdentity,
  existingCards: readonly Card[],
): CardOperation[] => {
  const ops: CardOperation[] = []
  for (const status of STATUS_ORDER) {
    const target = newDistribution[status]
    const matches = findPrintMatches(existingCards, status, identity)

    // Prefer the row with canonical edition; else first match.
    const canonical = matches.find(c => c.edition === identity.edition) ?? matches[0]
    const dupes = matches.filter(c => c.id !== canonical?.id)

    // Always delete dupes (self-heal).
    for (const d of dupes) {
      ops.push({ type: 'delete', status, cardId: d.id, quantity: 0 })
    }

    if (target <= 0) {
      if (canonical) ops.push({ type: 'delete', status, cardId: canonical.id, quantity: 0 })
      continue
    }

    if (canonical) {
      const needsEditionFix = canonical.edition !== identity.edition
      if (canonical.quantity !== target || needsEditionFix) {
        ops.push({ type: 'update', status, cardId: canonical.id, quantity: target })
      }
      continue
    }

    ops.push({ type: 'create', status, quantity: target })
  }
  return ops
}
