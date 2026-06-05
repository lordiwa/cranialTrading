/**
 * SCRUM-71.2 — Regresión: un match descartado NO debe reaparecer tras 15 días.
 *
 * Bug: los docs de `matches_eliminados` reciben `lifeExpiresAt` de 15 días igual
 * que cualquier match, y `cleanExpiredMatches` los incluía en la limpieza por
 * expiración. Al expirar el registro de descarte, la persona dejaba de estar
 * filtrada y el match reaparecía en el siguiente recálculo.
 *
 * Fix: `cleanExpiredMatches` NUNCA debe consultar ni borrar `matches_eliminados`.
 * Los descartes/bloqueos persisten indefinidamente.
 *
 * Firebase está completamente mockeado — sin llamadas reales al SDK.
 */
import { createPinia, setActivePinia } from 'pinia'

// Captura los nombres de colección que `cleanExpiredMatches` consulta
const queriedCollections: string[] = []

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, _users: string, _uid: string, colName?: string) => {
    if (colName) queriedCollections.push(colName)
    return { colName }
  }),
  getDocs: vi.fn(),
  addDoc: vi.fn().mockResolvedValue({ id: 'new-doc' }),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  doc: vi.fn(() => ({})),
  query: vi.fn(),
  where: vi.fn(),
  or: vi.fn(),
  writeBatch: vi.fn(() => batchMock),
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

const deleteSpy = vi.fn()
const batchMock = { delete: deleteSpy, commit: vi.fn().mockResolvedValue(undefined) }

import { getDocs } from 'firebase/firestore'
import { useMatchesStore } from '@/stores/matches'

const PAST = new Date('2020-01-01T00:00:00Z') // expirado
const FUTURE = new Date('2999-01-01T00:00:00Z') // vigente

describe('useMatchesStore — cleanExpiredMatches (SCRUM-71.2)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    queriedCollections.length = 0
  })

  it('NUNCA consulta matches_eliminados (los descartes no expiran)', async () => {
    ;(getDocs as any).mockResolvedValue({ docs: [] })

    const store = useMatchesStore()
    await store.cleanExpiredMatches()

    expect(queriedCollections).not.toContain('matches_eliminados')
    expect(queriedCollections).toEqual(['matches_nuevos', 'matches_guardados'])
  })

  it('sigue borrando docs expirados de matches_nuevos y matches_guardados', async () => {
    ;(getDocs as any).mockResolvedValue({
      docs: [
        { ref: { id: 'expired' }, data: () => ({ lifeExpiresAt: PAST }) },
        { ref: { id: 'fresh' }, data: () => ({ lifeExpiresAt: FUTURE }) },
      ],
    })

    const store = useMatchesStore()
    await store.cleanExpiredMatches()

    // 2 colecciones consultadas × 1 doc expirado cada una = 2 borrados
    expect(deleteSpy).toHaveBeenCalledTimes(2)
    expect(deleteSpy).toHaveBeenCalledWith({ id: 'expired' })
  })
})
