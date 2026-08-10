/**
 * Unit tests for useSendInterest composable (TASK-075).
 *
 * sendInterestFromSearch was extracted from useGlobalSearch into its own
 * reusable composable. These tests pin down the behavior that must survive
 * the extraction:
 * - early return when there is no authenticated user
 * - dedup: an existing shared_match with same sender/receiver/scryfallId/edition
 *   marks the card as sent WITHOUT creating a new doc
 * - happy path: addDoc payload carries sender/receiver/card data and the card id
 *   lands in sentInterestIds
 * - guard: already-sent card ids are not re-sent
 */

import { vi } from 'vitest'

const addDocMock = vi.fn()
const getDocsMock = vi.fn()
const collectionMock = vi.fn((_db: unknown, name: string) => ({ __collection: name }))
const queryMock = vi.fn((...args: unknown[]) => ({ __query: args }))
const whereMock = vi.fn((field: string, op: string, value: unknown) => ({ field, op, value }))

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
  collection: (...args: unknown[]) => collectionMock(...(args as [unknown, string])),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  query: (...args: unknown[]) => queryMock(...args),
  where: (...args: unknown[]) => whereMock(...(args as [string, string, unknown])),
}))
vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('@/services/firestore', () => ({ db: {} }))

const toastShowMock = vi.fn()
vi.mock('@/stores/toast', () => ({
  useToastStore: () => ({ show: toastShowMock }),
}))

const authState: { user: Record<string, unknown> | null } = {
  user: { id: 'me', username: 'rafa', location: 'Madrid', email: 'rafa@example.com' },
}
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authState,
}))

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}))

// eslint-disable-next-line import/first
import { useSendInterest } from '@/composables/useSendInterest'
// eslint-disable-next-line import/first
import type { PublicCardResult } from '@/services/publicCardSearch'

function makePublicCard(overrides: Partial<PublicCardResult> = {}): PublicCardResult {
  return {
    id: 'pc-1',
    cardId: 'card-1',
    scryfallId: 'scry-1',
    cardName: 'Lightning Bolt',
    edition: 'Magic 2021',
    userId: 'other-user',
    username: 'alice',
    location: 'Barcelona',
    quantity: 2,
    condition: 'NM',
    foil: false,
    price: 1.5,
    image: 'https://example.com/bolt.jpg',
    status: 'sale',
    ...overrides,
  }
}

beforeEach(() => {
  addDocMock.mockReset()
  getDocsMock.mockReset()
  toastShowMock.mockReset()
  collectionMock.mockClear()
  queryMock.mockClear()
  whereMock.mockClear()
  authState.user = { id: 'me', username: 'rafa', location: 'Madrid', email: 'rafa@example.com' }
})

describe('useSendInterest', () => {
  it('returns early without touching Firestore when there is no authenticated user', async () => {
    authState.user = null
    const { sendInterestFromSearch, sentInterestIds } = useSendInterest()

    await sendInterestFromSearch(makePublicCard())

    expect(getDocsMock).not.toHaveBeenCalled()
    expect(addDocMock).not.toHaveBeenCalled()
    expect(sentInterestIds.value.size).toBe(0)
  })

  it('does NOT create a duplicate when a match with same edition already exists (dedup intact)', async () => {
    getDocsMock.mockResolvedValueOnce({
      docs: [
        { data: () => ({ card: { edition: 'Magic 2021' } }) },
      ],
    })
    const { sendInterestFromSearch, sentInterestIds } = useSendInterest()
    const card = makePublicCard()

    await sendInterestFromSearch(card)

    expect(addDocMock).not.toHaveBeenCalled()
    expect(sentInterestIds.value.has(card.id)).toBe(true)
    expect(toastShowMock).toHaveBeenCalledWith(expect.stringContaining('dashboard.interest.sent'), 'info')
  })

  it('creates the shared match when the existing match is for a different edition', async () => {
    getDocsMock.mockResolvedValueOnce({
      docs: [
        { data: () => ({ card: { edition: 'Beta' } }) },
      ],
    })
    addDocMock.mockResolvedValueOnce({ id: 'new-match' })
    const { sendInterestFromSearch } = useSendInterest()

    await sendInterestFromSearch(makePublicCard())

    expect(addDocMock).toHaveBeenCalledTimes(1)
  })

  it('sends interest with full payload and marks the card id as sent', async () => {
    getDocsMock.mockResolvedValueOnce({ docs: [] })
    addDocMock.mockResolvedValueOnce({ id: 'new-match' })
    const { sendInterestFromSearch, sentInterestIds, sendingInterest } = useSendInterest()
    const card = makePublicCard()

    await sendInterestFromSearch(card)

    expect(addDocMock).toHaveBeenCalledTimes(1)
    const payload = addDocMock.mock.calls[0]?.[1] as Record<string, unknown>
    expect(payload).toMatchObject({
      senderId: 'me',
      senderUsername: 'rafa',
      receiverId: 'other-user',
      receiverUsername: 'alice',
      cardType: 'sale',
      totalValue: 3,
      status: 'pending',
      senderStatus: 'interested',
      receiverStatus: 'new',
    })
    expect(payload.card).toMatchObject({
      scryfallId: 'scry-1',
      name: 'Lightning Bolt',
      edition: 'Magic 2021',
      quantity: 2,
    })
    expect(payload.lifeExpiresAt).toBeInstanceOf(Date)
    expect(sentInterestIds.value.has(card.id)).toBe(true)
    expect(sendingInterest.value).toBe(false)
    expect(toastShowMock).toHaveBeenCalledWith(expect.stringContaining('dashboard.interest.sent'), 'success')
  })

  it('skips cards whose id is already in sentInterestIds', async () => {
    const { sendInterestFromSearch, sentInterestIds } = useSendInterest()
    const card = makePublicCard()
    sentInterestIds.value.add(card.id)

    await sendInterestFromSearch(card)

    expect(getDocsMock).not.toHaveBeenCalled()
    expect(addDocMock).not.toHaveBeenCalled()
  })

  it('shows an error toast and resets sendingInterest when Firestore fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    getDocsMock.mockRejectedValueOnce(new Error('permission denied'))
    const { sendInterestFromSearch, sendingInterest, sentInterestIds } = useSendInterest()
    const card = makePublicCard()

    await sendInterestFromSearch(card)

    expect(addDocMock).not.toHaveBeenCalled()
    expect(sentInterestIds.value.has(card.id)).toBe(false)
    expect(sendingInterest.value).toBe(false)
    expect(toastShowMock).toHaveBeenCalledWith('dashboard.interest.error', 'error')
    consoleSpy.mockRestore()
  })
})
