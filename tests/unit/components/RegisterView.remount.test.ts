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
 * Fix under test (round 1, commit 7d391e1): onMounted also recognizes
 * authStore.user && !emailVerified and shows the pending screen
 * (registered.value = true) instead of the form, so no UI path can
 * re-trigger register() while a session already exists.
 *
 * Round 2 (reviewer HIGH on 7d391e1): the router guard (authGuard.ts) was
 * redirecting EVERY authenticated user away from /register before
 * RegisterView could even mount, making the round-1 onMounted fix
 * unreachable in production — see authGuard.test.ts for that half. This
 * file's round-2 addition covers the component's own remaining gap
 * (reviewer MEDIUM-1): onMounted only reads authStore.user/emailVerified
 * SYNCHRONOUSLY at mount time. Once the guard now lets an unverified
 * session's navigation through, there's still a real window (last-known
 * guest/null, optimistic paint) where RegisterView mounts BEFORE the SDK's
 * onAuthStateChanged callback has resolved — the store's `user` arrives
 * asynchronously, after mount. A plain onMounted check would miss that and
 * leave the blank form live (with a real submit path) until the user
 * manually reloads. Fixed by replacing the onMounted check with a `watch`
 * (immediate: true, no async callback — see CLAUDE.md's onMounted rule)
 * over authStore.user/emailVerified, so a later-arriving session flips
 * registered.value reactively.
 *
 * Mirrors the mock shape from svgSpriteMount.test.ts (TASK-121, which fixed
 * the Windows-only vitest crash on literal <use href="/icons.svg#..."> so
 * RegisterView can be mount()-ed at all) but makes authStore.user/
 * emailVerified a real Vue `reactive()` object — a plain-object mock with
 * getters (round 1) can't exercise a `watch`, since Vue's reactivity system
 * never sees the mutation.
 */
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, reactive } from 'vue'

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

// Mutable per-test auth session state as a real Vue reactive() object — the
// same singleton object/proxy is returned by every useAuthStore() call,
// mirroring how the real Pinia store instance survives an in-SPA remount
// (only a hard reload creates a fresh one) AND how it survives an
// async-resolves-after-mount session arrival (round 2: needs to be
// reactive so the component's watch can observe the later mutation).
const authState = reactive<{
  user: { id: string; email: string } | null
  emailVerified: boolean
  register: typeof registerMock
  loginWithGoogle: ReturnType<typeof vi.fn>
  sendVerificationEmail: ReturnType<typeof vi.fn>
  checkEmailVerification: ReturnType<typeof vi.fn>
  changeRegistrationEmail: ReturnType<typeof vi.fn>
}>({
  user: null,
  emailVerified: false,
  register: registerMock,
  loginWithGoogle: vi.fn(),
  sendVerificationEmail: vi.fn(),
  checkEmailVerification: vi.fn(),
  changeRegistrationEmail: vi.fn(),
})

vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: () => authState,
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
    // Review MEDIUM-2 (round 3): `email` is a local ref, empty on a fresh
    // mount — the pending screen must fall back to the account's own email
    // from the store, not show "We've sent an email to " blank.
    expect(wrapper.text()).toContain('pending@example.com')
  })

  it('never re-triggers register() on remount with an unverified logged-in user (no submit path exists)', async () => {
    authState.user = { id: 'u1', email: 'pending@example.com' }
    authState.emailVerified = false

    const wrapper = await mountView()

    // Review LOW-1 (round 2): this assertion alone is trivially true even
    // pre-fix (nothing in the test ever clicks submit), so it does not by
    // itself lock the regression. The REAL lock is the absence of the
    // <form> element entirely — asserted here directly, not just via the
    // submit-button-only check in the sibling test above — which is what
    // actually removes every UI path that could dispatch a second
    // handleRegister -> authStore.register() call.
    expect(wrapper.findAll('form')).toHaveLength(0)
    expect(registerMock).not.toHaveBeenCalled()
  })

  it('shows the pending screen when an unverified session arrives AFTER mount (async SDK restore, review MEDIUM-1)', async () => {
    // Simulates the real-world race the guard's optimistic-paint path
    // allows through: RegisterView mounts with no session yet known
    // (authStore.user still null — onAuthStateChanged hasn't resolved),
    // so the normal form renders first...
    authState.user = null
    authState.emailVerified = false

    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="register-submit"]').exists()).toBe(true)

    // ...then the SDK resolves an existing unverified session shortly after.
    authState.user = { id: 'u1', email: 'pending@example.com' }
    authState.emailVerified = false
    await nextTick()

    expect(wrapper.find('[data-testid="register-submit"]').exists()).toBe(false)
    expect(wrapper.findAll('form')).toHaveLength(0)
    expect(wrapper.text()).toContain('auth.verify.title')
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
