<script setup lang="ts">
import { Card } from '../../types/card';
import CollectionCard from './CollectionCard.vue';

defineProps<{
  cards: Card[];
}>();

const emit = defineEmits<{
  click: [card: Card];
  edit: [card: Card];
  delete: [cardId: string];
}>();
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
    <CollectionCard
        v-for="card in cards"
        :key="card.id"
        :card="card"
        @click="emit('click', $event)"
        @edit="emit('edit', $event)"
        @delete="emit('delete', $event)"
    />
  </div>
</template>