// src/utils/cardEnrichment.ts
//
// Pure, framework-free enrichment helpers shared between the collection store
// (own-profile self-heal + persist) and UserProfileView (read-only, public
// profiles). Given a thin Card and a raw Scryfall card object, builds a patch
// of the missing metadata fields the advanced filters depend on
// (type_line, colors, cmc, rarity, produced_mana, setCode, keywords,
// legalities, power, toughness, full_art) plus image/price.
//
// CANONICAL RULE (project memory): `setCode` is the set CODE (Scryfall `set`,
// e.g. "lea"). `edition` is the human-readable set_name and is NEVER written
// here — this patch must not clobber it.

import type { Card } from '../types/card'

/**
 * Does this card still need enrichment? True when it has a scryfallId to fetch
 * from AND is missing the metadata the filters rely on (mirrors the
 * own-profile background-enrichment selection criteria).
 */
export const needsEnrichment = (card: Card): boolean => {
  if (!card.scryfallId) return false
  return !card.type_line || card.produced_mana === undefined
}

/**
 * Build a patch of missing metadata fields from a Scryfall card.
 * Returns an empty object if nothing needs updating.
 */
export const buildEnrichmentPatch = (card: Card, sc: Record<string, unknown>): Partial<Card> => {
  const patch: Record<string, unknown> = {}

  // Fields where falsy means missing
  const falsyFields = ['type_line', 'colors', 'rarity', 'oracle_text', 'keywords', 'legalities', 'power', 'toughness'] as const
  for (const field of falsyFields) {
    // eslint-disable-next-line security/detect-object-injection
    if (!card[field] && sc[field]) patch[field] = sc[field]
  }

  // Fields where undefined means missing
  const undefinedFields = ['cmc', 'full_art', 'produced_mana'] as const
  for (const field of undefinedFields) {
    // eslint-disable-next-line security/detect-object-injection
    if (card[field] === undefined && sc[field] !== undefined) patch[field] = sc[field]
  }

  // setCode: the set CODE (Scryfall `set`), NOT the human-readable edition/set_name.
  // Never write `edition` here — it stays canonical.
  if (!card.setCode && typeof sc.set === 'string' && sc.set) {
    patch.setCode = sc.set
  }

  // Image: extract from Scryfall's nested image_uris or card_faces
  if (!card.image) {
    const imageUris = sc.image_uris as Record<string, string> | undefined
    const cardFaces = sc.card_faces as { image_uris?: Record<string, string> }[] | undefined
    const image = imageUris?.normal ?? cardFaces?.[0]?.image_uris?.normal ?? ''
    if (image) patch.image = image
  }

  // Price: extract from Scryfall's nested prices object
  if (!card.price || card.price === 0) {
    const prices = sc.prices as Record<string, string | null> | undefined
    const usd = prices?.usd
    if (usd) patch.price = Number.parseFloat(usd)
  }

  return patch as Partial<Card>
}
