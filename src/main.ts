import { type Component, createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import { initI18n } from './composables/useI18n';
import './style.css';

// Detect corrupted Firestore IndexedDB cache (projects// = empty project ID)
// and auto-clear + reload once per session
window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event.reason);
  if (
    (msg.includes('Invalid segment') || msg.includes('projects//')) &&
    !sessionStorage.getItem('firestore-cache-cleared')
  ) {
    event.preventDefault();
    sessionStorage.setItem('firestore-cache-cleared', Date.now().toString());
    void (async () => {
      try {
        const databases = await indexedDB.databases();
        for (const dbInfo of databases.filter(d => d.name?.startsWith('firestore'))) {
          if (dbInfo.name) indexedDB.deleteDatabase(dbInfo.name);
        }
      } catch { /* ignore */ }
      window.location.reload();
    })();
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
