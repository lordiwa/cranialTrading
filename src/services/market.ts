import { doc, getDoc } from 'firebase/firestore'
import { db } from './firestore'
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
    updatedAt: unknown
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
    updatedAt: unknown
}

export type FormatKey = 'standard' | 'modern' | 'pioneer' | 'legacy' | 'vintage' | 'pauper' | 'commander'

export type MoverType = 'average_regular' | 'average_foil' | 'market_regular' | 'market_foil'

export type StapleCategory = 'overall' | 'creatures' | 'spells' | 'lands'

export interface PortfolioImpact {
    card: Card
    mover: PriceMover
    dollarChange: number          // presentPrice - pastPrice
    totalImpact: number           // dollarChange * card.quantity
    adjustedCurrentPrice: number  // presentPrice * conditionMultiplier
    adjustedPastPrice: number     // pastPrice * conditionMultiplier
    adjustedImpact: number        // (adjustedCurrent - adjustedPast) * quantity
}

// Service functions

/**
 * TASK-314: this used to catch-and-return-null on ANY error, including a
 * genuinely failed read (network down, Firestore unreachable, permission
 * denied) — indistinguishable from "the document legitimately doesn't
 * exist yet". That swallowed the failure before `stores/market.ts`'s own
 * try/catch (which shows an error toast) ever saw it: MEASURED on dev,
 * intercepting Firestore reads, 2 aborted requests and 0 toasts shown to
 * the user. Only "document doesn't exist" is a normal null; a thrown
 * error now propagates to the caller, which is the one that can tell the
 * user about it.
 */
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
