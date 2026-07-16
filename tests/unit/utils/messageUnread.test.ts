/**
 * TASK-091 — unreadCount real (F3 messages split-pane).
 *
 * Pure counting logic, TDD'd before stores/messages.ts wiring.
 */
import { countUnreadMessages, sumUnreadCounts } from '@/utils/messageUnread'

describe('countUnreadMessages', () => {
  it('returns 0 for an empty message list', () => {
    expect(countUnreadMessages([], 'me')).toBe(0)
  })

  it('counts only messages addressed to the given user', () => {
    const messages = [
      { recipientId: 'me', read: false },
      { recipientId: 'other', read: false },
    ]
    expect(countUnreadMessages(messages, 'me')).toBe(1)
  })

  it('ignores messages already marked as read even if addressed to the user', () => {
    const messages = [
      { recipientId: 'me', read: true },
      { recipientId: 'me', read: false },
    ]
    expect(countUnreadMessages(messages, 'me')).toBe(1)
  })

  it('counts multiple unread messages from the same conversation', () => {
    const messages = [
      { recipientId: 'me', read: false },
      { recipientId: 'me', read: false },
      { recipientId: 'me', read: false },
    ]
    expect(countUnreadMessages(messages, 'me')).toBe(3)
  })

  it('returns 0 when userId is empty', () => {
    const messages = [{ recipientId: '', read: false }]
    expect(countUnreadMessages(messages, '')).toBe(0)
  })

  it('does not count messages sent by the user to someone else', () => {
    const messages = [{ recipientId: 'other', read: false }]
    expect(countUnreadMessages(messages, 'me')).toBe(0)
  })
})

describe('sumUnreadCounts', () => {
  it('returns 0 for an empty conversation list', () => {
    expect(sumUnreadCounts([])).toBe(0)
  })

  it('sums unreadCount across conversations', () => {
    const conversations = [{ unreadCount: 2 }, { unreadCount: 1 }, { unreadCount: 0 }]
    expect(sumUnreadCounts(conversations)).toBe(3)
  })

  it('treats a missing unreadCount as 0', () => {
    const conversations = [{ unreadCount: 2 }, {}]
    expect(sumUnreadCounts(conversations)).toBe(2)
  })
})
