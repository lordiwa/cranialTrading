<script setup lang="ts">
import { ref, reactive } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseButton from '../ui/BaseButton.vue'
import { useCollectionStore } from '../../stores/collection'
import { useToastStore } from '../../stores/toast'
import { useAuthStore } from '../../stores/auth'

interface Props {
  show: boolean
  card?: any
}

const props = defineProps<Props>()
const emit = defineEmits(['close', 'card-added'])

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

const conditionOptions = [
  { value: 'M', label: 'M - Mint' },
  { value: 'NM', label: 'NM - Near Mint' },
  { value: 'LP', label: 'LP - Light Play' },
  { value: 'MP', label: 'MP - Moderate Play' },
  { value: 'HP', label: 'HP - Heavy Play' },
  { value: 'PO', label: 'PO - Poor' },
]

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
    await collectionStore.addCard({
      scryfallId: props.card.id,
      name: props.card.name,
      edition: props.card.set_name,
      quantity: form.quantity,
      condition: form.condition,
      foil: form.foil,
      status: form.status,
      price: parseFloat(props.card.prices?.usd || '0'),
      image: props.card.image_uris?.normal || '',
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
  emit('close')
}
</script>

<template>
  <BaseModal :show="show" @close="handleClose">
    <div class="space-y-4">
      <!-- Título -->
      <h2 class="text-xl font-bold text-[#EEEEEE]">AGREGAR CARTA</h2>

      <!-- Datos de la carta -->
      <div v-if="card" class="border border-[#EEEEEE]/30 p-4 space-y-4">
        <!-- Imagen y nombre -->
        <div class="flex gap-4">
          <img
              v-if="card.image_uris?.normal"
              :src="card.image_uris.normal"
              :alt="card.name"
              class="w-24 h-32 object-cover border border-[#EEEEEE]/20"
          />
          <div class="flex-1">
            <p class="font-bold text-[#EEEEEE]">{{ card.name }}</p>
            <p class="text-sm text-[#EEEEEE]/70">{{ card.set_name }}</p>
            <p class="text-sm text-[#CCFF00] mt-2">${{ card.prices?.usd || '0.00' }}</p>
          </div>
        </div>

        <!-- Formulario -->
        <div class="border-t border-[#EEEEEE]/20 pt-4 space-y-4">
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