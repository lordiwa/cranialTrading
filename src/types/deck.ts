import type { CardCondition } from './card'

export type DeckFormat = 'vintage' | 'modern' | 'commander' | 'standard' | 'custom'

// ============================================================================
// NEW: Allocation-based types (Collection as single source of truth)
// ============================================================================

// Lightweight reference to a collection card
export interface DeckCardAllocation {
    cardId: string              // Reference to Card.id in collection
    quantity: number            // How many copies allocated to this deck
    isInSideboard: boolean
    notes?: string
    addedAt: Date
}

// Card needed but not yet owned
export interface DeckWishlistItem {
    scryfallId: string          // Scryfall ID for identification
    name: string
    edition: string
    quantity: number            // How many needed
    isInSideboard: boolean
    price: number
    image: string
    condition: CardCondition    // Desired condition
    foil: boolean               // Desired foil status
    cmc?: number                // Mana value for grouping
    type_line?: string          // Card type for grouping
    colors?: string[]           // Card colors for grouping (W, U, B, R, G)
    notes?: string
    addedAt: Date
}

// Hydrated deck card for UI display (owned cards)
export interface HydratedDeckCard {
    // From Card (collection)
    cardId: string
    scryfallId: string
    name: string
    edition: string
    condition: CardCondition
    foil: boolean
    language?: string
    price: number
    image: string
    cmc?: number              // Mana value for grouping
    type_line?: string        // Card type for grouping
    colors?: string[]         // Card colors for grouping (W, U, B, R, G)
    produced_mana?: string[]  // Colors of mana produced (for lands)

    // From DeckCardAllocation
    allocatedQuantity: number
    isInSideboard: boolean
    notes?: string
    addedAt: Date

    // Computed
    isWishlist: false
    availableInCollection: number
    totalInCollection: number
}

// Hydrated wishlist card for UI display
export interface HydratedWishlistCard {
    cardId: string            // Reference to Card.id in collection (wishlist cards are now in collection)
    scryfallId: string
    name: string
    edition: string
    condition: CardCondition
    foil: boolean
    language?: string
    price: number
    image: string
    cmc?: number              // Mana value for grouping
    type_line?: string        // Card type for grouping
    colors?: string[]         // Card colors for grouping (W, U, B, R, G)
    produced_mana?: string[]  // Colors of mana produced (for lands)
    requestedQuantity: number
    allocatedQuantity: number // Same as requestedQuantity (for unified access)
    isInSideboard: boolean
    notes?: string
    addedAt: Date

    isWishlist: true
    availableInCollection: number
    totalInCollection: number
}

// Union type for displaying deck cards (both owned and wishlist)
export type DisplayDeckCard = HydratedDeckCard | HydratedWishlistCard

// ============================================================================
// LEGACY: Keep for backward compatibility during migration
// ============================================================================

/** @deprecated Use DeckCardAllocation instead */
export interface DeckCard {
    id: string
    scryfallId: string
    name: string
    edition: string
    quantity: number
    condition: CardCondition
    foil: boolean
    isInSideboard: boolean
    price: number
    image: string
    notes?: string
    addedAt: Date
}

// ============================================================================
// Deck structure
// ============================================================================

export interface DeckStats {
    totalCards: number          // All cards (owned + wishlist)
    sideboardCards: number      // Sideboard count
    ownedCards: number          // Cards from collection
    wishlistCards: number       // Cards not yet owned
    avgPrice: number
    totalPrice: number
    completionPercentage: number // ownedCards / totalCards * 100
}

export interface Deck {
    id: string
    userId: string
    name: string
    format: DeckFormat
    description: string
    colors: string[]
    commander?: string              // Commander name (for Commander format)

    // NEW: Reference-based storage
    allocations: DeckCardAllocation[]
    wishlist: DeckWishlistItem[]

    // LEGACY: Keep for migration, will be removed
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    mainboard?: DeckCard[]
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    sideboard?: DeckCard[]

    thumbnail: string
    createdAt: Date
    updatedAt: Date
    isPublic: boolean
    stats: DeckStats
}

// For creating a new deck
export interface CreateDeckInput {
    name: string
    format: DeckFormat
    description: string
    colors: string[]
    commander?: string              // Commander name (for Commander format)
}
