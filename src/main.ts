import { type Component, createApp } from 'vue';
import { createHead } from '@unhead/vue/client';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import { initI18n } from './composables/useI18n';
import { handleChunkLoadError } from './utils/chunkReload';
import './style.css';

// One-time cleanup: delete any leftover corrupted Firestore IndexedDB databases
if (!sessionStorage.getItem('firestore-idb-cleaned')) {
  sessionStorage.setItem('firestore-idb-cleaned', '1');
  void (async () => {
    try {
      const databases = await indexedDB.databases();
      for (const dbInfo of databases.filter(d => d.name?.startsWith('firestore'))) {
        if (dbInfo.name) indexedDB.deleteDatabase(dbInfo.name);
      }
    } catch { /* ignore */ }
  })();
}

// TASK-132 review fix (HIGH-1c): a stale deployment can leave the browser
// holding an index.html whose chunk hashes no longer exist on the server
// (right after a new release). Vite's runtime dispatches this event
// whenever ANY dynamic import() fails to load its chunk — broader than
// router.onError below (route navigation only): it also covers the new
// non-route dynamic imports this ticket introduced (stores/auth.ts's
// Firebase SDK load, services/publicCardSearch.ts). Reuses the same
// single-retry-per-path safeguard (sessionStorage) as the router handler,
// keyed on the current location since there's no route change here.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  handleChunkLoadError(window.location.pathname + window.location.search);
});

void (async () => {
  const app = createApp(App as Component);
  const head = createHead();
  const pinia = createPinia();

  app.use(head);
  app.use(pinia);
  app.use(router);

  // Initialize auth AFTER router is set up. TASK-132: initAuth() now
  // dynamically imports the Firebase SDK internally, so this fires the
  // background fetch without blocking module evaluation / first paint —
  // intentionally not awaited (same as before).
  const authStore = useAuthStore();
  void authStore.initAuth();

  // Load locale before mounting so translations are ready
  await initI18n();

  app.mount('#app');
})();
