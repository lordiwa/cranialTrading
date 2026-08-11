/**
 * TASK-188 — el email NO debe vivir en el documento /users/{uid}.
 *
 * POR QUE. firestore.rules tiene `match /users/{userId} { allow read: if true }`
 * porque el perfil publico se abre SIN sesion (requisito explicito de producto).
 * Las reglas de Firestore no filtran por campo: si el documento es legible, se
 * leen TODOS sus campos. Medido el 2026-08-11: una peticion REST anonima
 * devolvia HTTP 200 con 134 documentos en produccion y 232 en dev, cada uno con
 * el campo `email` poblado.
 *
 * Es la TERCERA vez que aparece la misma clase de fuga (TASK-087 sobre
 * users/{uid}/cards, TASK-169 sobre public_cards). El arreglo es el mismo camino
 * que ya recorrio TASK-169: el email no se escribe en el documento publico. Vive
 * en contact_info/{uid}, que exige sesion para leerse, y para el propio dueño la
 * fuente de verdad es Firebase Auth (auth.currentUser.email), que ya lo era
 * desde TASK-124.
 *
 * Estos tests son el candado: cada punto de escritura de /users y la lectura de
 * sesion. Si alguien vuelve a meter el campo, se ponen rojos.
 */
import { vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const setDocMock = vi.fn()
const getDocMock = vi.fn()
const updateDocMock = vi.fn()
const signInWithEmailAndPasswordMock = vi.fn()
const createUserMock = vi.fn()
const signInWithPopupMock = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn((_db, col, id) => ({ col, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  query: vi.fn(),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: vi.fn(),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  where: vi.fn(),
}))

vi.mock('@/services/firebase', () => ({ db: {}, auth: { currentUser: null } }))
vi.mock('@/services/firestore', () => ({ db: {} }))

vi.mock('@/services/contactInfo', () => ({
  syncContactInfo: vi.fn(),
  getContactInfo: vi.fn(),
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  createUserWithEmailAndPassword: (...args: unknown[]) => createUserMock(...args),
  signInWithEmailAndPassword: (...args: unknown[]) => signInWithEmailAndPasswordMock(...args),
  signInWithPopup: (...args: unknown[]) => signInWithPopupMock(...args),
  browserPopupRedirectResolver: {},
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  confirmPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
  deleteUser: vi.fn(),
  verifyBeforeUpdateEmail: vi.fn(),
}))

vi.mock('@/composables/useI18n', () => ({
  t: (key: string) => key,
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'en' } }),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  setDocMock.mockReset()
  getDocMock.mockReset()
  updateDocMock.mockReset()
  signInWithEmailAndPasswordMock.mockReset()
  createUserMock.mockReset()
  signInWithPopupMock.mockReset()
  setDocMock.mockResolvedValue(undefined)
})

// eslint-disable-next-line import/first
import { useAuthStore } from '@/stores/auth'
// eslint-disable-next-line import/first
import { auth as authMock } from '@/services/firebase'

/** Todas las llamadas a setDoc dirigidas a la coleccion /users. */
const userDocWrites = () =>
  setDocMock.mock.calls.filter(([ref]) => (ref as { col?: string }).col === 'users')

