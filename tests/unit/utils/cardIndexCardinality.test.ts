/**
 * TASK-275 — sensor de CARDINALIDAD del card_index (detección pura).
 *
 * `indexLooksComplete` (src/stores/collection.ts) mira CUATRO condiciones —
 * versión, ids duplicados, chunks contiguos desde 0, y "último chunk
 * exactamente lleno" — y NINGUNA de ellas es cardinalidad. Medido contra la
 * cuenta de QA de dev el 2026-08-22: 1880 documentos en users/<uid>/cards
 * contra 1879 entradas en un único chunk contiguo, sin duplicados y con 1879
 * != 2000, o sea que las cuatro condiciones dan "sano" mientras falta una
 * carta. Esa carta es invisible para la búsqueda, que se construye A PARTIR
 * del índice.
 *
 * Esta es la decisión pura del sensor. La lectura agregada y el documento de
 * diagnóstico viven en el store (collection.indexCardinality.test.ts).
 */

import { evaluateIndexCardinality } from '@/utils/cardIndexCardinality'

describe('evaluateIndexCardinality (TASK-275)', () => {
  it('no reporta divergencia cuando el índice tiene exactamente tantas entradas como documentos', () => {
    const report = evaluateIndexCardinality(1880, 1880)

    expect(report.diverged).toBe(false)
    expect(report.docCount).toBe(1880)
    expect(report.indexCount).toBe(1880)
    expect(report.difference).toBe(0)
  })

  it('detecta el caso MEDIDO: 1880 documentos contra 1879 entradas es divergencia de 1', () => {
    const report = evaluateIndexCardinality(1880, 1879)

    expect(report.diverged).toBe(true)
    expect(report.difference).toBe(1)
  })

  it('un índice CORTO da diferencia positiva (faltan entradas)', () => {
    expect(evaluateIndexCardinality(1878, 1872).difference).toBe(6)
    expect(evaluateIndexCardinality(1878, 1872).diverged).toBe(true)
  })

  it('un índice LARGO da diferencia negativa — nunca se lo reporta como "faltan entradas"', () => {
    const report = evaluateIndexCardinality(100, 103)

    expect(report.diverged).toBe(true)
    expect(report.difference).toBe(-3)
  })

  it('una colección vacía con índice vacío es sana', () => {
    expect(evaluateIndexCardinality(0, 0).diverged).toBe(false)
  })

  it('una colección con documentos y el índice VACIADO es divergencia — el caso de TASK-208 que los cuatro chequeos existentes no ven', () => {
    const report = evaluateIndexCardinality(59198, 0)

    expect(report.diverged).toBe(true)
    expect(report.difference).toBe(59198)
  })
})
