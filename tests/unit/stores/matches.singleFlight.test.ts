/**
 * Perf regression (bug report 2026-08-07 — "the site is dead slow").
 *
 * loadAllMatches() reads four Firestore collections (matches_nuevos,
 * matches_guardados, matches_eliminados, shared_matches) plus whatever
 * cleanExpiredMatches reads. On the post-login landing it fired 2-3 times
 * concurrently: SavedMatchesView's initView calls it, the header's
 * MatchNotificationsDropdown calls it on its own mount, and the view calls it
 * again after recalculation. Each concurrent caller paid the full read cost.
 *
 * Fix: a single-flight promise memo — concurrent callers share one round trip.
 * Callers that arrive AFTER it settles must still get a fresh load.
 *
 * Firebase is fully mocked — no real SDK calls.
 */
import { createPinia, setActivePinia } from 'pinia'

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, _users: string, _uid: string, colName?: string) => ({ colName })),
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
  useAuthStore: () => ({ user: { id: 'me-id', username: 'me', location: 'X', avatarUrl: null } }),
}))
vi.mock('@/stores/toast', () => ({ useToastStore: () => ({ show: vi.fn() }) }))
vi.mock('@/composables/useI18n', () => ({
  t: (k: string) => k,
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'en' } }),
}))

import { getDocs } from 'firebase/firestore'
import { useMatchesStore } from '@/stores/matches'

const mockGetDocs = vi.mocked(getDocs)

/** An empty Firestore snapshot shaped the way the store consumes it. */
const emptySnapshot = { docs: [], empty: true, forEach: () => {} } as unknown as Awaited<ReturnType<typeof getDocs>>

beforeEach(() => {
  setActivePinia(createPinia())
  mockGetDocs.mockReset()
  mockGetDocs.mockResolvedValue(emptySnapshot)
})

describe('loadAllMatches: single-flight', () => {
  it('shares one round trip between concurrent callers', async () => {
    const store = useMatchesStore()

    // Three callers in the same tick — the view, the header dropdown, and the
    // post-calculation reload all landing together.
    await Promise.all([
      store.loadAllMatches(),
      store.loadAllMatches(),
      store.loadAllMatches(),
    ])

    const callsForThree = mockGetDocs.mock.calls.length

    // Compare against a single lone call from a clean store.
    setActivePinia(createPinia())
    mockGetDocs.mockClear()
    const solo = useMatchesStore()
    await solo.loadAllMatches()
    const callsForOne = mockGetDocs.mock.calls.length

    expect(callsForOne).toBeGreaterThan(0)
    expect(callsForThree).toBe(callsForOne)
  })

  // NB: asserting promise IDENTITY here would be wrong — Pinia wraps store
  // actions, so each façade call returns a fresh promise even when the underlying
  // work is shared. Assert the observable effect instead: no extra reads.
  it('a caller that arrives mid-load adds no further reads', async () => {
    let releaseFirst!: () => void
    const gate = new Promise<void>((res) => { releaseFirst = res })
    mockGetDocs.mockImplementation(async () => {
      await gate
      return emptySnapshot
    })

    const store = useMatchesStore()
    const first = store.loadAllMatches()
    await Promise.resolve()
    const callsWhileInFlight = mockGetDocs.mock.calls.length

    // Second caller lands while the first is still blocked on the gate.
    const second = store.loadAllMatches()
    expect(mockGetDocs.mock.calls.length).toBe(callsWhileInFlight)

    releaseFirst()
    await Promise.all([first, second])
  })

  it('a caller arriving after the load settles still gets a fresh read', async () => {
    const store = useMatchesStore()

    await store.loadAllMatches()
    const callsAfterFirst = mockGetDocs.mock.calls.length

    await store.loadAllMatches()
    expect(mockGetDocs.mock.calls.length).toBeGreaterThan(callsAfterFirst)
  })

  it('clears the in-flight memo when the load rejects, so the next call retries', async () => {
    const store = useMatchesStore()

    mockGetDocs.mockRejectedValueOnce(new Error('network down'))
    await store.loadAllMatches() // the store swallows and logs errors

    mockGetDocs.mockResolvedValue(emptySnapshot)
    const callsAfterFailure = mockGetDocs.mock.calls.length
    await store.loadAllMatches()

    // A stuck memo would make this a no-op and leave the user with no matches
    // until a full reload.
    expect(mockGetDocs.mock.calls.length).toBeGreaterThan(callsAfterFailure)
  })

  it('leaves loading false once the shared load settles', async () => {
    const store = useMatchesStore()
    await Promise.all([store.loadAllMatches(), store.loadAllMatches()])
    expect(store.loading).toBe(false)
  })
})
