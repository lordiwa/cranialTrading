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
