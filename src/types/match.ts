import {type CardCondition} from "./card";

export type MatchStatus = 'nuevo' | 'visto' | 'activo' | 'eliminado';
export type MatchType = 'VENDO' | 'BUSCO';

export interface MatchCard {
    cardId: string;
    name: string;
    quantity: number;
    condition: CardCondition;
    price: number;
}

export interface Match {
    id: string;
    type: MatchType;
    otherUserId: string;
    otherUsername: string;
    otherLocation?: string;
    myCard?: any;
    otherCard?: any;
    otherPreference?: any;
    myPreference?: any;
    status: MatchStatus;
    createdAt: Date;
    lifeExpiresAt: Date;
    docId?: string;
}

export interface SavedMatch extends Match {
    savedAt: Date;
}

export interface DeletedMatch extends Match {
    eliminatedAt: Date;
}

export interface MatchCardInfo {
    offering: MatchCard[];
    receiving: MatchCard[];
    valueDiff: number;
    compatibility: number;
}