/**
 * TASK-275 — decisión pura del sensor de CARDINALIDAD del card_index.
 *
 * `indexLooksComplete` (src/stores/collection.ts) mira cuatro condiciones —
 * versión del índice, ids duplicados entre chunks, chunks contiguos desde 0, y
 * "el último chunk leído está EXACTAMENTE lleno" — y ninguna de ellas cuenta
 * nada contra la fuente de verdad. Medido contra la cuenta de QA de dev el
 * 2026-08-22: 1880 documentos en users/<uid>/cards contra 1879 entradas en un
 * único chunk contiguo y sin duplicados. Las cuatro condiciones lo declaran
 * sano (1879 no es 2000), y la suite E2E completa cargó esa colección decenas
 * de veces sin cerrar nunca el hueco. La carta que falta es invisible para la
 * búsqueda, que se construye A PARTIR del índice.
 *
 * Esto SOLO decide si hay divergencia. No lee, no escribe y no repara: la
 * lectura agregada y el documento de diagnóstico viven en el store, y la
 * reparación está deliberadamente FUERA del alcance (ver el comentario del
 * 2026-08-22 en tasks/TASK-275.json).
 */

export interface CardIndexCardinalityReport {
    /** Documentos reales en users/<uid>/cards (getCountFromServer). */
    docCount: number
    /** Entradas únicas efectivamente cargadas desde card_index. */
    indexCount: number
    /**
     * docCount - indexCount. POSITIVO = al índice le faltan entradas (el caso
     * medido y el único visto hasta hoy). NEGATIVO = el índice tiene entradas
     * de más, que sería la familia de TASK-168 (duplicación/chunks huérfanos)
     * y no ésta. El signo se conserva a propósito para poder distinguirlas en
     * el diagnóstico en vez de reportar un valor absoluto que las confunde.
     */
    difference: number
    /** true si los dos conteos no coinciden, en cualquiera de los dos sentidos. */
    diverged: boolean
}

export function evaluateIndexCardinality(
    docCount: number,
    indexCount: number,
): CardIndexCardinalityReport {
    const difference = docCount - indexCount
    return {
        docCount,
        indexCount,
        difference,
        diverged: difference !== 0,
    }
}
