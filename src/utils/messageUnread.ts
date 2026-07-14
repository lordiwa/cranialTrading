/**
 * TASK-091 — unreadCount real (F3 messages split-pane).
 * Pure counting logic, kept isolated from Firestore so it can be unit tested
 * without mocking Firebase (see stores/messages.ts for the wiring).
 */

export interface UnreadCountableMessage {
    recipientId: string;
    read: boolean;
}

/**
 * Cuenta cuántos mensajes de `messages` están dirigidos a `userId` y no leídos.
 */
export const countUnreadMessages = (messages: UnreadCountableMessage[], userId: string): number => {
    if (!userId) return 0;
    return messages.reduce((count, m) => count + (m.recipientId === userId && !m.read ? 1 : 0), 0);
};

/**
 * Suma el unreadCount de una lista de conversaciones (badge global del header).
 */
export const sumUnreadCounts = (conversations: { unreadCount?: number }[]): number => {
    return conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
};
