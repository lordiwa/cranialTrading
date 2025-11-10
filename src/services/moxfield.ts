// src/services/moxfield.ts
export interface MoxfieldCard {
    quantity: number
    boardType: 'mainboard' | 'sideboard' | 'commanders'
    card: {
        name: string
        set: string
        cn: string
        scryfallId: string
    }
}

export interface MoxfieldDeck {
    name: string
    mainboard: Record<string, MoxfieldCard>
    sideboard: Record<string, MoxfieldCard>
    commanders: Record<string, MoxfieldCard>
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

export const fetchMoxfieldDeck = async (deckId: string): Promise<MoxfieldDeck | null> => {
    try {
        const response = await fetch(`https://api2.moxfield.com/v3/decks/all/${deckId}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error('Error fetching Moxfield deck:', error);
        return null;
    }
}

export const moxfieldToCardList = (deck: MoxfieldDeck, includeSideboard: boolean = false): Array<{
    quantity: number
    name: string
    setCode: string
    collectorNumber: string
    scryfallId: string
}> => {
    const cards: Array<any> = [];

    // Mainboard
    Object.values(deck.mainboard).forEach(item => {
        if (item.boardType === 'mainboard') {
            cards.push({
                quantity: item.quantity,
                name: item.card.name,
                setCode: item.card.set.toUpperCase(),
                collectorNumber: item.card.cn,
                scryfallId: item.card.scryfallId,
            });
        }
    });

    // Sideboard
    if (includeSideboard) {
        Object.values(deck.sideboard).forEach(item => {
            if (item.boardType === 'sideboard') {
                cards.push({
                    quantity: item.quantity,
                    name: item.card.name,
                    setCode: item.card.set.toUpperCase(),
                    collectorNumber: item.card.cn,
                    scryfallId: item.card.scryfallId,
                });
            }
        });
    }

    return cards;
}