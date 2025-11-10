<script setup lang="ts">
import { ref, watch } from 'vue';
import { Card, CardCondition } from '../../types/card';
import BaseModal from '../ui/BaseModal.vue';
import BaseInput from '../ui/BaseInput.vue';
import BaseSelect from '../ui/BaseSelect.vue';
import BaseButton from '../ui/BaseButton.vue';

const props = defineProps<{
  show: boolean;
  card: Card | null;
}>();

const emit = defineEmits<{
  close: [];
  save: [updates: Partial<Card>];
}>();

const form = ref({
  quantity: 1,
  condition: 'NM' as CardCondition,
  foil: false,
  price: 0,
  public: false,
});

const conditions: CardCondition[] = ['NM', 'LP', 'MP', 'HP'];

watch(() => props.card, (newCard) => {
  if (newCard) {
    form.value = {
      quantity: newCard.quantity,
      condition: newCard.condition,
      foil: newCard.foil,
      price: newCard.price,
      public: newCard.public || false,
    };
  }
}, { deep: true });

const handleSave = () => {
  emit('save', form.value);
};
</script>

<template>
  <BaseModal :show="show" @close="emit('close')">
    <div class="w-full max-w-md">
      <h2 class="text-h2 font-bold text-silver mb-6">EDITAR CARTA</h2>

      <div v-if="card" class="space-y-4">
        <div>
          <p class="text-small font-bold text-silver-70 mb-2">{{ card.name }}</p>
          <p class="text-tiny text-silver-50">{{ card.edition }}</p>
        </div>

        <div>
          <label class="text-small font-bold text-silver mb-2 block">Cantidad</label>
          <BaseInput
              v-model.number="form.quantity"
              type="number"
              min="1"
              placeholder="Cantidad"
          />
        </div>

        <div>
          <label class="text-small font-bold text-silver mb-2 block">Condición</label>
          <BaseSelect
              v-model="form.condition"
              :options="conditions.map(c => ({ value: c, label: c }))"
          />
        </div>

        <div>
          <label class="text-small font-bold text-silver mb-2 block">Precio</label>
          <BaseInput
              v-model.number="form.price"
              type="number"
              step="0.01"
              min="0"
              placeholder="Precio"
          />
        </div>

        <div class="flex items-center gap-3">
          <input
              v-model="form.foil"
              type="checkbox"
              id="foil"
              class="w-4 h-4"
          />
          <label for="foil" class="text-small text-silver">FOIL</label>
        </div>

        <div class="flex items-center gap-3">
          <input
              v-model="form.public"
              type="checkbox"
              id="public"
              class="w-4 h-4"
          />
          <label for="public" class="text-small text-silver">Visible en mi perfil público</label>
        </div>

        <div class="flex gap-3 mt-6">
          <BaseButton
              variant="secondary"
              class="flex-1"
              @click="emit('close')"
          >
            CANCELAR
          </BaseButton>
          <BaseButton
              class="flex-1"
              @click="handleSave"
          >
            GUARDAR
          </BaseButton>
        </div>
      </div>
    </div>
  </BaseModal>
</template>
