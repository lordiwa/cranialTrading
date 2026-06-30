/**
 * Unit tests for useTour composable — TASK-082
 *
 * Covers acceptance criteria:
 * - isTourCompleted: store as source of truth (AC-2/3), localStorage as fallback (AC-5)
 * - markTourCompleted: writes Firestore + localStorage + in-memory store (AC-1)
 * - Backfill: localStorage completed but store missing → fires Firestore write (AC-5)
 * - skipTour: triggers Firestore write (AC-1)
 */

import { vi } from 'vitest'

// Mock driver.js (uses DOM APIs not available in happy-dom, not under test)
vi.mock('driver.js', () => ({
  driver: vi.fn(() => ({ setSteps: vi.fn(), drive: vi.fn() })),
}))
vi.mock('driver.js/dist/driver.css', () => ({}))

// Mock i18n
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

// Mock Firestore
const updateDocMock = vi.fn()
const docMock = vi.fn((_db: unknown, col: string, id: string) => ({ col, id }))

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => docMock(...(args as [unknown, string, string])),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
}))

vi.mock('@/services/firebase', () => ({ db: {} }))

// Mutable auth state — tests adjust user to simulate different auth states
type MockUser = { id: string; tourCompleted?: boolean } | null
const authState: { user: MockUser } = {
  user: { id: 'uid1', tourCompleted: false },
}
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authState,
}))

// eslint-disable-next-line import/first
import { useTour } from '@/composables/useTour'

beforeEach(() => {
  updateDocMock.mockReset()
  updateDocMock.mockResolvedValue(undefined)
  docMock.mockClear()
  authState.user = { id: 'uid1', tourCompleted: false }
  localStorage.clear()
})

// ─── isTourCompleted ──────────────────────────────────────────────────────────

describe('isTourCompleted', () => {
  it('returns false when store flag is absent and localStorage has no flag', () => {
    const { isTourCompleted } = useTour()
    expect(isTourCompleted()).toBe(false)
  })

  it('returns true when authStore.user.tourCompleted is true (store as source of truth)', () => {
    authState.user = { id: 'uid1', tourCompleted: true }
    const { isTourCompleted } = useTour()
    expect(isTourCompleted()).toBe(true)
  })

  it('returns true via localStorage when store flag is false (tolerant read)', () => {
    authState.user = { id: 'uid1', tourCompleted: false }
    localStorage.setItem('cranial_tour_completed_uid1', 'true')
    const { isTourCompleted } = useTour()
    expect(isTourCompleted()).toBe(true)
  })

  it('returns true via localStorage when store flag is undefined (tolerant read)', () => {
    authState.user = { id: 'uid1', tourCompleted: undefined }
    localStorage.setItem('cranial_tour_completed_uid1', 'true')
    const { isTourCompleted } = useTour()
    expect(isTourCompleted()).toBe(true)
  })

  it('returns false when user is null', () => {
    authState.user = null
    const { isTourCompleted } = useTour()
    expect(isTourCompleted()).toBe(false)
  })

  it('returns false when logged in but neither store nor localStorage has the flag', () => {
    authState.user = { id: 'uid1', tourCompleted: undefined }
    const { isTourCompleted } = useTour()
    expect(isTourCompleted()).toBe(false)
  })
})

// ─── markTourCompleted ────────────────────────────────────────────────────────

describe('markTourCompleted', () => {
  it('calls Firestore updateDoc with { tourCompleted: true }', async () => {
    const { markTourCompleted } = useTour()
    await markTourCompleted()
    expect(updateDocMock).toHaveBeenCalledTimes(1)
    expect(updateDocMock.mock.calls[0]?.[1]).toEqual({ tourCompleted: true })
  })

  it('passes the correct user doc reference to updateDoc', async () => {
    const { markTourCompleted } = useTour()
    await markTourCompleted()
    expect(docMock).toHaveBeenCalledWith({}, 'users', 'uid1')
  })

  it('writes the localStorage flag', async () => {
    const { markTourCompleted } = useTour()
    await markTourCompleted()
    expect(localStorage.getItem('cranial_tour_completed_uid1')).toBe('true')
  })

  it('updates authStore.user.tourCompleted in memory to true', async () => {
    authState.user = { id: 'uid1', tourCompleted: false }
    const { markTourCompleted } = useTour()
    await markTourCompleted()
    expect(authState.user?.tourCompleted).toBe(true)
  })

  it('does not call updateDoc when user is null', async () => {
    authState.user = null
    const { markTourCompleted } = useTour()
    await markTourCompleted()
    expect(updateDocMock).not.toHaveBeenCalled()
  })

  it('swallows Firestore errors gracefully — localStorage and in-memory store still updated', async () => {
    updateDocMock.mockRejectedValueOnce(new Error('permission denied'))
    const { markTourCompleted } = useTour()
    await expect(markTourCompleted()).resolves.toBeUndefined()
    expect(localStorage.getItem('cranial_tour_completed_uid1')).toBe('true')
    expect(authState.user?.tourCompleted).toBe(true)
  })
})

