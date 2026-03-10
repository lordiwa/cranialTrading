const STORAGE_PREFIX = 'chunk-reload:'

/**
 * Attempt a single reload for a failed chunk. Returns true if reload was triggered.
 * Uses sessionStorage to ensure at most ONE retry per path per session.
 */
export function handleChunkLoadError(
  path: string,
  storage: Storage = sessionStorage,
  reload: (p: string) => void = (p) => { window.location.assign(p) },
): boolean {
  const key = `${STORAGE_PREFIX}${path}`
  if (storage.getItem(key)) {
    console.error(`[chunkReload] Already retried "${path}", not reloading again.`)
    return false
  }
  storage.setItem(key, Date.now().toString())
  reload(path)
  return true
}

/**
 * Clear the retry flag for a path after successful navigation.
 */
export function clearChunkReloadFlag(
  path: string,
  storage: Storage = sessionStorage,
): void {
  storage.removeItem(`${STORAGE_PREFIX}${path}`)
}
