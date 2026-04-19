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
}

/** Extracted card data from Scryfall for building collection cards */
export interface ExtractedScryfallData {
  scryfallId: string
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
 * Apply ExtractedScryfallData metadata to an ImportCardData in-place.
 * Shared between buildRawMoxfieldCard and buildRawCsvCard (anti-loop Rule 6).
 *
 * SCRUM-27: cmc=0 is a real value (Mox Pearl, Black Lotus, Mishra's Bauble) —
 * use direct assignment, NEVER `?? undefined` or `|| undefined` (the latter nukes 0).
 */
const applyScryfallMetadata = (target: ImportCardData, data: ExtractedScryfallData): void => {
  // cmc=0 is a real value (e.g. Mox Pearl) — do not coerce
  target.cmc = data.cmc
  if (data.type_line) target.type_line = data.type_line
  target.colors = data.colors
  if (data.rarity) target.rarity = data.rarity
  if (data.power !== undefined) target.power = data.power
  if (data.toughness !== undefined) target.toughness = data.toughness
  if (data.oracle_text !== undefined) target.oracle_text = data.oracle_text
  target.keywords = data.keywords
  if (data.legalities !== undefined) target.legalities = data.legalities
  target.full_art = data.full_art
  // produced_mana: undefined is how enrichCardsWithMissingMetadata detects "missing",
  // so only copy when defined — do NOT default to []
  if (data.produced_mana !== undefined) {
    target.produced_mana = data.produced_mana
  }
}

/** Build a minimal card from Moxfield import data.
 *  When scryfallData is provided (SCRUM-27), metadata is populated at build time
 *  so cardToIndex / mana curve see correct cmc/type_line without waiting for background enrichment. */
export const buildRawMoxfieldCard = (
  card: MoxfieldImportCard,
  condition: CardCondition,
  status: CardStatus | undefined,
  makePublic: boolean,
  scryfallData?: ExtractedScryfallData | null,
): ImportCardData => {
  let cardName = card.name
  const isFoil = /\*[fF]\*?\s*$/.test(cardName)
  if (isFoil) cardName = cardName.replace(/\s*\*[fF]\*?\s*$/, '').trim()

  const fallbackImage = card.scryfallId
    ? `https://cards.scryfall.io/normal/front/${card.scryfallId.charAt(0)}/${card.scryfallId.charAt(1)}/${card.scryfallId}.jpg`
    : ''

  const cardData: ImportCardData = {
    scryfallId: scryfallData?.scryfallId || card.scryfallId || '',
    name: cardName,
    edition: (scryfallData?.edition) || card.setCode?.toUpperCase() || 'Unknown',
    setCode: scryfallData?.setCode || card.setCode?.toUpperCase(),
    quantity: card.quantity,
    condition,
    foil: isFoil,
    price: (scryfallData && scryfallData.price > 0) ? scryfallData.price : 0,
    image: (scryfallData?.image) || fallbackImage,
    status: status ?? 'collection',
    public: makePublic,
    updatedAt: new Date(),
  }

  if (scryfallData) {
    applyScryfallMetadata(cardData, scryfallData)
  }

  return cardData
}

/** Build a minimal card from CSV import data.
 *  When scryfallData is provided (SCRUM-27), metadata is populated at build time. */
export const buildRawCsvCard = (
  card: ParsedCsvCard,
  status: CardStatus | undefined,
  makePublic: boolean,
  scryfallData?: ExtractedScryfallData | null,
): ImportCardData => {
  const fallbackImage = card.scryfallId
    ? `https://cards.scryfall.io/normal/front/${card.scryfallId.charAt(0)}/${card.scryfallId.charAt(1)}/${card.scryfallId}.jpg`
    : ''

  const cardData: ImportCardData = {
    scryfallId: scryfallData?.scryfallId || card.scryfallId || '',
    name: card.name,
    edition: (scryfallData?.edition) || card.setCode?.toUpperCase() || 'Unknown',
    quantity: card.quantity,
    condition: card.condition,
    foil: card.foil,
    price: (scryfallData && scryfallData.price > 0) ? scryfallData.price : (card.price ?? 0),
    image: (scryfallData?.image) || fallbackImage,
    status: status ?? 'collection',
    public: makePublic,
    updatedAt: new Date(),
  }
  if (scryfallData?.setCode) {
    cardData.setCode = scryfallData.setCode
  } else if (card.setCode) {
    cardData.setCode = card.setCode.toUpperCase()
  }
  if (card.language) cardData.language = card.language

  if (scryfallData) {
    applyScryfallMetadata(cardData, scryfallData)
  }

  return cardData
}
