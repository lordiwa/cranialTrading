/**
 * RED phase test for TASK-137 review finding H1: openDatabase() must not hang
 * forever when IndexedDB reports the open request as `blocked` — e.g. an
 * older-version (v1) connection left open in another tab blocks the v1->v2
 * schema bump this ticket introduced. Before this fix, neither `onblocked`
 * nor `onversionchange` were wired: the open Promise never settled on
 * blocked, so every caller (hydrateCardPricesCache, getFromDB, saveToDB)
 * hung indefinitely — `loading` stuck true forever in the UI, and deck/binder
 * price lookups (which also go through openDatabase) dead in the water.
 *
 * dbInstance is a module-level singleton in mtgjson.ts, so each test resets
 * modules and re-imports to start from a clean (null) cached connection.
 */

interface FakeIDBOpenDBRequest {
  onerror: (() => void) | null
  onsuccess: (() => void) | null
  onblocked: (() => void) | null
  onupgradeneeded: ((event: unknown) => void) | null
  result: unknown
  error: unknown
}

function installFakeIndexedDB() {
  const openCalls: FakeIDBOpenDBRequest[] = []
  const open = vi.fn((_name: string, _version: number) => {
    const req: FakeIDBOpenDBRequest = {
      onerror: null,
      onsuccess: null,
      onblocked: null,
      onupgradeneeded: null,
      result: undefined,
      error: undefined,
    }
    openCalls.push(req)
    return req
  })
  vi.stubGlobal('indexedDB', { open })
  return { open, openCalls }
}

describe('mtgjson.ts openDatabase — multi-tab version bump safety (TASK-137 review H1)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects instead of hanging forever when the open request is blocked', async () => {
    const { openCalls } = installFakeIndexedDB()
    const { openDatabase } = await import('@/services/mtgjson')

    const promise = openDatabase()
    // Simulate IndexedDB reporting the connection is blocked by a stale
    // connection in another tab. onsuccess never fires in this scenario.
    openCalls[0]!.onblocked?.()

    await expect(promise).rejects.toThrow()
  })

  it('closes the connection and drops the cached instance on versionchange, so a later call re-opens instead of reusing the closed handle', async () => {
    const { open, openCalls } = installFakeIndexedDB()
    const { openDatabase } = await import('@/services/mtgjson')

    const fakeDb = { close: vi.fn(), onversionchange: null as (() => void) | null }
    const firstPromise = openDatabase()
    openCalls[0]!.result = fakeDb
    openCalls[0]!.onsuccess?.()
    await expect(firstPromise).resolves.toBe(fakeDb)

    // Another tab/window needs a newer version — this connection must close
    // itself rather than block that upgrade forever.
    fakeDb.onversionchange?.()
    expect(fakeDb.close).toHaveBeenCalledTimes(1)

    // A later openDatabase() call must NOT reuse the (now closed) cached
    // instance — it should issue a fresh indexedDB.open() call.
    const secondPromise = openDatabase()
    expect(open).toHaveBeenCalledTimes(2)
    const secondDb = { close: vi.fn(), onversionchange: null }
    openCalls[1]!.result = secondDb
    openCalls[1]!.onsuccess?.()
    await expect(secondPromise).resolves.toBe(secondDb)
  })

  it('still resolves normally (no blocked/versionchange) when nothing else has the DB open', async () => {
    const { openCalls } = installFakeIndexedDB()
    const { openDatabase } = await import('@/services/mtgjson')

    const fakeDb = { close: vi.fn(), onversionchange: null }
    const promise = openDatabase()
    openCalls[0]!.result = fakeDb
    openCalls[0]!.onsuccess?.()

    await expect(promise).resolves.toBe(fakeDb)
  })
})
