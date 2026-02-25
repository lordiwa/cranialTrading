// src/types/card.ts
export type CardCondition = 'M' | 'NM' | 'LP' | 'MP' | 'HP' | 'PO';
export type CardStatus = 'collection' | 'sale' | 'trade' | 'wishlist';

// Card in collection - Single Source of Truth
export interface Card {
    id: string;
    scryfallId: string;
    name: string;
    edition: string;
    setCode?: string;           // Set code (e.g., "MH2") for price lookups
    quantity: number;           // Total copies owned
    condition: CardCondition;
    foil: boolean;
    language?: string;
    price: number;
    image: string;
    status: CardStatus;
    public?: boolean;           // Visible on user's public profile
    deckName?: string | null;   // Legacy field for deck association
    cmc?: number;               // Converted mana cost (mana value)
    type_line?: string;         // Card type (e.g., "Creature — Human Wizard")
    colors?: string[];          // Card colors (W, U, B, R, G)
    rarity?: string;            // Rarity (common, uncommon, rare, mythic)
    power?: string;             // Creature power (e.g., "3", "*")
    toughness?: string;         // Creature toughness (e.g., "4", "*")
    oracle_text?: string;       // Rules text
    keywords?: string[];        // Keyword abilities (e.g., ["flying", "trample"])
    legalities?: Record<string, string>; // Format legality (e.g., { standard: "legal", modern: "legal" })
    full_art?: boolean;         // Whether the card is full art
    createdAt?: Date;
    updatedAt: Date;
}

// Allocation info for a card (which decks use it)
export interface DeckAllocation {
    deckId: string;
    deckName: string;
    quantity: number;
    isInSideboard: boolean;
}

// Card with computed allocation data (for UI display)
export interface CardWithAllocation extends Card {
    allocatedQuantity: number;      // Sum of all deck allocations
    availableQuantity: number;      // quantity - allocatedQuantity
    allocations: DeckAllocation[];  // Which decks use this card
}

// Scryfall API card response - re-export from service
export type { ScryfallCard } from '../services/scryfall'
