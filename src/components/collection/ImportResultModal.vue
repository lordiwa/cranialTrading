<script setup lang="ts">
import BaseModal from '../ui/BaseModal.vue';
import BaseButton from '../ui/BaseButton.vue';

const props = defineProps<{
  show: boolean;
  success: number;
  failed: number;
  total: number;
  errors: string[];
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const successRate = Math.round((props.success / props.total) * 100);
</script>

<template>
  <BaseModal :show="show" title="RESULTADOS DE IMPORTACIÓN" @close="emit('cancel')">
    <div class="space-y-md">
      <!-- Resumen -->
      <div class="border border-silver-30 p-md">
        <div class="grid grid-cols-3 gap-4 text-center">
          <div>
            <p class="text-tiny text-silver-70">TOTAL</p>
            <p class="text-h2 font-bold text-silver mt-1">{{ total }}</p>
          </div>
          <div>
            <p class="text-tiny text-silver-70">EXITOSAS</p>
            <p class="text-h2 font-bold text-neon mt-1">{{ success }}</p>
          </div>
          <div>
            <p class="text-tiny text-silver-70">FALLIDAS</p>
            <p class="text-h2 font-bold text-rust mt-1">{{ failed }}</p>
          </div>
        </div>

        <div class="mt-4 pt-4 border-t border-silver-20">
          <p class="text-small text-silver-70 text-center">
            Tasa de éxito: <span :class="successRate >= 85 ? 'text-neon' : 'text-rust'">{{ successRate }}%</span>
          </p>
        </div>
      </div>

      <!-- Cartas no encontradas -->
      <div v-if="errors.length > 0">
        <p class="text-small font-bold text-silver-70 mb-2">CARTAS NO ENCONTRADAS</p>
        <div class="border border-rust p-md max-h-48 overflow-y-auto bg-primary-dark">
          <ul class="space-y-1">
            <li v-for="(error, index) in errors" :key="index" class="text-tiny text-rust">
              • {{ error }}
            </li>
          </ul>
        </div>
      </div>

      <!-- Mensaje -->
      <div class="border border-silver-30 p-md bg-primary-dark">
        <p class="text-small text-silver">
          ¿Deseas agregar las <span class="text-neon font-bold">{{ success }} cartas correctas</span> a tu colección?
        </p>
        <p class="text-tiny text-silver-50 mt-2">
          Las cartas no encontradas no se agregarán. Puedes intentar importarlas manualmente después.
        </p>
      </div>

      <!-- Botones -->
      <div class="flex gap-3">
        <BaseButton
            variant="secondary"
            class="flex-1"
            @click="emit('cancel')"
        >
          CANCELAR
        </BaseButton>
        <BaseButton
            class="flex-1"
            @click="emit('confirm')"
        >
          AGREGAR {{ success }} CARTAS
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(139, 46, 31, 0.5);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 46, 31, 0.7);
}
</style>