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

// TASK-280: the in-memory `collectionStore.cards` list a save decides
// create-vs-update against can be stale relative to Firestore — the
// production incident (Grand Abolisher, 2026-08-24) happened because the
// `sale` doc for this identity wasn't in memory at save time, so its bucket
// read as empty and a second `collection` doc got CREATED instead of the
// `sale` doc being UPDATED. mergeServerCards folds a fresh server read into
// the memory list before any create/update decision is made. Server rows win
// on id collision (freshest truth); any memory-only row (an optimistic write
// not yet reflected by the read) is kept as-is.
export const mergeServerCards = (
  memoryCards: readonly Card[],
  serverCards: readonly Card[],
): Card[] => {
  const byId = new Map<string, Card>()
  for (const c of memoryCards) byId.set(c.id, c)
  for (const c of serverCards) byId.set(c.id, c)
  return Array.from(byId.values())
}

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
//
// TASK-318: `sourceCards` are the rows the user was actually editing in the modal —
// i.e. the OLD identity (before any condition/foil/print change). Before this param
// existed, `matches`/`canonical` were resolved ONLY against the NEW identity, so
// changing condition (NM -> LP) with no existing LP row produced a bare `create` and
// left the NM rows untouched forever: a silent duplicate (Rockalanche NM x5 -> LP x5
// created, NM x5 survived). Now sourceCards rows that aren't the destination's own
// canonical row are folded into the delete set (their quantity is already reflected in
// `newDistribution`, which the modal built by summing sourceCards), and any PRE-EXISTING
// destination-identity quantity that ISN'T part of sourceCards (case: destination
// already had its own stock, e.g. LP x2 for sale before the move) is added on top so a
// merge into an existing row doesn't clobber what was already there.
// TASK-318 M1 (fixed GLOBALLY in the 2nd review round — the first fix only
// ordered within a single status): every create/update across ALL statuses
// is emitted BEFORE any delete, not just before the delete of that SAME
// status. Applying deletes first — or deletes from an EARLIER status before
// a LATER status' create — meant that if the delete succeeded but the
// create/update that was still to come then failed (e.g. Firestore write
// timeout), the cards and their deck/binder allocations were gone with
// nothing left to point at — worse than "at worst the previous state
// intact" (case 8). All non-destructive ops first, globally, means a
// failure at ANY delete (all of them applied last) leaves every row alive.
export const computeStatusOperations = (
  newDistribution: StatusDistribution,
  identity: CardIdentity,
  existingCards: readonly Card[],
  sourceCards: readonly Card[] = [],
): CardOperation[] => {
  const nonDestructiveOps: CardOperation[] = []
  const destructiveOps: CardOperation[] = []
  for (const status of STATUS_ORDER) {
    const destMatches = findPrintMatches(existingCards, status, identity)
    const sourceRows = sourceCards.filter(c => c.status === status)
    const sourceIds = new Set(sourceRows.map(c => c.id))

    // Prefer the row with canonical edition; else first destination match.
    const canonical = destMatches.find(c => c.edition === identity.edition) ?? destMatches[0]

    // Pre-existing destination stock that the modal never showed the user (a
    // different identity than what they opened) must be preserved, not overwritten.
    // Only additive when the caller actually passed sourceCards: callers that omit
    // it (existing callers/tests predating TASK-318) mean newDistribution[status]
    // as the literal absolute target, exactly as before — adding destMatches' own
    // quantity on top of itself would double it for a plain in-place update.
    const destOnlyQty = sourceCards.length > 0
      ? destMatches.filter(c => !sourceIds.has(c.id)).reduce((sum, c) => sum + c.quantity, 0)
      : 0
    const target = newDistribution[status] + destOnlyQty

    // Rows to delete: destination dupes (self-heal) PLUS every source row that is
    // not itself the canonical destination row (identity unchanged -> same rows,
    // no-op; identity changed -> the old-identity rows get folded away).
    const toDelete = new Map<string, Card>()
    for (const m of destMatches) if (m.id !== canonical?.id) toDelete.set(m.id, m)
    for (const s of sourceRows) if (s.id !== canonical?.id) toDelete.set(s.id, s)

    if (target <= 0) {
      for (const d of toDelete.values()) {
        destructiveOps.push({ type: 'delete', status, cardId: d.id, quantity: 0 })
      }
      if (canonical) destructiveOps.push({ type: 'delete', status, cardId: canonical.id, quantity: 0 })
      continue
    }

    if (canonical) {
      const needsEditionFix = canonical.edition !== identity.edition
      if (canonical.quantity !== target || needsEditionFix) {
        nonDestructiveOps.push({ type: 'update', status, cardId: canonical.id, quantity: target })
      }
    } else {
      nonDestructiveOps.push({ type: 'create', status, quantity: target })
    }

    for (const d of toDelete.values()) {
      destructiveOps.push({ type: 'delete', status, cardId: d.id, quantity: 0 })
    }
  }
  // M1: every delete — from every status — runs after every create/update.
  return [...nonDestructiveOps, ...destructiveOps]
}
