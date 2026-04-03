/**
 * Shared card helper utilities
 */

import type { CardCondition } from '../types/card'

/**
 * Clean card name by removing foil indicators, set codes, and collector numbers
 * Examples:
 * - "Card Name *F*" → "Card Name"
 * - "Card Name (SET) 123" → "Card Name"
 * - "Card Name (PLST) KHM-275" → "Card Name"
 *
 * Note: Patterns use bounded quantifiers to prevent ReDoS attacks
 */
export const cleanCardName = (name: string): string => {
  // Trim first to simplify patterns (removes need for trailing \s*)
  let result = name.trim()

  // Remove foil indicator (*f, *F, *f*, *F*)
  result = result.replace(/\s{0,5}\*f\*?$/i, '')

  // Remove (SET) COLLECTOR patterns like "(PLST) KHM-275"
  result = result.replace(/\s{0,5}\([A-Z0-9]{2,10}\)\s{0,5}[A-Z]{0,5}-?\d{1,5}[a-z]?$/i, '')

  // Remove (SET) 123 patterns
  result = result.replace(/\s{0,5}\([A-Z0-9]{2,10}\)\s{0,5}\d{1,5}[a-z]?$/i, '')

  // Remove trailing (SET)
  result = result.replace(/\s{0,5}\([A-Z0-9]{2,10}\)$/i, '')

  return result.trim()
}

/**
 * Parsed deck line result
 */
interface ParsedDeckLine {
  quantity: number
  cardName: string
  setCode: string | null
  isFoil: boolean
}

/**
 * Parse a single line from a deck list
 * Returns null if line is not a valid card entry
 *
 * Handles formats like:
 * - "4 Lightning Bolt"
 * - "4x Lightning Bolt"
 * - "4 Lightning Bolt (M21)"
 * - "4 Lightning Bolt *F*"
 */
export const parseDeckLine = (line: string): ParsedDeckLine | null => {
  const trimmed = line.trim()
  if (!trimmed) return null

  // Check for sideboard marker
  if (trimmed.toLowerCase().includes('sideboard')) return null

  // Match: quantity (optional x) followed by card name
  const match = /^(\d+)x?\s+(.+)$/.exec(trimmed)
  const matchQty = match?.[1]
  const matchRemainder = match?.[2]
  if (!match || !matchQty || !matchRemainder) return null

  const quantity = Number.parseInt(matchQty, 10)
  const remainder = matchRemainder.trim()

  // Check for foil indicator in the original line
  const isFoil = /\*[fF]\*?/.test(trimmed)

  // Extract set code if present: (ABC) or (ABC123)
  const setMatch = /\(([A-Za-z0-9]+)\)/.exec(remainder)
  const setCode = setMatch?.[1] ?? null

  // Clean card name: remove foil indicators and (SET) suffix
  const cardName = remainder
    .replaceAll(/\s*\*f\*?\s*/gi, '')
    .replace(/\s+\([a-z0-9]+\).*$/i, '')
    .trim()

  return { quantity, cardName, setCode, isFoil }
}

// ============ CSV (ManaBox / Moxfield) IMPORT/EXPORT ============

/**
 * Map ManaBox condition strings to app's CardCondition type
 */
const mapCsvCondition = (condition: string): CardCondition => {
  switch (condition?.toLowerCase().trim()) {
    case 'mint': return 'M'
    case 'near_mint': return 'NM'
    case 'excellent': return 'LP'
    case 'good': return 'LP'
    case 'light_played': return 'MP'
    case 'played': return 'HP'
    case 'poor': return 'PO'
    default: return 'NM'
  }
}

/**
 * Map Moxfield condition strings to app's CardCondition type
 */
const mapMoxfieldCondition = (condition: string): CardCondition => {
  switch (condition?.trim()) {
    case 'Mint': return 'M'
    case 'Near Mint': return 'NM'
    case 'Lightly Played': return 'LP'
    case 'Moderately Played': return 'MP'
    case 'Heavily Played': return 'HP'
    case 'Damaged': return 'PO'
    default: return 'NM'
  }
}

/**
 * Map app's CardCondition to Moxfield condition string (for CSV export)
 */
const conditionToCsv = (condition: CardCondition): string => {
  switch (condition) {
    case 'M': return 'Near Mint'
    case 'NM': return 'Near Mint'
    case 'LP': return 'Lightly Played'
    case 'MP': return 'Moderately Played'
    case 'HP': return 'Heavily Played'
    case 'PO': return 'Damaged'
    default: return 'Near Mint'
  }
}

/**
 * Map app's CardCondition to ManaBox condition string (for CSV export)
 */
