/**
 * SCRUM-71.3 — Dedup semántico de matches.
 *
 * "Repetido" = misma persona + mismo conjunto de cartas. Dos matches con
 * cartas distintas de la misma persona NO son duplicados (los agrupa 71.4).
 */
import { dedupeMatchesByIdentity, matchIdentityKey } from '@/utils/matchDedup'

describe('matchIdentityKey', () => {
  it('combina otherUserId + scryfallIds ordenados de myCards y otherCards', () => {
    const key = matchIdentityKey({
      otherUserId: 'u1',
      myCards: [{ scryfallId: 'b' }],
      otherCards: [{ scryfallId: 'a' }],
    })
    expect(key).toBe('u1::a,b')
  })

  it('es estable ante el orden de las cartas', () => {
    const a = matchIdentityKey({ otherUserId: 'u1', otherCards: [{ scryfallId: 'x' }, { scryfallId: 'y' }] })
    const b = matchIdentityKey({ otherUserId: 'u1', otherCards: [{ scryfallId: 'y' }, { scryfallId: 'x' }] })
    expect(a).toBe(b)
  })

  it('distingue personas distintas con las mismas cartas', () => {
    const a = matchIdentityKey({ otherUserId: 'u1', otherCards: [{ scryfallId: 'x' }] })
    const b = matchIdentityKey({ otherUserId: 'u2', otherCards: [{ scryfallId: 'x' }] })
    expect(a).not.toBe(b)
  })

  it('ignora scryfallIds vacíos', () => {
    const key = matchIdentityKey({ otherUserId: 'u1', myCards: [{ scryfallId: '' }], otherCards: [{ scryfallId: 'a' }] })
    expect(key).toBe('u1::a')
  })
})

describe('dedupeMatchesByIdentity', () => {
  it('colapsa repetidos exactos (misma persona + mismas cartas) conservando el primero', () => {
    const input = [
      { id: '1', otherUserId: 'u1', otherCards: [{ scryfallId: 'a' }] },
      { id: '2', otherUserId: 'u1', otherCards: [{ scryfallId: 'a' }] }, // dup
      { id: '3', otherUserId: 'u1', otherCards: [{ scryfallId: 'a' }] }, // dup
    ]
    const out = dedupeMatchesByIdentity(input)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('1')
  })

  it('conserva matches distintos de la misma persona (cartas diferentes)', () => {
    const input = [
      { id: '1', otherUserId: 'u1', otherCards: [{ scryfallId: 'a' }] },
      { id: '2', otherUserId: 'u1', otherCards: [{ scryfallId: 'b' }] },
    ]
    const out = dedupeMatchesByIdentity(input)
    expect(out).toHaveLength(2)
  })

  it('conserva matches de personas distintas', () => {
    const input = [
      { id: '1', otherUserId: 'u1', otherCards: [{ scryfallId: 'a' }] },
      { id: '2', otherUserId: 'u2', otherCards: [{ scryfallId: 'a' }] },
    ]
    const out = dedupeMatchesByIdentity(input)
    expect(out).toHaveLength(2)
  })

  it('no muta el array de entrada', () => {
    const input = [{ id: '1', otherUserId: 'u1', otherCards: [{ scryfallId: 'a' }] }]
    const copy = [...input]
    dedupeMatchesByIdentity(input)
    expect(input).toEqual(copy)
  })
})
