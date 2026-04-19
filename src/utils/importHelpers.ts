/**
 * Pure import helper functions for CollectionView import flows.
 * These functions have zero side effects — no store imports, no composable calls.
 *
 * Extracted from CollectionView.vue (Plan 03-A) for reuse by Plans B and C.
 */

import type { CardCondition, CardStatus } from '../types/card'
import { cleanCardName, type ParsedCsvCard } from '../utils/cardHelpers'

// ============================================================
// Shared interfaces (moved here from CollectionView.vue)
// ============================================================

/** Moxfield import card shape (from moxfieldToCardList) */
export interface MoxfieldImportCard {
  quantity: number
  name: string
  setCode: string
  collectorNumber: string
  scryfallId: string
  isInSideboard: boolean
  isCommander: boolean
}

/** Shape of a collection card being built for import (before it gets an id) */
export interface ImportCardData {
  scryfallId: string
  name: string
  edition: string
  quantity: number
  condition: CardCondition
  foil: boolean
  price: number
  image: string
  status: CardStatus
  public: boolean
  isInSideboard?: boolean
  setCode?: string
  language?: string
  cmc?: number
  type_line?: string
  colors?: string[]
  rarity?: string
  power?: string
  toughness?: string
  oracle_text?: string
  keywords?: string[]
  legalities?: Record<string, string>
  full_art?: boolean
  produced_mana?: string[]
  updatedAt: Date
  /**
   * Opaque bundle of Scryfall metadata forwarded to `functions/index.js:bulkImportCards`
   * (extracted there and written to `scryfall_cache` with admin rights).
   * The server strips this before writing the user doc, so it stays out of USER_CARD_FIELDS.
   */
  _cacheFields?: Record<string, unknown>
}

/** Extracted card data from Scryfall for building collection cards */
export interface ExtractedScryfallData {
  scryfallId: string
  name: string
  image: string
  price: number
  edition: string
  setCode: string
  cmc: number | undefined
  type_line: string
  colors: string[]
  rarity: string
  power: string | undefined
  toughness: string | undefined
  oracle_text: string | undefined
  keywords: string[]
  legalities: Record<string, string> | undefined
  full_art: boolean
  produced_mana: string[] | undefined
}

// ============================================================
// Pure helper functions (verbatim extraction from CollectionView.vue)
// ============================================================

/** Parse a single text line into card data for import (shared by deck and binder text import) */
export const parseTextImportLine = (trimmed: string): { quantity: number; cardName: string; setCode: string | null; isFoil: boolean } | null => {
  // eslint-disable-next-line security/detect-unsafe-regex
  const match = /^(\d+)x?\s+(.+?)(?:\s+\((\w+)\))?(?:\s+[\w-]+)?(?:\s+\*f\*?)?$/i.exec(trimmed)
  const matchQty = match?.[1]
  const matchName = match?.[2]
  if (!match || !matchQty || !matchName) return null

  return {
    quantity: Number.parseInt(matchQty, 10),
    cardName: cleanCardName(matchName.trim()),
    setCode: match[3] ?? null,
    isFoil: /\*[fF]\*?\s*$/.test(trimmed),
  }
}

/** Build a collection card object from text import line data + Scryfall results */
export const buildCollectionCardFromScryfall = (opts: {
  cardName: string,
  quantity: number,
  condition: CardCondition,
  isFoil: boolean,
  setCode: string | null,
  scryfallData: ExtractedScryfallData | null | undefined,
  status: CardStatus | undefined,
  makePublic: boolean,
  isInSideboard: boolean,
}): ImportCardData => {
  const { cardName, quantity, condition, isFoil, setCode, scryfallData, status, makePublic, isInSideboard } = opts
  const cardData: ImportCardData = {
    scryfallId: scryfallData?.scryfallId ?? '',
    name: cardName,
    edition: scryfallData?.edition ?? setCode ?? 'Unknown',
    quantity,
    condition,
    foil: isFoil,
    price: scryfallData?.price ?? 0,
    image: scryfallData?.image ?? '',
    status: status ?? 'collection',
    public: makePublic,
    isInSideboard,
    cmc: scryfallData?.cmc,
    type_line: scryfallData?.type_line,
    colors: scryfallData?.colors ?? [],
    rarity: scryfallData?.rarity,
    power: scryfallData?.power,
    toughness: scryfallData?.toughness,
    oracle_text: scryfallData?.oracle_text,
    keywords: scryfallData?.keywords ?? [],
    legalities: scryfallData?.legalities,
    full_art: scryfallData?.full_art ?? false,
    updatedAt: new Date(),
  }
  if (scryfallData?.setCode ?? setCode) {
    cardData.setCode = scryfallData?.setCode ?? setCode ?? undefined
  }
  return cardData
}

/**
 * Build the `_cacheFields` bundle from ExtractedScryfallData.
 * These fields are shipped to `bulkImportCards` (see functions/index.js:496) and
 * written to scryfall_cache with admin rights — bypassing the Firestore rules
 * that block client-side writes to that collection.
 *
 * Only includes non-empty fields to avoid overwriting good cache data with blanks.
 */
