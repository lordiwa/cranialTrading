import { normalizeUsername, pickCanonical, buildPlan } from '../../../scripts/usernameMigration.mjs';

describe('normalizeUsername', () => {
  it('trims and lowercases', () => {
    expect(normalizeUsername('  Rafael_M ')).toBe('rafael_m');
  });

  it('returns empty string for null/undefined (defensive for raw Firestore data)', () => {
    expect(normalizeUsername(null)).toBe('');
    expect(normalizeUsername(undefined)).toBe('');
  });
});

describe('pickCanonical', () => {
  it('picks the member with the most cards', () => {
    const group = [
      { uid: 'a', username: 'x', cardCount: 5, createdAt: 100 },
      { uid: 'b', username: 'x', cardCount: 10, createdAt: 200 },
    ];
    expect(pickCanonical(group).uid).toBe('b');
  });

  it('breaks ties by oldest createdAt', () => {
    const group = [
      { uid: 'a', username: 'x', cardCount: 7, createdAt: 100 },
      { uid: 'b', username: 'x', cardCount: 7, createdAt: 200 },
    ];
    expect(pickCanonical(group).uid).toBe('a');
  });

  it('handles a single-member group', () => {
    const group = [{ uid: 'solo', username: 'x', cardCount: 0, createdAt: 0 }];
    expect(pickCanonical(group).uid).toBe('solo');
  });
});

describe('buildPlan', () => {
  it('produces no renames for a unique (size-1) group, just one index write', () => {
    const groups = new Map([['rafael_m', [{ uid: 'a', username: 'rafael_m', cardCount: 3, createdAt: 1 }]]]);
    const plan = buildPlan(groups);
    expect(plan.renames).toEqual([]);
    expect(plan.indexWrites).toEqual([{ norm: 'rafael_m', uid: 'a' }]);
  });

  it('renames non-canonical members to ${norm}_old1, ${norm}_old2 in order', () => {
    const groups = new Map([['dup', [
      { uid: 'a', username: 'Dup', cardCount: 1, createdAt: 100 },
      { uid: 'b', username: 'dup', cardCount: 9, createdAt: 200 }, // canonical (most cards)
      { uid: 'c', username: 'DUP', cardCount: 1, createdAt: 300 },
    ]]]);
    const plan = buildPlan(groups);
    // canonical is b; a and c get renamed in iteration order
    expect(plan.renames).toEqual([
      { uid: 'a', from: 'Dup', to: 'dup_old1' },
      { uid: 'c', from: 'DUP', to: 'dup_old2' },
    ]);
    expect(plan.indexWrites).toEqual([{ norm: 'dup', uid: 'b' }]);
  });

  it('writes exactly one index entry per normalized username', () => {
    const groups = new Map([
      ['one', [{ uid: 'a', username: 'one', cardCount: 1, createdAt: 1 }]],
      ['two', [{ uid: 'b', username: 'two', cardCount: 1, createdAt: 1 }, { uid: 'c', username: 'two', cardCount: 2, createdAt: 2 }]],
    ]);
    const plan = buildPlan(groups);
    expect(plan.indexWrites.length).toBe(2);
  });
});
