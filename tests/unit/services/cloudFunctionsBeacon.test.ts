/**
 * TASK-237 AC2: sendCardIndexDeltaBeacon builds the applyCardIndexDelta
 * callable request BY HAND (not httpsCallable) so it can pass
 * `keepalive: true` — the Functions SDK's own fetch has no way to opt into
 * that, and a normal in-flight fetch gets cancelled by the browser once
 * page unload starts (the trap the ticket calls out explicitly).
 */

const { mockIdTokenListenerBox } = vi.hoisted(() => ({
  mockIdTokenListenerBox: { current: undefined as ((user: { getIdToken: () => Promise<string> } | null) => void) | undefined },
}))

vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: vi.fn(),
}))

vi.mock('firebase/app', () => ({
  getApp: () => ({}),
}))

vi.mock('firebase/auth', () => ({
  onIdTokenChanged: (_auth: unknown, cb: typeof mockIdTokenListenerBox.current) => {
    mockIdTokenListenerBox.current = cb
    return () => {}
  },
}))

vi.mock('@/services/firebase', () => ({
  db: {},
  auth: {},
}))

import { sendCardIndexDeltaBeacon } from '@/services/cloudFunctions'

describe('sendCardIndexDeltaBeacon', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'cranial-trading-dev')
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ result: {} }) })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('does nothing and returns false for an empty batch', () => {
    const sent = sendCardIndexDeltaBeacon([])
    expect(sent).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('POSTs a keepalive fetch to the applyCardIndexDelta callable URL with the {data: {mutations}} envelope', () => {
    const mutations = [{ cardId: 'card-1', action: 'update' as const }]
    const sent = sendCardIndexDeltaBeacon(mutations)

    expect(sent).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://us-central1-cranial-trading-dev.cloudfunctions.net/applyCardIndexDelta')
    expect(init.method).toBe('POST')
    expect(init.keepalive).toBe(true)
    expect(JSON.parse(init.body)).toEqual({ data: { mutations } })
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('attaches a bearer token once onIdTokenChanged has resolved one', async () => {
    expect(mockIdTokenListenerBox.current).toBeTypeOf('function')
    mockIdTokenListenerBox.current?.({ getIdToken: async () => 'fresh-id-token' })
    // Let the cached-token promise chain settle.
    await Promise.resolve()
    await Promise.resolve()

    sendCardIndexDeltaBeacon([{ cardId: 'card-1', action: 'update' }])

    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer fresh-id-token')
  })

  it('omits the Authorization header when no token has been cached yet (signed-out / not-yet-resolved)', async () => {
    mockIdTokenListenerBox.current?.(null)
    await Promise.resolve()

    sendCardIndexDeltaBeacon([{ cardId: 'card-1', action: 'update' }])

    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('returns false without throwing when there is no project id configured', () => {
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '')
    const sent = sendCardIndexDeltaBeacon([{ cardId: 'card-1', action: 'update' }])
    expect(sent).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not throw when the keepalive fetch itself rejects (fire-and-forget)', async () => {
    mockFetch.mockRejectedValue(new Error('network gone'))
    expect(() => sendCardIndexDeltaBeacon([{ cardId: 'card-1', action: 'update' }])).not.toThrow()
  })

  /**
   * TASK-237 LOW-2: a getIdToken() call from an EARLIER onIdTokenChanged
   * (login) can still be in flight when a LATER onIdTokenChanged(null)
   * (logout) fires and clears the cache — without a generation guard, that
   * stale getIdToken() result repopulates _cachedIdToken with a token that
   * belongs to nobody currently signed in.
   */
  it('discards a stale getIdToken() result that resolves after a later logout (generation guard)', async () => {
    let resolveStaleToken: ((token: string) => void) | undefined
    const staleTokenPromise = new Promise<string>((resolve) => { resolveStaleToken = resolve })

    // Login fires; its getIdToken() call is still pending.
    mockIdTokenListenerBox.current?.({ getIdToken: () => staleTokenPromise })

    // Logout fires BEFORE that getIdToken() call settles — this is the
    // generation bump that should make the stale resolution below a no-op.
    mockIdTokenListenerBox.current?.(null)

    // The stale getIdToken() now resolves, late.
    resolveStaleToken?.('stale-token-from-logged-out-user')
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    sendCardIndexDeltaBeacon([{ cardId: 'card-1', action: 'update' }])

    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('still caches a token from a getIdToken() call that resolves BEFORE any later auth change (control negative for the generation guard)', async () => {
    mockIdTokenListenerBox.current?.({ getIdToken: async () => 'still-valid-token' })
    await Promise.resolve()
    await Promise.resolve()

    sendCardIndexDeltaBeacon([{ cardId: 'card-1', action: 'update' }])

    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer still-valid-token')
  })
})
