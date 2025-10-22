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
            console.log('[MESSAGES] Intentando crear/obtener conversación:', conversationId);

            // Intentar obtener el documento existente
            const conversationRef = doc(db, 'conversations', conversationId);
            const conversationDoc = await getDoc(conversationRef);

            if (!conversationDoc.exists()) {
                console.log('[MESSAGES] Conversación no existe, creando nueva...');

                // Crear nueva conversación usando setDoc con el ID específico
                await setDoc(conversationRef, {
                    id: conversationId,
                    participantIds: [authStore.user.id, otherUserId],
                    participantNames: {
                        [authStore.user.id]: authStore.user.username,
                        [otherUserId]: otherUsername,
                    },
                    createdAt: Timestamp.now(),
                });
                console.log('[MESSAGES] Conversación creada exitosamente:', conversationId);
            } else {
                console.log('[MESSAGES] Conversación ya existe:', conversationId);
            }

            return conversationId;
        } catch (error) {
            console.error('[MESSAGES] Error creating conversation:', error);
            toastStore.show('Error al crear conversación', 'error');
            return '';
        }
    };

    // Enviar mensaje
    const sendMessage = async (conversationId: string, otherUserId: string, content: string): Promise<boolean> => {
        if (!authStore.user || !content.trim()) {
            console.log('[MESSAGES] No user or empty content');
            return false;
        }

        try {
            console.log('[MESSAGES] Enviando mensaje a conversación:', conversationId);
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
            console.log('[MESSAGES] Mensaje enviado exitosamente:', newMessageRef.id);
            return true;
        } catch (error) {
            console.error('[MESSAGES] Error sending message:', error);
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

            console.log('[MESSAGES] Loaded', conversations.value.length, 'conversations');
        } catch (error) {
            console.error('[MESSAGES] Error loading conversations:', error);
        } finally {
            loading.value = false;
        }
    };

    // Cargar mensajes de una conversación en tiempo real
    const loadConversationMessages = (conversationId: string) => {
        if (!authStore.user) {
            console.log('[MESSAGES] No user, skipping message loading');
            return;
        }

        // Desuscribirse del listener anterior si existe
        if (unsubscribe) unsubscribe();

        console.log('[MESSAGES] Cargando mensajes para:', conversationId);
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

                console.log('[MESSAGES] Loaded', currentMessages.value.length, 'messages');
            },
            (error) => {
                console.error('[MESSAGES] Error listening to messages:', error);
            }
        );
    };

    // Detener de escuchar mensajes
    const stopListeningMessages = () => {
        if (unsubscribe) {
            console.log('[MESSAGES] Stopping message listener');
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
