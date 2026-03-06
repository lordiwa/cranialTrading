/**
 * Tests for date/match parsing helpers used in src/stores/matches.ts
 *
 * The helpers (toDate, calculateExpirationDate, parseFirestoreMatch) are internal
 * closures inside the Pinia store which imports Firebase. To avoid complex mocking,
 * we replicate the pure logic here as characterization tests.
 */

const MATCH_LIFETIME_DAYS = 15

// Re-implement the pure helper logic for testing
// (originals are closures inside the Pinia store definition)
const toDate = (value: any): Date => {
  if (!value) return new Date()
  if (value instanceof Date) return value
  if (typeof value.toDate === 'function') return value.toDate() // Firestore Timestamp
  if (typeof value === 'number') return new Date(value) // Unix timestamp
  if (typeof value === 'string') return new Date(value) // ISO string
  return new Date() // fallback
}

const calculateExpirationDate = (createdAt: Date): Date => {
  const date = new Date(createdAt)
  date.setDate(date.getDate() + MATCH_LIFETIME_DAYS)
  return date
}

const parseFirestoreMatch = (docId: string, data: any) => {
  const createdAt = toDate(data.createdAt)

  let lifeExpiresAt = data.lifeExpiresAt ? toDate(data.lifeExpiresAt) : null
  if (!lifeExpiresAt || Number.isNaN(lifeExpiresAt.getTime())) {
    lifeExpiresAt = calculateExpirationDate(createdAt)
  }

  return {
    id: data.id || '',
    type: data.type || 'BUSCO',
    otherUserId: data.otherUserId || '',
    otherUsername: data.otherUsername || '',
    otherLocation: data.otherLocation,
    otherEmail: data.otherEmail,
    otherAvatarUrl: data.otherAvatarUrl || null,
    myCard: data.myCard,
    otherCard: data.otherCard,
    myPreference: data.myPreference,
    otherPreference: data.otherPreference,
    myCards: data.myCards || [],
    otherCards: data.otherCards || [],
    myTotalValue: data.myTotalValue ?? 0,
    theirTotalValue: data.theirTotalValue ?? 0,
    valueDifference: data.valueDifference ?? 0,
    compatibility: data.compatibility ?? 0,
    createdAt,
    status: data.status,
    lifeExpiresAt,
    docId,
  }
}

// ---------------------------------------------------------------------------
// toDate
// ---------------------------------------------------------------------------
describe('toDate', () => {
  it('returns the same Date when given a Date instance', () => {
    const d = new Date('2024-06-15T12:00:00Z')
    expect(toDate(d)).toBe(d)
  })

  it('calls .toDate() on Firestore Timestamp-like objects', () => {
    const expected = new Date('2024-03-10T08:30:00Z')
    const firestoreTimestamp = { toDate: () => expected }
    expect(toDate(firestoreTimestamp)).toBe(expected)
  })

  it('converts a Unix millisecond number to a Date', () => {
    const ms = 1704067200000 // 2024-01-01T00:00:00Z
    const result = toDate(ms)
    expect(result).toBeInstanceOf(Date)
    expect(result.getTime()).toBe(ms)
  })

  it('converts an ISO string to a Date', () => {
    const iso = '2024-01-15T00:00:00Z'
    const result = toDate(iso)
    expect(result).toBeInstanceOf(Date)
    expect(result.toISOString()).toBe('2024-01-15T00:00:00.000Z')
  })

  it('returns a recent Date when given null', () => {
    const before = Date.now()
    const result = toDate(null)
    const after = Date.now()
    expect(result).toBeInstanceOf(Date)
    expect(result.getTime()).toBeGreaterThanOrEqual(before)
    expect(result.getTime()).toBeLessThanOrEqual(after)
  })

  it('returns a recent Date when given undefined', () => {
    const before = Date.now()
    const result = toDate(undefined)
    const after = Date.now()
    expect(result).toBeInstanceOf(Date)
    expect(result.getTime()).toBeGreaterThanOrEqual(before)
    expect(result.getTime()).toBeLessThanOrEqual(after)
  })
})

// ---------------------------------------------------------------------------
// calculateExpirationDate
// ---------------------------------------------------------------------------
describe('calculateExpirationDate', () => {
  it('adds 15 days to a standard date (Jan 1 -> Jan 16)', () => {
    const created = new Date('2024-01-01T00:00:00Z')
    const result = calculateExpirationDate(created)
    expect(result.getUTCFullYear()).toBe(2024)
    expect(result.getUTCMonth()).toBe(0) // January
    expect(result.getUTCDate()).toBe(16)
  })

  it('crosses month boundary correctly (Jan 25 -> Feb 9)', () => {
    const created = new Date('2024-01-25T00:00:00Z')
    const result = calculateExpirationDate(created)
    expect(result.getUTCFullYear()).toBe(2024)
    expect(result.getUTCMonth()).toBe(1) // February
    expect(result.getUTCDate()).toBe(9)
  })

  it('handles leap year boundary (Feb 20 2024 -> Mar 6 2024)', () => {
    const created = new Date('2024-02-20T00:00:00Z')
    const result = calculateExpirationDate(created)
    expect(result.getUTCFullYear()).toBe(2024)
    expect(result.getUTCMonth()).toBe(2) // March
    expect(result.getUTCDate()).toBe(6)
  })

  it('does not mutate the original date', () => {
    const created = new Date('2024-01-01T00:00:00Z')
    const originalTime = created.getTime()
    calculateExpirationDate(created)
    expect(created.getTime()).toBe(originalTime)
  })
})

