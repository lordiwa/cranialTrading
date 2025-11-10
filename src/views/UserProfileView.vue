<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppContainer from '../components/layout/AppContainer.vue';
import BaseLoader from '../components/ui/BaseLoader.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import CollectionGrid from '../components/collection/CollectionGrid.vue';
import ChatModal from '../components/chat/ChatModal.vue';
import { doc, getDoc, collection, getDocs, query, where, limit, startAfter } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToastStore } from '../stores/toast';

const route = useRoute();
const toastStore = useToastStore();

const userId = ref<string | null>(route.params.userId as string || null);
const userInfo = ref<{ username?: string; location?: string } | null>(null);
const cards = ref<any[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const pageSize = 24;
const lastDoc = ref<any | null>(null);
const hasMore = ref(true);
const showChat = ref(false);
const selectedUserId = ref('');
const selectedUsername = ref('');

watch(() => route.params.userId, (v) => {
  userId.value = v as string;
  loadProfile();
});

const loadProfile = async () => {
  if (!userId.value) return;
  // reset pagination
  cards.value = [];
  lastDoc.value = null;
  hasMore.value = true;
  await loadNextPage();
};

const loadNextPage = async () => {
  if (!userId.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const cardsCol = collection(db, 'users', userId.value, 'cards');
    let q = query(cardsCol, where('public', '==', true), limit(pageSize));
    if (lastDoc.value) {
      q = query(cardsCol, where('public', '==', true), startAfter(lastDoc.value), limit(pageSize));
    }

    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    cards.value.push(...docs);

    if (snapshot.docs.length > 0) {
      lastDoc.value = snapshot.docs[snapshot.docs.length - 1];
    }

    hasMore.value = snapshot.docs.length === pageSize;
  } catch (err) {
    toastStore.show('Error al cargar cartas del perfil', 'error');
  } finally {
    loadingMore.value = false;
  }
};

const loadBasicUser = async () => {
  if (!userId.value) return;
  loading.value = true;
  try {
    const userDoc = await getDoc(doc(db, 'users', userId.value));
    if (userDoc.exists()) {
      userInfo.value = userDoc.data() as any;
    } else {
      userInfo.value = { username: 'Usuario', location: '' };
    }
  } catch (err) {
    toastStore.show('Error al cargar perfil', 'error');
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  await loadBasicUser();
  await loadProfile();
});

const handleContact = (id: string, username: string) => {
  selectedUserId.value = id;
  selectedUsername.value = username;
  showChat.value = true;
};

const handleCloseChat = () => {
  showChat.value = false;
};
</script>

<template>
  <AppContainer>
    <div>
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-h2 font-bold text-silver">Perfil público</h1>
          <p class="text-small text-silver-70 mt-1">{{ userInfo?.username }}</p>
          <p class="text-tiny text-silver-50">{{ userInfo?.location }}</p>
        </div>
        <div>
          <BaseButton size="small" @click="handleContact(userId, userInfo?.username || '')">Contactar</BaseButton>
        </div>
      </div>

      <BaseLoader v-if="loading" size="large" />

      <div v-else>
        <h2 class="text-h5 text-silver font-bold mb-3">Colección pública</h2>
        <p class="text-small text-silver-70 mb-4">{{ cards.length }} cartas</p>

        <CollectionGrid :cards="cards" />

        <div class="mt-4 text-center" v-if="hasMore">
          <BaseButton :disabled="loadingMore" @click="loadNextPage">
            {{ loadingMore ? 'CARGANDO...' : 'CARGAR MÁS' }}
          </BaseButton>
        </div>

        <div v-if="!loading && cards.length === 0" class="border border-silver-30 p-6 text-center mt-4">
          <p class="text-small text-silver-70">Este usuario no tiene cartas públicas en su colección.</p>
        </div>
      </div>

      <ChatModal
        :show="showChat"
        :other-user-id="selectedUserId"
        :other-username="selectedUsername"
        @close="handleCloseChat"
      />
    </div>
  </AppContainer>
</template>
