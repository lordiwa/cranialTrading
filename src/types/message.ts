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
    lastMessage?: Message;
    lastMessageTime?: Date;
    unreadCount: number;
}

