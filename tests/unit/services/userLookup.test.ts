import { vi } from 'vitest';

const getDocMock = vi.fn();
const getDocsMock = vi.fn();
const docArgs: unknown[][] = [];

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ __col: true })),
  doc: vi.fn((_db, col, id) => { docArgs.push([col, id]); return { col, id }; }),
  getDoc: (...a: unknown[]) => getDocMock(...a),
  getDocs: (...a: unknown[]) => getDocsMock(...a),
  query: vi.fn((...a: unknown[]) => a),
  where: vi.fn((...a: unknown[]) => ({ where: a })),
  limit: vi.fn((n: number) => ({ limit: n })),
}));
vi.mock('@/services/firebase', () => ({ db: {} }));

beforeEach(() => {
  getDocMock.mockReset();
  getDocsMock.mockReset();
  docArgs.length = 0;
});

import { resolveUsernameToUid } from '@/services/userLookup';

describe('resolveUsernameToUid', () => {
  it('index hit: returns user doc when /usernames/{norm} exists', async () => {
    getDocMock
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ uid: 'U1' }) })
      .mockResolvedValueOnce({ exists: () => true, id: 'U1', data: () => ({ username: 'rafael_m', location: 'x' }) });
    const result = await resolveUsernameToUid('rafael_m');
    expect(result).toEqual({ id: 'U1', data: { username: 'rafael_m', location: 'x' } });
  });

  it('normalizes input before lookup', async () => {
    getDocMock
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ uid: 'U1' }) })
      .mockResolvedValueOnce({ exists: () => true, id: 'U1', data: () => ({ username: 'rafael_m' }) });
    await resolveUsernameToUid('Rafael_M');
    // first doc() call is for the /usernames index — id must be normalized
    expect(docArgs[0]).toEqual(['usernames', 'rafael_m']);
  });

  it('legacy fallback: index miss → where/limit(1) query resolves', async () => {
    getDocMock.mockResolvedValueOnce({ exists: () => false });
    getDocsMock.mockResolvedValueOnce({ empty: false, docs: [{ id: 'U2', data: () => ({ username: 'rafael_m' }) }] });
    const result = await resolveUsernameToUid('rafael_m');
    expect(result).toEqual({ id: 'U2', data: { username: 'rafael_m' } });
  });

  it('returns null when index miss AND legacy query empty', async () => {
    getDocMock.mockResolvedValueOnce({ exists: () => false });
    getDocsMock.mockResolvedValueOnce({ empty: true, docs: [] });
    const result = await resolveUsernameToUid('ghost');
    expect(result).toBeNull();
  });

  it('falls back to legacy when index points to a missing user doc', async () => {
    getDocMock
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ uid: 'U3' }) }) // index exists
      .mockResolvedValueOnce({ exists: () => false }); // users/U3 missing
    getDocsMock.mockResolvedValueOnce({ empty: false, docs: [{ id: 'U3b', data: () => ({ username: 'rafael_m' }) }] });
    const result = await resolveUsernameToUid('rafael_m');
    expect(result).toEqual({ id: 'U3b', data: { username: 'rafael_m' } });
  });

  it('returns null for whitespace-only / empty username', async () => {
    const result = await resolveUsernameToUid('   ');
    expect(result).toBeNull();
    expect(getDocMock).not.toHaveBeenCalled();
  });
});
