import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import { initI18n } from './composables/useI18n';
import './style.css';

(async () => {
  const app = createApp(App);
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
