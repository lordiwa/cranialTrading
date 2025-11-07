import {CardCondition} from "./card";

export type PreferenceType = 'BUSCO' | 'CAMBIO' | 'VENDO';

export interface Preference {
    id: string;
    scryfallId: string;
    name: string;
    type: PreferenceType;
    quantity: number;
    condition: CardCondition;
    edition: string;
    image: string;
    createdAt: Date;
}