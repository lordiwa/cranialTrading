/**
 * Tests for the 3 new matchesStore methods introduced in Plan 02-B:
 *   - loadDiscardedUserIds
 *   - discardCalculatedMatch (sequential two-step, non-atomic — Amendment D)
 *   - persistCalculatedMatches (4-step, preserves _notificationOf — Amendment C)
 *
 * Amendment H — these 7 cases must all pass:
 *   [base 3] loadDiscardedUserIds, discardCalculatedMatch, persistCalculatedMatches basic
 *   [+ H.1] _notificationOf preservation
 *   [+ H.2] 4-step call order
 *   [+ H.3] notifyMatchUser failure is non-blocking
 *   [+ H.4] non-atomic discard (addDoc succeeds even when deleteDoc throws)
 *
 * Firebase is fully mocked — no real SDK calls.
 */
import { createPinia, setActivePinia } from 'pinia'

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  getDocs: vi.fn(),
  addDoc: vi.fn().mockResolvedValue({ id: 'new-doc' }),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  doc: vi.fn(() => ({})),
  query: vi.fn(),
  where: vi.fn(),
  or: vi.fn(),
  writeBatch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) })),
  Timestamp: { fromDate: (d: Date) => d, now: () => new Date() },
}))

vi.mock('@/services/firebase', () => ({ db: {} }))

vi.mock('@/services/cloudFunctions', () => ({
  notifyMatchUser: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'me-id', username: 'me', location: 'X', avatarUrl: null },
  }),
}))

vi.mock('@/stores/toast', () => ({
  useToastStore: () => ({ show: vi.fn() }),
}))

vi.mock('@/composables/useI18n', () => ({
  t: (k: string) => k,
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'en' } }),
}))

import { addDoc, deleteDoc, getDocs } from 'firebase/firestore'
import { notifyMatchUser } from '@/services/cloudFunctions'
import { useMatchesStore } from '@/stores/matches'

const makeMatch = (overrides: Partial<any> = {}) => ({
  id: 'm-1',
  otherUserId: 'u1',
  otherUsername: 'A',
  otherLocation: '',
  otherEmail: '',
  myCards: [],
  otherCards: [],
  myTotalValue: 0,
  theirTotalValue: 0,
  valueDifference: 0,
  compatibility: 50,
  type: 'BIDIRECTIONAL' as const,
  createdAt: new Date('2024-06-01T00:00:00Z'),
  lifeExpiresAt: new Date('2024-06-16T00:00:00Z'),
  ...overrides,
})

describe('useMatchesStore — loadDiscardedUserIds', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('returns Set of otherUserIds from matches_eliminados snapshot', async () => {
    ;(getDocs as any).mockResolvedValueOnce({
      docs: [
        { data: () => ({ otherUserId: 'u1' }) },
        { data: () => ({ otherUserId: 'u2' }) },
        { data: () => ({}) }, // missing otherUserId — skipped
      ],
    })
    const store = useMatchesStore()
    const ids = await store.loadDiscardedUserIds()
    expect(ids.size).toBe(2)
    expect(ids.has('u1')).toBe(true)
    expect(ids.has('u2')).toBe(true)
  })

  it('returns empty Set on getDocs error (preserves DashboardView behavior)', async () => {
    ;(getDocs as any).mockRejectedValueOnce(new Error('firestore down'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* noop */ })
    const store = useMatchesStore()
    const ids = await store.loadDiscardedUserIds()
    expect(ids.size).toBe(0)
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})

describe('useMatchesStore — discardCalculatedMatch', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    ;(addDoc as any).mockResolvedValue({ id: 'new-doc' })
    ;(deleteDoc as any).mockResolvedValue(undefined)
  })

  it('writes to matches_eliminados then deletes matching matches_nuevos docs', async () => {
    const ref1 = { id: 'd1' }
    const ref2 = { id: 'd2' }
    ;(getDocs as any).mockResolvedValueOnce({
      docs: [
        { ref: ref1, data: () => ({ id: 'm1', otherUserId: 'u1' }) },
        { ref: ref2, data: () => ({ id: 'm-other', otherUserId: 'u-other' }) },
      ],
    })
    const store = useMatchesStore()
    await store.discardCalculatedMatch({
      id: 'm1',
      otherUserId: 'u1',
      otherUsername: 'A',
      otherLocation: '',
      myCards: [],
      otherCards: [],
    })
    expect(addDoc).toHaveBeenCalledTimes(1)
    expect(deleteDoc).toHaveBeenCalledTimes(1)
    expect(deleteDoc).toHaveBeenCalledWith(ref1)
  })

  // Amendment H.4: non-atomic discard
  it('[H.4] propagates error AND does not roll back addDoc when deleteDoc throws (non-atomic)', async () => {
    ;(addDoc as any).mockResolvedValueOnce({ id: 'elim-1' })
    ;(getDocs as any).mockResolvedValueOnce({
      docs: [{ ref: { id: 'd1' }, data: () => ({ id: 'm1', otherUserId: 'u1' }) }],
    })
    ;(deleteDoc as any).mockRejectedValueOnce(new Error('delete failed'))

    const store = useMatchesStore()
    await expect(
      store.discardCalculatedMatch({
        id: 'm1',
        otherUserId: 'u1',
        otherUsername: 'A',
        otherLocation: '',
        myCards: [],
        otherCards: [],
      }),
    ).rejects.toThrow('delete failed')

    // addDoc was called (and NOT rolled back — no compensating deleteDoc on eliminados)
    expect(addDoc).toHaveBeenCalledTimes(1)
  })
})

