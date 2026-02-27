<script setup lang="ts">
import { computed } from 'vue';
import { type Card } from '../../types/card';

const props = defineProps<{
  card: Card;
}>();

const emit = defineEmits<{
  click: [card: Card];
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

// ✅ AGREGADO: Handler para click en la card
const handleCardClick = () => {
  emit('click', props.card);
};
</script>

<template>
  <div
      @click="handleCardClick"
      :class="[
        'relative bg-primary p-md md:p-lg hover:border-neon-40 transition-normal cursor-pointer',
        'border-2', // ✅ AGREGADO: border-2 para visibilidad
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