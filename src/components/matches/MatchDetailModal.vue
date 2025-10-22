<script setup lang="ts">
import { ref, computed } from 'vue';
import { SimpleMatch } from '../../stores/matches';
import { useSavedMatchesStore } from '../../stores/savedMatches';
import BaseModal from '../ui/BaseModal.vue';
import BaseButton from '../ui/BaseButton.vue';
import ChatModal from '../chat/ChatModal.vue';

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

const isMatchSaved = computed(() => {
  return props.match ? savedMatchesStore.isMatchSaved(props.match.id) : false;
});

const handleSaveMatch = async () => {
  if (!props.match) return;

  isSaving.value = true;
  const success = await savedMatchesStore.saveMatch(props.match);
  isSaving.value = false;

  if (success) {
    // Opcional: cerrar el modal después de guardar
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
</script>

<template>
  <BaseModal :show="show" @close="emit('close')">
    <div v-if="match" class="w-full max-w-md">
      <h2 class="text-h2 font-bold text-silver mb-6">DETALLES DEL MATCH</h2>

      <div class="space-y-6">
        <!-- Usuario -->
        <div>
          <p class="text-small font-bold text-silver-70 mb-2">USUARIO</p>
          <p class="text-body text-silver">{{ match.otherUsername }}</p>
          <p v-if="match.otherLocation" class="text-small text-silver-50 mt-1">
            📍 {{ match.otherLocation }}
          </p>
        </div>

        <!-- Si es VENDO (otro user quiere mis cartas) -->
        <div v-if="match.type === 'VENDO'">
          <p class="text-small font-bold text-silver-70 mb-2">TÚ TIENES</p>
          <div v-if="match.myCard" class="bg-primary-dark p-4 rounded border border-neon">
            <p class="text-body font-bold text-neon">{{ match.myCard.name }}</p>
            <p class="text-small text-silver-70 mt-1">{{ match.myCard.edition }}</p>
            <div class="flex gap-4 mt-3 text-tiny text-silver-50">
              <span>Cant: {{ match.myCard.quantity }}</span>
              <span>Cond: {{ match.myCard.condition }}</span>
            </div>
            <p v-if="match.myCard.price" class="text-small text-neon mt-2">
              $ {{ match.myCard.price }}
            </p>
          </div>

          <p class="text-small font-bold text-silver-70 mt-4 mb-2">QUIERE</p>
          <div v-if="match.otherPreference" class="bg-primary-dark p-4 rounded border border-silver-30">
            <p class="text-body font-bold text-silver">{{ match.otherPreference.name }}</p>
            <p class="text-small text-silver-70 mt-1">{{ match.otherPreference.edition }}</p>
            <div class="flex gap-4 mt-3 text-tiny text-silver-50">
              <span>Cant: {{ match.otherPreference.quantity }}</span>
              <span>Cond: {{ match.otherPreference.condition }}</span>
            </div>
          </div>
        </div>

        <!-- Si es BUSCO (otro user tiene mis preferencias) -->
        <div v-else>
          <p class="text-small font-bold text-silver-70 mb-2">TÚ BUSCAS</p>
          <div v-if="match.myPreference" class="bg-primary-dark p-4 rounded border border-silver-30">
            <p class="text-body font-bold text-silver">{{ match.myPreference.name }}</p>
            <p class="text-small text-silver-70 mt-1">{{ match.myPreference.edition }}</p>
            <div class="flex gap-4 mt-3 text-tiny text-silver-50">
              <span>Cant: {{ match.myPreference.quantity }}</span>
              <span>Cond: {{ match.myPreference.condition }}</span>
            </div>
          </div>

          <p class="text-small font-bold text-silver-70 mt-4 mb-2">TIENE</p>
          <div v-if="match.otherCard" class="bg-primary-dark p-4 rounded border border-neon">
            <p class="text-body font-bold text-neon">{{ match.otherCard.name }}</p>
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
