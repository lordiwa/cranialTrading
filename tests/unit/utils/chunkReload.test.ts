describe('chunkReload', () => {
  let mockStorage: Storage
  let mockReload: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Create a minimal in-memory Storage mock
    const store: Record<string, string> = {}
    mockStorage = {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value }),
      removeItem: vi.fn((key: string) => { delete store[key] }),
      clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]) }),
      get length() { return Object.keys(store).length },
      key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
    }
    mockReload = vi.fn()
  })

  describe('handleChunkLoadError', () => {
    it('sets storage key, calls reload, and returns true on first call', async () => {
      const { handleChunkLoadError } = await import('@/utils/chunkReload')

      const result = handleChunkLoadError('/collection', mockStorage, mockReload)

      expect(result).toBe(true)
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        'chunk-reload:/collection',
        expect.any(String),
      )
      expect(mockReload).toHaveBeenCalledWith('/collection')
    })

    it('does NOT call reload and returns false on second call for same path', async () => {
      const { handleChunkLoadError } = await import('@/utils/chunkReload')

      handleChunkLoadError('/collection', mockStorage, mockReload)
      mockReload.mockClear()

      const result = handleChunkLoadError('/collection', mockStorage, mockReload)

      expect(result).toBe(false)
      expect(mockReload).not.toHaveBeenCalled()
    })

    it('tracks different paths independently', async () => {
      const { handleChunkLoadError } = await import('@/utils/chunkReload')

      expect(handleChunkLoadError('/collection', mockStorage, mockReload)).toBe(true)
      expect(handleChunkLoadError('/market', mockStorage, mockReload)).toBe(true)
      expect(mockReload).toHaveBeenCalledTimes(2)
    })
  })

  describe('clearChunkReloadFlag', () => {
    it('removes the storage key so next call would reload again', async () => {
      const { handleChunkLoadError, clearChunkReloadFlag } = await import('@/utils/chunkReload')

      // First call sets the flag
      handleChunkLoadError('/collection', mockStorage, mockReload)
      mockReload.mockClear()

      // Clear the flag
      clearChunkReloadFlag('/collection', mockStorage)

      // Now it should reload again
      const result = handleChunkLoadError('/collection', mockStorage, mockReload)
      expect(result).toBe(true)
      expect(mockReload).toHaveBeenCalledWith('/collection')
    })

    it('is a no-op for paths that were never set', async () => {
      const { clearChunkReloadFlag } = await import('@/utils/chunkReload')

      // Should not throw
      clearChunkReloadFlag('/nonexistent', mockStorage)
      expect(mockStorage.removeItem).toHaveBeenCalledWith('chunk-reload:/nonexistent')
    })
  })
})
