const SCRYFALL_API = 'https://api.scryfall.com'

// Rate limiter: Scryfall allows ~10 req/s, we stay safe at ~5 req/s
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 200 // ms between requests

async function rateLimitedFetch(url: string): Promise<Response> {
    const now = Date.now()
    const elapsed = now - lastRequestTime
    if (elapsed < MIN_REQUEST_INTERVAL) {
        await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - elapsed))
    }
    lastRequestTime = Date.now()

    const response = await fetch(url)

    // Retry once on 429 with backoff
    if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After')
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : 2000
        await new Promise(resolve => setTimeout(resolve, delay))
        lastRequestTime = Date.now()
        return fetch(url)
    }

    return response
}

// Cache para sugerencias (10 minutos)
const suggestionsCache = new Map<string, { results: string[], timestamp: number }>()
const SUGGESTIONS_CACHE_TTL = 10 * 60 * 1000

export interface ScryfallSet {
    id: string
    code: string
    name: string
    set_type: string
    released_at?: string
    card_count: number
    icon_svg_uri: string
    parent_set_code?: string
}

// Cache para sets (1 hora)
const SETS_CACHE_TTL = 60 * 60 * 1000

export interface ScryfallCard {
    id: string
    name: string
    set: string
    set_name: string
    collector_number: string
    rarity: string
    type_line: string
    mana_cost?: string
    cmc?: number
    colors?: string[]
    power?: string
    toughness?: string
    image_uris?: {
        small?: string
        normal?: string
        large?: string
        png?: string
        art_crop?: string
        border_crop?: string
    }
    // ✅ NUEVO: Soporte para cartas de dos caras (split cards)
    card_faces?: {
        name: string
        image_uris?: {
            small?: string
            normal?: string
            large?: string
            png?: string
            art_crop?: string
            border_crop?: string
        }
    }[]
    oracle_text?: string
    keywords?: string[]
    legalities?: Record<string, string>
    full_art?: boolean
    prices?: {
        usd?: string
        usd_foil?: string
        eur?: string
        tix?: string
    }
}

/**
 * Búsqueda por nombre O query Scryfall compleja
 *
 * Ejemplos:
 * - searchCards('Black Lotus') → busca exacto
 * - searchCards('"Teferi" c:u') → Teferi azul
 * - searchCards('"Teferi" (c:u OR c:w)') → Teferi azul o blanco
 */
export const searchCards = async (query: string): Promise<ScryfallCard[]> => {
    try {
        if (!query || query.trim().length === 0) return []

        const trimmedQuery = query.trim()

        // Si es una query compleja (contiene : o OR o ! o ya tiene comillas), usar directamente
        // Si no, es un nombre simple - envolverlo en comillas
        const isComplexQuery = trimmedQuery.includes(':') ||
                               trimmedQuery.includes('OR') ||
                               trimmedQuery.startsWith('!') ||
                               trimmedQuery.startsWith('"')
        const finalQuery = isComplexQuery ? trimmedQuery : `"${trimmedQuery}"`

        const encodedQuery = encodeURIComponent(finalQuery)

        console.log(`🔍 Query enviada a Scryfall: ${finalQuery}`)

        const response = await rateLimitedFetch(
            `${SCRYFALL_API}/cards/search?q=${encodedQuery}&unique=prints&order=released&dir=desc`
        )

        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`⚠️ No se encontraron cartas: ${finalQuery}`)
                return []
            }
            throw new Error(`Scryfall API error: ${response.status}`)
        }

        const data = await response.json()
        const results = data.data || []
        console.log(`✅ ${results.length} cartas encontradas`)
        return results
    } catch (error) {
        console.error('Error en searchCards:', error)
        return []
    }
}

/**
 * Obtener carta por ID
 */
