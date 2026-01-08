/**
 * Servicio de integración con Scryfall API
 * https://scryfall.com/docs/api
 */

const SCRYFALL_API = 'https://api.scryfall.com'

export interface ScryfallCard {
    id: string
    name: string
    set_name: string
    prices: {
        usd: string | null
        usd_foil: string | null
    }
    image_uris?: {
        normal: string
        small: string
    }
    card_faces?: Array<{
        image_uris: {
            normal: string
        }
    }>
}

/**
 * Buscar cartas en Scryfall con mejor filtrado
 */
export const searchCards = async (query: string): Promise<ScryfallCard[]> => {
    try {
        const encodedQuery = encodeURIComponent(query)
        const response = await fetch(
            `${SCRYFALL_API}/cards/search?q=${encodedQuery}&unique=prints&order=released&dir=desc`
        )

        if (!response.ok) {
            throw new Error(`Scryfall API error: ${response.status}`)
        }

        const data = await response.json()
        let results = data.data || []

        // ✅ FILTRAR: Solo devolver cartas que coincidan bien con la búsqueda
        const queryLower = query.toLowerCase().trim()

        results = results.filter((card: ScryfallCard) => {
            const nameLower = card.name.toLowerCase()

            // Prioridad 1: Coincidencia exacta
            if (nameLower === queryLower) return true

            // Prioridad 2: Comienza con la búsqueda
            if (nameLower.startsWith(queryLower)) return true

            // Prioridad 3: Contiene la palabra completa (no substring)
            const words = queryLower.split(/\s+/)
            const allWordsMatch = words.every(word =>
                nameLower.includes(word)
            )
            if (allWordsMatch && words.length > 1) return true

            // Prioridad 4: La búsqueda es palabra exacta al inicio
            if (nameLower.split(' ')[0] === queryLower.split(' ')[0]) return true

            return false
        })

        // Limitar a 10 resultados máximo
        return results.slice(0, 10)
    } catch (error) {
        console.error('Error en searchCards:', error)
        throw error
    }
}

/**
 * Obtener carta por ID de Scryfall
 */
export const getCardById = async (cardId: string): Promise<ScryfallCard | null> => {
    try {
        const response = await fetch(`${SCRYFALL_API}/cards/${cardId}`)

        if (!response.ok) {
            return null
        }

        return await response.json()
    } catch (error) {
        console.error('Error en getCardById:', error)
        return null
    }
}

/**
 * Autocomplete de cartas (rápido)
 */
export const getSuggestions = async (query: string): Promise<string[]> => {
    try {
        const encodedQuery = encodeURIComponent(query)
        const response = await fetch(
            `${SCRYFALL_API}/cards/autocomplete?q=${encodedQuery}`
        )

        if (!response.ok) {
            return []
        }

        const data = await response.json()
        return data.data || []
    } catch (error) {
        console.error('Error en getSuggestions:', error)
        return []
    }
}

/**
 * Validar que una carta existe en Scryfall
 */
export const validateCard = async (name: string): Promise<boolean> => {
    try {
        const suggestions = await getSuggestions(name)
        return suggestions.length > 0
    } catch {
        return false
    }
}

/**
 * Búsqueda avanzada con filtros
 * Ejemplo: searchAdvanced("type:creature color:blue")
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
        const params = new URLSearchParams()
        params.append('q', query)
        params.append('unique', options?.unique || 'prints')
        if (options?.order) params.append('order', options.order)
        if (options?.dir) params.append('dir', options.dir)
        if (options?.page) params.append('page', options.page.toString())

        const response = await fetch(`${SCRYFALL_API}/cards/search?${params.toString()}`)

        if (!response.ok) {
            throw new Error(`Scryfall API error: ${response.status}`)
        }

        const data = await response.json()
        return data.data || []
    } catch (error) {
        console.error('Error en searchAdvanced:', error)
        return []
    }
}

/**
 * Obtener precio de una carta
 */
export const getCardPrice = async (cardId: string): Promise<number | null> => {
    try {
        const card = await getCardById(cardId)
        if (card?.prices?.usd) {
            return parseFloat(card.prices.usd)
        }
        return null
    } catch {
        return null
    }
}