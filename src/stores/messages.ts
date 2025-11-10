import { defineStore } from 'pinia';
import { ref } from 'vue';
import { collection, getDocs, doc, onSnapshot, Timestamp, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';
import { Message, Conversation } from '../types/message';

export const useMessagesStore = defineStore('messages', () => {
    const conversations = ref<Conversation[]>([]);
    const currentMessages = ref<Message[]>([]);
    const loading = ref(false);
    const authStore = useAuthStore();
    const toastStore = useToastStore();
    let unsubscribe: (() => void) | null = null;

    // Generar ID de conversación consistente entre dos usuarios
    const getConversationId = (userId1: string, userId2: string): string => {
        return [userId1, userId2].sort().join('_');
    };

    // Crear o obtener una conversación
    const createConversation = async (otherUserId: string, otherUsername: string): Promise<string> => {
        if (!authStore.user) return '';

        const conversationId = getConversationId(authStore.user.id, otherUserId);

        try {
            // Get or create conversation document
            const conversationRef = doc(db, 'conversations', conversationId);
            const conversationDoc = await getDoc(conversationRef);

            if (!conversationDoc.exists()) {
                // Create new conversation using setDoc with the specific ID
                await setDoc(conversationRef, {
                    id: conversationId,
                    participantIds: [authStore.user.id, otherUserId],
                    participantNames: {
                        [authStore.user.id]: authStore.user.username,
                        [otherUserId]: otherUsername,
                    },
                    createdAt: Timestamp.now(),
                });
            }

            return conversationId;
        } catch (error) {
            toastStore.show('Error al crear conversación', 'error');
            return '';
        }
    };

    // Enviar mensaje
    const sendMessage = async (conversationId: string, otherUserId: string, content: string): Promise<boolean> => {
        if (!authStore.user || !content.trim()) {
            return false;
        }

        try {
            // sending message
            const messagesRef = collection(db, 'conversations', conversationId, 'messages');

            // Generar ID único para el mensaje
            const newMessageRef = doc(messagesRef);

            const newMessage = {
                senderId: authStore.user.id,
                senderUsername: authStore.user.username,
                recipientId: otherUserId,
                content: content.trim(),
                createdAt: Timestamp.now(),
                read: false,
            };

            await setDoc(newMessageRef, newMessage);
            return true;
        } catch (error) {
            toastStore.show('Error al enviar mensaje', 'error');
            return false;
        }
    };

    // Cargar conversaciones del usuario
    const loadConversations = async () => {
        if (!authStore.user) return;

        loading.value = true;
        try {
            const conversationsRef = collection(db, 'conversations');
            const snapshot = await getDocs(conversationsRef);

            conversations.value = snapshot.docs
                .map(doc => {
                    const data = doc.data();
                    return {
                        id: data.id,
                        participantIds: data.participantIds || [],
                        participantNames: data.participantNames || {},
                        lastMessage: data.lastMessage,
                        lastMessageTime: data.lastMessageTime?.toDate(),
                        unreadCount: 0,
                    } as Conversation;
                })
                .filter(conv => conv.participantIds.includes(authStore.user!.id));

            // conversations loaded
        } catch (error) {
            toastStore.show('Error al cargar conversaciones', 'error');
         } finally {
             loading.value = false;
         }
     };

    // Cargar mensajes de una conversación en tiempo real
    const loadConversationMessages = (conversationId: string) => {
        if (!authStore.user) {
            return;
        }

        // Desuscribirse del listener anterior si existe
        if (unsubscribe) unsubscribe();

        // start listening messages
        const messagesRef = collection(db, 'conversations', conversationId, 'messages');

        unsubscribe = onSnapshot(
            messagesRef,
            (snapshot) => {
                currentMessages.value = snapshot.docs
                    .map(doc => {
                        const data = doc.data();
                        return {
                            id: doc.id,
                            senderId: data.senderId,
                            senderUsername: data.senderUsername,
                            recipientId: data.recipientId,
                            content: data.content,
                            createdAt: data.createdAt?.toDate() || new Date(),
                            read: data.read || false,
                        } as Message;
                    })
                    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

                // messages loaded
            },
            (_err) => {
                toastStore.show('Error al escuchar mensajes', 'error');
            }
        );
    };

    // Detener de escuchar mensajes
    const stopListeningMessages = () => {
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
    };

    return {
        conversations,
        currentMessages,
        loading,
        createConversation,
        sendMessage,
        loadConversations,
        loadConversationMessages,
        stopListeningMessages,
        getConversationId,
    };
});
