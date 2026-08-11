/**
 * TASK-124 review follow-up — HIGH-1 + MEDIUM-2.
 *
 * HIGH-1: loadUserData (auth-state load, exercised here via login()) must
 * sync the /users/{uid} doc's `email` field to Firebase Auth's current email
 * when they diverge. changeRegistrationEmail's verifyBeforeUpdateEmail
 * (TASK-124) changes the Auth email out-of-band — only once the user clicks
 * the confirmation link — so without this sync the Firestore doc goes stale
 * forever. Downstream reads of `authStore.user.email` (SettingsView,
 * UserPopover, and critically UserProfileView's senderEmail on the
 * trade-contact flow) would keep using the abandoned address.
 *
 * MEDIUM-2: verifyBeforeUpdateEmail revokes refresh tokens once the link is
 * clicked, so the "I VERIFIED" button's checkEmailVerification →
 * firebaseUser.reload() call is expected to throw auth/user-token-expired
 * (or auth/user-disabled) right after an email change. That must map to a
 * dedicated "sign in again with your new email" message, not the generic
 * verifyEmailError toast.
 */
import { vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const setDocMock = vi.fn()
const getDocMock = vi.fn()
const updateDocMock = vi.fn()
const signInWithEmailAndPasswordMock = vi.fn()

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

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: (...args: unknown[]) => signInWithEmailAndPasswordMock(...args),
  signInWithPopup: vi.fn(),
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
})

// eslint-disable-next-line import/first
import { useAuthStore } from '@/stores/auth'
// eslint-disable-next-line import/first
import { useToastStore } from '@/stores/toast'
// eslint-disable-next-line import/first
import { auth as authMock } from '@/services/firebase'

/*
 * TASK-188 SUPERSEDE A HIGH-1. La sincronizacion que estos dos tests protegian
 * ya no existe, y su desaparicion es el arreglo, no una regresion.
 *
 * HIGH-1 existia porque el email vivia DENTRO del documento /users/{uid} y por
 * lo tanto podia quedar rancio frente a Firebase Auth. TASK-188 saco el campo de
 * ese documento — es de lectura publica y las reglas de Firestore no filtran por
 * campo, asi que una peticion anonima se bajaba el email de todos los usuarios
 * (medido: 134 en produccion, 232 en dev). Sin campo que guardar no hay nada que
 * sincronizar: el email se lee siempre de auth.currentUser.
 *
 * La intencion original de HIGH-1 — que despues de un cambio de email por
 * verifyBeforeUpdateEmail la sesion use la direccion nueva y no la abandonada —
 * sigue cubierta, y mas fuerte: ahora la unica fuente es Firebase Auth.
 * Los tests que la fijan estan en auth.noEmailInUserDoc.test.ts.
 *
 * MEDIUM-2 (el mapeo del error de checkEmailVerification) no lo toca TASK-188 y
 * queda tal cual, abajo.
 */
describe('loadUserData email (TASK-188 reemplaza el sync de HIGH-1)', () => {
  it('toma el email de Firebase Auth e ignora el campo rancio del documento heredado', async () => {
    authMock.currentUser = { uid: 'uid3', email: 'new@example.com' } as never
    signInWithEmailAndPasswordMock.mockResolvedValueOnce({
      user: { uid: 'uid3', emailVerified: true },
    })
    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        // Documento previo a la migracion: todavia trae el campo.
        email: 'old@example.com',
        username: 'someuser',
        location: 'City',
        createdAt: { toDate: () => new Date() },
      }),
    })

    const store = useAuthStore()
    await store.login('new@example.com', 'pw')

    expect(store.user?.email).toBe('new@example.com')
    // Y no lo "corrige" en el documento: reescribirlo reabriria la fuga.
    expect(updateDocMock).not.toHaveBeenCalled()
  })

  it('no escribe nada en /users cuando el documento ya no trae email', async () => {
    authMock.currentUser = { uid: 'uid4', email: 'same@example.com' } as never
    signInWithEmailAndPasswordMock.mockResolvedValueOnce({
      user: { uid: 'uid4', emailVerified: true },
    })
    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        username: 'someuser',
        location: 'City',
        createdAt: { toDate: () => new Date() },
      }),
    })

    const store = useAuthStore()
    await store.login('same@example.com', 'pw')

    expect(updateDocMock).not.toHaveBeenCalled()
    expect(store.user?.email).toBe('same@example.com')
  })
})

describe('checkEmailVerification error mapping (MEDIUM-2)', () => {
  it('maps auth/user-token-expired to a "sign in again with your new email" message', async () => {
    authMock.currentUser = {
      reload: vi.fn().mockRejectedValueOnce({ code: 'auth/user-token-expired' }),
      emailVerified: false,
    } as never

    const store = useAuthStore()
    const toastStore = useToastStore()
    const result = await store.checkEmailVerification()

    expect(result).toBe(false)
    expect(toastStore.toasts.at(-1)?.message).toBe('auth.messages.emailChangedReauth')
  })

  it('maps auth/user-disabled to the same reauth message', async () => {
    authMock.currentUser = {
      reload: vi.fn().mockRejectedValueOnce({ code: 'auth/user-disabled' }),
      emailVerified: false,
    } as never

    const store = useAuthStore()
    const toastStore = useToastStore()
    const result = await store.checkEmailVerification()

    expect(result).toBe(false)
    expect(toastStore.toasts.at(-1)?.message).toBe('auth.messages.emailChangedReauth')
  })

  it('regression: other reload failures keep the generic verifyEmailError message', async () => {
    authMock.currentUser = {
      reload: vi.fn().mockRejectedValueOnce({ code: 'auth/network-request-failed' }),
      emailVerified: false,
    } as never

    const store = useAuthStore()
    const toastStore = useToastStore()
    const result = await store.checkEmailVerification()

    expect(result).toBe(false)
    expect(toastStore.toasts.at(-1)?.message).toBe('auth.messages.verifyEmailError')
  })
})
