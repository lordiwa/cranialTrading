<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseButton from '../ui/BaseButton.vue'
import { useCollectionStore } from '../../stores/collection'
import { useToastStore } from '../../stores/toast'
import { useAuthStore } from '../../stores/auth'

interface Props {
  show: boolean
  scryfallCard?: any
}

const props = defineProps<Props>()
const emit = defineEmits(['close', 'added'])

const collectionStore = useCollectionStore()
const toastStore = useToastStore()
const authStore = useAuthStore()

const loading = ref(false)

const form = reactive({
  quantity: 1,
  condition: 'NM',
  foil: false,
  status: 'collection',
  deckName: '',
})

// ✅ NUEVO: Estado para controlar qué lado mostrar en split cards
const cardFaceIndex = ref(0)

const conditionOptions = [
  { value: 'M', label: 'M - Mint' },
  { value: 'NM', label: 'NM - Near Mint' },
  { value: 'LP', label: 'LP - Light Play' },
  { value: 'MP', label: 'MP - Moderate Play' },
  { value: 'HP', label: 'HP - Heavy Play' },
  { value: 'PO', label: 'PO - Poor' },
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
  return props.scryfallCard?.card_faces && props.scryfallCard.card_faces.length > 1
})

// ✅ NUEVO: Obtener imagen actual según el lado
const currentCardImage = computed(() => {
  if (!props.scryfallCard) return ''
  if (props.scryfallCard.card_faces && props.scryfallCard.card_faces[cardFaceIndex.value]) {
    return props.scryfallCard.card_faces[cardFaceIndex.value].image_uris?.normal || ''
  }
  return getCardImage(props.scryfallCard)
})

// ✅ NUEVO: Obtener nombre del lado actual
const currentCardName = computed(() => {
  if (!props.scryfallCard) return ''
  if (props.scryfallCard.card_faces && props.scryfallCard.card_faces[cardFaceIndex.value]) {
    return props.scryfallCard.card_faces[cardFaceIndex.value].name
  }
  return props.scryfallCard.name
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
  if (!props.scryfallCard || !authStore.user) return

  loading.value = true
  try {
    // ✅ CORREGIDO: Guardar el nombre del lado actual (para split cards)
    const cardName = isSplitCard.value
        ? props.scryfallCard.card_faces[cardFaceIndex.value].name
        : props.scryfallCard.name

    const imageToSave = currentCardImage.value || ''

    console.log('✅ GUARDANDO CARTA:', {
      name: cardName,
      image: imageToSave,
      isSplitCard: isSplitCard.value,
      cardFaceIndex: cardFaceIndex.value,
    })

    await collectionStore.addCard({
      scryfallId: props.scryfallCard.id,
      name: cardName,
      edition: props.scryfallCard.set_name,
      quantity: form.quantity,
      condition: form.condition,
      foil: form.foil,
      status: form.status,
      price: parseFloat(props.scryfallCard.prices?.usd || '0'),
      image: imageToSave,
      deckName: form.deckName || null,
    })

    toastStore.show(`✓ ${props.scryfallCard.name} agregada`, 'success')
    emit('added')
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
</script>

<template>
  <BaseModal :show="show" @close="handleClose" :close-on-click-outside="false">
    <div class="space-y-4">
      <!-- Título -->
      <h2 class="text-xl font-bold text-[#EEEEEE]">AGREGAR CARTA</h2>

      <!-- Datos de la carta -->
      <div v-if="scryfallCard" class="border border-[#EEEEEE]/30 p-4 space-y-4">
        <!-- Imagen (grande) y Formulario lado a lado -->
        <div class="flex gap-6">
          <!-- IZQUIERDA: Imagen grande -->
          <div class="flex flex-col items-center gap-4">
            <!-- Imagen con botón toggle encima para split cards -->
            <div class="relative">
              <img
                  v-if="currentCardImage"
                  :src="currentCardImage"
                  :alt="currentCardName"
                  class="w-64 h-96 object-cover border border-[#EEEEEE]/20"
              />
              <div v-else class="w-64 h-96 bg-[#333333] border border-[#EEEEEE]/20 flex items-center justify-center">
                <span class="text-[#EEEEEE]/50">Sin imagen</span>
              </div>

              <!-- ✅ Botón toggle flotante en esquina (SOLO para split cards) -->
              <button
                  v-if="isSplitCard"
                  @click="toggleCardFace"
                  class="absolute top-2 right-2 bg-[#000000]/80 border-2 border-[#CCFF00] p-2 hover:bg-[#CCFF00]/20 transition-all"
                  :title="`Ver lado ${cardFaceIndex === 0 ? 2 : 1}`"
              >
                <svg class="w-5 h-5 text-[#CCFF00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
                </svg>
              </button>
            </div>

            <!-- Info bajo la imagen -->
            <div class="text-center w-full">
              <p class="font-bold text-[#EEEEEE]">{{ currentCardName }}</p>
              <p v-if="isSplitCard" class="text-xs text-[#CCFF00] mt-1">
                Lado {{ cardFaceIndex + 1 }} de {{ scryfallCard.card_faces.length }}
              </p>
              <p class="text-xs text-[#EEEEEE]/70 mt-2">{{ scryfallCard.set_name }}</p>
              <p class="text-lg text-[#CCFF00] font-bold mt-2">${{ scryfallCard.prices?.usd || '0.00' }}</p>
            </div>
          </div>

          <!-- DERECHA: Formulario -->
          <div class="flex-1 space-y-4">
            <!-- Cantidad -->
            <div>
              <label class="text-sm text-[#EEEEEE]">Cantidad</label>
              <input
                  v-model.number="form.quantity"
                  type="number"
                  min="1"
                  class="w-full mt-1 bg-[#000000] border border-[#EEEEEE] text-[#EEEEEE] px-3 py-2"
              />
            </div>

            <!-- Condición -->
            <div>
              <label class="text-sm text-[#EEEEEE]">Condición</label>
              <BaseSelect
                  v-model="form.condition"
                  :options="conditionOptions"
                  class="mt-1"
              />
            </div>

            <!-- Foil -->
            <div class="flex items-center gap-2">
              <input
                  v-model="form.foil"
                  type="checkbox"
                  id="foil"
                  class="w-4 h-4"
              />
              <label for="foil" class="text-sm text-[#EEEEEE]">Foil</label>
            </div>

            <!-- Estado -->
            <div>
              <label class="text-sm text-[#EEEEEE]">Estado</label>
              <BaseSelect
                  v-model="form.status"
                  :options="statusOptions"
                  class="mt-1"
              />
            </div>

            <!-- Deck (opcional) -->
            <div>
              <label class="text-sm text-[#EEEEEE]">Asignar a Deck</label>
              <BaseSelect
                  v-model="form.deckName"
                  :options="deckOptions"
                  class="mt-1"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Botones -->
      <div class="flex gap-2 justify-end pt-4 border-t border-[#EEEEEE]/20">
        <BaseButton variant="secondary" @click="handleClose">
          CANCELAR
        </BaseButton>
        <BaseButton @click="handleAddCard" :disabled="loading">
          {{ loading ? 'GUARDANDO...' : 'AGREGAR' }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>