// ─── skipTour triggers Firestore write ───────────────────────────────────────

describe('skipTour', () => {
  it('writes tourCompleted: true to Firestore when tour is skipped', async () => {
    const { skipTour } = useTour()
    skipTour()
    await new Promise<void>(resolve => { setTimeout(resolve, 0) })
    expect(updateDocMock).toHaveBeenCalledWith(
      expect.objectContaining({ col: 'users', id: 'uid1' }),
      { tourCompleted: true },
    )
  })
})

// ─── backfill ─────────────────────────────────────────────────────────────────

describe('backfill: localStorage completed but store flag missing', () => {
  it('fires a Firestore write when localStorage says done but store flag is false', async () => {
    authState.user = { id: 'uid1', tourCompleted: false }
    localStorage.setItem('cranial_tour_completed_uid1', 'true')
    const { isTourCompleted } = useTour()

    isTourCompleted()
    // Allow the fire-and-forget async write to settle
    await new Promise<void>(resolve => { setTimeout(resolve, 0) })

    expect(updateDocMock).toHaveBeenCalledTimes(1)
    expect(updateDocMock.mock.calls[0]?.[1]).toEqual({ tourCompleted: true })
  })

  it('does NOT backfill when store flag is already true', async () => {
    authState.user = { id: 'uid1', tourCompleted: true }
    localStorage.setItem('cranial_tour_completed_uid1', 'true')
    const { isTourCompleted } = useTour()

    isTourCompleted()
    await new Promise<void>(resolve => { setTimeout(resolve, 0) })

    expect(updateDocMock).not.toHaveBeenCalled()
  })

  it('updates authStore.user.tourCompleted synchronously during backfill', () => {
    authState.user = { id: 'uid1', tourCompleted: false }
    localStorage.setItem('cranial_tour_completed_uid1', 'true')
    const { isTourCompleted } = useTour()

    isTourCompleted()

    // The synchronous part of markTourCompleted (in-memory update) runs before the first await
    expect(authState.user?.tourCompleted).toBe(true)
  })

  it('does NOT backfill when user is null', async () => {
    authState.user = null
    localStorage.setItem('cranial_tour_completed', 'true')
    const { isTourCompleted } = useTour()

    isTourCompleted()
    await new Promise<void>(resolve => { setTimeout(resolve, 0) })

    expect(updateDocMock).not.toHaveBeenCalled()
  })
})

// ─── resetTour clears all three layers ───────────────────────────────────────

describe('resetTour', () => {
  it('writes tourCompleted: false to Firestore', async () => {
    authState.user = { id: 'uid1', tourCompleted: true }
    const { resetTour } = useTour()
    await resetTour()
    expect(updateDocMock).toHaveBeenCalledTimes(1)
    expect(updateDocMock.mock.calls[0]?.[1]).toEqual({ tourCompleted: false })
  })

  it('clears the in-memory store flag', async () => {
    authState.user = { id: 'uid1', tourCompleted: true }
    const { resetTour } = useTour()
    await resetTour()
    expect(authState.user?.tourCompleted).toBe(false)
  })

  it('removes the localStorage flag', async () => {
    authState.user = { id: 'uid1', tourCompleted: true }
    localStorage.setItem('cranial_tour_completed_uid1', 'true')
    const { resetTour } = useTour()
    await resetTour()
    expect(localStorage.getItem('cranial_tour_completed_uid1')).toBeNull()
  })

  it('after reset, isTourCompleted returns false (modal can replay)', async () => {
    authState.user = { id: 'uid1', tourCompleted: true }
    const { resetTour, isTourCompleted } = useTour()
    await resetTour()
    expect(isTourCompleted()).toBe(false)
  })

  it('does not call updateDoc when user is null', async () => {
    authState.user = null
    const { resetTour } = useTour()
    await resetTour()
    expect(updateDocMock).not.toHaveBeenCalled()
  })

  it('swallows Firestore errors gracefully — localStorage and in-memory still cleared', async () => {
    authState.user = { id: 'uid1', tourCompleted: true }
    localStorage.setItem('cranial_tour_completed_uid1', 'true')
    updateDocMock.mockRejectedValueOnce(new Error('permission denied'))
    const { resetTour } = useTour()
    await expect(resetTour()).resolves.toBeUndefined()
    expect(localStorage.getItem('cranial_tour_completed_uid1')).toBeNull()
    expect(authState.user?.tourCompleted).toBe(false)
  })
})
