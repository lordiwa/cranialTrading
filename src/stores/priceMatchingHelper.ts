import { defineStore } from 'pinia'
import { Card } from '../types/card'
import { Preference } from '../types/preferences'

const PRICE_TOLERANCE = 0.1

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
     * Validar que el match esté dentro de la tolerancia de precio (±10%)
     */
    const isValidMatch = (myValue: number, theirValue: number): boolean => {
        if (myValue === 0 || theirValue === 0) return true
        return calculateDifferenceRatio(myValue, theirValue) <= PRICE_TOLERANCE
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

        console.log('🔍 Bidireccional check:', {
            myCards: myCards.filter(c => c.status !== 'wishlist').map(c => ({ name: c.name, edition: c.edition })),
            myPrefs: myPreferences.filter(p => p.type === 'BUSCO').map(p => ({ name: p.name, edition: p.edition })),
            theirCards: theirCards.filter(c => c.status !== 'wishlist').map(c => ({ name: c.name, edition: c.edition })),
            theirPrefs: theirPreferences.filter(p => p.type === 'BUSCO').map(p => ({ name: p.name, edition: p.edition })),
        })

        // Mi oferta: cartas que ELLOS BUSCAN (solo BUSCO)
        for (const myCard of myCards) {
            if (myCard.status === 'wishlist') continue

            const matchingPref = theirPreferences.find(p =>
                p.name?.toLowerCase() === myCard.name?.toLowerCase() &&
                p.type === 'BUSCO'
            )

            if (matchingPref) {
                // Usar la cantidad que ELLOS BUSCAN, limitada a lo que YO TENGO
                const theirWantedQty = matchingPref.quantity || 1
                const myAvailableQty = myCard.quantity || 1
                const matchQty = Math.min(theirWantedQty, myAvailableQty)

                // Crear copia con cantidad ajustada
                const adjustedCard = { ...myCard, quantity: matchQty }
                myOffering.push(adjustedCard)
                myValue += (myCard.price || 0) * matchQty
                console.log(`✅ Mi carta "${myCard.name}" x${matchQty} (buscan ${theirWantedQty}, tengo ${myAvailableQty})`)
            }
        }

        // Su oferta: cartas que YO BUSCO (solo BUSCO)
        const theirOffering: Card[] = []
        let theirValue = 0

        for (const myPref of myPreferences) {
            if (myPref.type !== 'BUSCO') continue

            const matching = theirCards.filter(
                c => c.name?.toLowerCase() === myPref.name?.toLowerCase() &&
                    c.status !== 'wishlist' &&
                    c.quantity > 0
            )

            for (const card of matching) {
                // Usar la cantidad que YO BUSCO, limitada a lo que el otro TIENE
                const wantedQty = myPref.quantity || 1
                const availableQty = card.quantity || 1
                const matchQty = Math.min(wantedQty, availableQty)

                // Crear copia con cantidad ajustada
                const adjustedCard = { ...card, quantity: matchQty }
                theirOffering.push(adjustedCard)
                theirValue += (card.price || 0) * matchQty
                console.log(`✅ Su carta "${card.name}" x${matchQty} (busco ${wantedQty}, tiene ${availableQty})`)
            }
        }

        console.log('📊 Resultado bidireccional:', {
            myOffering: myOffering.length,
            theirOffering: theirOffering.length,
            myValue,
            theirValue,
        })

        // BIDIRECCIONAL: ambos lados deben tener cartas
        if (myOffering.length === 0 || theirOffering.length === 0) {
            console.log('❌ Bidireccional fallido: un lado vacío')
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

            // Mi oferta: cartas que ELLOS BUSCAN (solo BUSCO)
            for (const myCard of myCards) {
                if (myCard.status === 'wishlist' || !myCard.name) continue

                const matchingPref = theirPreferences.find(p =>
                    p.name?.toLowerCase() === myCard.name?.toLowerCase() &&
                    p.type === 'BUSCO'
                )

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
                const matching = theirCards.filter(
                    c => c.name?.toLowerCase() === myPref.name?.toLowerCase() &&
                        c.status !== 'wishlist' &&
                        c.quantity > 0
                )

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