import { type Component, createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import { initI18n } from './composables/useI18n';
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
