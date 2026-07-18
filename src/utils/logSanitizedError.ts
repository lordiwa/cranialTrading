/**
 * TASK-127: sanitized error logging, extracted from stores/auth.ts's
 * TASK-122 `logAuthError` (which itself absorbed a TASK-122 review fix:
 * error can be null/undefined — e.g. a Promise.reject(null) — so
 * destructuring it directly would throw and let the failure escape the
 * caller's catch block before any toast fires). Some Firebase Auth error
 * shapes carry a `customData.credential`
 * (e.g. account-exists-with-different-credential) — logging the raw object
 * to the console is poor hygiene in production. Only the safe, string/number
 * `code` and string `message` fields are ever passed to console.
 */
export const logSanitizedError = (context: string, error: unknown, level: 'error' | 'warn' = 'error'): void => {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown }
  const sanitized = {
    // GeolocationPositionError.code is numeric (1/2/3) — accept it
    // alongside Firebase's string codes instead of dropping it.
    code: typeof code === 'string' || typeof code === 'number' ? code : undefined,
    message: typeof message === 'string' ? message : undefined,
  }
  if (level === 'warn') {
    console.warn(`${context}:`, sanitized)
  } else {
    console.error(`${context}:`, sanitized)
  }
}

/**
 * Null-safe extraction of a Firebase/browser error's `code` field, for
 * catch blocks that branch on it (e.g. `auth/wrong-password`,
 * `auth/user-not-found`). A raw `(error as { code?: string }).code` access
 * throws when error is null/undefined (Promise.reject(null)), which used to
 * escape the catch block entirely and skip its toast — see TASK-127.
 */
export const getErrorCode = (error: unknown): string | number | undefined => {
  const { code } = (error ?? {}) as { code?: unknown }
  return typeof code === 'string' || typeof code === 'number' ? code : undefined
}
