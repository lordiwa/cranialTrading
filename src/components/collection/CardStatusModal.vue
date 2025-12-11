<script setup lang="ts">
import { ref, watch } from 'vue';
import BaseModal from '../ui/BaseModal.vue';
import BaseButton from '../ui/BaseButton.vue';
import BaseBadge from '../ui/BaseBadge.vue';
import { Card, CardStatus } from '../../types/card';

const props = defineProps<{
  show: boolean;
  card: Card | null;
}>();

const emit = defineEmits<{
  close: [];
  updateStatus: [status: CardStatus, isPublic: boolean];
  delete: [cardId: string];
}>();

const selectedStatus = ref<CardStatus>('collection');
const isPublic = ref(false);

watch(
    () => props.card,
    (c) => {
      if (c) {
        selectedStatus.value = (c.status as CardStatus) || 'collection';
        isPublic.value = !!c.public;
      }
    },
    { immediate: true }
);

const handleConfirm = () => {
  emit('updateStatus', selectedStatus.value, isPublic.value);
};

const handleDelete = () => {
  if (!props.card) {
    console.error('❌ No card found in props');
    return;
  }

  console.log('🗑️ DELETE CLICKED for card:', props.card.name, 'ID:', props.card.id);

  const confirmed = confirm(`Delete "${props.card.name}"?`);
  if (confirmed) {
    console.log('✅ Confirmed delete. Emitting delete event with ID:', props.card.id);
    emit('delete', props.card.id);
  } else {
    console.log('❌ User cancelled delete');
  }
};

const handleClose = () => {
  selectedStatus.value = 'collection';
  isPublic.value = false;
  emit('close');
};
</script>

<template>
  <BaseModal :show="show" title="WHAT DO YOU WANT TO DO WITH THIS CARD?" @close="handleClose">
    <div v-if="card" class="space-y-lg">
      <!-- Card preview -->
      <div class="border border-silver-30 p-md flex gap-4">
        <img
            v-if="card.image"
            :src="card.image"
            :alt="card.name"
            class="w-20 h-28 object-cover"
        />
        <div class="flex-1">
          <p class="text-body font-bold text-silver">{{ card.name }}</p>
          <p class="text-small text-silver-70 mt-1">{{ card.edition }}</p>
          <div class="flex items-center gap-2 mt-2">
            <span class="text-small font-bold text-neon">x{{ card.quantity }}</span>
            <span class="text-tiny text-silver-70">|</span>
            <span class="text-tiny text-silver-70">{{ card.condition }}</span>
          </div>
        </div>
      </div>

      <!-- Status options -->
      <div class="space-y-sm">
        <p class="text-small text-silver-70">Select an option:</p>

        <button
            @click="selectedStatus = 'collection'"
            :class="[
              'w-full p-md border-2 transition-fast text-left',
              selectedStatus === 'collection'
                ? 'border-neon bg-neon-5'
                : 'border-silver-30 hover:border-silver'
            ]"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-body font-bold text-silver">COLLECTION ONLY</p>
              <p class="text-tiny text-silver-70 mt-1">
                Keep in collection, do not trade
              </p>
            </div>
            <BaseBadge variant="cambio">KEEP</BaseBadge>
          </div>
        </button>

        <button
            @click="selectedStatus = 'sale'"
            :class="[
              'w-full p-md border-2 transition-fast text-left',
              selectedStatus === 'sale'
                ? 'border-neon bg-neon-5'
                : 'border-silver-30 hover:border-silver'
            ]"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-body font-bold text-silver">SELL</p>
              <p class="text-tiny text-silver-70 mt-1">
                Create automatic SALE preference
              </p>
            </div>
            <BaseBadge variant="vendo">SALE</BaseBadge>
          </div>
        </button>

        <button
            @click="selectedStatus = 'trade'"
            :class="[
              'w-full p-md border-2 transition-fast text-left',
              selectedStatus === 'trade'
                ? 'border-neon bg-neon-5'
                : 'border-silver-30 hover:border-silver'
            ]"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-body font-bold text-silver">TRADE</p>
              <p class="text-tiny text-silver-70 mt-1">
                Create automatic TRADE preference
              </p>
            </div>
            <BaseBadge variant="cambio">TRADE</BaseBadge>
          </div>
        </button>

        <button
            @click="selectedStatus = 'wishlist'"
            :class="[
              'w-full p-md border-2 transition-fast text-left',
              selectedStatus === 'wishlist'
                ? 'border-neon bg-neon-5'
                : 'border-silver-30 hover:border-silver'
            ]"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-body font-bold text-silver">SEARCH</p>
              <p class="text-tiny text-silver-70 mt-1">
                Add to my SEARCH preferences
              </p>
            </div>
            <BaseBadge variant="busco">SEARCH</BaseBadge>
          </div>
        </button>
      </div>

      <!-- Public toggle -->
      <div class="pt-2">
        <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
          <input v-model="isPublic" type="checkbox" class="w-4 h-4" />
          <span>Visible on my public profile</span>
        </label>
      </div>

      <!-- Actions -->
      <div class="flex flex-col gap-3 pt-4 border-t border-silver-20">
        <div class="flex gap-3">
          <BaseButton
              variant="secondary"
              class="flex-1"
              @click="handleClose"
          >
            CANCEL
          </BaseButton>
          <BaseButton
              class="flex-1"
              @click="handleConfirm"
          >
            CONFIRM
          </BaseButton>
        </div>

        <!-- DELETE BUTTON - RED -->
        <BaseButton
            variant="danger"
            class="w-full"
            @click="handleDelete"
        >
          🗑️ DELETE CARD
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>