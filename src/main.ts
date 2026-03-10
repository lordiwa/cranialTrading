import { type Component, createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import { initI18n } from './composables/useI18n';
import './style.css';

// Two-phase recovery for corrupted Firestore IndexedDB cache.
// Phase 1: detect "projects//" errors (synchronous throws from IDB handlers
// + async rejections) → set localStorage flag → reload.
// Phase 2: firebase.ts reads flag → uses memoryLocalCache → skips corrupted IDB.
function handleFirestoreCorruption(): void {
  if (localStorage.getItem('firestore-idb-corrupt')) return;
  localStorage.setItem('firestore-idb-corrupt', Date.now().toString());
  window.location.reload();
}

// Synchronous throws from IndexedDB onsuccess/oncursor handlers
window.addEventListener('error', (event) => {
  const msg = event.message || String(event.error);
  if (msg.includes('Invalid segment') || msg.includes('projects//')) {
    event.preventDefault();
    handleFirestoreCorruption();
  }
});

// Async promise rejections (some Firestore errors surface this way)
window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event.reason);
  if (msg.includes('Invalid segment') || msg.includes('projects//')) {
    event.preventDefault();
    handleFirestoreCorruption();
  }
});

void (async () => {
  const app = createApp(App as Component);
  const pinia = createPinia();

  app.use(pinia);
  app.use(router);

  // Initialize auth AFTER router is set up
  const authStore = useAuthStore();
  authStore.initAuth();

  // Load locale before mounting so translations are ready
  await initI18n();

  app.mount('#app');
})();
