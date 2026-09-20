/**
 * TASK-314: getFormatStaples/getPriceMovers used to catch ANY error
 * (including a genuinely failed read — network down, Firestore
 * unreachable) and swallow it into a plain `return null`, indistinguishable
 * from "the document legitimately doesn't exist yet". That swallow is what
 * MEASURABLY suppressed the store's error toast on dev (2 aborted requests,
 * 0 toasts shown) — stores/market.ts's own try/catch never saw the failure
 * because the promise it awaited never rejected.
 *
 * These tests exercise the real services/market.ts functions (not a mock of
 * the module) against a getDoc that throws, proving the rejection now
 * reaches the caller instead of being swallowed.
 */
const getDocMock = vi.fn()
const docMock = vi.fn((_db: unknown, ...path: string[]) => ({ path }))

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => docMock(...(args as [unknown, ...string[]])),
  getDoc: (...args: unknown[]) => getDocMock(...args),
}))
vi.mock('@/services/firestore', () => ({ db: {} }))

describe('services/market — a failed read propagates instead of being swallowed (TASK-314)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getFormatStaples rejects when getDoc throws — no more catch-and-return-null', async () => {
    const { getFormatStaples } = await import('@/services/market')
    getDocMock.mockRejectedValueOnce(new Error('firestore unreachable'))

    await expect(getFormatStaples('modern')).rejects.toThrow('firestore unreachable')
  })

  it('getPriceMovers rejects when getDoc throws — no more catch-and-return-null', async () => {
    const { getPriceMovers } = await import('@/services/market')
    getDocMock.mockRejectedValueOnce(new Error('firestore unreachable'))

    await expect(getPriceMovers('market_regular')).rejects.toThrow('firestore unreachable')
  })

  it('getFormatStaples still returns null (not an error) when the document genuinely does not exist', async () => {
    const { getFormatStaples } = await import('@/services/market')
    getDocMock.mockResolvedValueOnce({ exists: () => false })

    await expect(getFormatStaples('modern')).resolves.toBeNull()
  })
})
