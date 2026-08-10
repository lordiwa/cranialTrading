/**
 * Unit tests for searchPublicCards (TASK-075).
 *
 * Covers:
 * - Firestore prefix query carries limit(20) by default (custom max supported)
 * - Result docs are mapped to PublicCardResult (doc.id + data spread)
 * - The authenticated user's own cards are excluded from results
 * - currentUserId === null keeps all results (no exclusion)
 * - Query failure returns [] WITHOUT a second getDocs call
 *   (the old full-collection fallback must be gone)
 * - Terms shorter than 2 chars short-circuit to [] without querying
 */

import { vi } from 'vitest'

const getDocsMock = vi.fn()
const limitMock = vi.fn((n: number) => ({ __type: 'limit', n }))
const whereMock = vi.fn((field: string, op: string, value: unknown) => ({ __type: 'where', field, op, value }))
const queryMock = vi.fn((...args: unknown[]) => ({ __type: 'query', args }))
const collectionMock = vi.fn((_db: unknown, name: string) => ({ __type: 'collection', name }))

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => collectionMock(...(args as [unknown, string])),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  limit: (n: number) => limitMock(n),
  query: (...args: unknown[]) => queryMock(...args),
  where: (...args: unknown[]) => whereMock(...(args as [string, string, unknown])),
}))
vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('@/services/firestore', () => ({ db: {} }))

// eslint-disable-next-line import/first
import { searchPublicCards } from '@/services/publicCardSearch'

function makeDoc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data }
}

beforeEach(() => {
  getDocsMock.mockReset()
  limitMock.mockClear()
  whereMock.mockClear()
  queryMock.mockClear()
  collectionMock.mockClear()
})

describe('searchPublicCards', () => {
  it('returns [] without querying Firestore when term is shorter than 2 chars', async () => {
    const result = await searchPublicCards('a', 'me')
    expect(result).toEqual([])
    expect(getDocsMock).not.toHaveBeenCalled()
  })

  it('maps snapshot docs to PublicCardResult with doc.id and data fields', async () => {
    getDocsMock.mockResolvedValueOnce({
      docs: [
        makeDoc('doc-1', {
          cardName: 'Lightning Bolt',
          cardNameLower: 'lightning bolt',
          userId: 'other-user',
          username: 'alice',
          edition: 'Magic 2021',
          price: 1.5,
        }),
      ],
    })

    const result = await searchPublicCards('lightning', 'me')

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'doc-1',
      cardName: 'Lightning Bolt',
      userId: 'other-user',
      username: 'alice',
      edition: 'Magic 2021',
      price: 1.5,
    })
  })

  it('excludes cards owned by the current user', async () => {
    getDocsMock.mockResolvedValueOnce({
      docs: [
        makeDoc('mine', { cardName: 'Bolt', userId: 'me' }),
        makeDoc('theirs', { cardName: 'Bolt', userId: 'other' }),
      ],
    })

    const result = await searchPublicCards('bolt', 'me')

    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('theirs')
  })

  it('keeps all results when currentUserId is null', async () => {
    getDocsMock.mockResolvedValueOnce({
      docs: [
        makeDoc('a', { cardName: 'Bolt', userId: 'user-a' }),
        makeDoc('b', { cardName: 'Bolt', userId: 'user-b' }),
      ],
    })

    const result = await searchPublicCards('bolt', null)

    expect(result).toHaveLength(2)
  })

  it('builds the Firestore query with limit(20) by default', async () => {
    getDocsMock.mockResolvedValueOnce({ docs: [] })

    await searchPublicCards('bolt', 'me')

    expect(limitMock).toHaveBeenCalledTimes(1)
    expect(limitMock).toHaveBeenCalledWith(20)
    // The limit constraint must actually be part of the query() call
    const queryArgs = queryMock.mock.calls[0] ?? []
    expect(queryArgs).toContainEqual({ __type: 'limit', n: 20 })
  })

  it('passes a custom max through to limit()', async () => {
    getDocsMock.mockResolvedValueOnce({ docs: [] })

    await searchPublicCards('bolt', 'me', 5)

    expect(limitMock).toHaveBeenCalledWith(5)
  })

  it('queries by cardNameLower prefix with normalized (trimmed + lowercased) term', async () => {
    getDocsMock.mockResolvedValueOnce({ docs: [] })

    await searchPublicCards('  Lightning ', 'me')

    expect(whereMock).toHaveBeenCalledWith('cardNameLower', '>=', 'lightning')
    expect(whereMock).toHaveBeenCalledWith('cardNameLower', '<=', 'lightning')
  })

  it('returns [] on query failure WITHOUT a second getDocs (no full-collection fallback)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    getDocsMock.mockRejectedValueOnce(new Error('missing index'))

    const result = await searchPublicCards('bolt', 'me')

    expect(result).toEqual([])
    expect(getDocsMock).toHaveBeenCalledTimes(1)
    consoleSpy.mockRestore()
  })
})
