export interface Message {
    id: string;
    senderId: string;
    senderUsername: string;
    recipientId: string;
    content: string;
    createdAt: Date;
    read: boolean;
}

export interface Conversation {
    id: string;
    participantIds: string[]; // [userId1, userId2]
    participantNames: Record<string, string>;
    participantAvatars?: Record<string, string | null>;
    // ✅ FIX (TASK-091): stores/messages.ts persiste/lee lastMessage como texto plano
    // (campo `lastMessage: string` en el doc de Firestore), no como objeto Message.
    lastMessage?: string;
    lastMessageTime?: Date;
    unreadCount: number;
}

