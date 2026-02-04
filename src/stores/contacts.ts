import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    onSnapshot,
    Timestamp,
} from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'
import { type Contact } from '../types/contact'
import { t } from '../composables/useI18n'

export const useContactsStore = defineStore('contacts', () => {
    const contacts = ref<Contact[]>([])
    const loading = ref(false)
    const authStore = useAuthStore()
    const toastStore = useToastStore()
    let unsubscribe: (() => void) | null = null

    const saveContact = async (contact: Omit<Contact, 'id' | 'savedAt'>) => {
        if (!authStore.user?.id) return false

        try {
            const contactsRef = collection(db, 'users', authStore.user.id, 'contactos_guardados')
            const docRef = await addDoc(contactsRef, {
                ...contact,
                savedAt: Timestamp.now(),
            })

            contacts.value.push({
                id: docRef.id,
                ...contact,
                savedAt: new Date(),
            })

            toastStore.show(t('contacts.messages.saved'), 'success')
            return true
        } catch (error) {
            console.error('Error saving contact:', error)
            toastStore.show(t('contacts.messages.saveError'), 'error')
            return false
        }
    }

    const deleteContact = async (contactId: string) => {
        if (!authStore.user?.id) return false

        try {
            const contactRef = doc(db, 'users', authStore.user.id, 'contactos_guardados', contactId)
            await deleteDoc(contactRef)

            contacts.value = contacts.value.filter(c => c.id !== contactId)
            toastStore.show(t('contacts.messages.deleted'), 'success')
            return true
        } catch (error) {
            console.error('Error deleting contact:', error)
            toastStore.show(t('contacts.messages.deleteError'), 'error')
            return false
        }
    }

    const loadSavedContacts = async () => {
        if (!authStore.user?.id) return

        loading.value = true
        try {
            const contactsRef = collection(db, 'users', authStore.user.id, 'contactos_guardados')

            // Setup real-time listener
            unsubscribe = onSnapshot(
                contactsRef,
                (snapshot) => {
                    contacts.value = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data(),
                        savedAt: doc.data().savedAt?.toDate() || new Date(),
                    })) as Contact[]
                    loading.value = false
                },
                (error) => {
                    console.error('Error loading contacts:', error)
                    toastStore.show(t('contacts.messages.loadError'), 'error')
                    loading.value = false
                }
            )
        } catch (error) {
            console.error('Error setting up listener:', error)
            loading.value = false
        }
    }

    const stopListeningContacts = () => {
        if (unsubscribe) {
            unsubscribe()
            unsubscribe = null
        }
    }

    /**
     * Delete all contacts for current user
     */
    const deleteAllContacts = async (): Promise<boolean> => {
        if (!authStore.user?.id) return false

        try {
            const contactsRef = collection(db, 'users', authStore.user.id, 'contactos_guardados')
            const snapshot = await getDocs(contactsRef)

            await Promise.all(snapshot.docs.map(docSnap => deleteDoc(doc(db, 'users', authStore.user!.id, 'contactos_guardados', docSnap.id))))

            contacts.value = []
            return true
        } catch (error) {
            console.error('Error deleting all contacts:', error)
            return false
        }
    }

    return {
        contacts,
        loading,
        saveContact,
        deleteContact,
        deleteAllContacts,
        loadSavedContacts,
        stopListeningContacts,
    }
})