import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, initializeAuth } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
// TASK-172: popupRedirectResolver is intentionally NOT passed here. Doing so
// makes initializeAuth eagerly mount Firebase's popup/redirect resolver on
// every app boot, which injects a reCAPTCHA/gapi iframe (api.js, bframe
// script, rum beacon — ~3 third-party requests, ~2s each) into every page
// load, even when nobody uses Google sign-in. The resolver is instead passed
// per-call to signInWithPopup (see stores/auth.ts loginWithGoogle) — the only
// place a popup is actually opened.
export const auth = initializeAuth(app, {
    persistence: browserLocalPersistence,
});
export const db = initializeFirestore(app, {
    localCache: memoryLocalCache(),
});
