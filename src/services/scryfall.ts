import { ScryfallCard } from '../types/card';

const SCRYFALL_API = 'https://api.scryfall.com';

export const searchCards = async (query: string): Promise<ScryfallCard[]> => {
    if (!query || query.length < 2) return [];

    try {
        // Usar el operador "!" para búsqueda exacta de nombre
        // Esto prioriza matches exactos primero
        const searchQuery = `!"${query}"`;

        const response = await fetch(
            `${SCRYFALL_API}/cards/search?q=${encodeURIComponent(searchQuery)}&unique=prints&order=released`
        );

        if (!response.ok) {
            if (response.status === 404) {
                // Si no hay match exacto, hacer búsqueda normal
                const fallbackResponse = await fetch(
                    `${SCRYFALL_API}/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released`
                );

                if (!fallbackResponse.ok) {
                    if (fallbackResponse.status === 404) return [];
                    throw new Error('Error searching cards');
                }

                const fallbackData = await fallbackResponse.json();
                return fallbackData.data || [];
            }
            throw new Error('Error searching cards');
        }

        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.error('Scryfall search error:', error);
        return [];
    }
};

export const getCardById = async (id: string): Promise<ScryfallCard | null> => {
    try {
        const response = await fetch(`${SCRYFALL_API}/cards/${id}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error('Scryfall get card error:', error);
        return null;
    }
};

export const getCardBySetAndNumber = async (
    setCode: string,
    collectorNumber: string
): Promise<ScryfallCard | null> => {
    try {
        const response = await fetch(
            `${SCRYFALL_API}/cards/${setCode.toLowerCase()}/${collectorNumber}`
        )
        if (!response.ok) return null
        return await response.json()
    } catch (error) {
        console.error('Scryfall get card by set error:', error)
        return null
    }
}