import { describe, it, expect } from 'vitest'
import { groupMatchesByUser } from '@/utils/matchGrouping'
import type { PublicCard, PublicPreference } from '@/services/publicCards'

const card = (overrides: Partial<PublicCard>): PublicCard =>
  ({
    docId: 'd',
    cardId: 'c',
    userId: 'u1',
    username: 'A',
    cardName: 'Lotus',
    scryfallId: 's',
    status: 'trade',
    price: 0,
    edition: '',
    condition: 'NM',
    foil: false,
    quantity: 1,
    image: '',
    location: 'X',
    email: 'a@x',
    updatedAt: { toDate: () => new Date() } as unknown as PublicCard['updatedAt'],
    ...overrides,
  }) as PublicCard

const pref = (overrides: Partial<PublicPreference>): PublicPreference =>
  ({
    docId: 'd',
    prefId: 'p',
    userId: 'u2',
    username: 'B',
    cardName: 'Mox',
    scryfallId: 's',
    location: 'Y',
    email: 'b@y',
    updatedAt: { toDate: () => new Date() } as unknown as PublicPreference['updatedAt'],
    ...overrides,
  }) as PublicPreference

describe('groupMatchesByUser', () => {
  it('returns empty map for empty inputs', () => {
    expect(groupMatchesByUser([], []).size).toBe(0)
  })

  it('groups a card-only user', () => {
    const map = groupMatchesByUser([card({ userId: 'u1' })], [])
    expect(map.size).toBe(1)
    const entry = map.get('u1')!
    expect(entry.cards.length).toBe(1)
    expect(entry.prefs.length).toBe(0)
    expect(entry.username).toBe('A')
  })

  it('groups a pref-only user', () => {
    const map = groupMatchesByUser([], [pref({ userId: 'u2' })])
    expect(map.size).toBe(1)
    expect(map.get('u2')!.prefs.length).toBe(1)
    expect(map.get('u2')!.cards.length).toBe(0)
  })

  it('merges cards and prefs under the same userId', () => {
    const map = groupMatchesByUser(
      [card({ userId: 'u1' })],
      [pref({ userId: 'u1', username: 'A' })],
    )
    expect(map.size).toBe(1)
    const entry = map.get('u1')!
    expect(entry.cards.length).toBe(1)
    expect(entry.prefs.length).toBe(1)
  })

  it('keeps separate users separate', () => {
    const map = groupMatchesByUser(
      [card({ userId: 'u1' }), card({ userId: 'u3', username: 'C' })],
      [pref({ userId: 'u2' })],
    )
    expect(map.size).toBe(3)
  })

  it('defaults missing location to Unknown and missing email to empty string', () => {
    const map = groupMatchesByUser(
      [card({ userId: 'u1', location: undefined, email: undefined })],
      [],
    )
    const entry = map.get('u1')!
    expect(entry.location).toBe('Unknown')
    expect(entry.email).toBe('')
  })
})
