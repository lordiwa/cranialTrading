export interface FilterOptions {
  name?: string
  colors?: string[]
  types?: string[]
  manaValue?: { min?: number; max?: number; even?: boolean; values?: number[] }
  rarity?: string[]
  sets?: string[]
  power?: { min?: number; max?: number }
  toughness?: { min?: number; max?: number }
  formatLegal?: string[]
  priceUSD?: { min?: number; max?: number }
  keywords?: string[]
  creatureTypes?: string[]
  isFoil?: boolean
  isFullArt?: boolean
  onlyReleased?: boolean
}

export const buildManaValueQuery = (manaValue: FilterOptions['manaValue']): string | null => {
  if (!manaValue) return null
  if (manaValue.even) return 'mv:even'

  if (manaValue.values && manaValue.values.length > 0) {
    const values = manaValue.values
    const has10Plus = values.includes(10)
    const regularValues = values.filter(v => v < 10)

    const mvParts: string[] = []
    regularValues.forEach(v => mvParts.push(`mv=${v}`))
    if (has10Plus) mvParts.push('mv>=10')

    const firstPart = mvParts[0]
    if (mvParts.length === 1 && firstPart) return firstPart
    if (mvParts.length > 1) return `(${mvParts.join(' OR ')})`
    return null
  }

  const parts: string[] = []
  if (manaValue.min !== undefined) parts.push(`mv>=${manaValue.min}`)
  if (manaValue.max !== undefined) parts.push(`mv<=${manaValue.max}`)
  return parts.length > 0 ? parts.join(' ') : null
}

export const buildRangeQuery = (
  range: { min?: number; max?: number } | undefined,
  prefix: string
): string[] => {
  if (!range) return []
  const parts: string[] = []
  if (range.min !== undefined) parts.push(`${prefix}>=${range.min}`)
  if (range.max !== undefined) parts.push(`${prefix}<=${range.max}`)
  return parts
}

export const buildArrayQuery = (items: string[] | undefined, prefix: string): string[] => {
  if (!items || items.length === 0) return []
  return items.map(item => `${prefix}${item}`)
}

export const buildKeywordsQuery = (keywords: string[] | undefined): string[] => {
  if (!keywords || keywords.length === 0) return []
  return keywords.map(kw => (kw.includes(' ') ? `o:"${kw}"` : `o:${kw}`))
}

export const buildQuery = (filters: FilterOptions): string => {
  const parts: string[] = []

  if (filters.name?.trim()) parts.push(`"${filters.name.trim()}"`)

  if (filters.colors && filters.colors.length > 0) {
    parts.push(`id<=${filters.colors.join('')}`)
  }

  parts.push(...buildArrayQuery(filters.types, 't:'))

  const mvQuery = buildManaValueQuery(filters.manaValue)
  if (mvQuery) parts.push(mvQuery)

  parts.push(
    ...buildArrayQuery(filters.rarity, 'r:'),
    ...buildArrayQuery(filters.sets, 'e:'),
    ...buildRangeQuery(filters.power, 'pow'),
    ...buildRangeQuery(filters.toughness, 'tou'),
    ...buildArrayQuery(filters.formatLegal, 'f:'),
    ...buildRangeQuery(filters.priceUSD, 'usd'),
    ...buildKeywordsQuery(filters.keywords),
  )

  if (filters.creatureTypes && filters.creatureTypes.length > 0) {
    parts.push(...filters.creatureTypes.map(ct => `t:${ct}`))
  }

  if (filters.isFoil) parts.push('is:foil')
  if (filters.isFullArt) parts.push('is:full')
  if (filters.onlyReleased) parts.push('-is:preview')

  return parts.join(' ')
}
