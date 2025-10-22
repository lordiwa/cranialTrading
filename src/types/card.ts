export type CardCondition = 'M' | 'NM' | 'LP' | 'MP' | 'HP' | 'PO';

export interface Card {
    id: string;
    scryfallId: string;
    name: string;
    edition: string;
    quantity: number;
    condition: CardCondition;
    foil: boolean;
    price: number;
    image: string;
    updatedAt: Date;
}

export interface ScryfallCard {
    id: string;
    name: string;
    set_name: string;
    set: string;
    collector_number: string;
    image_uris?: {
        normal: string;
        small: string;
    };
    prices: {
        usd?: string;
        usd_foil?: string;
    };
}