export const getCardById = async (id: string): Promise<ScryfallCard | null> => {
    try {
        const response = await rateLimitedFetch(`${SCRYFALL_API}/cards/${id}`)

        if (!response.ok) {
            throw new Error(`Scryfall API error: ${response.status}`)
        }

        return await response.json()
    } catch (error) {
        console.error('Error en getCardById:', error)
        return null
    }
}

/**
 * Búsqueda avanzada con query string de Scryfall
 * Ejemplo: searchAdvanced('type:creature color:blue')
 * ✅ MEJORADO: Manejo mejor de errores y rate limiting
 */
export const searchAdvanced = async (
    query: string,
    options?: {
        unique?: 'cards' | 'prints' | 'art'
        order?: 'name' | 'set' | 'released' | 'rarity' | 'color' | 'usd' | 'tix' | 'eur' | 'power' | 'toughness' | 'edhrec' | 'penny' | 'artist'
        dir?: 'asc' | 'desc'
        include_extras?: boolean
        include_multilingual?: boolean
        page?: number
    }
): Promise<ScryfallCard[]> => {
    try {
        // Validar query no vacía
        if (!query || query.trim().length === 0) {
            console.warn('⚠️ Query vacía')
            return []
        }

        const params = new URLSearchParams()
        params.append('q', query.trim())
        params.append('unique', options?.unique || 'prints')
        if (options?.order) params.append('order', options.order)
        if (options?.dir) params.append('dir', options.dir)
        if (options?.page) params.append('page', options.page.toString())

        console.log(`🔍 Buscando con query: ${query}`)

        const response = await rateLimitedFetch(`${SCRYFALL_API}/cards/search?${params.toString()}`)

        if (!response.ok) {
            if (response.status === 404) {
                console.warn('⚠️ No se encontraron cartas con estos filtros')
                return []
            }
            throw new Error(`Scryfall API error: ${response.status}`)
        }

        const data = await response.json()
        const results = data.data || []
        console.log(`✅ ${results.length} cartas encontradas`)
        return results
    } catch (error) {
        console.error('Error en searchAdvanced:', error)
        return []
    }
}

/**
 * Búsqueda de cartas por múltiples criterios
 * ✅ NUEVO: Búsqueda con validación y manejo avanzado
 */
export const searchByMultipleCriteria = async (
    name?: string,
    type?: string,
    color?: string,
    set?: string
): Promise<ScryfallCard[]> => {
    const parts: string[] = []

    if (name?.trim()) {
        parts.push(`"${name.trim()}"`)
    }
    if (type?.trim()) {
        parts.push(`t:${type}`)
    }
    if (color?.trim()) {
        parts.push(`c:${color}`)
    }
    if (set?.trim()) {
        parts.push(`e:${set}`)
    }

    if (parts.length === 0) {
        return []
    }

    return searchAdvanced(parts.join(' '), {
        unique: 'prints',
        order: 'released',
        dir: 'desc',
    })
}

/**
 * Obtener sugerencias de cartas (autocomplete)
 * ✅ MEJORADO: Con caché para respuestas más rápidas
 */
export const getCardSuggestions = async (query: string): Promise<string[]> => {
    try {
        if (!query || query.trim().length < 2) {
            return []
        }

        const trimmedQuery = query.trim().toLowerCase()

        // Verificar caché
        const cached = suggestionsCache.get(trimmedQuery)
        if (cached && Date.now() - cached.timestamp < SUGGESTIONS_CACHE_TTL) {
            return cached.results
        }

        const encodedQuery = encodeURIComponent(trimmedQuery)
        const response = await rateLimitedFetch(
            `${SCRYFALL_API}/cards/autocomplete?q=${encodedQuery}`
        )

        if (!response.ok) {
            return []
        }

        const data = await response.json()
        const results = data.data || []

        // Guardar en caché
        suggestionsCache.set(trimmedQuery, { results, timestamp: Date.now() })

        // Limpiar caché viejo (máximo 100 queries)
        if (suggestionsCache.size > 100) {
            const oldestKey = suggestionsCache.keys().next().value
            if (oldestKey) suggestionsCache.delete(oldestKey)
        }

        return results
    } catch (error) {
        console.error('Error en getCardSuggestions:', error)
        return []
    }
}

