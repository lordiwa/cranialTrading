/**
 * Tests for the useDashboardMatches composable — specifically the PURE
 * buildMatchFromUserGroup helper extracted from calculateMatches
 * (DashboardView.vue:697-770 per RESEARCH.md inventory).
 *
 * The full async pipeline (calculateMatches wiring) is covered by
 * Plan D's E2E specs — unit tests stay focused on the per-user-group
 * logic with a mocked priceMatching object.
 */
// Mock all Firebase-touching modules BEFORE importing the composable —
// buildMatchFromUserGroup is a PURE function but lives in a module that
// also transitively imports auth/firebase. The full useDashboardMatches()
// orchestration is covered by Plan D E2E; these unit tests only exercise
// the pure helper.
vi.mock('@/services/firebase', () => ({ db: {}, auth: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  or: vi.fn(),
  writeBatch: vi.fn(),
  Timestamp: { fromDate: (d: Date) => d, now: () => new Date() },
  getCountFromServer: vi.fn(),
}))
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(),
}))
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => vi.fn()),
}))
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApp: vi.fn(() => ({})),
}))
vi.mock('@/composables/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'en' } }),
  t: (key: string) => key,
}))

import { buildMatchFromUserGroup } from '@/composables/useDashboardMatches'
import type { UserMatchGroup } from '@/utils/matchGrouping'

const baseGroup: UserMatchGroup = {
  cards: [],
  prefs: [],
  username: 'Other',
  location: 'Loc',
  email: 'other@test',
}

const baseMyCards: any[] = []
const baseMyPreferences: any[] = []

describe('buildMatchFromUserGroup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-01T00:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a BIDIRECTIONAL CalculatedMatch when bidirectional matcher returns valid result', () => {
    const priceMatching = {
      calculateBidirectionalMatch: vi.fn().mockReturnValue({
        isValid: true,
        compatibility: 90,
        myTotalValue: 100,
        theirTotalValue: 110,
        valueDifference: 10,
        myCardsInfo: [{ id: 'mc' }],
        theirCardsInfo: [{ id: 'tc' }],
        matchType: 'bidirectional',
      }),
      calculateUnidirectionalMatch: vi.fn(),
    }
    const result = buildMatchFromUserGroup(
      'me', 'u1', baseGroup, baseMyCards, baseMyPreferences, priceMatching,
    )
    expect(result).not.toBeNull()
    expect(result!.type).toBe('BIDIRECTIONAL')
    expect(result!.compatibility).toBe(90)
    expect(result!.otherUsername).toBe('Other')
    expect(result!.otherUserId).toBe('u1')
    expect(priceMatching.calculateUnidirectionalMatch).not.toHaveBeenCalled()
  })

  it('falls back to UNIDIRECTIONAL when bidirectional returns null', () => {
    const priceMatching = {
      calculateBidirectionalMatch: vi.fn().mockReturnValue(null),
      calculateUnidirectionalMatch: vi.fn().mockReturnValue({
        isValid: true,
        compatibility: 70,
        myTotalValue: 50,
        theirTotalValue: 60,
        valueDifference: 10,
        myCardsInfo: [],
        theirCardsInfo: [],
        matchType: 'unidirectional',
      }),
    }
    const result = buildMatchFromUserGroup(
      'me', 'u1', baseGroup, baseMyCards, baseMyPreferences, priceMatching,
    )
    expect(result!.type).toBe('UNIDIRECTIONAL')
  })

  it('returns null when both matchers return null', () => {
    const priceMatching = {
      calculateBidirectionalMatch: vi.fn().mockReturnValue(null),
      calculateUnidirectionalMatch: vi.fn().mockReturnValue(null),
    }
    expect(
      buildMatchFromUserGroup('me', 'u1', baseGroup, baseMyCards, baseMyPreferences, priceMatching),
    ).toBeNull()
  })

  it('returns null when matcher returns isValid:false', () => {
    const priceMatching = {
      calculateBidirectionalMatch: vi.fn().mockReturnValue({ isValid: false, compatibility: 0 }),
      calculateUnidirectionalMatch: vi.fn().mockReturnValue({ isValid: false, compatibility: 0 }),
    }
    expect(
      buildMatchFromUserGroup('me', 'u1', baseGroup, baseMyCards, baseMyPreferences, priceMatching),
    ).toBeNull()
  })

  it('sets lifeExpiresAt 15 calendar days after createdAt', () => {
    const priceMatching = {
      calculateBidirectionalMatch: vi.fn().mockReturnValue({
        isValid: true,
        compatibility: 50,
        myTotalValue: 0,
        theirTotalValue: 0,
        valueDifference: 0,
        myCardsInfo: [],
        theirCardsInfo: [],
        matchType: 'bidirectional',
      }),
      calculateUnidirectionalMatch: vi.fn(),
    }
    const result = buildMatchFromUserGroup('me', 'u1', baseGroup, baseMyCards, baseMyPreferences, priceMatching)!
    const diffDays = (result.lifeExpiresAt.getTime() - result.createdAt.getTime()) / 86_400_000
    // calendar-day setDate may give 14.95-15.05 over DST; 14 < diffDays <= 15.05 is acceptable
    expect(diffDays).toBeGreaterThan(14)
    expect(diffDays).toBeLessThanOrEqual(15.05)
  })
})
