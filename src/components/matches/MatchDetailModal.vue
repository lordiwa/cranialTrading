<script setup lang="ts">
import { ref, computed } from 'vue';
import { SimpleMatch } from '../../stores/matches';
import { useSavedMatchesStore } from '../../stores/savedMatches';
import BaseModal from '../ui/BaseModal.vue';
import BaseButton from '../ui/BaseButton.vue';
import ChatModal from '../chat/ChatModal.vue';
import BaseBadge from '../ui/BaseBadge.vue';
import UserProfileHoverCard from '../user/UserProfileHoverCard.vue';

const props = defineProps<{
  show: boolean;
  match: SimpleMatch | null;
}>();

const emit = defineEmits<{
  close: [];
  contact: [];
}>();

const savedMatchesStore = useSavedMatchesStore();
const isSaving = ref(false);
const showChat = ref(false);
const showHoverCard = ref(false);

const isMatchSaved = computed(() => {
  return props.match ? savedMatchesStore.isMatchSaved(props.match.id) : false;
});

const handleSaveMatch = async () => {
  if (!props.match) return;

  isSaving.value = true;
  const success = await savedMatchesStore.saveMatch(props.match);
  isSaving.value = false;

  if (success) {
    setTimeout(() => {
      emit('close');
    }, 500);
  }
};

const handleContact = () => {
  showChat.value = true;
};

const handleCloseChat = () => {
  showChat.value = false;
};

// Helper: derive badge variant and border class from preference or card
const getVisualFor = (obj: any) => {
  // obj may be a card (with status) or a preference (with type)
  if (!obj) return { badge: 'solo', border: 'border-silver-30', label: 'COLECCIÓN' };

  if (obj.type) {
    const t = String(obj.type).toUpperCase();
    if (t === 'VENDO') return { badge: 'vendo', border: 'border-rust', label: 'VENDO' };
    if (t === 'CAMBIO') return { badge: 'cambio', border: 'border-silver', label: 'CAMBIO' };
    if (t === 'BUSCO') return { badge: 'busco', border: 'border-neon', label: 'BUSCO' };
  }

  if (obj.status) {
    const s = String(obj.status).toLowerCase();
    if (s === 'sell') return { badge: 'vendo', border: 'border-rust', label: 'VENDO' };
    if (s === 'trade') return { badge: 'cambio', border: 'border-silver', label: 'CAMBIO' };
    if (s === 'busco') return { badge: 'busco', border: 'border-neon', label: 'BUSCO' };
    if (s === 'collection') return { badge: 'solo', border: 'border-silver-20', label: 'COLECCIÓN' };
  }

  return { badge: 'solo', border: 'border-silver-30', label: 'COLECCIÓN' };
};
</script>

