<script setup lang="ts">
import { ref } from 'vue';
import { Card } from '../../types/card';
import BaseButton from '../ui/BaseButton.vue';

const props = defineProps<{
  card: Card;
}>();

const emit = defineEmits<{
  edit: [card: Card];
  delete: [cardId: string];
}>();

const showActions = ref(false);
</script>

<template>
  <div
      class="bg-primary border border-silver-20 p-4 hover:border-neon-40 transition-normal"
      @mouseenter="showActions = true"
      @mouseleave="showActions = false"
  >
    <img
        v-if="card.image"
        :src="card.image"
        :alt="card.name"
        class="w-full aspect-[3/4] object-cover mb-3"
    />

    <div>
      <p class="text-small font-bold text-silver">{{ card.name }}</p>
      <p class="text-tiny text-silver-70 mt-1">{{ card.edition }}</p>

      <div class="flex items-center gap-2 mt-2 text-tiny text-silver-70">
        <span>Qty: {{ card.quantity }}</span>
        <span>|</span>
        <span>{{ card.condition }}</span>
        <span v-if="card.foil" class="text-neon">| FOIL</span>
      </div>

      <p class="text-small font-bold text-neon mt-2">${{ card.price.toFixed(2) }}</p>
    </div>

    <Transition name="fade">
      <div v-if="showActions" class="flex gap-2 mt-3">
        <BaseButton
            variant="secondary"
            size="small"
            @click="emit('edit', card)"
            class="flex-1"
        >
          EDITAR
        </BaseButton>
        <BaseButton
            variant="danger"
            size="small"
            @click="emit('delete', card.id)"
            class="flex-1"
        >
          ELIMINAR
        </BaseButton>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 150ms ease-out;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>