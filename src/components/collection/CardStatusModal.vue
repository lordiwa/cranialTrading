<script setup lang="ts">
import { ref } from 'vue';
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
  updateStatus: [status: CardStatus];
}>();

const selectedStatus = ref<CardStatus>('collection');

const handleConfirm = () => {
  emit('updateStatus', selectedStatus.value);
};

const handleClose = () => {
  selectedStatus.value = 'collection';
  emit('close');
};
</script>

<template>
  <BaseModal :show="show" title="¿QUÉ QUIERES HACER CON ESTA CARTA?" @close="handleClose">
    <div v-if="card" class="space-y-6">
      <!-- Card preview -->
      <div class="border border-silver-30 p-4 flex gap-4">
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
      <div class="space-y-3">
        <p class="text-small text-silver-70">Selecciona una opción:</p>

        <button
            @click="selectedStatus = 'collection'"
            :class="[
              'w-full p-4 border-2 transition-fast text-left',
              selectedStatus === 'collection'
                ? 'border-neon bg-neon-5'
                : 'border-silver-30 hover:border-silver'
            ]"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-body font-bold text-silver">SOLO COLECCIÓN</p>
              <p class="text-tiny text-silver-70 mt-1">
                Guardar en mi colección, no comerciar
              </p>
            </div>
            <BaseBadge variant="cambio">GUARDAR</BaseBadge>
          </div>
        </button>

        <button
            @click="selectedStatus = 'sell'"
            :class="[
              'w-full p-4 border-2 transition-fast text-left',
              selectedStatus === 'sell'
                ? 'border-neon bg-neon-5'
                : 'border-silver-30 hover:border-silver'
            ]"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-body font-bold text-silver">VENDER</p>
              <p class="text-tiny text-silver-70 mt-1">
                Crear preferencia automática de VENTA
              </p>
            </div>
            <BaseBadge variant="vendo">VENDO</BaseBadge>
          </div>
        </button>

        <button
            @click="selectedStatus = 'busco'"
            :class="[
              'w-full p-4 border-2 transition-fast text-left',
              selectedStatus === 'busco'
                ? 'border-neon bg-neon-5'
                : 'border-silver-30 hover:border-silver'
            ]"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-body font-bold text-silver">BUSCAR</p>
              <p class="text-tiny text-silver-70 mt-1">
                Agregar a mis preferencias de BUSCO
              </p>
            </div>
            <BaseBadge variant="busco">BUSCO</BaseBadge>
          </div>
        </button>

        <button
            @click="selectedStatus = 'trade'"
            :class="[
              'w-full p-4 border-2 transition-fast text-left',
              selectedStatus === 'trade'
                ? 'border-neon bg-neon-5'
                : 'border-silver-30 hover:border-silver'
            ]"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-body font-bold text-silver">CAMBIAR</p>
              <p class="text-tiny text-silver-70 mt-1">
                Crear preferencia automática de CAMBIO
              </p>
            </div>
            <BaseBadge variant="cambio">CAMBIO</BaseBadge>
          </div>
        </button>
      </div>

      <!-- Actions -->
      <div class="flex gap-3 pt-4 border-t border-silver-20">
        <BaseButton
            variant="secondary"
            class="flex-1"
            @click="handleClose"
        >
          CANCELAR
        </BaseButton>
        <BaseButton
            class="flex-1"
            @click="handleConfirm"
        >
          CONFIRMAR
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>