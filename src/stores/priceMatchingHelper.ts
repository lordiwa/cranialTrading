import { defineStore } from 'pinia'
import { Card } from '../types/card'
import { Preference } from '../types/preferences'

const PRICE_TOLERANCE = 0.10

export interface MatchCalculation {
    myCardIds: string[]
    myCardsInfo: Card[]
    myTotalValue: number

    theirCardIds: string[]
    theirCardsInfo: Card[]
    theirTotalValue: number

    valueDifference: number
    compatibility: number
    isValid: boolean
}

export const usePriceMatchingStore = defineStore('priceMatching', () => {

    const calculateCompatibility = (myValue: number, theirValue: number): number => {
        if (myValue === 0 && theirValue === 0) return 100
        if (myValue === 0 || theirValue === 0) return 0

        const maxValue = Math.max(myValue, theirValue)
        const minValue = Math.min(myValue, theirValue)
        const diff = (maxValue - minValue) / maxValue

        return Math.max(0, 100 - Math.round(diff * 100))
    }

    const isValidMatch = (myValue: number, theirValue: number): boolean => {
        if (myValue === 0 || theirValue === 0) return false

        const maxValue = Math.max(myValue, theirValue)
        const minValue = Math.min(myValue, theirValue)
        const diff = (maxValue - minValue) / maxValue

        return diff <= PRICE_TOLERANCE
    }

    /**
     * MATCH BIDIRECCIONAL: Yo tengo lo que él busca + Él tiene lo que yo busco
     */
    const calculateBidirectionalMatch = (
        myCards: Card[],
        myPreferences: Preference[],
        theirCards: Card[],
        theirPreferences: Preference[]
    ): MatchCalculation | null => {
        const myOffering: Card[] = []
        let myValue = 0

        // Mi oferta: cartas que él busca (excluir preferencias guardadas)
        for (const myCard of myCards) {
            if (myCard.status === 'wishlist') continue
            if (theirPreferences.some(p => p.scryfallId === myCard.scryfallId)) {
                myOffering.push(myCard)
                myValue += (myCard.price || 0) * (myCard.quantity || 1)
            }
        }

        // Su oferta: cartas que yo busco (excluir preferencias)
        const theirOffering: Card[] = []
        let theirValue = 0

        for (const myPref of myPreferences) {
            const matching = theirCards.filter(
                c => c.scryfallId === myPref.scryfallId && c.status !== 'wishlist'
            )
            for (const card of matching) {
                theirOffering.push(card)
                theirValue += (card.price || 0) * (card.quantity || 1)
            }
        }

        // BIDIRECCIONAL: ambos lados deben tener cartas
        if (myOffering.length === 0 || theirOffering.length === 0) {
            return null
        }

        return {
            myCardIds: myOffering.map(c => c.id),
            myCardsInfo: myOffering,
            myTotalValue: myValue,

            theirCardIds: theirOffering.map(c => c.id),
            theirCardsInfo: theirOffering,
            theirTotalValue: theirValue,

            valueDifference: myValue - theirValue,
            compatibility: calculateCompatibility(myValue, theirValue),
            isValid: true,
        }
    }

    /**
     * MATCH UNIDIRECCIONAL: O yo tengo lo que él busca, O él tiene lo que yo busco
     */
    const calculateUnidirectionalMatch = (
        myCards: Card[],
        myPreferences: Preference[],
        theirCards: Card[],
        theirPreferences: Preference[],
        debugName?: string
    ): MatchCalculation | null => {
        const myOffering: Card[] = []
        let myValue = 0

        // Mi oferta: cartas que él busca (excluir preferencias guardadas)
        for (const myCard of myCards) {
            if (myCard.status === 'wishlist') continue
            if (theirPreferences.some(p => p.scryfallId === myCard.scryfallId)) {
                myOffering.push(myCard)
                myValue += (myCard.price || 0) * (myCard.quantity || 1)
            }
        }

        // Su oferta: cartas que yo busco (excluir preferencias)
        const theirOffering: Card[] = []
        let theirValue = 0

        for (const myPref of myPreferences) {
            const matching = theirCards.filter(
                c => c.scryfallId === myPref.scryfallId && c.status !== 'wishlist'
            )
            for (const card of matching) {
                theirOffering.push(card)
                theirValue += (card.price || 0) * (card.quantity || 1)
            }
        }

        if (debugName === 'srparca') {
            console.log(`  [UNIDIRECTIONAL DEBUG]`)
            console.log(`    Their preferences:`, theirPreferences.map(p => p.name))
            console.log(`    Their prefs scryfallIds:`, theirPreferences.map(p => p.scryfallId))
            console.log(`    My cards (todas):`, myCards.map(c => ({ name: c.name, scryfallId: c.scryfallId, status: c.status })))
            console.log(`    My offering (cartas que buscan ellos):`, myOffering.map(c => `${c.name}($${c.price})`))
            console.log(`    My preferences:`, myPreferences.map(p => p.name))
            console.log(`    Their cards (todas):`, theirCards.map(c => ({ name: c.name, scryfallId: c.scryfallId, status: c.status })))
            console.log(`    Their offering (cartas que busco yo):`, theirOffering.map(c => `${c.name}($${c.price})`))
        }

        // UNIDIRECCIONAL: al menos UN lado debe tener cartas
        if (myOffering.length === 0 && theirOffering.length === 0) {
            if (debugName === 'srparca') console.log(`    ❌ NO MATCH: Ambos sin cartas`)
            return null
        }

        if (debugName === 'srparca') console.log(`    ✅ MATCH ENCONTRADO`)

        return {
            myCardIds: myOffering.map(c => c.id),
            myCardsInfo: myOffering,
            myTotalValue: myValue,

            theirCardIds: theirOffering.map(c => c.id),
            theirCardsInfo: theirOffering,
            theirTotalValue: theirValue,

            valueDifference: myValue - theirValue,
            compatibility: calculateCompatibility(myValue, theirValue),
            isValid: true,
        }
    }

    return {
        calculateCompatibility,
        isValidMatch,
        calculateBidirectionalMatch,
        calculateUnidirectionalMatch,
    }
})