/**
 * Obtener cartas por color
 * ✅ NUEVO: Filtro específico por color
 */
export const getCardsByColor = async (color: string): Promise<ScryfallCard[]> => {
    return searchAdvanced(`c:${color}`, {
        unique: 'prints',
        order: 'released',
        dir: 'desc',
    })
}

/**
 * Obtener cartas por tipo
 * ✅ NUEVO: Filtro específico por tipo
 */
export const getCardsByType = async (type: string): Promise<ScryfallCard[]> => {
    return searchAdvanced(`t:${type}`, {
        unique: 'prints',
        order: 'released',
        dir: 'desc',
    })
}

/**
 * Obtener cartas por set/edición
 * ✅ NUEVO: Filtro específico por set
 */
export const getCardsBySet = async (setCode: string): Promise<ScryfallCard[]> => {
    return searchAdvanced(`e:${setCode}`, {
        unique: 'prints',
        order: 'released',
        dir: 'desc',
    })
}

/**
 * Obtener cartas dentro de rango de precio
 * ✅ NUEVO: Filtro por precio
 */
export const getCardsByPrice = async (
    minPrice: number,
    maxPrice: number
): Promise<ScryfallCard[]> => {
    return searchAdvanced(`usd>=${minPrice} usd<=${maxPrice}`, {
        unique: 'prints',
        order: 'usd',
        dir: 'desc',
    })
}

/**
 * Obtener cartas por palabra clave
 * ✅ NUEVO: Filtro por habilidad
 */
export const getCardsByKeyword = async (keyword: string): Promise<ScryfallCard[]> => {
    return searchAdvanced(`kw:${keyword}`, {
        unique: 'prints',
        order: 'released',
        dir: 'desc',
    })
}

/**
 * Obtener cartas por rango de mana value
 * ✅ NUEVO: Filtro por mana cost
 */
export const getCardsByManaValue = async (
    min: number,
    max: number
): Promise<ScryfallCard[]> => {
    return searchAdvanced(`mv>=${min} mv<=${max}`, {
        unique: 'prints',
        order: 'released',
        dir: 'desc',
    })
}

/**
 * Obtener cartas por rarity
 * ✅ NUEVO: Filtro por rareza
 */
export const getCardsByRarity = async (rarity: string): Promise<ScryfallCard[]> => {
    return searchAdvanced(`r:${rarity}`, {
        unique: 'prints',
        order: 'released',
        dir: 'desc',
    })
}

/**
 * Obtener cartas por formato legal
 * ✅ NUEVO: Filtro por formato
 */
export const getCardsByFormat = async (format: string): Promise<ScryfallCard[]> => {
    return searchAdvanced(`f:${format}`, {
        unique: 'prints',
        order: 'released',
        dir: 'desc',
    })
}

/**
 * Obtener cartas foil
 * ✅ NUEVO: Filtro para foil
 */
export const getFoilCards = async (): Promise<ScryfallCard[]> => {
    return searchAdvanced('is:foil', {
        unique: 'prints',
        order: 'released',
        dir: 'desc',
    })
}

/**
 * Obtener cartas full art
 * ✅ NUEVO: Filtro para full art
 */
export const getFullArtCards = async (): Promise<ScryfallCard[]> => {
    return searchAdvanced('is:full', {
        unique: 'prints',
        order: 'released',
        dir: 'desc',
    })
}

/**
 * Obtener cartas por power/toughness
 * ✅ NUEVO: Filtro por poder/resistencia
 */
export const getCardsByPowerToughness = async (
    minPower: number,
    maxPower: number,
    minToughness: number,
    maxToughness: number
): Promise<ScryfallCard[]> => {
    return searchAdvanced(
        `pow>=${minPower} pow<=${maxPower} tou>=${minToughness} tou<=${maxToughness}`,
        {
            unique: 'prints',
            order: 'released',
            dir: 'desc',
        }
    )
}

