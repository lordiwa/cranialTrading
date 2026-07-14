/**
 * TASK-091 review follow-up (M1) — markConversationRead usa writeBatch, que tiene
 * un límite de 500 operaciones por batch. chunkArray es el helper puro que particiona
 * el array de docs a marcar en grupos de tamaño `size` para commits secuenciales.
 */
import { chunkArray } from '@/utils/chunkArray'

describe('chunkArray', () => {
  it('devuelve un array vacío para una lista vacía', () => {
    expect(chunkArray([], 500)).toEqual([])
  })

  it('devuelve un único chunk cuando hay menos elementos que el tamaño (499 < 500)', () => {
    const items = Array.from({ length: 499 }, (_, i) => i)
    const chunks = chunkArray(items, 500)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(499)
  })

  it('devuelve un único chunk cuando hay exactamente el tamaño límite (500)', () => {
    const items = Array.from({ length: 500 }, (_, i) => i)
    const chunks = chunkArray(items, 500)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(500)
  })

  it('devuelve dos chunks cuando hay uno más que el límite (501)', () => {
    const items = Array.from({ length: 501 }, (_, i) => i)
    const chunks = chunkArray(items, 500)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(500)
    expect(chunks[1]).toHaveLength(1)
  })

  it('preserva el orden de los elementos a través de los chunks', () => {
    const items = [1, 2, 3, 4, 5]
    const chunks = chunkArray(items, 2)
    expect(chunks).toEqual([[1, 2], [3, 4], [5]])
  })
})