// ---------------------------------------------------------------------------
// parseFirestoreMatch
// ---------------------------------------------------------------------------
describe('parseFirestoreMatch', () => {
  const fullData = {
    id: 'match-123',
    type: 'VENDO',
    otherUserId: 'user-456',
    otherUsername: 'trader_joe',
    otherLocation: 'Santiago, Chile',
    otherEmail: 'joe@example.com',
    otherAvatarUrl: 'https://example.com/avatar.png',
    myCard: { name: 'Lightning Bolt', scryfallId: 'abc' },
    otherCard: { name: 'Counterspell', scryfallId: 'def' },
    myPreference: { name: 'Bolt Pref', type: 'VENDO' },
    otherPreference: { name: 'Counter Pref', type: 'BUSCO' },
    myCards: [{ name: 'Card A' }],
    otherCards: [{ name: 'Card B' }],
    myTotalValue: 12.5,
    theirTotalValue: 10.0,
    valueDifference: 2.5,
    compatibility: 85,
    createdAt: new Date('2024-06-01T00:00:00Z'),
    status: 'nuevo',
    lifeExpiresAt: new Date('2024-06-16T00:00:00Z'),
  }

  it('populates all fields from complete data', () => {
    const result = parseFirestoreMatch('doc-001', fullData)

    expect(result.id).toBe('match-123')
    expect(result.type).toBe('VENDO')
    expect(result.otherUserId).toBe('user-456')
    expect(result.otherUsername).toBe('trader_joe')
    expect(result.otherLocation).toBe('Santiago, Chile')
    expect(result.otherEmail).toBe('joe@example.com')
    expect(result.otherAvatarUrl).toBe('https://example.com/avatar.png')
    expect(result.myCard).toEqual({ name: 'Lightning Bolt', scryfallId: 'abc' })
    expect(result.otherCard).toEqual({ name: 'Counterspell', scryfallId: 'def' })
    expect(result.myPreference).toEqual({ name: 'Bolt Pref', type: 'VENDO' })
    expect(result.otherPreference).toEqual({ name: 'Counter Pref', type: 'BUSCO' })
    expect(result.myCards).toEqual([{ name: 'Card A' }])
    expect(result.otherCards).toEqual([{ name: 'Card B' }])
    expect(result.myTotalValue).toBe(12.5)
    expect(result.theirTotalValue).toBe(10.0)
    expect(result.valueDifference).toBe(2.5)
    expect(result.compatibility).toBe(85)
    expect(result.status).toBe('nuevo')
    expect(result.docId).toBe('doc-001')
    expect(result.createdAt.toISOString()).toBe('2024-06-01T00:00:00.000Z')
    expect(result.lifeExpiresAt!.toISOString()).toBe('2024-06-16T00:00:00.000Z')
  })

  it('applies defaults for missing optional fields', () => {
    const result = parseFirestoreMatch('doc-002', {
      createdAt: new Date('2024-01-01T00:00:00Z'),
    })

    expect(result.id).toBe('')
    expect(result.type).toBe('BUSCO')
    expect(result.otherUserId).toBe('')
    expect(result.otherUsername).toBe('')
    expect(result.otherAvatarUrl).toBeNull()
    expect(result.myCards).toEqual([])
    expect(result.otherCards).toEqual([])
    expect(result.myTotalValue).toBe(0)
    expect(result.theirTotalValue).toBe(0)
    expect(result.valueDifference).toBe(0)
    expect(result.compatibility).toBe(0)
  })

  it('calculates lifeExpiresAt as createdAt + 15 days when missing', () => {
    const result = parseFirestoreMatch('doc-003', {
      createdAt: new Date('2024-03-01T00:00:00Z'),
    })

    expect(result.lifeExpiresAt!.toISOString()).toBe('2024-03-16T00:00:00.000Z')
  })

  it('recalculates lifeExpiresAt when it is invalid (NaN)', () => {
    const result = parseFirestoreMatch('doc-004', {
      createdAt: new Date('2024-05-10T00:00:00Z'),
      lifeExpiresAt: 'not-a-date',
    })

    expect(result.lifeExpiresAt!.toISOString()).toBe('2024-05-25T00:00:00.000Z')
  })

  it('passes docId through correctly', () => {
    const result = parseFirestoreMatch('my-unique-doc-id', {
      createdAt: new Date('2024-01-01T00:00:00Z'),
    })
    expect(result.docId).toBe('my-unique-doc-id')
  })

  it('preserves explicit zero values via nullish coalescing', () => {
    const result = parseFirestoreMatch('doc-005', {
      createdAt: new Date('2024-01-01T00:00:00Z'),
      myTotalValue: 0,
      theirTotalValue: 0,
      valueDifference: 0,
      compatibility: 0,
    })

    expect(result.myTotalValue).toBe(0)
    expect(result.theirTotalValue).toBe(0)
    expect(result.valueDifference).toBe(0)
    expect(result.compatibility).toBe(0)
  })
})