const conditionToManabox = (condition: CardCondition): string => {
  switch (condition) {
    case 'M': return 'mint'
    case 'NM': return 'near_mint'
    case 'LP': return 'excellent'
    case 'MP': return 'light_played'
    case 'HP': return 'played'
    case 'PO': return 'poor'
    default: return 'near_mint'
  }
}

/**
 * Download a string as a file
 */
export const downloadAsFile = (content: string, filename: string, mimeType = 'text/csv') => {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Escape a CSV field value (wrap in quotes if it contains commas or quotes)
 */
const escapeCsvField = (value: string): string => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}

/**
 * Build Moxfield-compatible CSV from card data.
 */
export const buildMoxfieldCsv = (cards: {
  name: string
  setCode: string
  quantity: number
  foil: boolean
  scryfallId: string
  price: number
  condition: CardCondition
  language?: string
}[]): string => {
  const header = 'Count,Name,Edition,Condition,Language,Foil,Collector Number,Alter,Proxy,Purchase Price'
  const lines = [header]

  for (const card of cards) {
    lines.push([
      String(card.quantity),          // Count
      escapeCsvField(card.name),      // Name
      card.setCode,                   // Edition
      conditionToCsv(card.condition), // Condition
      (card.language ?? 'en').toUpperCase(), // Language
      card.foil ? 'foil' : '',        // Foil
      '',                             // Collector Number (not stored)
      '',                             // Alter
      '',                             // Proxy
      card.price ? card.price.toFixed(2) : '', // Purchase Price
    ].join(','))
  }

  return lines.join('\n')
}

/**
 * Build ManaBox-compatible CSV from card data.
 */
export const buildManaboxCsv = (cards: {
  name: string
  setCode: string
  quantity: number
  foil: boolean
  scryfallId: string
  price: number
  condition: CardCondition
  language?: string
}[]): string => {
  const header = 'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase currency'
  const lines = [header]

  for (const card of cards) {
    lines.push([
      escapeCsvField(card.name),            // Name
      card.setCode,                         // Set code
      '',                                   // Set name (not stored)
      '',                                   // Collector number (not stored)
      card.foil ? 'foil' : '',              // Foil
      '',                                   // Rarity (not stored)
      String(card.quantity),                // Quantity
      '',                                   // ManaBox ID (not stored)
      card.scryfallId ?? '',                // Scryfall ID
      card.price ? card.price.toFixed(2) : '', // Purchase price
      '',                                   // Misprint
      '',                                   // Altered
      conditionToManabox(card.condition),   // Condition
      (card.language ?? 'en').toLowerCase(), // Language
      '',                                   // Purchase currency
    ].join(','))
  }

  return lines.join('\n')
}

/**
 * Parse a CSV line handling quoted fields (e.g. card names with commas)
 */
const parseCsvLine = (line: string): string[] => {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    // eslint-disable-next-line security/detect-object-injection
    const char = line[i]
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++ // skip escaped quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += char ?? ''
    }
  }
  fields.push(current)
  return fields
}

/**
 * Parsed CSV card result
 */
export interface ParsedCsvCard {
  name: string
  setCode: string
  quantity: number
  foil: boolean
  language?: string
  scryfallId: string
  price: number
  condition: CardCondition
}

/**
 * Map Urza's Gatherer condition labels to app's CardCondition type
 */
const mapUrzasGathererCondition = (label: string): CardCondition => {
  switch (label.toLowerCase().trim()) {
    case 'mint': return 'M'
    case 'near mint': return 'NM'
    case 'excellent': return 'LP'
    case 'good': return 'LP'
    case 'light played': return 'MP'
    case 'played': return 'HP'
    case 'poor': return 'PO'
    default: return 'NM'
  }
}

/**
 * Map Urza's Gatherer language string (e.g. "1xEnglish") to ISO code
 */
const mapUgLanguage = (langStr: string): string | undefined => {
  if (!langStr.trim()) return undefined
  // Extract language name: strip "NxLanguage" prefix from first segment
  const firstSegment = langStr.split(',')[0]?.trim() ?? ''
  const langName = firstSegment.replace(/^\d+x/i, '').trim()
  if (!langName) return undefined
  const map: Record<string, string> = {
    english: 'en', spanish: 'es', portuguese: 'pt', french: 'fr',
    german: 'de', italian: 'it', japanese: 'ja', chinese: 'zh',
    korean: 'ko', russian: 'ru',
  }
  return map[langName.toLowerCase()]
}

/**
 * Parse Urza's Gatherer condition string (e.g. "2xMint, 1xNear mint")
 * into an array of { condition, count } entries.
 */
