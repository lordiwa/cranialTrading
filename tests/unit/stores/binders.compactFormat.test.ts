import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'

// Mock Firebase before importing the store
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(() => '__DELETE_FIELD__'),
  Timestamp: { now: () => ({ toDate: () => new Date() }) },
}))

vi.mock('@/services/firebase', () => ({
  db: {},
}))

vi.mock('@/composables/useI18n', () => ({
  t: (key: string) => key,
}))

import { serializeAllocations, deserializeAllocationMap } from '@/stores/binders'
import type { BinderAllocation } from '@/types/binder'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

// ==========================================================================
// serializeAllocations: BinderAllocation[] → JSON string
// ==========================================================================

describe('serializeAllocations', () => {
  it('converts allocations array to JSON string', () => {
    const allocations: BinderAllocation[] = [
      { cardId: 'card-A', quantity: 4, addedAt: new Date() },
      { cardId: 'card-B', quantity: 2, addedAt: new Date() },
      { cardId: 'card-C', quantity: 1, addedAt: new Date() },
    ]

    const result = serializeAllocations(allocations)

    expect(typeof result).toBe('string')
    expect(JSON.parse(result)).toEqual({
      'card-A': 4,
      'card-B': 2,
      'card-C': 1,
    })
  })

  it('returns empty JSON object string for empty allocations', () => {
    const result = serializeAllocations([])
    expect(result).toBe('{}')
    expect(JSON.parse(result)).toEqual({})
  })

  it('drops addedAt field (not persisted in compact format)', () => {
    const allocations: BinderAllocation[] = [
      { cardId: 'card-X', quantity: 7, addedAt: new Date('2025-01-15') },
    ]

    const result = serializeAllocations(allocations)
    const parsed = JSON.parse(result)

    expect(parsed).toEqual({ 'card-X': 7 })
    expect(Object.keys(parsed)).toEqual(['card-X'])
  })

  it('handles duplicate cardIds by using the last occurrence', () => {
    const allocations: BinderAllocation[] = [
      { cardId: 'card-A', quantity: 2, addedAt: new Date() },
      { cardId: 'card-A', quantity: 5, addedAt: new Date() },
    ]

    const result = serializeAllocations(allocations)

    expect(JSON.parse(result)).toEqual({ 'card-A': 5 })
  })
})

// ==========================================================================
// deserializeAllocationMap: JSON string → BinderAllocation[]
// ==========================================================================

describe('deserializeAllocationMap', () => {
  it('converts JSON string to allocations array', () => {
    const json = JSON.stringify({ 'card-A': 4, 'card-B': 2 })

    const result = deserializeAllocationMap(json)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ cardId: 'card-A', quantity: 4 })
    expect(result[1]).toMatchObject({ cardId: 'card-B', quantity: 2 })
  })

  it('populates addedAt with a Date fallback', () => {
    const json = JSON.stringify({ 'card-A': 1 })

    const result = deserializeAllocationMap(json)

    expect(result[0]!.addedAt).toBeInstanceOf(Date)
  })

  it('returns empty array for empty JSON object', () => {
    expect(deserializeAllocationMap('{}')).toEqual([])
  })

  it('returns empty array for undefined/null input', () => {
    expect(deserializeAllocationMap(undefined as unknown as string)).toEqual([])
    expect(deserializeAllocationMap(null as unknown as string)).toEqual([])
  })

  it('returns empty array for malformed JSON', () => {
    expect(deserializeAllocationMap('not valid json')).toEqual([])
  })

  it('roundtrips correctly with serializeAllocations', () => {
    const original: BinderAllocation[] = [
      { cardId: 'card-A', quantity: 4, addedAt: new Date() },
      { cardId: 'card-B', quantity: 1, addedAt: new Date() },
    ]

    const serialized = serializeAllocations(original)
    const deserialized = deserializeAllocationMap(serialized)

    expect(deserialized).toHaveLength(2)
    expect(deserialized[0]).toMatchObject({ cardId: 'card-A', quantity: 4 })
    expect(deserialized[1]).toMatchObject({ cardId: 'card-B', quantity: 1 })
  })
})
