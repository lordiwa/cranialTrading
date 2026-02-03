/**
 * Shared card helper utilities
 */

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
