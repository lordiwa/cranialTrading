<script setup lang="ts">
import { ref, watch } from 'vue'
import { useCollectionStore } from '../../stores/collection'
import { useToastStore } from '../../stores/toast'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseModal from '../ui/BaseModal.vue'
import type { CardStatus } from '../../types/card'

const props = defineProps<{
  show: boolean
  scryfallCard: any | null
}>()

const emit = defineEmits<{
  close: []
  added: []
}>()

const collectionStore = useCollectionStore()
const toastStore = useToastStore()

const form = ref({
  quantity: 1,
  condition: 'NM' as const,
  foil: false,
  status: 'collection' as CardStatus,
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

// ✅ NUEVO: Función para obtener imagen correcta de split cards
const getCardImage = (card: any): string => {
  if (card.card_faces && card.card_faces.length > 0) {
    return card.card_faces[0].image_uris?.normal || ''
  }
  return card.image_uris?.normal || ''
}

// ✅ NUEVO: Verificar si es split card
const isSplitCard = computed(() => {
  return props.card?.card_faces && props.card.card_faces.length > 1
})

// ✅ NUEVO: Obtener imagen actual según el lado
const currentCardImage = computed(() => {
  if (!props.card) return ''
  if (props.card.card_faces && props.card.card_faces[cardFaceIndex.value]) {
    return props.card.card_faces[cardFaceIndex.value].image_uris?.normal || ''
  }
  return getCardImage(props.card)
})

// ✅ NUEVO: Obtener nombre del lado actual
const currentCardName = computed(() => {
  if (!props.card) return ''
  if (props.card.card_faces && props.card.card_faces[cardFaceIndex.value]) {
    return props.card.card_faces[cardFaceIndex.value].name
  }
  return props.card.name
})

// ✅ NUEVO: Toggle entre lados
const toggleCardFace = () => {
  if (isSplitCard.value) {
    cardFaceIndex.value = cardFaceIndex.value === 0 ? 1 : 0
  }
}

const statusOptions = [
  { value: 'collection', label: 'Colección Personal' },
  { value: 'sale', label: 'A la Venta' },
  { value: 'trade', label: 'Disponible para Cambio' },
  { value: 'wishlist', label: 'Busco / Wishlist' },
]

const deckOptions = [
  { value: '', label: 'Sin asignar' },
  { value: 'modern', label: 'Modern Deck' },
  { value: 'commander', label: 'Commander' },
  { value: 'standard', label: 'Standard' },
  { value: 'vintage', label: 'Vintage' },
]

const handleAddCard = async () => {
  if (!props.card || !authStore.user) return

  loading.value = true
  try {
    // ✅ CORREGIDO: Guardar el nombre del lado actual (para split cards)
    const cardName = isSplitCard.value
        ? props.card.card_faces[cardFaceIndex.value].name
        : props.card.name

    const imageToSave = currentCardImage.value || ''

    // 🔴 DEBUG: Ver qué se está guardando
    console.log('🔴 GUARDANDO CARTA:', {
      name: cardName,
      image: imageToSave,
      isSplitCard: isSplitCard.value,
      cardFaceIndex: cardFaceIndex.value,
      currentCardImage: currentCardImage.value,
      card_faces: props.card?.card_faces?.length
    })

    await collectionStore.addCard({
      scryfallId: props.card.id,
      name: cardName,
      edition: props.card.set_name,
      quantity: form.quantity,
      condition: form.condition,
      foil: form.foil,
      status: form.status,
      price: parseFloat(props.card.prices?.usd || '0'),
      image: imageToSave,
      deckName: form.deckName || null,
    })

    toastStore.show(`✓ ${props.card.name} agregada`, 'success')
    emit('card-added')
    handleClose()
  } catch (err) {
    console.error('Error agregando carta:', err)
    toastStore.show('Error al agregar carta', 'error')
  } finally {
    loading.value = false
  }
}

const handleClose = () => {
  form.quantity = 1
  form.condition = 'NM'
  form.foil = false
  form.status = 'collection'
  form.deckName = ''
  cardFaceIndex.value = 0
  emit('close')
}

watch(() => props.show, (newVal) => {
  if (!newVal) {
    resetForm()
  }
})
</script>

<template>
  <BaseModal :show="show" @close="emit('close')">
    <div class="space-y-6 w-full max-w-xl">
      <!-- Title -->
      <div>
        <h2 class="text-h2 font-bold text-silver mb-1">AGREGAR A COLECCIÓN</h2>
        <p class="text-small text-silver-70">Configura los detalles de esta carta</p>
      </div>

      <!-- Card Preview -->
      <div v-if="scryfallCard" class="bg-secondary border border-silver-30 p-4 space-y-4">
        <div class="flex gap-4">
          <!-- Image -->
          <div class="flex-shrink-0">
            <img
                v-if="scryfallCard.image_uris?.small"
                :src="scryfallCard.image_uris.small"
                :alt="scryfallCard.name"
                class="w-24 h-32 object-cover border border-silver-30"
            />
            <div v-else class="w-24 h-32 bg-primary border border-silver-30 flex items-center justify-center">
              <span class="text-tiny text-silver-50">No image</span>
            </div>
          </div>

          <!-- Card Info -->
          <div class="flex-1 space-y-2">
            <p class="font-bold text-silver text-h3">{{ scryfallCard.name }}</p>
            <p class="text-small text-silver-70">{{ scryfallCard.set.toUpperCase() }}</p>
            <p class="text-body font-bold text-neon">
              ${{ scryfallCard.prices?.usd ? parseFloat(scryfallCard.prices.usd).toFixed(2) : 'N/A' }}
            </p>
            <p class="text-tiny text-silver-70 pt-2">
              {{ scryfallCard.type_line }}
            </p>
          </div>
        </div>
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

        <!-- Status -->
        <div>
          <label class="text-small text-silver-70 block mb-2">Estado</label>
          <BaseSelect
              v-model="form.status"
              :options="statusOptions"
          />
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
            @click="handleAdd"
        >
          {{ isLoading ? '⏳ GUARDANDO...' : '✓ AGREGAR CARTA' }}
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