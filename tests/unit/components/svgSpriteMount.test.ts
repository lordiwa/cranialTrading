/**
 * TASK-121 regression lock.
 *
 * Root cause (see also the comment on the vue() plugin in vitest.config.ts):
 * `@vue/compiler-sfc`'s default `transformAssetUrls` node-transform (wired in via
 * `@vitejs/plugin-vue`'s `template` compiler options) rewrites any STATIC
 * `<use href="/some/path.svg#frag">` attribute into an ES module import of the
 * asset path. Under Vitest's Node-based SSR module evaluator
 * (`VitestModuleEvaluator` / Vite's `ModuleRunner`), resolving that
 * `/icons.svg` import ends up calling Node's `Module.createRequire()` with a
 * malformed `file:///icons.svg` URL (no drive segment) — which Node rejects
 * on Windows only with `TypeError [ERR_INVALID_ARG_VALUE]`.
 *
 * Fix: vitest.config.ts excludes the `use` tag from the vue() plugin's
 * `template.transformAssetUrls.tags` map (test-env only — vite.config.ts,
 * and therefore `npx vite build`, is untouched). This test mounts the two
 * components the original TASK-118 review flagged as broken
 * (RegisterView, LandingHeader) — both render a literal
 * `<use href="/icons.svg#cranial-logo">` — as the regression sensor.
 */
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

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
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@unhead/vue', () => ({
  useSeoMeta: vi.fn(),
}))

vi.mock('../../../src/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('../../../src/stores/auth', () => ({
  useAuthStore: () => ({
    user: null,
    emailVerified: false,
    register: vi.fn(),
    loginWithGoogle: vi.fn(),
    sendVerificationEmail: vi.fn(),
    checkEmailVerification: vi.fn(),
    changeRegistrationEmail: vi.fn(),
  }),
}))

vi.mock('../../../src/stores/toast', () => ({
  useToastStore: () => ({ showToast: vi.fn() }),
}))

describe('components with literal svg sprite <use href="/icons.svg#..."> mount on Windows (TASK-121)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('mounts RegisterView without crashing', async () => {
    const { default: RegisterView } = await import('../../../src/views/RegisterView.vue')
    const wrapper = mount(RegisterView, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.find('use').attributes('href')).toBe('/icons.svg#cranial-logo')
  })

  it('mounts LandingHeader without crashing', async () => {
    const { default: LandingHeader } = await import('../../../src/components/landing/LandingHeader.vue')
    // The wordmark logo (which renders the literal "/icons.svg#..." <use>
    // that crashed vitest) sits inside the RouterLink's default slot, so a
    // plain `true` stub (which doesn't render slot content) would hide it —
    // use RouterLinkStub, which does render its default slot.
    const wrapper = mount(LandingHeader, {
      props: { query: '' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    // LandingHeader renders several <use> elements (IconV2 sprite icons use
    // "#i-*" fragment-only refs); only the wordmark logo uses the literal
    // "/icons.svg#..." path that crashed vitest — assert on that one.
    const logoUse = wrapper.findAll('use').find(u => u.attributes('href') === '/icons.svg#cranial-logo')
    expect(logoUse).toBeDefined()
  })
})
