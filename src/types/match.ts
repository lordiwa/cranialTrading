import {CardCondition} from "./card";

export interface MatchCard {
    cardId: string;
    name: string;
    quantity: number;
    condition: CardCondition;
    price: number;
}

export interface Match {
    id: string;
    otherUserId: string;
    otherUsername: string;
    otherLocation: string;
    offering: MatchCard[];
    receiving: MatchCard[];
    valueDiff: number;
    compatibility: number;
    createdAt: Date;
}

export interface SavedMatch extends Match {
    savedAt: Date;
}