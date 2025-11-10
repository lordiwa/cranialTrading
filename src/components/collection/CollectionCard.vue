<script setup lang="ts">
import { ref, computed } from 'vue';
import { Card } from '../../types/card';
import BaseButton from '../ui/BaseButton.vue';
import BaseBadge from '../ui/BaseBadge.vue';

const props = defineProps<{
  card: Card;
}>();

// compute a border class that matches the badge text color
const statusBorderClass = computed(() => {
  const s = props.card.status;
  if (s === 'sell') return 'border-rust';
  if (s === 'trade') return 'border-silver';
  if (s === 'busco') return 'border-neon';
  // default / collection
  return 'border-silver-20';
});

const emit = defineEmits<{
  click: [card: Card];
  edit: [card: Card];
  delete: [cardId: string];
}>();

const showActions = ref(false);

const handleCardClick = () => {
  emit('click', props.card);
};

const handleEdit = (e: Event) => {
  e.stopPropagation();
  emit('edit', props.card);
};

const handleDelete = (e: Event) => {
  e.stopPropagation();
  emit('delete', props.card.id);
};
</script>

<template>
  <div
      :class="['bg-primary p-3 md:p-4 hover:border-neon-40 transition-normal cursor-pointer', 'border', statusBorderClass]"
      @mouseenter="showActions = true"
      @mouseleave="showActions = false"
      @click="handleCardClick"
  >
    <img
        v-if="card.image"
        :src="card.image"
        :alt="card.name"
        class="w-full aspect-[3/4] object-cover mb-2 md:mb-3"
    />

    <div>
      <p class="text-tiny md:text-small font-bold text-silver line-clamp-2">{{ card.name }}</p>
      <p class="text-tiny text-silver-70 mt-1 line-clamp-1">{{ card.edition }}</p>

      <div class="flex items-center gap-2 mt-2 text-tiny md:text-small">
        <span class="font-bold text-neon">x{{ card.quantity }}</span>
        <span class="text-silver-70">|</span>
        <span class="text-silver-70">{{ card.condition }}</span>
        <span v-if="card.foil" class="text-neon">| FOIL</span>
      </div>

      <div class="flex items-center justify-between mt-2">
        <p class="text-small font-bold text-neon">${{ card.price.toFixed(2) }}</p>
        <div>
          <BaseBadge :variant="card.status === 'sell' ? 'vendo' : card.status === 'trade' ? 'cambio' : card.status === 'busco' ? 'busco' : 'solo'">
            {{ card.status === 'sell' ? 'VENDO' : card.status === 'trade' ? 'CAMBIO' : card.status === 'busco' ? 'BUSCO' : 'COLECCIÓN' }}
          </BaseBadge>
        </div>
      </div>
    </div>

    <Transition name="fade">
      <div v-if="showActions" class="flex flex-col md:flex-row gap-2 mt-3" @click.stop>
        <BaseButton
            variant="secondary"
            size="small"
            @click="handleEdit"
            class="flex-1 w-full"
        >
          EDITAR
        </BaseButton>
        <BaseButton
            variant="danger"
            size="small"
            @click="handleDelete"
            class="flex-1 w-full"
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

.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>