export const parseUrzasGathererConditions = (
  conditionStr: string,
  totalCount: number,
): { condition: CardCondition; count: number }[] => {
  if (!conditionStr.trim()) {
    return [{ condition: 'NM', count: totalCount }]
  }

  const segments = conditionStr.split(', ')
  const result: { condition: CardCondition; count: number }[] = []
  let parsed = 0

  for (const seg of segments) {
    const match = /^(\d+)x(.+)$/i.exec(seg.trim())
    if (match) {
      const count = Number.parseInt(match[1]!, 10)
      const condition = mapUrzasGathererCondition(match[2]!)
      result.push({ condition, count })
      parsed += count
    }
  }

  if (result.length === 0) {
    return [{ condition: 'NM', count: totalCount }]
  }

  if (parsed < totalCount) {
    result.push({ condition: 'NM', count: totalCount - parsed })
  }

  return result
}

/**
 * Detect if text is an Urza's Gatherer CSV export.
 * UG headers contain "Foil count" AND "Multiverse ID" (unique combination).
 */
export const isUrzasGathererCsv = (text: string): boolean => {
  const lines = text.split('\n')
  if (lines.length < 2) return false
  // Skip "sep=," line if present
  const headerLine = lines[0]?.trim().startsWith('"sep=') || lines[0]?.trim().startsWith('sep=')
    ? lines[1]?.trim() ?? ''
    : lines[0]?.trim() ?? ''
  return headerLine.includes('Foil count') && headerLine.includes('Multiverse ID')
}

/**
 * Detect if text is a CSV export (ManaBox, Moxfield, or Urza's Gatherer)
 */
export const isCsvFormat = (text: string): boolean => {
  const firstLine = text.split('\n')[0]?.trim() ?? ''
  // ManaBox: headers contain "Name,Set code" or "Scryfall ID"
  // Moxfield: headers contain "Count,Name,Edition" or "Collector Number"
  return firstLine.includes('Name,Set code') || firstLine.includes('Scryfall ID')
    || firstLine.includes('Count,Name,Edition') || firstLine.includes('Collector Number')
    || isUrzasGathererCsv(text)
}

/**
 * Parse CSV text (ManaBox or Moxfield) into structured card data.
 * Auto-detects format based on header columns.
 */
export const parseCsvDeckImport = (csvText: string): ParsedCsvCard[] => {
  const lines = csvText.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  // Parse header to get column indices (flexible ordering)
  const headerLine = lines[0]
  if (!headerLine) return []
  const headers = parseCsvLine(headerLine)
  const colIndex = new Map<string, number>()
  headers.forEach((h, i) => { colIndex.set(h.trim(), i) })

  const nameIdx = colIndex.get('Name')
  // ManaBox uses "Set code", Moxfield uses "Edition"
  const setCodeIdx = colIndex.get('Set code') ?? colIndex.get('Edition')
  // ManaBox uses "Quantity", Moxfield uses "Count"
  const quantityIdx = colIndex.get('Quantity') ?? colIndex.get('Count')
  const foilIdx = colIndex.get('Foil')
  const scryfallIdx = colIndex.get('Scryfall ID')
  // ManaBox uses "Purchase price", Moxfield uses "Purchase Price"
  const priceIdx = colIndex.get('Purchase price') ?? colIndex.get('Purchase Price')
  const conditionIdx = colIndex.get('Condition')
  const languageIdx = colIndex.get('Language')

  if (nameIdx === undefined || quantityIdx === undefined) return []

  // Detect format for condition mapping:
  // ManaBox has "Set code" or "Scryfall ID"; Moxfield has "Edition" or "Count" without "Set code"
  const isManaBox = colIndex.has('Set code') || colIndex.has('Scryfall ID')
  const conditionMapper = isManaBox ? mapCsvCondition : mapMoxfieldCondition

  const getField = (fields: string[], idx: number | undefined): string => {
    if (idx === undefined) return ''
    // eslint-disable-next-line security/detect-object-injection
    return fields[idx] ?? ''
  }

  const cards: ParsedCsvCard[] = []

  for (let i = 1; i < lines.length; i++) {
    // eslint-disable-next-line security/detect-object-injection
    const line = lines[i]
    if (!line) continue
    const fields = parseCsvLine(line)
    const name = getField(fields, nameIdx).trim()
    const quantity = Number.parseInt(getField(fields, quantityIdx) || '0', 10)

    if (!name || !quantity || quantity <= 0) continue

    const lang = getField(fields, languageIdx).trim().toLowerCase()
    cards.push({
      name,
      setCode: getField(fields, setCodeIdx).trim(),
      quantity,
      foil: getField(fields, foilIdx).trim().toLowerCase() === 'foil',
      language: lang || undefined,
      scryfallId: getField(fields, scryfallIdx).trim(),
      price: Number.parseFloat(getField(fields, priceIdx) || '0') || 0,
      condition: conditionMapper(getField(fields, conditionIdx)),
    })
  }

  return cards
}

