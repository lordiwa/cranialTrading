import { ScryfallCard } from '../types/card';

const SCRYFALL_API = 'https://api.scryfall.com';

export const searchCards = async (query: string): Promise<ScryfallCard[]> => {
    if (!query || query.length < 2) return [];

    try {
        const response = await fetch(
            `${SCRYFALL_API}/cards/search?q=${encodeURIComponent(query)}&unique=prints`
        );

        if (!response.ok) {
            if (response.status === 404) return [];
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