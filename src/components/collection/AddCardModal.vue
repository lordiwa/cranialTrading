<template>
  <BaseModal :show="show" title="AGREGAR CARTA" @close="handleClose">
    <div class="space-y-6">
      <!-- Card Preview -->
      <div v-if="selectedCard" class="bg-silver-5 border border-silver-20 p-4 flex gap-4">
        <img
            v-if="selectedCard.image_uris?.normal"
            :src="selectedCard.image_uris.normal"
            :alt="selectedCard.name"
            class="w-20 h-28 object-cover border border-silver-30"
        />
        <div>
          <h3 class="text-h3 text-silver font-bold">{{ selectedCard.name }}</h3>
          <p class="text-body text-silver-70">{{ selectedCard.set_name }}</p>
          <p class="text-small text-neon font-bold mt-2">${{ selectedCard.prices?.usd || 'N/A' }}</p>
        </div>
      </div>

      <!-- Card Search -->
      <div>
        <label class="text-small font-bold text-silver-70 uppercase block mb-2">Buscar Carta</label>
        <input
            v-model="searchQuery"
            type="text"
            placeholder="Ej: Black Lotus, Mox Pearl..."
            class="w-full bg-black border border-silver-30 text-silver p-3 focus:border-neon outline-none"
            @input="debounceSearch"
        />
        <div v-if="searchResults.length > 0" class="mt-2 bg-black border border-silver-30 max-h-40 overflow-y-auto">
          <div
              v-for="card in searchResults"
              :key="card.id"
              class="p-2 cursor-pointer hover:bg-silver-10 border-b border-silver-20"
              @click="selectCard(card)"
          >
            <p class="text-small text-silver">{{ card.name }}</p>
            <p class="text-tiny text-silver-70">{{ card.set_name }} • ${{ card.prices?.usd || 'N/A' }}</p>
          </div>
        </div>
      </div>

      <!-- Cantidad -->
      <div>
        <label class="text-small font-bold text-silver-70 uppercase block mb-2">Cantidad</label>
        <input
            v-model.number="form.quantity"
            type="number"
            min="1"
            class="w-full bg-black border border-silver-30 text-silver p-3 focus:border-neon outline-none"
        />
      </div>

      <!-- Condición -->
      <div>
        <label class="text-small font-bold text-silver-70 uppercase block mb-2">Condición</label>
        <BaseSelect
            v-model="form.condition"
            :options="conditionOptions"
            placeholder="Seleccionar condición"
        />
        <p class="text-tiny text-silver-70 mt-1">M = Mint | NM = Near Mint | LP = Light Play | MP = Moderate Play | HP = Heavy Play | PO = Poor</p>
      </div>

      <!-- Foil -->
      <div class="flex items-center gap-3">
        <input
            v-model="form.foil"
            type="checkbox"
            id="foil-checkbox"
            class="w-4 h-4 cursor-pointer"
        />
        <label for="foil-checkbox" class="text-small text-silver-70 cursor-pointer">
          ✨ Es Foil (holográfica)
        </label>
      </div>

      <!-- Estado -->
      <div>
        <label class="text-small font-bold text-silver-70 uppercase block mb-2">Estado</label>
        <BaseSelect
            v-model="form.status"
            :options="statusOptions"
            placeholder="Seleccionar estado"
        />
        <p class="text-tiny text-silver-70 mt-1">Categoría de la carta en tu colección</p>
      </div>

      <!-- Mazo (Opcional) -->
      <div>
        <label class="text-small font-bold text-silver-70 uppercase block mb-2">Mazo (Opcional)</label>
        <BaseSelect
            v-model="form.deckName"
            :options="deckOptions"
            placeholder="Seleccionar o dejar en blanco"
        />
        <p class="text-tiny text-silver-70 mt-1">Asigna la carta a un mazo (opcional)</p>
      </div>

      <!-- Botones -->
      <div class="flex gap-3 pt-4">
        <BaseButton
            class="flex-1"
            @click="handleAddCard"
            :disabled="!selectedCard || form.quantity < 1 || loading"
        >
          {{ loading ? '⏳ AGREGANDO...' : '✓ AGREGAR' }}
        </BaseButton>
        <BaseButton variant="secondary" class="flex-1" @click="handleClose">
          CANCELAR
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseButton from '../ui/BaseButton.vue'
import { searchCards } from '../../services/scryfall'
import { useCollectionStore } from '../../stores/collection'
import { useToastStore } from '../../stores/toast'
import { useAuthStore } from '../../stores/auth'

interface Props {
  show: boolean
  defaultStatus?: 'collection' | 'sale' | 'trade'
  defaultDeckName?: string
}

const props = withDefaults(defineProps<Props>(), {
  defaultStatus: 'collection',
  defaultDeckName: undefined,
})

const emit = defineEmits(['close', 'card-added'])

const collectionStore = useCollectionStore()
const toastStore = useToastStore()
const authStore = useAuthStore()

// State
const searchQuery = ref('')
const selectedCard = ref<any>(null)
const searchResults = ref<any[]>([])
const loading = ref(false)
let searchTimeout: NodeJS.Timeout

const form = reactive({
  quantity: 1,
  condition: 'NM',
  foil: false,
  status: props.defaultStatus,
  deckName: props.defaultDeckName || '',
})

// Opciones para dropdowns
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
]

const deckOptions = [
  { value: '', label: 'Sin asignar' },
  { value: 'modern', label: 'Modern Deck' },
  { value: 'commander', label: 'Commander' },
  { value: 'standard', label: 'Standard' },
  { value: 'vintage', label: 'Vintage' },
]

// Métodos
const debounceSearch = () => {
  clearTimeout(searchTimeout)
  if (searchQuery.value.length < 2) {
    searchResults.value = []
    return
  }

  searchTimeout = setTimeout(async () => {
    try {
      const results = await searchCards(searchQuery.value)
      searchResults.value = results.slice(0, 5)
    } catch (err) {
      console.error('Error buscando cartas:', err)
      toastStore.addToast('Error buscando cartas', 'error')
    }
  }, 300)
}

const selectCard = (card: any) => {
  selectedCard.value = card
  searchResults.value = []
  searchQuery.value = ''
}

const handleAddCard = async () => {
  if (!selectedCard.value || !authStore.user) return

  loading.value = true
  try {
    await collectionStore.addCard({
      scryfallId: selectedCard.value.id,
      name: selectedCard.value.name,
      edition: selectedCard.value.set_name,
      quantity: form.quantity,
      condition: form.condition,
      foil: form.foil,
      status: form.status,
      price: parseFloat(selectedCard.value.prices?.usd || '0'),
      image: selectedCard.value.image_uris?.normal || '',
      deckName: form.deckName || null,
    })

    toastStore.addToast(`✓ ${selectedCard.value.name} agregada a tu colección`, 'success')
    emit('card-added')
    handleClose()
  } catch (err) {
    console.error('Error agregando carta:', err)
    toastStore.addToast('Error al agregar carta', 'error')
  } finally {
    loading.value = false
  }
}

const handleClose = () => {
  selectedCard.value = null
  searchQuery.value = ''
  searchResults.value = []
  form.quantity = 1
  form.condition = 'NM'
  form.foil = false
  form.status = props.defaultStatus
  form.deckName = props.defaultDeckName || ''
  emit('close')
}
</script>