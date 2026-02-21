import { doc, getDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { Card } from '../types/card'

// Types

export interface StapleCard {
    name: string
    percentDecks: number
    avgCopies: number
    rank: number
}

export interface FormatStaples {
    format: string
    categories: {
        overall: StapleCard[]
        creatures: StapleCard[]
        spells: StapleCard[]
        lands: StapleCard[]
    }
    updatedAt: any
}

export interface PriceMover {
    name: string
    setName: string
    rarity: string
    image: string
    pastPrice: number
    presentPrice: number
    percentChange: number
    foil: boolean
}

export interface PriceMovers {
    winners: PriceMover[]
    losers: PriceMover[]
    sourceDate: string
    updatedAt: any
}

export type FormatKey = 'standard' | 'modern' | 'pioneer' | 'legacy' | 'vintage' | 'pauper' | 'commander'

export type MoverType = 'average_regular' | 'average_foil' | 'market_regular' | 'market_foil'

export type StapleCategory = 'overall' | 'creatures' | 'spells' | 'lands'

export interface PortfolioImpact {
    card: Card
    mover: PriceMover
    dollarChange: number   // presentPrice - pastPrice
    totalImpact: number    // dollarChange * card.quantity
}

// Service functions

export async function getFormatStaples(format: FormatKey): Promise<FormatStaples | null> {
    const ref = doc(db, 'market_data', 'staples', 'formats', format)
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    return snap.data() as FormatStaples
}

export async function getPriceMovers(type: MoverType): Promise<PriceMovers | null> {
    const ref = doc(db, 'market_data', 'movers', 'types', type)
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    return snap.data() as PriceMovers
}
