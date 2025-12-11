/**
 * Servicio para interactuar con la API de Scryfall
 * https://scryfall.com/docs/api
 */

const SCRYFALL_API = 'https://api.scryfall.com'

/**
 * BUSCAR cartas por nombre
 * Query syntax: https://scryfall.com/docs/syntax
 *
 * Ejemplos:
 * - "Black Lotus" → Busca exacta por nombre
 * - "black" → Busca cartas que contengan "black" en el nombre
 * - "type:creature" → Busca por tipo
 */
export const searchCards = async (query: string) => {
    // Validar que hay query
    if (!query || query.trim().length === 0) {
        console.warn('⚠️ Empty search query')
        return []
    }

    try {
        // ✅ IMPORTANTE: Scryfall espera exactamente:
        // /cards/search?q=<query>
        //
        // ❌ INCORRECTO (lo que estaba pasando):
        // /cards/search?q=!%22ragavan%22&unique=prints&order=released
        //
        // El símbolo ! significa "exclusión" en Scryfall
        // Las comillas %22 se usan mal

        // ✅ CORRECTO: Simplemente el nombre de la carta
        const encodedQuery = encodeURIComponent(query.trim())
        const url = `${SCRYFALL_API}/cards/search?q=${encodedQuery}&unique=prints&order=released`

        console.log(`🔍 Searching Scryfall: "${query}"`)
        console.log(`📡 URL: ${url}`)

        const response = await fetch(url)

        // Manejar errores HTTP
        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`⚠️ No cards found for: "${query}"`)
                return []
            }

            const errorData = await response.json().catch(() => ({}))
            console.error(`❌ Scryfall API error (${response.status}):`, errorData)
            throw new Error(`Scryfall API error: ${response.status}`)
        }

        const data = await response.json()

        // Validar que tenemos resultados
        if (!data.data || data.data.length === 0) {
            console.warn(`⚠️ No results for: "${query}"`)
            return []
        }

        // Mapear resultados a formato utilizable
        const results = data.data.map((card: any) => ({
            id: card.id,
            scryfallId: card.id,
            name: card.name,
            edition: card.set_name || card.set,
            editionCode: card.set,
            image: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || '',
            price: parseFloat(card.prices?.usd || card.prices?.eur || '0') || 0,
            type: card.type_line || '',
            cmc: card.cmc || 0,
            rarity: card.rarity || 'common',
        }))

        console.log(`✅ Found ${results.length} cards for: "${query}"`)
        return results

    } catch (error) {
        console.error(`❌ Error searching Scryfall: ${error}`)

        // Si es un error de red o timeout, mostrar mensaje amigable
        if (error instanceof TypeError) {
            console.error('⚠️ Network error - check your connection')
        }

        return []
    }
}

/**
 * OBTENER carta por ID de Scryfall
 */
export const getCardById = async (scryfallId: string) => {
    if (!scryfallId) {
        console.warn('⚠️ No scryfallId provided')
        return null
    }

    try {
        const url = `${SCRYFALL_API}/cards/${scryfallId}`
        console.log(`🔍 Fetching card: ${scryfallId}`)

        const response = await fetch(url)

        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`⚠️ Card not found: ${scryfallId}`)
                return null
            }

            const errorData = await response.json().catch(() => ({}))
            console.error(`❌ Scryfall API error (${response.status}):`, errorData)
            throw new Error(`Scryfall API error: ${response.status}`)
        }

        const card = await response.json()

        return {
            id: card.id,
            scryfallId: card.id,
            name: card.name,
            edition: card.set_name || card.set,
            editionCode: card.set,
            image: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || '',
            price: parseFloat(card.prices?.usd || card.prices?.eur || '0') || 0,
            type: card.type_line || '',
            cmc: card.cmc || 0,
            rarity: card.rarity || 'common',
        }

    } catch (error) {
        console.error(`❌ Error fetching card: ${error}`)
        return null
    }
}

/**
 * OBTENER cartas por nombre exacto
 * Útil cuando necesitas busca más precisa
 */
export const searchCardsByExactName = async (exactName: string) => {
    if (!exactName) return []

    try {
        // Usar la query de búsqueda exacta: !"nombre"
        const query = `!"${exactName}"`
        const encodedQuery = encodeURIComponent(query)
        const url = `${SCRYFALL_API}/cards/search?q=${encodedQuery}&unique=prints&order=released`

        console.log(`🔍 Exact search: "${exactName}"`)

        const response = await fetch(url)

        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`⚠️ No exact match found for: "${exactName}"`)
                return []
            }
            throw new Error(`Scryfall API error: ${response.status}`)
        }

        const data = await response.json()

        if (!data.data || data.data.length === 0) {
            console.warn(`⚠️ No exact results for: "${exactName}"`)
            return []
        }

        const results = data.data.map((card: any) => ({
            id: card.id,
            scryfallId: card.id,
            name: card.name,
            edition: card.set_name || card.set,
            editionCode: card.set,
            image: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || '',
            price: parseFloat(card.prices?.usd || card.prices?.eur || '0') || 0,
            type: card.type_line || '',
            cmc: card.cmc || 0,
            rarity: card.rarity || 'common',
        }))

        console.log(`✅ Found ${results.length} exact matches for: "${exactName}"`)
        return results

    } catch (error) {
        console.error(`❌ Error in exact search: ${error}`)
        return []
    }
}

/**
 * VALIDAR que una carta existe en Scryfall
 */
export const validateCard = async (name: string, edition?: string) => {
    if (!name) return false

    try {
        let query = name
        if (edition) {
            query = `${name} set:${edition}`
        }

        const results = await searchCards(query)
        return results.length > 0

    } catch (error) {
        console.error(`❌ Error validating card: ${error}`)
        return false
    }
}

/**
 * Obtener sugerencias (autocomplete)
 * Scryfall cataloga automáticamente las cartas
 */
export const getSuggestions = async (partial: string) => {
    if (!partial || partial.length < 2) return []

    try {
        const results = await searchCards(partial)
        // Retornar solo los nombres únicos
        return [...new Set(results.map(r => r.name))]
    } catch (error) {
        console.error(`❌ Error getting suggestions: ${error}`)
        return []
    }
}

export default {
    searchCards,
    getCardById,
    searchCardsByExactName,
    validateCard,
    getSuggestions,
}