import { createRouter, createWebHistory } from 'vue-router';
import Home from '../views/Home.vue';
import AddCard from '../components/AddCard.vue';
import CardSearch from '../components/CardSearch.vue';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home,
  },
  {
    path: '/add-card',
    name: 'AddCard',
    component: AddCard,
  },
  {
    path: '/search-cards',
    name: 'CardSearch',
    component: CardSearch,
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;