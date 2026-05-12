// SCRUM-35 bug #1 fix: pure helper to find an existing collection card with the
// same print identity. AddCardModal previously always created a new row, leading
// to duplicate rows for the same physical print (scryfallId + edition + condition
// + foil + status). After consolidation by the card_index Cloud Function, a reload
// merges them, but until reload the deck grid shows two separate entries instead
// of incrementing the existing badge.
//
// Identity rule (per feedback_card_edition_canonical): edition is the human-readable
// set_name ("Foundations"), NOT the set code ("FDN").

import type { Card, CardCondition, CardStatus } from '../types/card'

export interface PrintIdentity {
  scryfallId: string
  edition: string
  condition: CardCondition
  foil: boolean
  status: CardStatus
}

export const findCardWithSamePrint = (
  cards: readonly Card[],
  identity: PrintIdentity,
): Card | undefined => {
  return cards.find(c =>
    c.scryfallId === identity.scryfallId &&
    c.edition === identity.edition &&
    c.condition === identity.condition &&
    c.foil === identity.foil &&
    c.status === identity.status,
  )
}