export const buildCacheFieldsFromScryfall = (sc: ExtractedScryfallData): Record<string, unknown> => {
  const fields: Record<string, unknown> = {}
  // id + name let the L2 cache reader (scryfallCache.ts) rebuild a usable
  // ScryfallCard object with the canonical id and matchable name — without
  // these the returned `sc.id` is undefined and `Map.set(undefined, x)`
  // collapses every card into a single key.
  if (sc.scryfallId) fields.id = sc.scryfallId
  if (sc.name) fields.name = sc.name
  if (sc.cmc !== undefined) fields.cmc = sc.cmc
  if (sc.type_line) fields.type_line = sc.type_line
  if (sc.colors.length > 0) fields.colors = sc.colors
  if (sc.rarity) fields.rarity = sc.rarity
  if (sc.power !== undefined) fields.power = sc.power
  if (sc.toughness !== undefined) fields.toughness = sc.toughness
  if (sc.oracle_text !== undefined) fields.oracle_text = sc.oracle_text
  if (sc.keywords.length > 0) fields.keywords = sc.keywords
  if (sc.legalities !== undefined) fields.legalities = sc.legalities
  if (sc.full_art) fields.full_art = sc.full_art
  if (sc.produced_mana !== undefined) fields.produced_mana = sc.produced_mana
  return fields
}

/** Build a minimal card from Moxfield import data (no Scryfall fetch needed) */
export const buildRawMoxfieldCard = (
  card: MoxfieldImportCard,
  condition: CardCondition,
  status: CardStatus | undefined,
  makePublic: boolean,
): ImportCardData => {
  let cardName = card.name
  const isFoil = /\*[fF]\*?\s*$/.test(cardName)
  if (isFoil) cardName = cardName.replace(/\s*\*[fF]\*?\s*$/, '').trim()

  // User-specific fields + convenience copies (name, edition, image)
  // Scryfall metadata (colors, keywords, etc.) lives in scryfall_cache
  return {
    scryfallId: card.scryfallId ?? '',
    name: cardName,
    edition: card.setCode?.toUpperCase() ?? 'Unknown',
    setCode: card.setCode?.toUpperCase(),
    quantity: card.quantity,
    condition,
    foil: isFoil,
    price: 0,
    image: card.scryfallId ? `https://cards.scryfall.io/normal/front/${card.scryfallId.charAt(0)}/${card.scryfallId.charAt(1)}/${card.scryfallId}.jpg` : '',
    status: status ?? 'collection',
    public: makePublic,
    updatedAt: new Date(),
  }
}

/**
 * Build an ImportCardData from a Moxfield card + optional Scryfall match.
 *
 * When Scryfall data is present:
 * - Uses buildCollectionCardFromScryfall to produce a full-metadata payload
 *   (cmc, type_line, colors, etc. go into convenience copies on the user doc).
 * - Attaches `_cacheFields` so bulkImportCards can populate scryfall_cache with
 *   admin rights (bypassing the Firestore rules that block client writes).
 *
 * When Scryfall data is missing (ID not in Scryfall / rate-limit / offline):
 * - Falls back to buildRawMoxfieldCard — exact legacy behavior, no regression.
 */
export const buildMoxfieldCardWithScryfall = (
  card: MoxfieldImportCard,
  scryfallData: ExtractedScryfallData | null | undefined,
  condition: CardCondition,
  status: CardStatus | undefined,
  makePublic: boolean,
): ImportCardData => {
  if (!scryfallData) {
    return buildRawMoxfieldCard(card, condition, status, makePublic)
  }

  let cardName = card.name
  const isFoil = /\*[fF]\*?\s*$/.test(cardName)
  if (isFoil) cardName = cardName.replace(/\s*\*[fF]\*?\s*$/, '').trim()

  const built = buildCollectionCardFromScryfall({
    cardName,
    quantity: card.quantity,
    condition,
    isFoil,
    setCode: card.setCode ?? null,
    scryfallData,
    status,
    makePublic,
    isInSideboard: card.isInSideboard ?? false,
  })

  built._cacheFields = buildCacheFieldsFromScryfall(scryfallData)
  return built
}

/** Build a minimal card from CSV import data (no Scryfall fetch needed) */
export const buildRawCsvCard = (
  card: ParsedCsvCard,
  status: CardStatus | undefined,
  makePublic: boolean,
): ImportCardData => {
  // User-specific fields + convenience copies (name, edition, image)
  // Scryfall metadata (colors, keywords, etc.) lives in scryfall_cache
  const cardData: ImportCardData = {
    scryfallId: card.scryfallId ?? '',
    name: card.name,
    edition: card.setCode?.toUpperCase() ?? 'Unknown',
    quantity: card.quantity,
    condition: card.condition,
    foil: card.foil,
    price: card.price ?? 0,
    image: card.scryfallId ? `https://cards.scryfall.io/normal/front/${card.scryfallId.charAt(0)}/${card.scryfallId.charAt(1)}/${card.scryfallId}.jpg` : '',
    status: status ?? 'collection',
    public: makePublic,
    updatedAt: new Date(),
  }
  if (card.setCode) cardData.setCode = card.setCode.toUpperCase()
  if (card.language) cardData.language = card.language
  return cardData
}
