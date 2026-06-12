import { normalizeUsername, isValidUsername } from '@/utils/username';

describe('normalizeUsername', () => {
  it('trims and lowercases', () => {
    expect(normalizeUsername('  Rafael_M ')).toBe('rafael_m');
  });

  it('lowercases ALL CAPS', () => {
    expect(normalizeUsername('ABCDEF')).toBe('abcdef');
  });

  it('leaves an already-normalized value unchanged', () => {
    expect(normalizeUsername('rafael_m')).toBe('rafael_m');
  });

  it('preserves digits and underscores', () => {
    expect(normalizeUsername('User_99')).toBe('user_99');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeUsername('   ')).toBe('');
  });
});

describe('isValidUsername', () => {
  it('accepts a 3-char lowercase value', () => {
    expect(isValidUsername('abc')).toBe(true);
  });

  it('accepts a 20-char value', () => {
    expect(isValidUsername('a'.repeat(20))).toBe(true);
  });

  it('accepts digits and underscores', () => {
    expect(isValidUsername('rafael_m99')).toBe(true);
  });

  it('rejects a 2-char value', () => {
    expect(isValidUsername('ab')).toBe(false);
  });

  it('rejects a 21-char value', () => {
    expect(isValidUsername('a'.repeat(21))).toBe(false);
  });

  it('rejects a value with a space', () => {
    expect(isValidUsername('bad name')).toBe(false);
  });

  it('rejects a value with a hyphen', () => {
    expect(isValidUsername('bad-name')).toBe(false);
  });

  it('trims before validating', () => {
    expect(isValidUsername('  abc  ')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidUsername('')).toBe(false);
  });
});