/**
 * ✅ NUEVO: Obtener múltiples cartas en un solo request (hasta 75 por batch)
 * Usa el endpoint /cards/collection de Scryfall
 */
export const getCardsByIds = async (
    identifiers: ({ id: string } | { name: string })[]
): Promise<ScryfallCard[]> => {
    if (identifiers.length === 0) return []

    const results: ScryfallCard[] = []
    const BATCH_SIZE = 75

    // Procesar en batches de 75
    for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
        const batch = identifiers.slice(i, i + BATCH_SIZE)
        let retries = 3

        while (retries > 0) {
            try {
                // Respect rate limit
                const now = Date.now()
                const elapsed = now - lastRequestTime
                if (elapsed < MIN_REQUEST_INTERVAL) {
                    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - elapsed))
                }
                lastRequestTime = Date.now()

                const response = await fetch(`${SCRYFALL_API}/cards/collection`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ identifiers: batch }),
                })

                if (!response.ok) {
                    if (response.status === 429) {
                        const retryAfter = response.headers.get('Retry-After')
                        const delay = retryAfter ? parseInt(retryAfter) * 1000 : 2000
                        await new Promise(resolve => setTimeout(resolve, delay))
                        retries--
                        continue
                    }
                    console.error(`Scryfall collection API error: ${response.status}`)
                    break
                }

                const data = await response.json()
                if (data.data) {
                    results.push(...data.data)
                }
                break // Success, exit retry loop
            } catch (error) {
                console.error('Error en getCardsByIds batch:', error)
                retries--
            }
        }

        // Pequeña pausa entre batches para evitar rate limiting
        if (i + BATCH_SIZE < identifiers.length) {
            await new Promise(resolve => setTimeout(resolve, 50))
        }
    }

    console.log(`✅ Obtenidas ${results.length}/${identifiers.length} cartas en batch`)
    return results
}

/**
 * ✅ NUEVO: Obtener todas las ediciones/sets de Magic
 * Usa el endpoint /sets de Scryfall con caché de 1 hora
 */
let cachedSets: { sets: ScryfallSet[], timestamp: number } | null = null

export const getAllSets = async (): Promise<ScryfallSet[]> => {
    try {
        // Verificar caché
        if (cachedSets && Date.now() - cachedSets.timestamp < SETS_CACHE_TTL) {
            console.log('⚡ Usando caché para sets')
            return cachedSets.sets
        }

        console.log('🔍 Obteniendo sets de Scryfall...')
        const response = await rateLimitedFetch(`${SCRYFALL_API}/sets`)

        if (!response.ok) {
            throw new Error(`Scryfall sets API error: ${response.status}`)
        }

        const data = await response.json()
        const allSets: ScryfallSet[] = data.data || []

        // Filtrar solo sets relevantes (excluir tokens, memorabilia, etc.)
        const relevantTypes = ['core', 'expansion', 'masters', 'draft_innovation', 'commander', 'starter', 'reprint', 'box', 'from_the_vault', 'premium_deck', 'duel_deck', 'archenemy', 'planechase', 'conspiracy']
        const filteredSets = allSets.filter(set =>
            relevantTypes.includes(set.set_type) &&
            set.card_count > 0
        )

        // Ordenar por fecha de lanzamiento (más reciente primero)
        filteredSets.sort((a, b) => {
            if (!a.released_at) return 1
            if (!b.released_at) return -1
            return new Date(b.released_at).getTime() - new Date(a.released_at).getTime()
        })

        // Guardar en caché
        cachedSets = { sets: filteredSets, timestamp: Date.now() }

        console.log(`✅ ${filteredSets.length} sets obtenidos`)
        return filteredSets
    } catch (error) {
        console.error('Error en getAllSets:', error)
        return []
    }
}