<template>
  <BaseModal :show="show" @close="emit('close')">
    <div v-if="match" class="w-full max-w-md">
      <h2 class="text-h2 font-bold text-silver mb-6">DETALLES DEL MATCH</h2>

      <div class="space-y-lg">
        <!-- Usuario con hover preview -->
        <div
            @mouseenter="showHoverCard = true"
            @mouseleave="showHoverCard = false"
            class="relative"
        >
          <p class="text-small font-bold text-silver-70 mb-2">USUARIO</p>
          <RouterLink
              :to="{ name: 'userProfile', params: { username: match.otherUsername } }"
              class="text-body text-neon hover:text-silver-70 transition-fast font-bold"
          >
            @{{ match.otherUsername }}
          </RouterLink>
          <p v-if="match.otherLocation" class="text-small text-silver-50 mt-1">
            📍 {{ match.otherLocation }}
          </p>

          <!-- Hover preview card -->
          <UserProfileHoverCard
              :username="match.otherUsername"
              :show="showHoverCard"
          />
        </div>

        <!-- Si es VENDO (otro user quiere mis cartas) -->
        <div v-if="match.type === 'VENDO'">
          <p class="text-small font-bold text-silver-70 mb-2">TÚ TIENES</p>
          <div v-if="match.myCard" :class="['bg-primary-dark p-md rounded', getVisualFor(match.myCard).border]">
            <div class="flex gap-4">
              <img v-if="match.myCard.image" :src="match.myCard.image" class="w-20 h-24 object-cover rounded" />
              <div class="flex-1">
                <div class="flex items-center justify-between">
                  <p
                      class="text-body font-bold"
                      :class="getVisualFor(match.myCard).badge === 'busco'
                        ? 'text-neon'
                        : getVisualFor(match.myCard).badge === 'vendo'
                          ? 'text-rust'
                          : 'text-silver'"
                  >
                    {{ match.myCard.name }}
                  </p>
                  <BaseBadge :variant="getVisualFor(match.myCard).badge">
                    {{ getVisualFor(match.myCard).label }}
                  </BaseBadge>
                </div>
                <p class="text-small text-silver-70 mt-1">{{ match.myCard.edition }}</p>
                <div class="flex gap-4 mt-3 text-tiny text-silver-50">
                  <span>Cant: {{ match.myCard.quantity }}</span>
                  <span>Cond: {{ match.myCard.condition }}</span>
                </div>
                <p v-if="match.myCard.price" class="text-small text-neon mt-2">
                  $ {{ match.myCard.price }}
                </p>
              </div>
            </div>
          </div>

          <p class="text-small font-bold text-silver-70 mt-4 mb-2">QUIERE</p>
          <div v-if="match.otherPreference" :class="['bg-primary-dark p-md rounded', getVisualFor(match.otherPreference).border]">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-body font-bold text-silver">{{ match.otherPreference.name }}</p>
                <p class="text-small text-silver-70 mt-1">{{ match.otherPreference.edition }}</p>
                <div class="flex gap-4 mt-3 text-tiny text-silver-50">
                  <span>Cant: {{ match.otherPreference.quantity }}</span>
                  <span>Cond: {{ match.otherPreference.condition }}</span>
                </div>
              </div>
              <BaseBadge :variant="getVisualFor(match.otherPreference).badge">
                {{ getVisualFor(match.otherPreference).label }}
              </BaseBadge>
            </div>
          </div>
        </div>

        <!-- Si es BUSCO (otro user tiene mis preferencias) -->
        <div v-else>
          <p class="text-small font-bold text-silver-70 mb-2">TÚ BUSCAS</p>
          <div v-if="match.myPreference" class="bg-primary-dark p-md rounded border border-silver-30">
            <p class="text-body font-bold text-silver">{{ match.myPreference.name }}</p>
            <p class="text-small text-silver-70 mt-1">{{ match.myPreference.edition }}</p>
            <div class="flex gap-4 mt-3 text-tiny text-silver-50">
              <span>Cant: {{ match.myPreference.quantity }}</span>
              <span>Cond: {{ match.myPreference.condition }}</span>
            </div>
          </div>

          <p class="text-small font-bold text-silver-70 mt-4 mb-2">TIENE</p>
          <div v-if="match.otherCard" :class="['bg-primary-dark p-md rounded', getVisualFor(match.otherCard).border]">
            <div class="flex gap-4">
              <img v-if="match.otherCard.image" :src="match.otherCard.image" class="w-20 h-24 object-cover rounded" />
              <div class="flex-1">
                <div class="flex items-center justify-between">
                  <p class="text-body font-bold text-neon">{{ match.otherCard.name }}</p>
                  <BaseBadge :variant="getVisualFor(match.otherCard).badge">
                    {{ getVisualFor(match.otherCard).label }}
                  </BaseBadge>
                </div>
                <p class="text-small text-silver-70 mt-1">{{ match.otherCard.edition }}</p>
                <div class="flex gap-4 mt-3 text-tiny text-silver-50">
                  <span>Cant: {{ match.otherCard.quantity }}</span>
                  <span>Cond: {{ match.otherCard.condition }}</span>
                </div>
                <p v-if="match.otherCard.price" class="text-small text-neon mt-2">
                  $ {{ match.otherCard.price }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Botones de acción -->
        <div class="flex gap-3 mt-6 pt-4 border-t border-silver-30">
          <BaseButton
              variant="secondary"
              class="flex-1"
              @click="emit('close')"
          >
            CERRAR
          </BaseButton>
          <BaseButton
              v-if="!isMatchSaved"
              class="flex-1"
              :disabled="isSaving"
              @click="handleSaveMatch"
          >
            {{ isSaving ? 'GUARDANDO...' : 'ME INTERESA' }}
          </BaseButton>
          <BaseButton
              v-else
              class="flex-1"
              @click="handleContact"
          >
            CONTACTAR
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- Chat Modal -->
    <ChatModal
        :show="showChat"
        :other-user-id="match?.otherUserId || ''"
        :other-username="match?.otherUsername || ''"
        @close="handleCloseChat"
    />
  </BaseModal>
</template>