// ── Mocks ──────────────────────────────────────────────────────────────────────

// Mock callable that the httpsCallable factory returns
const mockCallable = vi.fn()

// Mock httpsCallable factory — returns mockCallable
const mockHttpsCallable = vi.fn(() => mockCallable)

vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: (...args: unknown[]) => mockHttpsCallable(...args),
}))

vi.mock('firebase/app', () => ({
  getApp: () => ({}),
}))

vi.mock('@/services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user-id' } },
}))

// ── Import AFTER mocks ────────────────────────────────────────────────────────
import { queryCardIndex } from '@/services/cloudFunctions'
import type { QueryCardIndexRequest } from '@/services/cloudFunctions'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<QueryCardIndexRequest> = {}): QueryCardIndexRequest {
  return {
    userId: 'user-123',
    filters: {},
    sort: { field: 'name', direction: 'asc' },
    page: 0,
    pageSize: 50,
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('queryCardIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call httpsCallable with function name "queryCardIndex" and 30s timeout', () => {
    mockCallable.mockResolvedValue({ data: { cards: [], total: 0, page: 0, pageSize: 50, hasMore: false } })

    queryCardIndex(makeRequest())

    expect(mockHttpsCallable).toHaveBeenCalledWith(
      expect.anything(),        // functions instance
      'queryCardIndex',         // function name
      { timeout: 30000 },       // options
    )
  })

  it('should pass request params through to the callable', async () => {
    const request = makeRequest({
      userId: 'user-abc',
      filters: { search: 'bolt', status: ['trade'], foil: true },
      sort: { field: 'price', direction: 'desc' },
      page: 2,
      pageSize: 25,
      mode: 'ids',
    })

    mockCallable.mockResolvedValue({
      data: { cards: ['id1', 'id2'], total: 50, page: 2, pageSize: 25, hasMore: true },
    })

    await queryCardIndex(request)

    expect(mockCallable).toHaveBeenCalledWith(request)
  })

  it('should return the unwrapped response data', async () => {
    const responseData = {
      cards: [{ id: 'card-1', name: 'Lightning Bolt' }],
      total: 1,
      page: 0,
      pageSize: 50,
      hasMore: false,
    }
    mockCallable.mockResolvedValue({ data: responseData })

    const result = await queryCardIndex(makeRequest())

    expect(result).toEqual(responseData)
  })

  it('should return ids when mode is "ids"', async () => {
    const responseData = {
      cards: ['card-1', 'card-2', 'card-3'],
      total: 3,
      page: 0,
      pageSize: 50,
      hasMore: false,
    }
    mockCallable.mockResolvedValue({ data: responseData })

    const result = await queryCardIndex(makeRequest({ mode: 'ids' }))

    expect(result).toEqual(responseData)
  })

  it('should throw a meaningful error for "unauthenticated" Firebase error', async () => {
    mockCallable.mockRejectedValue({ code: 'functions/unauthenticated', message: 'Must be logged in' })

    await expect(queryCardIndex(makeRequest())).rejects.toThrow(
      'User must be authenticated to query card index'
    )
  })

  it('should throw a meaningful error for "invalid-argument" Firebase error', async () => {
    mockCallable.mockRejectedValue({ code: 'functions/invalid-argument', message: 'page must be a non-negative integer' })

    await expect(queryCardIndex(makeRequest())).rejects.toThrow(
      'page must be a non-negative integer'
    )
  })

  it('should throw a meaningful error for "internal" Firebase error', async () => {
    mockCallable.mockRejectedValue({ code: 'functions/internal', message: 'Failed to query card index' })

    await expect(queryCardIndex(makeRequest())).rejects.toThrow(
      'Failed to query card index'
    )
  })

  it('should re-throw unknown errors as-is', async () => {
    const unknownError = new Error('Network timeout')
    mockCallable.mockRejectedValue(unknownError)

    await expect(queryCardIndex(makeRequest())).rejects.toThrow('Network timeout')
  })
})
