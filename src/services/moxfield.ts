// src/services/moxfield.ts

export interface MoxfieldCard {
    quantity: number
    boardType: string
    card: {
        name: string
        set: string
        cn: string
        scryfall_id: string
    }
}

export interface MoxfieldBoard {
    count: number
    cards: Record<string, MoxfieldCard>
}

export interface MoxfieldDeck {
    name: string
    format?: string
    boards: {
        mainboard: MoxfieldBoard
        sideboard: MoxfieldBoard
        commanders: MoxfieldBoard
    }
}

export const extractDeckId = (input: string): string | null => {
    // Si es un link: https://moxfield.com/decks/tiIftnM5wUC29k6F5KisRw
    const linkMatch = input.match(/moxfield\.com\/decks\/([a-zA-Z0-9_-]+)/);
    if (linkMatch) {
        return linkMatch[1];
    }

    // Si es solo el ID
    if (/^[a-zA-Z0-9_-]+$/.test(input.trim())) {
        return input.trim();
    }

    return null;
}

export const fetchMoxfieldDeck = async (deckId: string): Promise<{ data: MoxfieldDeck | null; error?: string }> => {
    try {
        // Usar Cloudflare Worker como proxy para evitar CORS/Cloudflare
        const response = await fetch(`https://moxfield-proxy.srparca.workers.dev?id=${deckId}`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return {
                data: null,
                error: errorData.error || `Error ${response.status}: No se pudo obtener el deck`
            };
        }

        return { data: await response.json() };
    } catch (error) {
        // Si el worker no está disponible, mostrar instrucciones
        return {
            data: null,
            error: 'MOXFIELD_LINK_DETECTED'
        };
    }
}

export const moxfieldToCardList = (deck: MoxfieldDeck, includeSideboard: boolean = true): Array<{
    quantity: number
    name: string
    setCode: string
    collectorNumber: string
    scryfallId: string
    isInSideboard: boolean
    isCommander: boolean
}> => {
    const cards: Array<any> = [];

    // Commanders (para Commander format)
    if (deck.boards?.commanders?.cards) {
        Object.values(deck.boards.commanders.cards).forEach(item => {
            cards.push({
                quantity: item.quantity,
                name: item.card.name,
                setCode: item.card.set.toUpperCase(),
                collectorNumber: item.card.cn,
                scryfallId: item.card.scryfall_id,
                isInSideboard: false,
                isCommander: true,
            });
        });
    }

    // Mainboard
    if (deck.boards?.mainboard?.cards) {
        Object.values(deck.boards.mainboard.cards).forEach(item => {
            cards.push({
                quantity: item.quantity,
                name: item.card.name,
                setCode: item.card.set.toUpperCase(),
                collectorNumber: item.card.cn,
                scryfallId: item.card.scryfall_id,
                isInSideboard: false,
                isCommander: false,
            });
        });
    }

    // Sideboard (siempre incluir por defecto)
    if (includeSideboard && deck.boards?.sideboard?.cards) {
        Object.values(deck.boards.sideboard.cards).forEach(item => {
            cards.push({
                quantity: item.quantity,
                name: item.card.name,
                setCode: item.card.set.toUpperCase(),
                collectorNumber: item.card.cn,
                scryfallId: item.card.scryfall_id,
                isInSideboard: true,
                isCommander: false,
            });
        });
    }

    return cards;
}

// Helper para obtener conteos del deck
export const getMoxfieldDeckCounts = (deck: MoxfieldDeck): { mainboard: number; sideboard: number; commanders: number } => {
    return {
        mainboard: deck.boards?.mainboard?.count || 0,
        sideboard: deck.boards?.sideboard?.count || 0,
        commanders: deck.boards?.commanders?.count || 0,
    };
}
