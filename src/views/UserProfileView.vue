<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { collection, getDocs, query, where, limit, startAfter } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToastStore } from '../stores/toast';
import { useAuthStore } from '../stores/auth';
import AppContainer from '../components/layout/AppContainer.vue';
import BaseLoader from '../components/ui/BaseLoader.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import CollectionGrid from '../components/collection/CollectionGrid.vue';
import ChatModal from '../components/chat/ChatModal.vue';

const route = useRoute();
const toastStore = useToastStore();
const authStore = useAuthStore();

// State refs
const username = ref<string>(route.params.username as string || '');
const userId = ref<string | null>(null);
const userInfo = ref<{ username?: string; location?: string } | null>(null);
const cards = ref<any[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const userNotFound = ref(false);
const pageSize = 24;
const lastDoc = ref<any | null>(null);
const hasMore = ref(true);
const showChat = ref(false);
const selectedUserId = ref('');
const selectedUsername = ref('');

// Computed properties
const isOwnProfile = computed(() => {
  return authStore.user?.id === userId.value;
});

// Watchers
watch(() => route.params.username, (v) => {
  username.value = v as string;
  loadProfile();
});

// Methods
const loadProfile = async () => {
  if (!username.value) return;

  loading.value = true;
  userNotFound.value = false;

  try {
    // Check if viewing own profile - use auth user directly to avoid duplicate username issues
    if (authStore.user && authStore.user.username === username.value) {
      userId.value = authStore.user.id;
      userInfo.value = {
        username: authStore.user.username,
        location: authStore.user.location,
      };
    } else {
      // Query users collection to find userId by username
      const usersCol = collection(db, 'users');
      const q = query(usersCol, where('username', '==', username.value), limit(1));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        userNotFound.value = true;
        loading.value = false;
        return;
      }

      const userData = snapshot.docs[0].data();
      userId.value = snapshot.docs[0].id;
      userInfo.value = userData as any;
    }

    // Reset pagination
    cards.value = [];
    lastDoc.value = null;
    hasMore.value = true;

    // Load first page of public cards
    await loadNextPage();
  } catch (err) {
    console.error('Error loading profile:', err);
    toastStore.show('Error al cargar perfil', 'error');
    userNotFound.value = true;
  } finally {
    loading.value = false;
  }
};

const loadNextPage = async () => {
  if (!userId.value || !hasMore.value) return;

  loadingMore.value = true;
  try {
    const cardsCol = collection(db, 'users', userId.value, 'cards');
    let q = query(cardsCol, limit(pageSize * 2));

    if (lastDoc.value) {
      q = query(cardsCol, startAfter(lastDoc.value), limit(pageSize * 2));
    }

    const snapshot = await getDocs(q);

    // Filter: show cards where public is explicitly true
    const publicCards = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter((card: any) => card.public === true);

    cards.value.push(...publicCards);

    if (snapshot.docs.length > 0) {
      lastDoc.value = snapshot.docs[snapshot.docs.length - 1];
    }

    // Has more if we got a full batch
    hasMore.value = snapshot.docs.length === pageSize * 2;
  } catch (err) {
    console.error('Error loading cards:', err);
    toastStore.show('Error al cargar cartas del perfil', 'error');
  } finally {
    loadingMore.value = false;
  }
};

const handleContact = (id: string, username: string) => {
  selectedUserId.value = id;
  selectedUsername.value = username;
  showChat.value = true;
};

const handleCloseChat = () => {
  showChat.value = false;
};

// Initialize on mount
onMounted(() => {
  loadProfile();
});
</script>

<template>
  <AppContainer>
    <!-- User not found state -->
    <div v-if="userNotFound" class="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <h2 class="text-h2 font-bold text-rust mb-4">404 - Usuario no encontrado</h2>
      <p class="text-body text-silver-70 mb-8 max-w-md">
        @{{ username }} no existe o su perfil es privado.
      </p>
      <RouterLink to="/dashboard">
        <BaseButton>VOLVER AL DASHBOARD</BaseButton>
      </RouterLink>
    </div>

    <!-- Profile content -->
    <div v-else>
      <!-- Profile header -->
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8 pb-8 border-b border-silver-20">
        <div>
          <h1 class="text-h2 md:text-h1 font-bold text-silver mb-2">
            @{{ userInfo?.username }}
          </h1>
          <p class="text-body text-silver-70 flex items-center gap-2">
            📍 {{ userInfo?.location || 'Ubicación no disponida' }}
          </p>
        </div>

        <!-- Contact button (only if not own profile) -->
        <div v-if="!isOwnProfile" class="flex gap-3">
          <BaseButton
              size="small"
              @click="handleContact(userId!, userInfo?.username || '')"
          >
            💬 CONTACTAR
          </BaseButton>
        </div>
      </div>

      <!-- Loading state -->
      <BaseLoader v-if="loading" size="large" />

      <!-- Empty state -->
      <div v-else-if="cards.length === 0" class="border border-silver-30 p-8 text-center">
        <p class="text-body text-silver-70">
          Este usuario no tiene cartas públicas en su colección.
        </p>
      </div>

      <!-- Public collection -->
      <div v-else>
        <h2 class="text-h3 font-bold text-silver mb-6">
          Colección pública
          <span class="text-small text-silver-70 font-normal ml-2">({{ cards.length }} cartas)</span>
        </h2>

        <div class="space-y-8">
          <CollectionGrid :cards="cards" :readonly="true" />

          <!-- Load more button -->
          <div v-if="hasMore" class="text-center">
            <BaseButton :disabled="loadingMore" @click="loadNextPage">
              {{ loadingMore ? 'CARGANDO...' : 'CARGAR MÁS' }}
            </BaseButton>
          </div>
        </div>
      </div>

      <!-- Chat Modal -->
      <ChatModal
          :show="showChat"
          :other-user-id="selectedUserId"
          :other-username="selectedUsername"
          @close="handleCloseChat"
      />
    </div>
  </AppContainer>
</template>