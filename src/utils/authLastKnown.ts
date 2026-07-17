/**
 * TASK-129 (perf F2): cache of the most recently known Firebase Auth
 * resolution, written by the auth store the instant onAuthStateChanged
 * fires. Read by the router guard (@/router/authGuard) and App.vue's
 * full-screen loader gate to decide whether a requiresGuest route (e.g.
 * /login) can paint optimistically before the next Firebase round-trip
 * resolves, without flickering for the common "already logged in" case.
 */

export type LastKnownAuthState = 'authenticated' | 'guest'

const STORAGE_KEY = 'ct_auth_last_known'

export const getLastKnownAuthState = (): LastKnownAuthState | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'authenticated' || value === 'guest' ? value : null
  } catch {
    return null
  }
}

export const setLastKnownAuthState = (state: LastKnownAuthState): void => {
  try {
    localStorage.setItem(STORAGE_KEY, state)
  } catch {
    // best-effort: private browsing / storage disabled
  }
}
