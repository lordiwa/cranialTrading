/**
 * SCRUM-71.1 — Desacoplar descartar-un-match de bloquear-a-la-persona.
 *
 * Modelo: los docs de `matches_eliminados` llevan `kind: 'discard' | 'block'`.
 *  - 'discard' → suprime SOLO ese match (por identidad persona+cartas).
 *  - 'block'   → filtra TODOS los matches de esa persona.
 *  - legacy (sin kind) → se trata como 'block' (preserva comportamiento previo).
 *
 * Firebase está completamente mockeado.
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
vi.mock('@/services/cloudFunctions', () => ({ notifyMatchUser: vi.fn().mockResolvedValue({ success: true }) }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'me-id', username: 'me', location: 'X', avatarUrl: null } }),
}))
vi.mock('@/stores/toast', () => ({ useToastStore: () => ({ show: vi.fn() }) }))
vi.mock('@/composables/useI18n', () => ({
  t: (k: string) => k,
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'en' } }),
}))

import { addDoc, getDocs } from 'firebase/firestore'
import { useMatchesStore } from '@/stores/matches'

describe('useMatchesStore — loadBlockedUserIds (SCRUM-71.1)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('devuelve userIds de docs block + legacy (sin kind), NO de discards', async () => {
    ;(getDocs as any).mockResolvedValueOnce({
      docs: [
        { data: () => ({ otherUserId: 'u-block', kind: 'block' }) },
        { data: () => ({ otherUserId: 'u-discard', kind: 'discard' }) },
        { data: () => ({ otherUserId: 'u-legacy' }) }, // sin kind → block
      ],
    })
    const store = useMatchesStore()
    const ids = await store.loadBlockedUserIds()
    expect(ids.has('u-block')).toBe(true)
    expect(ids.has('u-legacy')).toBe(true)
    expect(ids.has('u-discard')).toBe(false)
    expect(ids.size).toBe(2)
  })
})

describe('useMatchesStore — loadDiscardedMatchKeys (SCRUM-71.1)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('devuelve claves de identidad SOLO de docs kind:discard', async () => {
    ;(getDocs as any).mockResolvedValueOnce({
      docs: [
        { data: () => ({ otherUserId: 'u1', kind: 'discard', otherCards: [{ scryfallId: 'a' }], myCards: [] }) },
        { data: () => ({ otherUserId: 'u2', kind: 'block', otherCards: [{ scryfallId: 'b' }] }) },
      ],
    })
    const store = useMatchesStore()
    const keys = await store.loadDiscardedMatchKeys()
    expect(keys.has('u1::a')).toBe(true)
    expect(keys.has('u2::b')).toBe(false)
    expect(keys.size).toBe(1)
  })
})

describe('useMatchesStore — discard escribe kind:discard (SCRUM-71.1)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    ;(addDoc as any).mockResolvedValue({ id: 'elim-1' })
  })

  it('discardCalculatedMatch marca el doc como kind:discard', async () => {
    ;(getDocs as any).mockResolvedValueOnce({ docs: [] })
    const store = useMatchesStore()
    await store.discardCalculatedMatch({
      id: 'm1', otherUserId: 'u1', otherUsername: 'A', otherLocation: '',
      myCards: [], otherCards: [{ scryfallId: 'a' }],
    })
    expect(addDoc).toHaveBeenCalledTimes(1)
    const payload = (addDoc as any).mock.calls[0][1]
    expect(payload.kind).toBe('discard')
  })

  it('discardMatch marca el doc como kind:discard y guarda las cartas', async () => {
    const store = useMatchesStore()
    store.newMatches.push({
      id: 'm1', docId: 'd1', otherUserId: 'u1', otherUsername: 'A',
      type: 'BIDIRECTIONAL', createdAt: new Date(),
      myCards: [], otherCards: [{ scryfallId: 'a', name: 'A', edition: '', quantity: 1, condition: 'NM', foil: false, price: 1, image: '', status: 'collection' }],
    } as any)

    await store.discardMatch('m1', 'new')

    expect(addDoc).toHaveBeenCalledTimes(1)
    const payload = (addDoc as any).mock.calls[0][1]
    expect(payload.kind).toBe('discard')
    expect(payload.otherCards).toEqual([expect.objectContaining({ scryfallId: 'a' })])
  })
})
