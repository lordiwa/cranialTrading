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
    const linkMatch = /moxfield\.com\/decks\/([a-zA-Z0-9_-]+)/.exec(input);
    const deckId = linkMatch?.[1];
    if (deckId) {
        return deckId;
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
            const errorData = await response.json().catch(() => ({})) as { error?: string };
            return {
                data: null,
                error: errorData.error ?? `Error ${response.status}: No se pudo obtener el deck`
            };
        }

        return { data: await response.json() as MoxfieldDeck };
    } catch {
        // Si el worker no está disponible, mostrar instrucciones
        return {
            data: null,
            error: 'MOXFIELD_LINK_DETECTED'
        };
    }
}

/**
 * TASK-196 — coercion de la cantidad que llega de Moxfield.
 *
 * Moxfield es un tercero: el tipo `quantity: number` es una promesa que
 * TypeScript no puede hacer cumplir en ejecucion. Una sola carta sin el campo
 * bastaba para que la suma diera NaN y el boton dijera "IMPORT NAN CARDS".
 *
 * Un string numerico se acepta (cambio de tipo, no dato corrupto). Se rechaza
 * todo lo demas, y ademas lo negativo y lo fraccionario: no existe media carta,
 * y un -2 restaria del total en silencio. Devuelve null en vez de 0 para que
 * quien llama pueda DISTINGUIR "cantidad ausente" de "cantidad cero", que es
 * legitima.
 */
const coerceQuantity = (value: unknown): number | null => {
    let n: number
    if (typeof value === 'number') n = value
    else if (typeof value === 'string' && value.trim() !== '') n = Number(value.trim())
    else return null
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null
    return n
}

/**
 * TASK-196 — cuenta cartas de un board sin poder devolver NaN nunca.
 *
 * Devuelve tambien cuantas se descartaron: quien llama decide que hacer con un
 * mazo incompleto (mostrar un error, deshabilitar el boton), y para eso necesita
 * saber que hubo descartes. Tragarselos en silencio seria cambiar un NaN visible
 * por una perdida invisible, que es peor.
 */
export const countMoxfieldCards = (
    cards?: Record<string, MoxfieldCard>
): { total: number; invalid: number } => {
    if (!cards) return { total: 0, invalid: 0 }
    let total = 0
    let invalid = 0
    for (const item of Object.values(cards)) {
        const qty = coerceQuantity(item?.quantity)
        if (qty == null) invalid++
        else total += qty
    }
    return { total, invalid }
}

export const moxfieldToCardList = (deck: MoxfieldDeck, includeSideboard = true): {
    quantity: number
    name: string
    setCode: string
    collectorNumber: string
    scryfallId: string
    isInSideboard: boolean
    isCommander: boolean
}[] => {
    const cards: {
        quantity: number
        name: string
        setCode: string
        collectorNumber: string
        scryfallId: string
        isInSideboard: boolean
        isCommander: boolean
    }[] = [];

    // TASK-196: los tres bloques (commanders / mainboard / sideboard) eran
    // codigo IDENTICO copiado tres veces, y ninguno tenia guarda: una carta sin
    // `set` reventaba con TypeError en .toUpperCase() A MITAD del import,
    // dejando estado parcial. Ahora hay UN solo camino — si vuelve a faltar una
    // guarda, falta en los tres a la vez y los tests lo ven (Regla 6).
    //
    // Una carta inservible se DESCARTA en vez de tumbar el mazo entero: el
    // usuario prefiere 99 de 100 cartas antes que un error a mitad de camino.
    const pushBoard = (
        board: Record<string, MoxfieldCard> | undefined,
        opts: { isInSideboard: boolean; isCommander: boolean }
    ) => {
        if (!board) return;
        for (const item of Object.values(board)) {
            const card = item?.card;
            const quantity = coerceQuantity(item?.quantity);
            // Sin nombre no hay nada que importar, y sin cantidad utilizable
            // tampoco. `set` puede faltar: se degrada a cadena vacia, que es lo
            // que ya hacen las importaciones por texto plano.
            if (!card?.name || quantity == null) continue;
            cards.push({
                quantity,
                name: card.name,
                setCode: typeof card.set === 'string' ? card.set.toUpperCase() : '',
                collectorNumber: card.cn ?? '',
                scryfallId: card.scryfall_id ?? '',
                ...opts,
            });
        }
    };

    pushBoard(deck.boards?.commanders?.cards, { isInSideboard: false, isCommander: true });
    pushBoard(deck.boards?.mainboard?.cards, { isInSideboard: false, isCommander: false });
    if (includeSideboard) {
        pushBoard(deck.boards?.sideboard?.cards, { isInSideboard: true, isCommander: false });
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
