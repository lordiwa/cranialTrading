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
 * Check if a card is a land based on its type line
 */
export const isLandCard = (typeLine?: string): boolean => {
  return typeLine?.toLowerCase().includes('land') ?? false
}

/**
 * Get card type priority for sorting
 * Returns: 1=Creature, 2=Planeswalker, 3=Instant, 4=Sorcery, 5=Enchantment, 6=Artifact, 7=Land, 8=Other
 */
export const getCardTypePriority = (typeLine?: string): number => {
  const type = typeLine?.toLowerCase() || ''
  if (type.includes('creature')) return 1
  if (type.includes('planeswalker')) return 2
  if (type.includes('instant')) return 3
  if (type.includes('sorcery')) return 4
  if (type.includes('enchantment')) return 5
  if (type.includes('artifact')) return 6
  if (type.includes('land')) return 7
  return 8
}

/**
 * Extract foil indicator from card name
 * Returns true if name ends with *F* or similar
 */
export const hasFoilIndicator = (name: string): boolean => {
  return /\*f\*?\s{0,5}$/i.test(name)
}

/**
 * Parsed deck line result
 */
export interface ParsedDeckLine {
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

  const quantity = Number.parseInt(matchQty)
  const remainder = matchRemainder.trim()

  // Check for foil indicator in the original line
  const isFoil = /\*[fF]\*?/.test(trimmed)

  // Extract set code if present: (ABC) or (ABC123)
  const setMatch = /\(([A-Za-z0-9]+)\)/.exec(remainder)
  const setCode = setMatch?.[1] ?? null

  // Clean card name: remove foil indicators and (SET) suffix
  const cardName = remainder
    .replaceAll(/\s*\*[fF]\*?\s*/gi, '')
    .replace(/\s+\([A-Za-z0-9]+\).*$/i, '')
    .trim()

  return { quantity, cardName, setCode, isFoil }
}

// ============ CSV (ManaBox) IMPORT/EXPORT ============

/**
 * Map ManaBox condition strings to app's CardCondition type
 */
export const mapCsvCondition = (condition: string): CardCondition => {
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
 * Map app's CardCondition to Moxfield condition string (for CSV export)
 */
export const conditionToCsv = (condition: CardCondition): string => {
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
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Escape a CSV field value (wrap in quotes if it contains commas or quotes)
 */
const escapeCsvField = (value: string): string => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
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
      (card.language || 'en').toUpperCase(), // Language
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
 * Parse a CSV line handling quoted fields (e.g. card names with commas)
 */
export const parseCsvLine = (line: string): string[] => {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
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
      current += char
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
 * Detect if text is a ManaBox CSV export
 */
export const isCsvFormat = (text: string): boolean => {
  const firstLine = text.split('\n')[0]?.trim() || ''
  return firstLine.includes('Name,Set code') || firstLine.includes('Scryfall ID')
}

/**
 * Parse ManaBox CSV text into structured card data
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
  const setCodeIdx = colIndex.get('Set code')
  const quantityIdx = colIndex.get('Quantity')
  const foilIdx = colIndex.get('Foil')
  const scryfallIdx = colIndex.get('Scryfall ID')
  const priceIdx = colIndex.get('Purchase price')
  const conditionIdx = colIndex.get('Condition')
  const languageIdx = colIndex.get('Language')

  if (nameIdx === undefined || quantityIdx === undefined) return []

  const getField = (fields: string[], idx: number | undefined): string => {
    if (idx === undefined) return ''
    return fields[idx] ?? ''
  }

  const cards: ParsedCsvCard[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const fields = parseCsvLine(line)
    const name = getField(fields, nameIdx).trim()
    const quantity = Number.parseInt(getField(fields, quantityIdx) || '0')

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
      condition: mapCsvCondition(getField(fields, conditionIdx)),
    })
  }

  return cards
}
