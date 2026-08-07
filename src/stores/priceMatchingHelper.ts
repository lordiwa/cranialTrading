import { defineStore } from 'pinia'
import { type Card } from '../types/card'
import { type Preference } from '../types/preferences'
import { logSanitizedError } from '../utils/logSanitizedError'

interface MatchCalculation {
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

/**
 * Index the FIRST BUSCO preference per lowercased name.
 *
 * Replaces a `theirPreferences.find(...)` performed inside a loop over the whole
 * collection, which made the pass O(cards x preferences) — ~9M case-insensitive
 * comparisons per candidate user on a 59k collection, each allocating two
 * lowercased strings. "First wins" is deliberate: it is the behaviour `find`
 * already had, and a same-named non-BUSCO entry must not shadow a BUSCO one.
 */
function indexFirstBuscoPreferenceByName(preferences: Preference[]): Map<string, Preference> {
    const byName = new Map<string, Preference>()
    for (const pref of preferences) {
        if (pref.type !== 'BUSCO' || !pref.name) continue
        const key = pref.name.toLowerCase()
        if (!byName.has(key)) byName.set(key, pref)
    }
    return byName
}

/**
 * Index offerable cards (anything not wishlist, with stock) by lowercased name,
 * preserving collection order within each name.
 *
 * Replaces a `theirCards.filter(...)` performed inside a loop over preferences.
 */
function indexOfferableCardsByName(cards: Card[]): Map<string, Card[]> {
    const byName = new Map<string, Card[]>()
    for (const card of cards) {
        if (!card.name || card.status === 'wishlist' || !(card.quantity > 0)) continue
        const key = card.name.toLowerCase()
        const bucket = byName.get(key)
        if (bucket) bucket.push(card)
        else byName.set(key, [card])
    }
    return byName
}

export const usePriceMatchingStore = defineStore('priceMatching', () => {

    /**
     * Calculate the difference ratio between two values
     * Returns 0 for equal values, up to 1 for completely different
     */
    const calculateDifferenceRatio = (value1: number, value2: number): number => {
        if (value1 === 0 && value2 === 0) return 0
        if (value1 === 0 || value2 === 0) return 1

        const maxValue = Math.max(value1, value2)
        const minValue = Math.min(value1, value2)
        return (maxValue - minValue) / maxValue
    }

    /**
     * Calcular compatibilidad basada en diferencia de precio
     * 100% = exacta, 90% = ~$10 de diferencia, etc
     */
    const calculateCompatibility = (myValue: number, theirValue: number): number => {
        if (myValue === 0 && theirValue === 0) return 100
        if (myValue === 0 || theirValue === 0) return 50

        const diff = calculateDifferenceRatio(myValue, theirValue)
        return Math.max(0, Math.round((1 - diff) * 100))
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

        // Indexed once per call — see indexFirstBuscoPreferenceByName.
        const theirBuscoByName = indexFirstBuscoPreferenceByName(theirPreferences)
        const theirOfferableByName = indexOfferableCardsByName(theirCards)

        // Mi oferta: cartas que ELLOS BUSCAN (solo BUSCO)
        for (const myCard of myCards) {
            if (myCard.status === 'wishlist' || !myCard.name) continue

            const matchingPref = theirBuscoByName.get(myCard.name.toLowerCase())

            if (matchingPref) {
                // Usar la cantidad que ELLOS BUSCAN, limitada a lo que YO TENGO
                const theirWantedQty = matchingPref.quantity || 1
                const myAvailableQty = myCard.quantity || 1
                const matchQty = Math.min(theirWantedQty, myAvailableQty)

                // Crear copia con cantidad ajustada
                const adjustedCard = { ...myCard, quantity: matchQty }
                myOffering.push(adjustedCard)
                myValue += (myCard.price || 0) * matchQty
            }
        }

        // Su oferta: cartas que YO BUSCO (solo BUSCO)
        const theirOffering: Card[] = []
        let theirValue = 0

        for (const myPref of myPreferences) {
            if (myPref.type !== 'BUSCO' || !myPref.name) continue

            const matching = theirOfferableByName.get(myPref.name.toLowerCase()) ?? []

            for (const card of matching) {
                // Usar la cantidad que YO BUSCO, limitada a lo que el otro TIENE
                const wantedQty = myPref.quantity || 1
                const availableQty = card.quantity || 1
                const matchQty = Math.min(wantedQty, availableQty)

                // Crear copia con cantidad ajustada
                const adjustedCard = { ...card, quantity: matchQty }
                theirOffering.push(adjustedCard)
                theirValue += (card.price || 0) * matchQty
            }
        }

        // BIDIRECCIONAL: ambos lados deben tener cartas
        if (myOffering.length === 0 || theirOffering.length === 0) {
            return null
        }

        // Para bidireccional, NO validamos precio - si ambos quieren intercambiar, mostrar el match

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

            // Indexed once per call — see indexFirstBuscoPreferenceByName.
            const theirBuscoByName = indexFirstBuscoPreferenceByName(theirPreferences)
            const theirOfferableByName = indexOfferableCardsByName(theirCards)

            // Mi oferta: cartas que ELLOS BUSCAN (solo BUSCO)
            for (const myCard of myCards) {
                if (myCard.status === 'wishlist' || !myCard.name) continue

                const matchingPref = theirBuscoByName.get(myCard.name.toLowerCase())

                if (matchingPref) {
                    // Usar la cantidad que ELLOS BUSCAN, limitada a lo que YO TENGO
                    const theirWantedQty = matchingPref.quantity || 1
                    const myAvailableQty = myCard.quantity || 1
                    const matchQty = Math.min(theirWantedQty, myAvailableQty)

                    const adjustedCard = { ...myCard, quantity: matchQty }
                    myOffering.push(adjustedCard)
                    myValue += (myCard.price || 0) * matchQty
                }
            }

            // Su oferta: cartas que YO BUSCO/CAMBIO/VENDO (cualquier tipo)
            const theirOffering: Card[] = []
            let theirValue = 0

            for (const myPref of myPreferences) {
                if (!myPref.name) continue

                // Buscar si él tiene esa carta en colección (cualquier estado excepto wishlist)
                const matching = theirOfferableByName.get(myPref.name.toLowerCase()) ?? []

                for (const card of matching) {
                    // Usar la cantidad que YO BUSCO, limitada a lo que el otro TIENE
                    const wantedQty = myPref.quantity || 1
                    const availableQty = card.quantity || 1
                    const matchQty = Math.min(wantedQty, availableQty)

                    const adjustedCard = { ...card, quantity: matchQty }
                    theirOffering.push(adjustedCard)
                    theirValue += (card.price || 0) * matchQty
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
            logSanitizedError('Error en calculateUnidirectionalMatch', error)
            return null
        }
    }

    return {
        calculateCompatibility,
        calculateBidirectionalMatch,
        calculateUnidirectionalMatch,
    }
})