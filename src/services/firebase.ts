import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, initializeAuth } from 'firebase/auth';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
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

// TASK-178: `firebase/firestore` used to be imported (and initializeFirestore
// called) right here, in the SAME module as Auth. That static import forced
// the JS engine to fetch+evaluate Firestore's code (the larger half of the
// Firebase SDK — 112KB gzip vs Auth's 51KB, measured) every single time
// anything needed just `auth` — including the router guard's boot-critical
// path (router/authGuard.ts -> stores/auth.ts's ensureSubscription(), which
// only ever calls onAuthStateChanged and never touches Firestore). Splitting
// the Vite output chunk alone did NOT fix this (measured: heroInputAt
// unchanged) because chunk boundaries don't change what a STATIC import
// forces the engine to load — only removing the import edge does. Firestore
// now lives in its own module, services/firestore.ts, which imports `app`
// from here but is never imported BY this file — so loading firebase.ts for
// `auth` no longer pulls Firestore in at all.
