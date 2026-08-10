import { vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const setDocMock = vi.fn();
const deleteDocMock = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn((_db, col, id) => ({ col, id })),
  getDoc: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  query: vi.fn(),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  updateDoc: vi.fn(),
  where: vi.fn(),
}));

vi.mock('@/services/firebase', () => ({ db: {}, auth: { currentUser: null } }));
vi.mock('@/services/firestore', () => ({ db: {} }))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  confirmPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock('@/composables/useI18n', () => ({
  t: (key: string) => key,
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'en' } }),
}));

beforeEach(() => {
  setActivePinia(createPinia());
  setDocMock.mockReset();
  deleteDocMock.mockReset();
});

import { useAuthStore } from '@/stores/auth';

describe('reserveUsername', () => {
  it('returns true when setDoc resolves', async () => {
    setDocMock.mockResolvedValueOnce(undefined);
    const store = useAuthStore();
    const result = await store.reserveUsername('uid1', 'rafael_m');
    expect(result).toBe(true);
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const [ref, body] = setDocMock.mock.calls[0] as [unknown, { uid: string; createdAt: unknown }];
    expect(ref).toEqual({ col: 'usernames', id: 'rafael_m' });
    expect(body.uid).toBe('uid1');
    expect(body.createdAt).toBeInstanceOf(Date);
  });

  it('returns false when setDoc rejects with permission-denied', async () => {
    setDocMock.mockRejectedValueOnce({ code: 'permission-denied' });
    const store = useAuthStore();
    await expect(store.reserveUsername('uid1', 'rafael_m')).resolves.toBe(false);
  });

  it('returns false when setDoc rejects with any error', async () => {
    setDocMock.mockRejectedValueOnce(new Error('network'));
    const store = useAuthStore();
    await expect(store.reserveUsername('uid1', 'rafael_m')).resolves.toBe(false);
  });
});

describe('releaseUsername', () => {
  it('calls deleteDoc with the usernames doc', async () => {
    deleteDocMock.mockResolvedValueOnce(undefined);
    const store = useAuthStore();
    await store.releaseUsername('rafael_m');
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
    expect(deleteDocMock.mock.calls[0][0]).toEqual({ col: 'usernames', id: 'rafael_m' });
  });

  it('does not throw when deleteDoc rejects', async () => {
    deleteDocMock.mockRejectedValueOnce(new Error('boom'));
    const store = useAuthStore();
    await expect(store.releaseUsername('rafael_m')).resolves.toBeUndefined();
  });
});
