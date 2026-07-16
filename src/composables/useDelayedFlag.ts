/**
 * useDelayedFlag — anti-flicker wrapper around a boolean source.
 *
 * TASK-117: shows a `true` result only after the source has stayed `true`
 * for `delayMs` (default 200ms), so a fast in-flight request (e.g. a
 * server-side query that resolves quickly) never flashes a loader.
 * Turns `false` immediately when the source turns `false`, clearing any
 * pending timer so nothing appears after the fact.
 */

import { onScopeDispose, type Ref, ref, watch } from 'vue'

export function useDelayedFlag(source: () => boolean, delayMs = 200): Ref<boolean> {
  const delayed = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  // flush: 'sync' ensures the watcher fires synchronously on source mutation
  // (required so setTimeout-based delay tests work with vi.useFakeTimers,
  // matching the convention in useCollectionPagination.ts)
  watch(
    source,
    (isActive) => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (isActive) {
        timer = setTimeout(() => {
          delayed.value = true
          timer = null
        }, delayMs)
      } else {
        delayed.value = false
      }
    },
    { immediate: true, flush: 'sync' }
  )

  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
  })

  return delayed
}
