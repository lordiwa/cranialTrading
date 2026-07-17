/**
 * TASK-129 (perf F2): last-known Firebase Auth resolution cached in
 * localStorage. Written by the auth store the instant onAuthStateChanged
 * fires, read by the router guard + App.vue's loader gate to decide whether
 * a requiresGuest route can paint optimistically before the next Firebase
 * round-trip resolves.
 */
import { getLastKnownAuthState, setLastKnownAuthState } from '@/utils/authLastKnown'

beforeEach(() => {
  localStorage.clear()
})

describe('getLastKnownAuthState', () => {
  it('returns null when nothing has been stored yet', () => {
    expect(getLastKnownAuthState()).toBeNull()
  })

  it('returns "authenticated" when that value was stored', () => {
    localStorage.setItem('ct_auth_last_known', 'authenticated')
    expect(getLastKnownAuthState()).toBe('authenticated')
  })

  it('returns "guest" when that value was stored', () => {
    localStorage.setItem('ct_auth_last_known', 'guest')
    expect(getLastKnownAuthState()).toBe('guest')
  })

  it('returns null for a garbage/unexpected stored value', () => {
    localStorage.setItem('ct_auth_last_known', 'not-a-real-state')
    expect(getLastKnownAuthState()).toBeNull()
  })

  it('returns null instead of throwing when localStorage.getItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: storage disabled')
    })
    expect(() => getLastKnownAuthState()).not.toThrow()
    expect(getLastKnownAuthState()).toBeNull()
    spy.mockRestore()
  })
})

describe('setLastKnownAuthState', () => {
  it('persists "authenticated" so a subsequent read sees it', () => {
    setLastKnownAuthState('authenticated')
    expect(getLastKnownAuthState()).toBe('authenticated')
  })

  it('persists "guest" so a subsequent read sees it', () => {
    setLastKnownAuthState('guest')
    expect(getLastKnownAuthState()).toBe('guest')
  })

  it('overwrites a previous value', () => {
    setLastKnownAuthState('authenticated')
    setLastKnownAuthState('guest')
    expect(getLastKnownAuthState()).toBe('guest')
  })

  it('does not throw when localStorage.setItem throws (e.g. private browsing)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => { setLastKnownAuthState('authenticated') }).not.toThrow()
    spy.mockRestore()
  })
})
