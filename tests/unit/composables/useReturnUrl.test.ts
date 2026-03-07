describe('useReturnUrl', () => {
  describe('buildLoginUrl', () => {
    it('builds login URL with encoded returnUrl', async () => {
      const { buildLoginUrl } = await import('../../../src/composables/useReturnUrl');
      expect(buildLoginUrl('/@rafael')).toBe('/login?returnUrl=%2F%40rafael');
    });

    it('handles empty string', async () => {
      const { buildLoginUrl } = await import('../../../src/composables/useReturnUrl');
      expect(buildLoginUrl('')).toBe('/login?returnUrl=');
    });

    it('handles already encoded characters', async () => {
      const { buildLoginUrl } = await import('../../../src/composables/useReturnUrl');
      expect(buildLoginUrl('/path%20with%20spaces')).toBe('/login?returnUrl=%2Fpath%2520with%2520spaces');
    });

    it('encodes query parameters in the return URL', async () => {
      const { buildLoginUrl } = await import('../../../src/composables/useReturnUrl');
      expect(buildLoginUrl('/collection?tab=decks')).toBe('/login?returnUrl=%2Fcollection%3Ftab%3Ddecks');
    });
  });

  describe('buildRegisterUrl', () => {
    it('builds register URL with encoded returnUrl', async () => {
      const { buildRegisterUrl } = await import('../../../src/composables/useReturnUrl');
      expect(buildRegisterUrl('/@rafael')).toBe('/register?returnUrl=%2F%40rafael');
    });

    it('handles empty string', async () => {
      const { buildRegisterUrl } = await import('../../../src/composables/useReturnUrl');
      expect(buildRegisterUrl('')).toBe('/register?returnUrl=');
    });
  });
});
