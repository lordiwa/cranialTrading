/**
 * Unit tests for the public_cards sync writers (TASK-085).
 *
 * Regression: `searchPublicCards` (publicCardSearch.ts) queries `cardNameLower`
 * but none of the three writers here (syncCardToPublic, batchSyncCardsToPublic,
 * syncAllUserCards) ever wrote that field, so the "Other users" search silently
 * returned []. These tests lock the field into every write payload.
 *
 * Also locks the pre-existing (and still required) invariant that these
 * writers NEVER publish a 'collection' or 'wishlist' status card, or a card
 * with public !== true — public_cards must stay safe-by-construction now
 * that TASK-085 opens it to anonymous reads.
 */

import { vi } from 'vitest'
import { makeCard } from '../helpers/fixtures'

const setDocMock = vi.fn().mockResolvedValue(undefined)
const deleteDocMock = vi.fn().mockResolvedValue(undefined)
const docMock = vi.fn((_db: unknown, col: string, id: string) => ({ col, id }))
const getDocsMock = vi.fn().mockResolvedValue({ docs: [] })
const queryMock = vi.fn((...args: unknown[]) => ({ __type: 'query', args }))
const collectionMock = vi.fn((_db: unknown, name: string) => ({ __type: 'collection', name }))
const whereMock = vi.fn((...args: unknown[]) => ({ __type: 'where', args }))

const batchSetMock = vi.fn()
const batchDeleteMock = vi.fn()
const batchCommitMock = vi.fn().mockResolvedValue(undefined)
const writeBatchMock = vi.fn(() => ({
  set: batchSetMock,
  delete: batchDeleteMock,
  commit: batchCommitMock,
}))

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => collectionMock(...(args as [unknown, string])),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  doc: (...args: unknown[]) => docMock(...(args as [unknown, string, string])),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  query: (...args: unknown[]) => queryMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  Timestamp: { now: () => 'FIXED_TIMESTAMP' },
  where: (...args: unknown[]) => whereMock(...args),
  writeBatch: () => writeBatchMock(),
}))
vi.mock('@/services/firebase', () => ({ db: {} }))

// eslint-disable-next-line import/first
import { batchSyncCardsToPublic, syncAllUserCards, syncCardToPublic } from '@/services/publicCards'

beforeEach(() => {
  setDocMock.mockClear()
  deleteDocMock.mockClear()
  docMock.mockClear()
  getDocsMock.mockClear()
  queryMock.mockClear()
  collectionMock.mockClear()
  whereMock.mockClear()
  batchSetMock.mockClear()
  batchDeleteMock.mockClear()
  batchCommitMock.mockClear()
  writeBatchMock.mockClear()
})

describe('syncCardToPublic', () => {
  it('writes cardNameLower alongside cardName for an eligible sale card', async () => {
    const card = makeCard({ name: 'Lightning Bolt', status: 'sale', public: true })

    await syncCardToPublic(card, 'user-1', 'alice')

    expect(setDocMock).toHaveBeenCalledTimes(1)
    const [, payload] = setDocMock.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(payload.cardName).toBe('Lightning Bolt')
    expect(payload.cardNameLower).toBe('lightning bolt')
  })

  it('lowercases mixed-case and accented-looking names consistently', async () => {
    const card = makeCard({ name: 'Sol Ring', status: 'trade', public: true })

    await syncCardToPublic(card, 'user-1', 'alice')

    const [, payload] = setDocMock.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(payload.cardNameLower).toBe('sol ring')
  })

  it('regression lock: never writes a collection-status card to public_cards (deletes instead)', async () => {
    const card = makeCard({ name: 'Lightning Bolt', status: 'collection', public: true })

    await syncCardToPublic(card, 'user-1', 'alice')

    expect(setDocMock).not.toHaveBeenCalled()
    expect(deleteDocMock).toHaveBeenCalledTimes(1)
  })

  // Review fix (M3): single-card-edit path pinning for the wishlist case —
  // e.g. a public sale card moved to wishlist while still public:true must
  // be deleted from public_cards, not re-published under 'wishlist'.
  it('regression lock: never writes a wishlist-status card to public_cards (deletes instead)', async () => {
    const card = makeCard({ name: 'Lightning Bolt', status: 'wishlist', public: true })

    await syncCardToPublic(card, 'user-1', 'alice')

    expect(setDocMock).not.toHaveBeenCalled()
    expect(deleteDocMock).toHaveBeenCalledTimes(1)
  })

  it('regression lock: never writes a card that is not marked public', async () => {
    const card = makeCard({ name: 'Lightning Bolt', status: 'sale', public: false })

    await syncCardToPublic(card, 'user-1', 'alice')

    expect(setDocMock).not.toHaveBeenCalled()
    expect(deleteDocMock).toHaveBeenCalledTimes(1)
  })
})

describe('batchSyncCardsToPublic', () => {
  it('writes cardNameLower for every eligible card in the batch', async () => {
    const cards = [
      makeCard({ id: 'c1', name: 'Black Lotus', status: 'sale', public: true }),
      makeCard({ id: 'c2', name: 'Mox Ruby', status: 'trade', public: true }),
    ]

    await batchSyncCardsToPublic(cards, 'user-1', 'alice')

    expect(batchSetMock).toHaveBeenCalledTimes(2)
    const payloads = batchSetMock.mock.calls.map(call => call[1] as Record<string, unknown>)
    expect(payloads.map(p => p.cardNameLower)).toEqual(['black lotus', 'mox ruby'])
  })

  it('regression lock: batches collection/wishlist cards as deletes, never as sets', async () => {
    const cards = [
      makeCard({ id: 'c1', name: 'Black Lotus', status: 'collection', public: true }),
      makeCard({ id: 'c2', name: 'Mox Ruby', status: 'wishlist', public: true }),
    ]

    await batchSyncCardsToPublic(cards, 'user-1', 'alice')

    expect(batchSetMock).not.toHaveBeenCalled()
    expect(batchDeleteMock).toHaveBeenCalledTimes(2)
  })
})

describe('syncAllUserCards', () => {
  it('writes cardNameLower for every eligible card', async () => {
    const cards = [
      makeCard({ id: 'c1', name: 'Time Walk', status: 'sale', public: true }),
    ]

    await syncAllUserCards(cards, 'user-1', 'alice')

    expect(batchSetMock).toHaveBeenCalledTimes(1)
    const [, payload] = batchSetMock.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(payload.cardNameLower).toBe('time walk')
  })

  it('regression lock: never includes a collection/wishlist card in the synced batch', async () => {
    const cards = [
      makeCard({ id: 'c1', name: 'Time Walk', status: 'collection', public: true }),
      makeCard({ id: 'c2', name: 'Ancestral Recall', status: 'wishlist', public: true }),
      makeCard({ id: 'c3', name: 'Timetwister', status: 'sale', public: true }),
    ]

    await syncAllUserCards(cards, 'user-1', 'alice')

    expect(batchSetMock).toHaveBeenCalledTimes(1)
    const [, payload] = batchSetMock.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(payload.cardName).toBe('Timetwister')
  })
})
