/**
 * Regression lock for TASK-171 — App.vue used to call preloadPriceData()
 * unconditionally in onMounted, downloading AllPricesToday.json.gz (5.48MB
 * compressed) on EVERY route (including /inicio and /login, neither of
 * which shows a single price) on every cold boot. On the slow 4G the app
 * targets, that's tens of seconds of dead-weight download before a guest
 * ever sees a price.
 *
 * preloadPriceData() is the exact same memoized fetchPriceData() that
 * getCardPrices() already calls lazily (services/mtgjson.ts) — every real
 * price consumer (CollectionTotalsPanel's already-3s-deferred
 * fetchAllPrices, per-card useCardPrices() in grid cards/modals/search
 * results/match cards) triggers it on its own, exactly when needed. So the
 * fix is a straight removal from App.vue, not a replacement call — this
 * test locks that the call is gone, not that it moved somewhere else.
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const preloadPriceDataMock = vi.fn()
const initAuthMock = vi.fn()

vi.mock('@/services/mtgjson', () => ({
  preloadPriceData: preloadPriceDataMock,
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    loading: false,
    user: null,
    initAuth: initAuthMock,
  }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ meta: {}, matched: [], name: undefined, path: '/' }),
}))

vi.mock('@unhead/vue', () => ({
  useHead: vi.fn(),
}))

vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'en' } }),
}))

vi.mock('@/router/authGuard', () => ({
  shouldBlockOnAuthLoading: () => false,
}))

vi.mock('@/utils/authLastKnown', () => ({
  getLastKnownAuthState: () => 'guest',
}))

beforeEach(() => {
  setActivePinia(createPinia())
  preloadPriceDataMock.mockClear()
  initAuthMock.mockClear()
})

describe('App.vue mount (TASK-171)', () => {
  it('never calls preloadPriceData() on mount', async () => {
    const { default: App } = await import('@/App.vue')

    mount(App, {
      global: {
        stubs: {
          IconSpriteV2: true,
          BaseToast: true,
          BaseLoader: true,
          ConfirmModal: true,
          PromptModal: true,
          AppFooter: true,
          RouterView: true,
        },
      },
    })

    expect(preloadPriceDataMock).not.toHaveBeenCalled()
    // Sanity check: onMounted itself did run (initAuth still fires) — an
    // empty test that never actually mounted would pass for the wrong
    // reason otherwise.
    expect(initAuthMock).toHaveBeenCalledTimes(1)
  })
})
