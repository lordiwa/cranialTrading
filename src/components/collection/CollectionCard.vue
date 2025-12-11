<script setup lang="ts">
import { ref, computed } from 'vue';
import { Card } from '../../types/card';
import BaseButton from '../ui/BaseButton.vue';
import BaseBadge from '../ui/BaseBadge.vue';

const props = defineProps<{
  card: Card;
}>();

// ✅ CORREGIDO: Usar 'sale' en lugar de 'sell', 'trade' en lugar de 'trade', 'wishlist' en lugar de 'busco'
const statusBorderClass = computed(() => {
  const s = props.card.status;
  if (s === 'sale') return 'border-rust';      // Rojo óxido para VENTA
  if (s === 'trade') return 'border-silver';   // Plata para CAMBIO
  if (s === 'wishlist') return 'border-neon';  // Neon lime para BUSCO
  // default / collection - gris claro
  return 'border-silver-20';
});

const emit = defineEmits<{
  click: [card: Card];
  edit: [card: Card];
  delete: [cardId: string];
}>();

const showActions = ref(false);

// ✅ AGREGADO: Handler para click en la card
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

// icon classes for public flag
const publicIconClass = computed(() => {
  return props.card.public ? 'text-neon' : 'text-silver-50 opacity-60 line-through';
});
</script>

<template>
  <!-- ✅ AGREGADO: @click="handleCardClick" en el contenedor principal + :class dinámico para border -->
  <div
      @click="handleCardClick"
      :class="[
        'relative bg-primary p-md md:p-lg hover:border-neon-40 transition-normal cursor-pointer',
        'border-2',  // ✅ AGREGADO: border-2 para visibilidad
        statusBorderClass
      ]"
  >
    <img
        v-if="card.image"
        :src="card.image"
        :alt="card.name"
        class="w-full aspect-[3/4] object-cover mb-sm md:mb-md"
    />

    <div>
      <p class="text-tiny md:text-small font-bold text-silver line-clamp-2">{{ card.name }}</p>
      <p class="text-tiny text-silver-70 mt-xs line-clamp-1">{{ card.edition }}</p>

      <div class="flex items-center gap-sm mt-sm text-tiny md:text-small">
        <span class="font-bold text-neon">x{{ card.quantity }}</span>
        <span class="text-silver-70">|</span>
        <span class="text-silver-70">{{ card.condition }}</span>
      </div>

      <div class="flex items-center justify-between mt-sm">
        <p class="text-small font-bold text-neon">${{ card.price.toFixed(2) }}</p>
      </div>
    </div>
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