/**
 * Parse Urza's Gatherer CSV text into structured card data.
 * Handles sep=, prefix, $ prices, condition expansion, foil/non-foil split.
 */
export const parseUrzasGathererCsv = (csvText: string): ParsedCsvCard[] => {
  const lines = csvText.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  // Skip "sep=," line if present
  let startIdx = 0
  if (lines[0]?.trim().startsWith('"sep=') || lines[0]?.trim().startsWith('sep=')) {
    startIdx = 1
  }

  const headerLine = lines[startIdx]
  if (!headerLine) return []
  const headers = parseCsvLine(headerLine)
  const colIndex = new Map<string, number>()
  headers.forEach((h, i) => { colIndex.set(h.trim(), i) })

  const nameIdx = colIndex.get('Name')
  const countIdx = colIndex.get('Count')
  const foilCountIdx = colIndex.get('Foil count')
  const specialFoilIdx = colIndex.get('Special foil count')
  const setCodeIdx = colIndex.get('Set code')
  const scryfallIdx = colIndex.get('Scryfall ID')
  const priceIdx = colIndex.get('Price')
  const foilPriceIdx = colIndex.get('Foil price')
  const conditionIdx = colIndex.get('Condition')
  const languageIdx = colIndex.get('Languages')

  if (nameIdx === undefined || countIdx === undefined) return []

  const getField = (fields: string[], idx: number | undefined): string => {
    if (idx === undefined) return ''
    // eslint-disable-next-line security/detect-object-injection
    return fields[idx] ?? ''
  }

  const cards: ParsedCsvCard[] = []

  for (let i = startIdx + 1; i < lines.length; i++) {
    // eslint-disable-next-line security/detect-object-injection
    const line = lines[i]
    if (!line) continue
    const fields = parseCsvLine(line)

    const name = getField(fields, nameIdx).trim()
    const count = Number.parseInt(getField(fields, countIdx) || '0', 10)
    if (!name || count <= 0) continue

    const foilCount = Number.parseInt(getField(fields, foilCountIdx) || '0', 10)
    const specialFoilCount = Number.parseInt(getField(fields, specialFoilIdx) || '0', 10)
    const totalFoil = Math.min(foilCount + specialFoilCount, count)
    const nonFoilCount = count - totalFoil

    const setCode = getField(fields, setCodeIdx).trim()
    const scryfallId = getField(fields, scryfallIdx).trim()
    const rawPrice = getField(fields, priceIdx).replace('$', '')
    const rawFoilPrice = getField(fields, foilPriceIdx).replace('$', '')
    const price = Number.parseFloat(rawPrice) || 0
    const foilPrice = Number.parseFloat(rawFoilPrice) || 0
    const conditionStr = getField(fields, conditionIdx).trim()
    const languageStr = getField(fields, languageIdx).trim()
    const language = mapUgLanguage(languageStr)

    // Expand conditions into per-copy array
    const conditionEntries = parseUrzasGathererConditions(conditionStr, count)
    const perCopy: CardCondition[] = []
    for (const entry of conditionEntries) {
      for (let j = 0; j < entry.count; j++) {
        perCopy.push(entry.condition)
      }
    }
    // Pad to count if needed
    while (perCopy.length < count) {
      perCopy.push('NM')
    }

    // Split into non-foil (first nonFoilCount copies) and foil (rest)
    const nonFoilConditions = perCopy.slice(0, nonFoilCount)
    const foilConditions = perCopy.slice(nonFoilCount, nonFoilCount + totalFoil)

    // Aggregate non-foil by condition
    const nonFoilAgg = new Map<CardCondition, number>()
    for (const cond of nonFoilConditions) {
      nonFoilAgg.set(cond, (nonFoilAgg.get(cond) ?? 0) + 1)
    }
    for (const [cond, qty] of nonFoilAgg) {
      cards.push({ name, setCode, quantity: qty, foil: false, language, scryfallId, price, condition: cond })
    }

    // Aggregate foil by condition
    const foilAgg = new Map<CardCondition, number>()
    for (const cond of foilConditions) {
      foilAgg.set(cond, (foilAgg.get(cond) ?? 0) + 1)
    }
    for (const [cond, qty] of foilAgg) {
      cards.push({ name, setCode, quantity: qty, foil: true, language, scryfallId, price: foilPrice, condition: cond })
    }
  }

  return cards
}
