<script setup lang="ts">
import { ref, watch } from 'vue'
import { useToastStore } from '../../stores/toast'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseModal from '../ui/BaseModal.vue'
import type { Card, CardStatus } from '../../types/card'

const props = defineProps<{
  show: boolean
  card: Card | null
}>()

const emit = defineEmits<{
  close: []
  save: [card: Card]
}>()

const toastStore = useToastStore()

const form = ref<Partial<Card>>({
  quantity: 1,
  condition: 'NM',
  foil: false,
})

const isLoading = ref(false)

const conditionOptions = [
  { value: 'M', label: 'Mint (M)' },
  { value: 'NM', label: 'Near Mint (NM)' },
  { value: 'LP', label: 'Light Play (LP)' },
  { value: 'MP', label: 'Moderate Play (MP)' },
  { value: 'HP', label: 'Heavy Play (HP)' },
  { value: 'PO', label: 'Poor (PO)' },
]

const handleSave = async () => {
  if (!props.card) return

  if ((form.value.quantity as number) < 1 || (form.value.quantity as number) > 4) {
    toastStore.showToast('Cantidad debe ser 1-4', 'error')
    return
  }

  isLoading.value = true

  try {
    const updatedCard: Card = {
      ...props.card,
      quantity: form.value.quantity as number,
      condition: form.value.condition as string,
      foil: form.value.foil as boolean,
    }

    emit('save', updatedCard)
  } catch (err) {
    toastStore.showToast('Error guardando cambios', 'error')
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

watch(() => props.card, (newCard) => {
  if (newCard) {
    form.value = {
      quantity: newCard.quantity,
      condition: newCard.condition,
      foil: newCard.foil,
    }
  }
}, { deep: true })
</script>

<template>
  <BaseModal :show="show" @close="emit('close')">
    <div class="space-y-6 w-full max-w-xl">
      <!-- Title -->
      <div>
        <h2 class="text-h2 font-bold text-silver mb-1">EDITAR CARTA</h2>
        <p class="text-small text-silver-70">Modifica los detalles de tu carta</p>
      </div>

      <!-- Card Info -->
      <div v-if="card" class="bg-secondary border border-silver-30 p-4 space-y-2">
        <p class="font-bold text-silver text-h3">{{ card.name }}</p>
        <p class="text-small text-silver-70">{{ card.edition }}</p>
        <p class="text-small text-neon">Condición actual: {{ card.condition }}</p>
      </div>

      <!-- Form -->
      <div class="space-y-4">
        <!-- Quantity & Condition -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-small text-silver-70 block mb-2">Cantidad</label>
            <BaseInput
                v-model.number="form.quantity"
                type="number"
                min="1"
                max="4"
            />
          </div>

          <div>
            <label class="text-small text-silver-70 block mb-2">Condición</label>
            <BaseSelect
                v-model="form.condition"
                :options="conditionOptions"
            />
          </div>
        </div>

        <!-- Foil Checkbox -->
        <label class="flex items-center gap-2 cursor-pointer hover:text-neon transition-colors">
          <input
              v-model="form.foil"
              type="checkbox"
              class="w-4 h-4 cursor-pointer"
          />
          <span class="text-small text-silver">Foil</span>
        </label>
      </div>

      <!-- Actions -->
      <div class="flex gap-3 pt-4 border-t border-silver-20">
        <BaseButton
            class="flex-1"
            :disabled="isLoading"
            @click="handleSave"
        >
          {{ isLoading ? '⏳ GUARDANDO...' : '✓ GUARDAR' }}
        </BaseButton>
        <BaseButton
            variant="secondary"
            class="flex-1"
            :disabled="isLoading"
            @click="emit('close')"
        >
          CANCELAR
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>