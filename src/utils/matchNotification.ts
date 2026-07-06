import type { SimpleMatch } from '../stores/matches'

/**
 * Compute the human-readable alert description for a match notification.
 *
 * Logic:
 * - Received shared interest (`isSharedMatch && !isSender`): ALWAYS "wants your card {name}"
 *   regardless of match.type — the card lives in myCards[0] for the receiver side,
 *   even for trade-status cards where type='BUSCO'.
 * - Calculated VENDO (not shared): "wants your card {name}" — myCards is the offered card.
 * - Calculated BUSCO (not shared): "has the card {name} you want" — otherCards is the target.
 * - Every lookup falls back tolerantly across all card fields so it never renders '?'
 *   when a name exists anywhere on the match.
 */
export function getMatchAlertDescription(
  match: SimpleMatch,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  // Received shared interest: the sender is interested in the receiver's card.
  // For the receiver, the card lives in myCards (set by parseSharedMatch).
  if (match.isSharedMatch && !match.isSender) {
    const cardName =
      match.myCards?.[0]?.name ??
      match.myCard?.name ??
      match.otherCards?.[0]?.name ??
      match.otherCard?.name ??
      '?'
    return t('matches.notifications.wantsYourCard', { card: cardName })
  }

  if (match.type === 'VENDO') {
    const cardName =
      match.myCards?.[0]?.name ??
      match.myCard?.name ??
      match.otherCards?.[0]?.name ??
      match.otherCard?.name ??
      '?'
    return t('matches.notifications.wantsYourCard', { card: cardName })
  }

  // Calculated BUSCO (non-shared): they have a card the current user wants.
  const cardName =
    match.otherCards?.[0]?.name ??
    match.otherCard?.name ??
    match.myCards?.[0]?.name ??
    match.myCard?.name ??
    '?'
  return t('matches.notifications.hasCardYouWant', { card: cardName })
}
