// src/types/card.ts
export type CardCondition = 'M' | 'NM' | 'LP' | 'MP' | 'HP' | 'PO';
export type CardStatus = 'collection' | 'sale' | 'trade' | 'wishlist';

// Card in collection - Single Source of Truth
export interface Card {
    id: string;
    scryfallId: string;
    name: string;
    edition: string;
    quantity: number;           // Total copies owned
    condition: CardCondition;
    foil: boolean;
    price: number;
    image: string;
    status: CardStatus;
    public?: boolean;           // Visible on user's public profile
    deckName?: string | null;   // Legacy field for deck association
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
