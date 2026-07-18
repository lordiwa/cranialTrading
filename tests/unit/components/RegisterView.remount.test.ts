/**
 * TASK-126 regression lock.
 *
 * Reviewer finding on TASK-124 (2026-07-17, MEDIUM): `registered` is a local
 * component ref (RegisterView.vue) and onMounted only redirected away when
 * authStore.user && authStore.emailVerified. Remounting /register (reload,
 * or navigate-away-and-back) while logged in with an UNVERIFIED account
 * showed the blank registration form instead of the pending-verification
 * screen — a re-submit from there re-runs authStore.register() and collides
 * with the account's own already-reserved username (D-06), producing a
 * misleading "username taken" toast (the original TASK-124 symptom via this
 * residual path).
 *
 * Fix under test: onMounted also recognizes authStore.user && !emailVerified
 * and shows the pending screen (registered.value = true) instead of the
 * form, so no UI path can re-trigger register() while a session already
 * exists. Mirrors the mock shape from svgSpriteMount.test.ts (TASK-121,
 * which fixed the Windows-only vitest crash on literal
 * <use href="/icons.svg#..."> so RegisterView can be mount()-ed at all) but
 * makes authStore.user/emailVerified mutable per test via getters.
 */
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const routerPushMock = vi.fn()

vi.mock('@/services/firebase', () => ({
  auth: {},
  db: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
  getFirestore: vi.fn(),
  serverTimestamp: vi.fn(() => new Date()),
  Timestamp: { fromDate: vi.fn((d: Date) => d) },
}))

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  onAuthStateChanged: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: routerPushMock }),
}))

vi.mock('@unhead/vue', () => ({
  useSeoMeta: vi.fn(),
}))

vi.mock('../../../src/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const registerMock = vi.fn()

// Mutable per-test auth session state, read through getters so the mocked
// store reflects whatever the test set BEFORE mount() — same singleton
// object reused across mounts, mirroring how the real Pinia store instance
// survives an in-SPA remount (only a hard reload creates a fresh one).
const authState: { user: { id: string; email: string } | null; emailVerified: boolean } = {
  user: null,
  emailVerified: false,
}

vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: () => ({
    get user() { return authState.user },
    get emailVerified() { return authState.emailVerified },
    register: registerMock,
    loginWithGoogle: vi.fn(),
    sendVerificationEmail: vi.fn(),
    checkEmailVerification: vi.fn(),
    changeRegistrationEmail: vi.fn(),
  }),
}))

vi.mock('../../../src/stores/toast', () => ({
  useToastStore: () => ({ showToast: vi.fn() }),
}))

describe('RegisterView remount with an existing session (TASK-126)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    authState.user = null
    authState.emailVerified = false
    routerPushMock.mockClear()
    registerMock.mockClear()
  })

  const mountView = async () => {
    const { default: RegisterView } = await import('../../../src/views/RegisterView.vue')
    return mount(RegisterView, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
  }

  it('shows the pending-verification screen (not the blank form) when remounted with an unverified logged-in user', async () => {
    authState.user = { id: 'u1', email: 'pending@example.com' }
    authState.emailVerified = false

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="register-submit"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('auth.verify.title')
  })

  it('never re-triggers register() on remount with an unverified logged-in user (no submit path exists)', async () => {
    authState.user = { id: 'u1', email: 'pending@example.com' }
    authState.emailVerified = false

    await mountView()

    // The registration <form> (and its submit button) is not in the DOM at
    // all when a session already exists, so there is no UI path left that
    // could dispatch a second handleRegister -> authStore.register() call.
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('keeps the TASK-124 change-email flow available on the remounted pending screen', async () => {
    authState.user = { id: 'u1', email: 'pending@example.com' }
    authState.emailVerified = false

    const wrapper = await mountView()
    const changeEmailButtons = wrapper.findAll('button').filter(b => b.text() === 'auth.verify.changeEmail')
    expect(changeEmailButtons).toHaveLength(1)

    await changeEmailButtons[0].trigger('click')

    expect(wrapper.find('#register-new-email').exists()).toBe(true)
  })

  it('regression: remounting with a VERIFIED logged-in user still redirects away (unchanged behavior)', async () => {
    authState.user = { id: 'u1', email: 'verified@example.com' }
    authState.emailVerified = true

    await mountView()

    expect(routerPushMock).toHaveBeenCalledWith('/dashboard')
  })

  it('regression: remounting with no session shows the normal registration form', async () => {
    authState.user = null
    authState.emailVerified = false

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="register-submit"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('auth.verify.title')
    expect(routerPushMock).not.toHaveBeenCalled()
  })
})