describe('TASK-188 — ningun punto de escritura mete `email` en /users', () => {
  it('register() escribe el documento de usuario sin campo email', async () => {
    authMock.currentUser = { uid: 'uidR', email: 'nuevo@example.com' } as never
    createUserMock.mockResolvedValueOnce({ user: { uid: 'uidR' } })
    // loadUserData() al final de register(): el doc ya existe, sin email.
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({
        username: 'nuevo',
        location: 'City',
        createdAt: { toDate: () => new Date() },
      }),
    })

    const store = useAuthStore()
    await store.register('nuevo@example.com', 'pw', 'nuevo', 'City')

    const writes = userDocWrites()
    expect(writes.length).toBeGreaterThan(0)
    for (const [, payload] of writes) {
      expect(payload).not.toHaveProperty('email')
    }
  })

  it('loginWithGoogle() crea el documento de usuario sin campo email', async () => {
    const googleUser = {
      uid: 'uidG',
      email: 'google@example.com',
      displayName: 'Google User',
      photoURL: null,
    }
    authMock.currentUser = googleUser as never
    signInWithPopupMock.mockResolvedValueOnce({ user: googleUser })
    // 1ª lectura: el doc de /users no existe → rama de creacion.
    // 2ª lectura (loadUserData): ya existe, sin email.
    getDocMock
      .mockResolvedValueOnce({ exists: () => false })
      .mockResolvedValue({
        exists: () => true,
        data: () => ({
          username: 'google_user',
          location: '',
          createdAt: { toDate: () => new Date() },
        }),
      })

    const store = useAuthStore()
    await store.loginWithGoogle()

    const writes = userDocWrites()
    expect(writes.length).toBeGreaterThan(0)
    for (const [, payload] of writes) {
      expect(payload).not.toHaveProperty('email')
    }
  })

  it('el auto-reparado de loadUserData (doc ausente) tampoco escribe email', async () => {
    authMock.currentUser = { uid: 'uidS', email: 'huerfano@example.com', displayName: null } as never
    signInWithEmailAndPasswordMock.mockResolvedValueOnce({
      user: { uid: 'uidS', emailVerified: true },
    })
    getDocMock.mockResolvedValue({ exists: () => false })

    const store = useAuthStore()
    await store.login('huerfano@example.com', 'pw')

    const writes = userDocWrites()
    expect(writes.length).toBeGreaterThan(0)
    for (const [, payload] of writes) {
      expect(payload).not.toHaveProperty('email')
    }
  })
})

describe('TASK-188 — la sesion toma el email de Firebase Auth, no de /users', () => {
  it('puebla user.email desde auth.currentUser aunque el doc no traiga el campo', async () => {
    authMock.currentUser = { uid: 'uidA', email: 'real@example.com' } as never
    signInWithEmailAndPasswordMock.mockResolvedValueOnce({
      user: { uid: 'uidA', emailVerified: true },
    })
    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        username: 'alguien',
        location: 'City',
        createdAt: { toDate: () => new Date() },
      }),
    })

    const store = useAuthStore()
    await store.login('real@example.com', 'pw')

    expect(store.user?.email).toBe('real@example.com')
  })

  it('NUNCA reescribe el email dentro de /users (el sync de TASK-124 ya no aplica)', async () => {
    // Doc heredado, todavia con el email viejo: la migracion aun no corrio.
    // El codigo debe ignorarlo, no "corregirlo" — reescribirlo reabriria la fuga.
    authMock.currentUser = { uid: 'uidB', email: 'nuevo@example.com' } as never
    signInWithEmailAndPasswordMock.mockResolvedValueOnce({
      user: { uid: 'uidB', emailVerified: true },
    })
    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        email: 'viejo@example.com',
        username: 'alguien',
        location: 'City',
        createdAt: { toDate: () => new Date() },
      }),
    })

    const store = useAuthStore()
    await store.login('nuevo@example.com', 'pw')

    for (const [, payload] of updateDocMock.mock.calls) {
      expect(payload).not.toHaveProperty('email')
    }
    // Y el email en memoria es el de Auth, no el rancio del documento.
    expect(store.user?.email).toBe('nuevo@example.com')
  })

  /*
   * NO CUBIERTO AQUI, a proposito: que loadUserData dispare syncContactInfo.
   * Se intento y se descarto por deshonesto, no por dificil. El disparo va
   * detras de `void import('../services/contactInfo')` (best-effort: no debe
   * cortar el login), y en la corrida completa del archivo esa cadena tarda
   * SEGUNDOS en resolverse — medido: con 5 s de espera solo habia llegado la
   * del primer test. Aislado pasa siempre. O sea que la asercion mide la
   * velocidad del arnes, no el producto: verde inestable o rojo que no es
   * regresion. Ese bloque ademas no lo toca TASK-188 — es de TASK-169 y quedo
   * intacto. Lo que si importa aca es de donde sale el email que se le pasa, y
   * eso lo fija el test de arriba: sale de Firebase Auth, no del documento.
   */
})
