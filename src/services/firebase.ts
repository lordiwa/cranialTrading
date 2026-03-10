import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Phase 2 of Firestore IndexedDB corruption recovery:
// If Phase 1 (main.ts error listener) detected corruption and set this flag,
// use memory-only cache to bypass the corrupted IDB entirely.
// Background-delete the corrupted databases so the next load can use persistent cache again.
const corruptionDetected = localStorage.getItem('firestore-idb-corrupt');
if (corruptionDetected) {
    localStorage.removeItem('firestore-idb-corrupt');
    void (async () => {
        try {
            const databases = await indexedDB.databases();
            for (const dbInfo of databases.filter(d => d.name?.startsWith('firestore'))) {
                if (dbInfo.name) indexedDB.deleteDatabase(dbInfo.name);
            }
        } catch { /* ignore */ }
    })();
}

export const db = initializeFirestore(app, {
    localCache: corruptionDetected
        ? memoryLocalCache()
        : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
