import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/auth';
import './style.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

// Initialize auth AFTER router is set up
const authStore = useAuthStore();
authStore.initAuth();


app.mount('#app');