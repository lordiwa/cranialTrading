export type DeckFormat = 'vintage' | 'modern' | 'commander' | 'standard' | 'custom'

export interface DeckCard {
    id: string
    scryfallId: string
    name: string
    edition: string
    quantity: number
    condition: 'M' | 'NM' | 'LP' | 'MP' | 'HP' | 'PO'
    foil: boolean
    isInSideboard: boolean
    price: number
    image: string
    notes?: string
    addedAt: Date
}

export interface DeckStats {
    totalCards: number
    sideboardCards: number
    avgPrice: number  // ✅ CAMBIÉ: era avgCardPrice
    totalPrice: number
    completionPercentage: number
}

export interface Deck {
    id: string
    userId: string
    name: string
    format: DeckFormat
    description: string
    colors: string[]
    mainboard: DeckCard[]
    sideboard: DeckCard[]
    thumbnail: string
    createdAt: Date
    updatedAt: Date
    isPublic: boolean
    stats: DeckStats
}

// Para crear un nuevo deck (sin ID, userId, etc)
export interface CreateDeckInput {
    name: string
    format: DeckFormat
    description: string
    colors: string[]
}