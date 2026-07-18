/**
 * TASK-127: regression lock for the shared sanitized error-logging helper,
 * extracted from stores/auth.ts's TASK-122 `logAuthError` (hardened by its
 * TASK-122 review fixes: null-safe on `error ?? {}`, numeric `code`
 * accepted) so it can be reused by the other 11 stores instead of
 * duplicated.
 */
import { getErrorCode, logSanitizedError } from '@/utils/logSanitizedError'

describe('logSanitizedError', () => {
  it('logs a sanitized {code, message} object at error level by default', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logSanitizedError('Something failed', { code: 'auth/network-request-failed', message: 'boom' })
    expect(spy).toHaveBeenCalledWith('Something failed:', { code: 'auth/network-request-failed', message: 'boom' })
    spy.mockRestore()
  })

  it('logs at warn level when explicitly requested', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logSanitizedError('Non-fatal issue', { code: 'x', message: 'y' }, 'warn')
    expect(spy).toHaveBeenCalledWith('Non-fatal issue:', { code: 'x', message: 'y' })
    spy.mockRestore()
  })

  it('never leaks extra fields (e.g. customData.credential) beyond code/message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const secretToken = 'super-secret-oauth-access-token'
    logSanitizedError('Google login error', {
      code: 'auth/account-exists-with-different-credential',
      message: 'boom',
      customData: { credential: { accessToken: secretToken } },
    })
    const [, sanitized] = spy.mock.calls[0]
    expect(sanitized).not.toHaveProperty('customData')
    expect(Object.keys(sanitized as object).sort()).toEqual(['code', 'message'])
    expect(JSON.stringify(sanitized)).not.toContain(secretToken)
    spy.mockRestore()
  })

  it('does not throw and logs {code: undefined, message: undefined} when error is null', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => { logSanitizedError('Null error', null) }).not.toThrow()
    expect(spy).toHaveBeenCalledWith('Null error:', { code: undefined, message: undefined })
    spy.mockRestore()
  })

  it('does not throw and logs a safe shape when error is undefined', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => { logSanitizedError('Undefined error', undefined) }).not.toThrow()
    expect(spy).toHaveBeenCalledWith('Undefined error:', { code: undefined, message: undefined })
    spy.mockRestore()
  })

  it('does not throw when error is a plain string, and drops it (not a safe code/message shape)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => { logSanitizedError('String error', 'just a string') }).not.toThrow()
    expect(spy).toHaveBeenCalledWith('String error:', { code: undefined, message: undefined })
    spy.mockRestore()
  })

  it('accepts a numeric code (e.g. GeolocationPositionError) instead of dropping it', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logSanitizedError('Geolocation failed', { code: 1, message: 'User denied Geolocation' }, 'warn')
    expect(spy).toHaveBeenCalledWith('Geolocation failed:', { code: 1, message: 'User denied Geolocation' })
    spy.mockRestore()
  })

  it('handles a real Error instance (message present, no code) without throwing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => { logSanitizedError('Real error', new Error('kaboom')) }).not.toThrow()
    expect(spy).toHaveBeenCalledWith('Real error:', { code: undefined, message: 'kaboom' })
    spy.mockRestore()
  })

  it('drops a non-string/non-number code (e.g. an object) instead of leaking it', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logSanitizedError('Weird shape', { code: { nested: true }, message: 42 })
    expect(spy).toHaveBeenCalledWith('Weird shape:', { code: undefined, message: undefined })
    spy.mockRestore()
  })
})

describe('getErrorCode', () => {
  it('extracts a string code', () => {
    expect(getErrorCode({ code: 'auth/wrong-password' })).toBe('auth/wrong-password')
  })

  it('extracts a numeric code', () => {
    expect(getErrorCode({ code: 2 })).toBe(2)
  })

  it('returns undefined without throwing for null', () => {
    expect(() => getErrorCode(null)).not.toThrow()
    expect(getErrorCode(null)).toBeUndefined()
  })

  it('returns undefined without throwing for undefined', () => {
    expect(() => getErrorCode(undefined)).not.toThrow()
    expect(getErrorCode(undefined)).toBeUndefined()
  })

  it('returns undefined for a plain string error', () => {
    expect(getErrorCode('boom')).toBeUndefined()
  })

  it('returns undefined for a non-string/non-number code field', () => {
    expect(getErrorCode({ code: { nested: true } })).toBeUndefined()
  })

  it('returns undefined when there is no code field at all', () => {
    expect(getErrorCode({ message: 'no code here' })).toBeUndefined()
  })
})
