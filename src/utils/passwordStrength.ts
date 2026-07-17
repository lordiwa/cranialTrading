/**
 * Pure password-strength heuristic for the v2 auth screens (design→app v2
 * F7b, register + reset-password — cranial-design/prototype/02-register-*
 * and 04-reset-password-*.html "pw-meter" affordance).
 *
 * Presentation-only: purely advisory, does not gate submission and never
 * touches auth/reserve-username logic (RegisterView/ResetPasswordView still
 * submit on the same conditions as before this ticket).
 */

export type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4;

export type PasswordStrengthLabel = 'empty' | 'weak' | 'fair' | 'strong' | 'veryStrong';

const SCORE_TO_LABEL: Record<PasswordStrengthScore, PasswordStrengthLabel> = {
  0: 'empty',
  1: 'weak',
  2: 'fair',
  3: 'strong',
  4: 'veryStrong',
};

/**
 * Scores 0-4 based on length + character-class variety. 0 = empty input.
 */
export function getPasswordStrengthScore(password: string): PasswordStrengthScore {
  if (!password) return 0;

  let score = 1;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[0-9]/.test(password) && /[a-zA-Z]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password) || (/[a-z]/.test(password) && /[A-Z]/.test(password))) score++;

  return Math.min(score, 4) as PasswordStrengthScore;
}

export function getPasswordStrengthLabel(score: PasswordStrengthScore): PasswordStrengthLabel {
  return SCORE_TO_LABEL[score];
}
