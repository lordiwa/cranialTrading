import { defineStore } from 'pinia';
import { ref } from 'vue';
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, Timestamp, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';
import { type Conversation, type Message } from '../types/message';
import { t } from '../composables/useI18n';

export const useMessagesStore = defineStore('messages', () => {
    const conversations = ref<Conversation[]>([]);
    const currentMessages = ref<Message[]>([]);
    const loading = ref(false);
    const authStore = useAuthStore();
    const toastStore = useToastStore();
    let unsubscribe: (() => void) | null = null;

    /**
     * Generar ID de conversación consistente entre dos usuarios
     * Ej: "user1_user2" (siempre ordenados alfabéticamente)
     */
    const getConversationId = (userId1: string, userId2: string): string => {
        return [userId1, userId2].sort((a, b) => a.localeCompare(b)).join('_');
    };

    /**
     * Crear o obtener una conversación existente
     * @returns conversationId o empty string si falla
     */
    const createConversation = async (otherUserId: string, otherUsername: string, otherAvatarUrl?: string | null): Promise<string> => {
        if (!authStore.user?.id) {
            console.error('❌ No authenticated user');
            return '';
        }

        // ✅ Validación: evitar conversación con sí mismo
        if (authStore.user.id === otherUserId) {
            toastStore.show(t('messages.errors.selfChat'), 'error');
            return '';
        }

        const conversationId = getConversationId(authStore.user.id, otherUserId);

        try {
            const conversationRef = doc(db, 'conversations', conversationId);
            const conversationDoc = await getDoc(conversationRef);

            if (!conversationDoc.exists()) {
                // Crear nueva conversación
                await setDoc(conversationRef, {
                    id: conversationId,
                    participantIds: [authStore.user.id, otherUserId],
                    participantNames: {
                        [authStore.user.id]: authStore.user.username,
                        [otherUserId]: otherUsername,
                    },
                    participantAvatars: {
                        [authStore.user.id]: authStore.user.avatarUrl ?? null,
                        [otherUserId]: otherAvatarUrl ?? null,
                    },
                    createdAt: Timestamp.now(),
                    lastMessage: '',
                    lastMessageTime: Timestamp.now(),
                });

                console.info(`Conversación creada: ${conversationId}`);
            } else {
                console.info(`Conversación existe: ${conversationId}`);
            }

            return conversationId;
        } catch (error) {
            console.error('❌ Error creando conversación:', error);
            toastStore.show(t('messages.errors.createError'), 'error');
            return '';
        }
    };

    /**
     * Enviar mensaje en una conversación
     */
    const sendMessage = async (conversationId: string, otherUserId: string, content: string): Promise<boolean> => {
        if (!authStore.user?.id) {
            console.error('❌ No authenticated user');
            return false;
        }

        if (!content.trim()) {
            console.warn('⚠️ Empty message');
            return false;
        }

        try {
            const messagesRef = collection(db, 'conversations', conversationId, 'messages');
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

            // ✅ Actualizar lastMessage en conversación
            const conversationRef = doc(db, 'conversations', conversationId);
            await setDoc(conversationRef, {
                lastMessage: content.trim(),
                lastMessageTime: Timestamp.now(),
            }, { merge: true });

            console.info(`Mensaje enviado`);
            return true;
        } catch (error) {
            console.error('❌ Error enviando mensaje:', error);
            toastStore.show(t('messages.errors.sendError'), 'error');
            return false;
        }
    };

    /**
     * Cargar todas las conversaciones del usuario autenticado
     */
    const loadConversations = async () => {
        if (!authStore.user?.id) {
            console.warn('⚠️ No user to load conversations');
            return;
        }

        loading.value = true;
        try {
            const conversationsRef = collection(db, 'conversations');
            const q = query(conversationsRef, where('participantIds', 'array-contains', authStore.user.id));
            const snapshot = await getDocs(q);

            interface FirestoreConversationData {
                id: string;
                participantIds?: string[];
                participantNames?: Record<string, string>;
                participantAvatars?: Record<string, string | null>;
                lastMessage?: string;
                lastMessageTime?: { toDate: () => Date };
            }
            conversations.value = snapshot.docs
                .map(d => {
                    const data = d.data() as FirestoreConversationData;
                    return {
                        id: data.id,
                        participantIds: data.participantIds ?? [],
                        participantNames: data.participantNames ?? {},
                        participantAvatars: data.participantAvatars ?? {},
                        lastMessage: data.lastMessage ?? '',
                        lastMessageTime: data.lastMessageTime?.toDate() ?? new Date(),
                        unreadCount: 0, // TODO: implementar contador de no leídos
                    } as unknown as Conversation;
                })
                .sort((a, b) => (b.lastMessageTime?.getTime() ?? 0) - (a.lastMessageTime?.getTime() ?? 0));

            console.info(`${conversations.value.length} conversaciones cargadas`);
        } catch (error) {
            console.error('❌ Error cargando conversaciones:', error);
            toastStore.show(t('messages.errors.loadError'), 'error');
        } finally {
            loading.value = false;
        }
    };

    /**
     * Cargar mensajes de una conversación con listener en tiempo real
     * ✅ FIX: Detiene listener anterior si existe
     */
    const loadConversationMessages = (conversationId: string) => {
        if (!authStore.user?.id) {
            console.error('❌ No authenticated user');
            return;
        }

        // Desuscribirse del listener anterior si existe
        if (unsubscribe) {
            console.info('Deteniendo listener anterior');
            unsubscribe();
            unsubscribe = null;
        }

        loading.value = true;
        const messagesRef = collection(db, 'conversations', conversationId, 'messages');

        unsubscribe = onSnapshot(
            messagesRef,
            (snapshot) => {
                interface FirestoreMessageData {
                    senderId: string;
                    senderUsername: string;
                    recipientId: string;
                    content: string;
                    createdAt?: { toDate: () => Date };
                    read?: boolean;
                }
                currentMessages.value = snapshot.docs
                    .map(d => {
                        const data = d.data() as FirestoreMessageData;
                        return {
                            id: d.id,
                            senderId: data.senderId,
                            senderUsername: data.senderUsername,
                            recipientId: data.recipientId,
                            content: data.content,
                            createdAt: data.createdAt?.toDate() ?? new Date(),
                            read: data.read ?? false,
                        } as Message;
                    })
                    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

                console.info(`${currentMessages.value.length} mensajes cargados`);
                loading.value = false;
            },
            (error) => {
                console.error('❌ Error en listener de mensajes:', error);
                toastStore.show(t('messages.errors.listenError'), 'error');
                loading.value = false;
            }
        );
    };

    /**
     * Detener de escuchar mensajes y limpiar recursos
     * ✅ FIX: Necesario en unmount para evitar memory leaks
     */
    const stopListeningMessages = () => {
        if (unsubscribe) {
            console.info('Deteniendo listener de mensajes');
            unsubscribe();
            unsubscribe = null;
        }
        currentMessages.value = [];
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
    };
});