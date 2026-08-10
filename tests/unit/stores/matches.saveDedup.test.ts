/**
 * SCRUM-71.3 — saveMatch no debe crear un duplicado cuando ya existe un match
 * guardado con la misma identidad (misma persona + mismas cartas).
 *
 * Firebase está completamente mockeado.
 */
import { createPinia, setActivePinia } from 'pinia'

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
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
vi.mock('@/services/firestore', () => ({ db: {} }))
vi.mock('@/services/cloudFunctions', () => ({ notifyMatchUser: vi.fn().mockResolvedValue({ success: true }) }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'me-id', username: 'me', location: 'X', avatarUrl: null } }),
}))
vi.mock('@/stores/toast', () => ({ useToastStore: () => ({ show: vi.fn() }) }))
vi.mock('@/composables/useI18n', () => ({
  t: (k: string) => k,
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'en' } }),
}))

import { addDoc } from 'firebase/firestore'
import { useMatchesStore } from '@/stores/matches'

const makeMatch = (overrides: Partial<any> = {}) => ({
  id: 'm-1',
  otherUserId: 'u1',
  otherUsername: 'A',
  otherLocation: '',
  otherEmail: '',
  myCards: [],
  otherCards: [{ scryfallId: 'a', name: 'A', edition: '', quantity: 1, condition: 'NM', foil: false, price: 1, image: '', status: 'collection' }],
  myTotalValue: 0,
  theirTotalValue: 1,
  valueDifference: 1,
  compatibility: 100,
  type: 'BIDIRECTIONAL' as const,
  createdAt: new Date('2024-06-01T00:00:00Z'),
  lifeExpiresAt: new Date('2024-06-16T00:00:00Z'),
  ...overrides,
})

describe('useMatchesStore — saveMatch dedup (SCRUM-71.3)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    ;(addDoc as any).mockResolvedValue({ id: 'new-doc' })
  })

  it('NO crea doc si ya existe un guardado con la misma identidad', async () => {
    const store = useMatchesStore()
    store.savedMatches.push(makeMatch({ id: 'existing' }))

    const ok = await store.saveMatch(makeMatch({ id: 'incoming', docId: 'd-incoming' }))

    expect(ok).toBe(true)
    expect(addDoc).not.toHaveBeenCalled()
  })

  it('crea doc cuando no hay duplicado', async () => {
    const store = useMatchesStore()
    const ok = await store.saveMatch(makeMatch({ id: 'incoming', docId: 'd-incoming' }))

    expect(ok).toBe(true)
    expect(addDoc).toHaveBeenCalledTimes(1)
  })
})
