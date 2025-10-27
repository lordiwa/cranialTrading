export interface ParsedCard {
    quantity: number
    name: string
    setCode: string
    collectorNumber: string
}

export interface ParsedDeck {
    mainboard: ParsedCard[]
    sideboard: ParsedCard[]
}

export function parseMoxfieldDeck(text: string): ParsedDeck {
    const lines = text.trim().split('\n')
    const mainboard: ParsedCard[] = []
    const sideboard: ParsedCard[] = []

    let inSideboard = false

    for (const line of lines) {
        const trimmed = line.trim()

        if (trimmed === 'SIDEBOARD:') {
            inSideboard = true
            continue
        }

        if (!trimmed || trimmed.startsWith('//')) continue

        // Regex: 3 Arid Mesa (MH2) 244
        const match = trimmed.match(/^(\d+)\s+(.+?)\s+\(([A-Z0-9]+)\)\s+(\S+)$/)

        if (match) {
            const [, qty, name, set, number] = match
            const card: ParsedCard = {
                quantity: parseInt(qty),
                name: name.trim(),
                setCode: set,
                collectorNumber: number,
            }

            if (inSideboard) {
                sideboard.push(card)
            } else {
                mainboard.push(card)
            }
        }
    }

    return { mainboard, sideboard }
}