describe('useMatchesStore — persistCalculatedMatches', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    ;(addDoc as any).mockResolvedValue({ id: 'new-doc' })
    ;(deleteDoc as any).mockResolvedValue(undefined)
    ;(notifyMatchUser as any).mockResolvedValue({ success: true })
  })

  it('writes N docs and calls notifyMatchUser N times', async () => {
    ;(getDocs as any).mockResolvedValueOnce({ docs: [] })
    const store = useMatchesStore()
    await store.persistCalculatedMatches([makeMatch({ id: 'a', otherUserId: 'u1' }), makeMatch({ id: 'b', otherUserId: 'u2' })])
    expect(addDoc).toHaveBeenCalledTimes(2)
    expect(notifyMatchUser).toHaveBeenCalledTimes(2)
  })

  // Amendment H.1: _notificationOf preservation
  it('[H.1] skips deleting matches_nuevos docs with truthy _notificationOf', async () => {
    const refA = { id: 'a' }
    const refB = { id: 'b' }
    const refC = { id: 'c' }
    ;(getDocs as any).mockResolvedValueOnce({
      docs: [
        { ref: refA, id: 'a', data: () => ({ id: 'match-a' }) },
        { ref: refB, id: 'b', data: () => ({ id: 'match-b', _notificationOf: 'external-m' }) },
        { ref: refC, id: 'c', data: () => ({ id: 'match-c' }) },
      ],
    })
    const store = useMatchesStore()
    await store.persistCalculatedMatches([])
    // Only docs WITHOUT _notificationOf should be deleted → 2 deleteDoc calls, not 3
    expect(deleteDoc).toHaveBeenCalledTimes(2)
  })

  // Amendment H.2: 4-step call order
  it('[H.2] calls steps in order: getDocs → deleteDoc(s) → addDoc(s) → notifyMatchUser(s)', async () => {
    const callOrder: string[] = []
    ;(getDocs as any).mockImplementationOnce(() => {
      callOrder.push('getDocs')
      return Promise.resolve({
        docs: [{ ref: { id: 'old' }, id: 'old', data: () => ({ id: 'old' }) }],
      })
    })
    ;(deleteDoc as any).mockImplementation(() => {
      callOrder.push('deleteDoc')
      return Promise.resolve()
    })
    ;(addDoc as any).mockImplementation(() => {
      callOrder.push('addDoc')
      return Promise.resolve({ id: 'new' })
    })
    ;(notifyMatchUser as any).mockImplementation(() => {
      callOrder.push('notifyMatchUser')
      return Promise.resolve({ success: true })
    })

    const store = useMatchesStore()
    await store.persistCalculatedMatches([makeMatch({ id: 'a' })])

    expect(callOrder).toEqual(['getDocs', 'deleteDoc', 'addDoc', 'notifyMatchUser'])
  })

  // Amendment H.3: notifyMatchUser failure is non-blocking
  it('[H.3] continues batch when one notifyMatchUser call fails (console.warn, non-blocking)', async () => {
    ;(getDocs as any).mockResolvedValueOnce({ docs: [] })
    ;(notifyMatchUser as any)
      .mockResolvedValueOnce({ success: true }) // first call ok
      .mockRejectedValueOnce(new Error('notify failed')) // second fails
      .mockResolvedValueOnce({ success: true }) // third ok
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* noop */ })

    const store = useMatchesStore()
    await store.persistCalculatedMatches([
      makeMatch({ id: 'a', otherUserId: 'u1' }),
      makeMatch({ id: 'b', otherUserId: 'u2' }),
      makeMatch({ id: 'c', otherUserId: 'u3' }),
    ])

    // All 3 addDocs should have fired AND all 3 notifyMatchUser calls should have been attempted
    expect(addDoc).toHaveBeenCalledTimes(3)
    expect(notifyMatchUser).toHaveBeenCalledTimes(3)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
