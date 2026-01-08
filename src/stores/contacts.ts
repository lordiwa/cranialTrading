import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
    collection,
    getDocs,
    addDoc,
    deleteDoc,
    doc,
    onSnapshot,
    Timestamp,
} from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'
import { Contact } from '../types/contact'

export const useContactsStore = defineStore('contacts', () => {
    const contacts = ref<Contact[]>([])
    const loading = ref(false)
    const authStore = useAuthStore()
    const toastStore = useToastStore()
    let unsubscribe: (() => void) | null = null

    const saveContact = async (contact: Omit<Contact, 'id'>) => {
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
            })

            toastStore.show('✓ Contacto guardado', 'success')
            return true
        } catch (error) {
            console.error('Error saving contact:', error)
            toastStore.show('Error al guardar contacto', 'error')
            return false
        }
    }

    const deleteContact = async (contactId: string) => {
        if (!authStore.user?.id) return false

        try {
            const contactRef = doc(db, 'users', authStore.user.id, 'contactos_guardados', contactId)
            await deleteDoc(contactRef)

            contacts.value = contacts.value.filter(c => c.id !== contactId)
            toastStore.show('Contacto eliminado', 'success')
            return true
        } catch (error) {
            console.error('Error deleting contact:', error)
            toastStore.show('Error al eliminar contacto', 'error')
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
                    toastStore.show('Error al cargar contactos', 'error')
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

    return {
        contacts,
        loading,
        saveContact,
        deleteContact,
        loadSavedContacts,
        stopListeningContacts,
    }
})