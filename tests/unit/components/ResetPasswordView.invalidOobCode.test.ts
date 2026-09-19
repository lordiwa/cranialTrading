/**
 * TASK-301 regression lock (WG4-O1-01, wargaming corrida #4, veredicto ROTURA
 * REAL contra DEV, 2026-09-19).
 *
 * Measured defect: opening /reset-password?oobCode=<garbage> rendered the
 * full new-password form (strength meter working, RESTABLECER enabled) —
 * the oobCode was never validated against Firebase Auth before the form was
 * trusted. Submitting only surfaced a 4s auto-dismissing toast, after which
 * the form was back exactly as before: filled in, enabled, no escape hatch.
 * The asymmetry was the bug: WITHOUT any oobCode the same view already did
 * the right thing (the persistent invalidLink card + "request new link"),
 * so a garbage/expired code — the common real-world case — was handled
 * *worse* than no code at all.
 *
 * Fix under test: onMounted (fire-and-forget per CLAUDE.md Rule 8, no
 * `async onMounted`) calls authStore.verifyResetCode(oobCode). An invalid
 * result flips the SAME `invalidCode` state the no-oobCode path already
 * used (AC3: reuse, don't invent a parallel error UI). While the check is
 * in flight, a third `verifying` state keeps the form off-screen so the
 * button can never be enabled over an unconfirmed code (AC2).
 */
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'

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

let currentQuery: Record<string, string> = {}
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: currentQuery }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@unhead/vue', () => ({
  useSeoMeta: vi.fn(),
}))

vi.mock('../../../src/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const verifyResetCodeMock = vi.fn()
const resetPasswordMock = vi.fn()

const authState = reactive({
  verifyResetCode: verifyResetCodeMock,
  resetPassword: resetPasswordMock,
})

vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: () => authState,
}))

vi.mock('../../../src/stores/toast', () => ({
  useToastStore: () => ({ showToast: vi.fn() }),
}))

describe('ResetPasswordView with an invalid/expired oobCode (TASK-301)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    verifyResetCodeMock.mockReset()
    resetPasswordMock.mockReset()
    currentQuery = {}
  })

  const mountView = async () => {
    const { default: ResetPasswordView } = await import('../../../src/views/ResetPasswordView.vue')
    return mount(ResetPasswordView, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
  }

  // Regression harm: prevents the new-password form (and its enabled
  // RESTABLECER button) from ever rendering over a code Firebase has
  // already told us is invalid or expired.
  it('never renders the new-password form for a garbage oobCode — shows the persistent invalidLink card instead', async () => {
    currentQuery = { oobCode: 'CODIGO_FALSO_WG4' }
    verifyResetCodeMock.mockResolvedValue(false)

    const wrapper = await mountView()
    // Flush the fire-and-forget verifyOobCode() microtask chain.
    await Promise.resolve()
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(verifyResetCodeMock).toHaveBeenCalledWith('CODIGO_FALSO_WG4')
    expect(wrapper.find('#reset-password').exists()).toBe(false)
    expect(wrapper.text()).toContain('auth.resetPassword.invalidLink')
    // AC3: the escape hatch — same link the no-oobCode path already had.
    const requestNewLink = wrapper.findAllComponents(RouterLinkStub).find(
      (c) => c.props('to') === '/forgot-password',
    )
    expect(requestNewLink).toBeTruthy()
  })

  // Regression harm: prevents a submit against a code already known to be
  // invalid from ever reaching accounts:resetPassword on the backend.
  it('never calls resetPassword() on the backend when the oobCode is known invalid (AC4)', async () => {
    currentQuery = { oobCode: 'CODIGO_FALSO_WG4' }
    verifyResetCodeMock.mockResolvedValue(false)

    const wrapper = await mountView()
    await Promise.resolve()
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    // No submit button exists at all in this state (defense in depth is
    // also asserted directly in the store-level call count below).
    expect(wrapper.findAll('button').filter((b) => b.text().includes('auth.resetPassword.submit'))).toHaveLength(0)
    expect(resetPasswordMock).not.toHaveBeenCalled()
  })

  // Regression harm: prevents a brief window where the form is usable while
  // the async Firebase check is still in flight (the "same defect in
  // miniature" the ticket calls out) — no password inputs during that gap.
  it('does not render the form while the oobCode check is still in flight', async () => {
    currentQuery = { oobCode: 'CODIGO_FALSO_WG4' }
    let resolveVerify: (value: boolean) => void = () => {}
    verifyResetCodeMock.mockImplementation(
      () => new Promise<boolean>((resolve) => { resolveVerify = resolve }),
    )

    const wrapper = await mountView()
    await Promise.resolve()

    expect(wrapper.find('#reset-password').exists()).toBe(false)
    expect(wrapper.find('[data-testid="reset-verifying"]').exists()).toBe(true)

    resolveVerify(true)
    await Promise.resolve()
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('#reset-password').exists()).toBe(true)
  })

  // Regression control (unchanged behavior): a VALID oobCode still shows the
  // real form once verification succeeds.
  it('regression: shows the new-password form once a valid oobCode is confirmed', async () => {
    currentQuery = { oobCode: 'valid-code' }
    verifyResetCodeMock.mockResolvedValue(true)

    const wrapper = await mountView()
    await Promise.resolve()
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('#reset-password').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('auth.resetPassword.invalidLink')
  })
})
