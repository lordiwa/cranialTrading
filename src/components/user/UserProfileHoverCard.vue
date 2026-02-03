<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';
import BaseLoader from '../ui/BaseLoader.vue';
import { getAvatarUrlForUser } from '../../utils/avatar';

const props = defineProps<{
  username: string;
  show: boolean;
}>();

const userInfo = ref<{ username: string; location?: string; avatarUrl?: string | null } | null>(null);
const cardCount = ref(0);
const loading = ref(false);

const displayLocation = computed(() => {
  return userInfo.value?.location || 'Ubicación no disponida';
});

const loadUserInfo = async () => {
  if (!props.username || !props.show) return;

  loading.value = true;
  try {
    // Query users collection by username
    const usersCol = collection(db, 'users');
    const q = query(usersCol, where('username', '==', props.username), limit(1));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const userData = snapshot.docs[0].data();
      const userId = snapshot.docs[0].id;
      userInfo.value = userData as any;

      // Count public cards
      const cardsCol = collection(db, 'users', userId, 'cards');
      const cardsQuery = query(cardsCol, where('public', '==', true));
      const cardsSnapshot = await getDocs(cardsQuery);
      cardCount.value = cardsSnapshot.size;
    }
  } catch (error) {
    // silent fail
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadUserInfo();
});
</script>

<template>
  <Teleport v-if="show" to="body">
    <div class="fixed z-40 bg-primary border-2 border-neon p-4 shadow-glow-strong w-64 pointer-events-none">
      <BaseLoader v-if="loading" size="small" />

      <div v-else-if="userInfo" class="space-y-3">
        <!-- Username with Avatar -->
        <div class="flex items-center gap-3">
          <img
              :src="getAvatarUrlForUser(userInfo.username, 40, userInfo.avatarUrl)"
              alt=""
              class="w-10 h-10 rounded-full"
          />
          <div>
            <p class="text-tiny text-silver-70">Usuario</p>
            <p class="text-body font-bold text-neon">@{{ userInfo.username }}</p>
          </div>
        </div>

        <!-- Location -->
        <div>
          <p class="text-tiny text-silver-70">📍 Ubicación</p>
          <p class="text-small text-silver">{{ displayLocation }}</p>
        </div>

        <!-- Card count -->
        <div class="pt-2 border-t border-silver-30">
          <p class="text-tiny text-silver-70">Cartas públicas</p>
          <p class="text-h5 font-bold text-neon">{{ cardCount }}</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.shadow-glow-strong {
  box-shadow: 0 0 12px rgba(204, 255, 0, 0.15);
}
</style>