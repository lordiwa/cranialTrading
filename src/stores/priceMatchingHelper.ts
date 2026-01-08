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
    matchType: 'bidirectional' | 'unidirectional'
}

export const usePriceMatchingStore = defineStore('priceMatching', () => {

    /**
     * Calcular compatibilidad basada en diferencia de precio
     * 100% = exacta, 90% = ~$10 de diferencia, etc
     */
    const calculateCompatibility = (myValue: number, theirValue: number): number => {
        if (myValue === 0 && theirValue === 0) return 100
        if (myValue === 0 || theirValue === 0) return 50

        const maxValue = Math.max(myValue, theirValue)
        const minValue = Math.min(myValue, theirValue)
        const diff = (maxValue - minValue) / maxValue

        return Math.max(0, Math.round((1 - diff) * 100))
    }

    /**
     * Validar que el match esté dentro de la tolerancia de precio (±10%)
     */
    const isValidMatch = (myValue: number, theirValue: number): boolean => {
        if (myValue === 0 || theirValue === 0) return true

        const maxValue = Math.max(myValue, theirValue)
        const minValue = Math.min(myValue, theirValue)
        const diff = (maxValue - minValue) / maxValue

        return diff <= PRICE_TOLERANCE
    }

    /**
     * MATCH BIDIRECCIONAL:
     * Yo tengo lo que él BUSCA AND él tiene lo que yo BUSCO
     */
    const calculateBidirectionalMatch = (
        myCards: Card[],
        myPreferences: Preference[],
        theirCards: Card[],
        theirPreferences: Preference[]
    ): MatchCalculation | null => {
        const myOffering: Card[] = []
        let myValue = 0

        // Mi oferta: cartas que ELLOS BUSCAN (solo BUSCO)
        for (const myCard of myCards) {
            if (myCard.status === 'wishlist') continue

            const matchingPref = theirPreferences.find(p =>
                p.name && p.name.toLowerCase() === myCard.name?.toLowerCase() &&
                p.type === 'BUSCO'
            )

            if (matchingPref) {
                myOffering.push(myCard)
                myValue += (myCard.price || 0) * (myCard.quantity || 1)
            }
        }

        // Su oferta: cartas que YO BUSCO (solo BUSCO)
        const theirOffering: Card[] = []
        let theirValue = 0

        for (const myPref of myPreferences) {
            if (myPref.type !== 'BUSCO') continue

            const matching = theirCards.filter(
                c => c.name && c.name.toLowerCase() === (myPref.name || '').toLowerCase() &&
                    c.status !== 'wishlist' &&
                    c.quantity > 0
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

        // Validar precio
        if (!isValidMatch(myValue, theirValue)) {
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
            matchType: 'bidirectional',
        }
    }

    /**
     * MATCH UNIDIRECCIONAL - SIMPLIFICADO:
     * Yo tengo lo que él BUSCA
     * O él tiene (en colección) lo que yo BUSCO/CAMBIO/VENDO
     *
     * NO importa el tipo de preferencia del otro usuario
     * Solo importa si EXISTE la carta en su colección
     */
    const calculateUnidirectionalMatch = (
        myCards: Card[],
        myPreferences: Preference[],
        theirCards: Card[],
        theirPreferences: Preference[]
    ): MatchCalculation | null => {
        try {
            const myOffering: Card[] = []
            let myValue = 0

            // Mi oferta: cartas que ELLOS BUSCAN (solo BUSCO)
            for (const myCard of myCards) {
                if (myCard.status === 'wishlist' || !myCard.name) continue

                const matchingPref = theirPreferences.find(p =>
                    p.name && p.name.toLowerCase() === myCard.name.toLowerCase() &&
                    p.type === 'BUSCO'
                )

                if (matchingPref) {
                    myOffering.push(myCard)
                    myValue += (myCard.price || 0) * (myCard.quantity || 1)
                }
            }

            // Su oferta: cartas que YO BUSCO/CAMBIO/VENDO (cualquier tipo)
            const theirOffering: Card[] = []
            let theirValue = 0

            for (const myPref of myPreferences) {
                if (!myPref.name) continue

                // Buscar si él tiene esa carta en colección (cualquier estado excepto wishlist)
                const matching = theirCards.filter(
                    c => c.name &&
                        c.name.toLowerCase() === myPref.name.toLowerCase() &&
                        c.status !== 'wishlist' &&
                        c.quantity > 0
                )

                for (const card of matching) {
                    theirOffering.push(card)
                    theirValue += (card.price || 0) * (card.quantity || 1)
                }
            }

            // UNIDIRECCIONAL: al menos UN lado debe tener cartas
            if (myOffering.length === 0 && theirOffering.length === 0) {
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
                matchType: 'unidirectional',
            }
        } catch (error) {
            console.error('Error en calculateUnidirectionalMatch:', error)
            return null
        }
    }

    return {
        calculateCompatibility,
        isValidMatch,
        calculateBidirectionalMatch,
        calculateUnidirectionalMatch,
    }
})