import { describe, it, expect } from 'vitest'
import { getMatchAlertDescription } from '@/utils/matchNotification'
import type { SimpleMatch, MatchCard } from '@/stores/matches'

// Fake t: returns "KEY:card_name" so we can assert both the i18n key and the interpolated name
const fakeT = (key: string, params?: Record<string, unknown>): string =>
  `${key}:${params?.card ?? ''}`

const makeCard = (name: string): MatchCard => ({
  scryfallId: 'scry1',
  name,
  edition: 'Test Set',
  quantity: 1,
  condition: 'NM',
  foil: false,
  price: 1.0,
  image: '',
  status: 'trade',
})

const baseMatch = (overrides: Partial<SimpleMatch>): SimpleMatch => ({
  id: 'm1',
  type: 'BUSCO',
  otherUserId: 'u2',
  otherUsername: 'someuser',
  createdAt: new Date(),
  myCards: [],
  otherCards: [],
  ...overrides,
})

describe('getMatchAlertDescription', () => {
  // ─── (a) Received shared TRADE interest ────────────────────────────────────
  describe('received shared TRADE interest (isSharedMatch && !isSender, type=BUSCO)', () => {
    it('uses wantsYourCard key with the card name from myCards', () => {
      const match = baseMatch({
        type: 'BUSCO',
        isSharedMatch: true,
        isSender: false,
        myCards: [makeCard('Dark Ritual')],
        otherCards: [],
      })
      const result = getMatchAlertDescription(match, fakeT)
      expect(result).toBe('matches.notifications.wantsYourCard:Dark Ritual')
    })

    it('does NOT render "?" when myCards carries the card name (regression for the bug)', () => {
      const match = baseMatch({
        type: 'BUSCO',
        isSharedMatch: true,
        isSender: false,
        myCards: [makeCard('Mox Ruby')],
        otherCards: [],
      })
      const result = getMatchAlertDescription(match, fakeT)
      expect(result).not.toContain('?')
    })
  })

  // ─── (b) Received shared SALE interest ─────────────────────────────────────
  describe('received shared SALE interest (isSharedMatch && !isSender, type=VENDO)', () => {
    it('uses wantsYourCard key with the card name from myCards', () => {
      const match = baseMatch({
        type: 'VENDO',
        isSharedMatch: true,
        isSender: false,
        myCards: [makeCard('Black Lotus')],
        otherCards: [],
      })
      const result = getMatchAlertDescription(match, fakeT)
      expect(result).toBe('matches.notifications.wantsYourCard:Black Lotus')
    })
  })

  // ─── (c) Calculated VENDO (not shared) ─────────────────────────────────────
  describe('calculated VENDO match (not shared)', () => {
    it('uses wantsYourCard key with myCards name', () => {
      const match = baseMatch({
        type: 'VENDO',
        myCards: [makeCard('Lightning Bolt')],
        otherCards: [makeCard('Counterspell')],
      })
      const result = getMatchAlertDescription(match, fakeT)
      expect(result).toBe('matches.notifications.wantsYourCard:Lightning Bolt')
    })

    it('falls back to myCard.name if myCards is empty', () => {
      const match = baseMatch({
        type: 'VENDO',
        myCards: [],
        myCard: makeCard('Sol Ring'),
        otherCards: [],
      })
      const result = getMatchAlertDescription(match, fakeT)
      expect(result).toBe('matches.notifications.wantsYourCard:Sol Ring')
    })
  })

  // ─── (d) Calculated BUSCO (not shared) ─────────────────────────────────────
  describe('calculated BUSCO match (not shared)', () => {
    it('uses hasCardYouWant key with otherCards name', () => {
      const match = baseMatch({
        type: 'BUSCO',
        myCards: [makeCard('Forest')],
        otherCards: [makeCard('Ancestral Recall')],
      })
      const result = getMatchAlertDescription(match, fakeT)
      expect(result).toBe('matches.notifications.hasCardYouWant:Ancestral Recall')
    })

    it('falls back to otherCard.name if otherCards is empty', () => {
      const match = baseMatch({
        type: 'BUSCO',
        otherCards: [],
        otherCard: makeCard('Lotus Cobra'),
        myCards: [],
      })
      const result = getMatchAlertDescription(match, fakeT)
      expect(result).toBe('matches.notifications.hasCardYouWant:Lotus Cobra')
    })
  })

  // ─── (e) Graceful fallback when no card name exists anywhere ───────────────
  describe('graceful fallback when card name is missing everywhere', () => {
    it('returns "?" as last resort for calculated VENDO with no card names', () => {
      const match = baseMatch({
        type: 'VENDO',
        myCards: [],
        otherCards: [],
        myCard: null,
        otherCard: null,
      })
      const result = getMatchAlertDescription(match, fakeT)
      expect(result).toBe('matches.notifications.wantsYourCard:?')
    })

    it('returns "?" as last resort for received shared match with no card names', () => {
      const match = baseMatch({
        type: 'BUSCO',
        isSharedMatch: true,
        isSender: false,
        myCards: [],
        otherCards: [],
        myCard: null,
        otherCard: null,
      })
      const result = getMatchAlertDescription(match, fakeT)
      expect(result).toBe('matches.notifications.wantsYourCard:?')
    })
  })
})
