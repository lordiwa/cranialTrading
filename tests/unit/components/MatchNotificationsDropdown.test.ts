/**
 * TASK-148: /inicio ran loadAllMatches() on mount via this component (hidden
 * md:block is CSS-only — it still mounts on every authenticated route,
 * mobile included), firing 6 Firestore collection reads plus batched
 * deletes with no user gesture at all.
 *
 * Fix: the load defers to the bell click (the user's gesture over the
 * notifications entry point) instead of firing on mount.
 */
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MatchNotificationsDropdown from '../../../src/components/layout/MatchNotificationsDropdown.vue'

const loadAllMatches = vi.fn().mockResolvedValue(undefined)

vi.mock('@/stores/matches', () => ({
  useMatchesStore: () => ({
    newMatches: [],
    loadAllMatches,
  }),
}))

vi.mock('../../../src/composables/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, _params?: Record<string, unknown>) => key,
  }),
}))

describe('MatchNotificationsDropdown: deferred load (TASK-148)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    loadAllMatches.mockClear()
  })

  it('does not call loadAllMatches on mount', () => {
    mount(MatchNotificationsDropdown, {
      props: { active: false },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    expect(loadAllMatches).not.toHaveBeenCalled()
  })

  it('calls loadAllMatches when the user clicks the bell', async () => {
    const wrapper = mount(MatchNotificationsDropdown, {
      props: { active: false },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    await wrapper.find('button').trigger('click')

    expect(loadAllMatches).toHaveBeenCalledTimes(1)
  })

  it('does not reload on a second click (already loaded)', async () => {
    const wrapper = mount(MatchNotificationsDropdown, {
      props: { active: false },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    const button = wrapper.find('button')
    await button.trigger('click')
    await button.trigger('click')

    expect(loadAllMatches).toHaveBeenCalledTimes(1)
  })
})
