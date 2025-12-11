<template>
  <BaseModal
      :open="open"
      title="AGREGAR CARTA"
      @close="handleClose"
  >
    <div class="modal-content">
      <!-- INPUT de búsqueda -->
      <div class="search-section">
        <BaseInput
            v-model="searchQuery"
            placeholder="Buscar carta (ej: Black Lotus, Ragavan)"
            @input="handleSearch"
        />
        <p class="helper-text">Escribe el nombre de la carta y espera resultados</p>
      </div>

      <!-- RESULTADOS de búsqueda -->
      <div v-if="searching" class="results-section">
        <BaseLoader />
        <p class="text-center">Buscando en Scryfall...</p>
      </div>

      <div v-else-if="searchResults.length > 0" class="results-section">
        <p class="results-label">{{ searchResults.length }} resultados encontrados</p>
        <div class="results-list">
          <div
              v-for="card in searchResults"
              :key="card.scryfallId"
              class="result-item"
              @click="selectCard(card)"
          >
            <img
                v-if="card.image"
                :src="card.image"
                :alt="card.name"
                class="card-image"
            />
            <div class="card-info">
              <h4>{{ card.name }}</h4>
              <p class="edition">{{ card.edition }}</p>
              <p class="price" v-if="card.price">
                💵 ${{ card.price.toFixed(2) }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="searchQuery.length > 0 && !searching" class="results-section">
        <p class="no-results">No se encontraron cartas</p>
      </div>

      <!-- FORMULARIO - Mostrar solo si hay carta seleccionada -->
      <div v-if="selectedCard" class="form-section">
        <div class="divider"></div>

        <div class="selected-card">
          <img
              v-if="selectedCard.image"
              :src="selectedCard.image"
              :alt="selectedCard.name"
              class="selected-image"
          />
          <div class="selected-info">
            <h3>{{ selectedCard.name }}</h3>
            <p>{{ selectedCard.edition }}</p>
          </div>
          <button class="clear-btn" @click="clearSelection">✕</button>
        </div>

        <!-- CANTIDAD -->
        <div class="form-group">
          <label>CANTIDAD</label>
          <BaseInput
              v-model.number="quantity"
              type="number"
              min="1"
              max="999"
              placeholder="1"
          />
        </div>

        <!-- CONDICIÓN -->
        <div class="form-group">
          <label>CONDICIÓN</label>
          <BaseSelect v-model="condition">
            <option value="M">M (Mint)</option>
            <option value="NM">NM (Near Mint)</option>
            <option value="LP">LP (Light Play)</option>
            <option value="MP">MP (Moderate Play)</option>
            <option value="HP">HP (Heavy Play)</option>
            <option value="PO">PO (Poor)</option>
          </BaseSelect>
        </div>

        <!-- FOIL -->
        <div class="form-group checkbox">
          <label>
            <input
                v-model="foil"
                type="checkbox"
            />
            Foil
          </label>
        </div>

        <!-- MAZO (NUEVO) -->
        <div class="form-group">
          <label>MAZO (opcional)</label>
          <BaseSelect v-model="deckName">
            <option value="">--- Sin mazo ---</option>
            <option value="main">Main Deck</option>
            <option value="sideboard">Sideboard</option>
            <option value="custom">Custom</option>
          </BaseSelect>
          <p class="helper-text">Asigna la carta a un mazo (opcional)</p>
        </div>

        <!-- BOTONES -->
        <div class="form-actions">
          <button
              class="btn-primary"
              :disabled="!quantity || quantity < 1"
              @click="handleAddCard"
          >
            ✅ AGREGAR
          </button>
          <button class="btn-secondary" @click="handleClose">
            CANCELAR
          </button>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useToastStore } from '../../stores/toast'
import { useCollectionStore } from '../../stores/collection'
import { searchCards } from '../../services/scryfall'
import BaseModal from '../ui/BaseModal.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseLoader from '../ui/BaseLoader.vue'

interface Card {
  scryfallId: string
  name: string
  edition: string
  editionCode: string
  image: string
  price: number
  type: string
  cmc: number
  rarity: string
}

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  added: [card: any]
}>()

const toastStore = useToastStore()
const collectionStore = useCollectionStore()

// Estado
const searchQuery = ref('')
const searchResults = ref<Card[]>([])
const searching = ref(false)
const selectedCard = ref<Card | null>(null)

// Formulario
const quantity = ref(1)
const condition = ref<'M' | 'NM' | 'LP' | 'MP' | 'HP' | 'PO'>('NM')
const foil = ref(false)
const deckName = ref('') // ✅ NUEVO - Con valor por defecto

// Buscar con debounce
const searchTimeout = ref<NodeJS.Timeout | null>(null)

const handleSearch = async () => {
  // Limpiar timeout anterior
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value)
  }

  // Si query es vacío, limpiar
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    return
  }

  // Debounce: esperar 500ms antes de buscar
  searching.value = true
  searchTimeout.value = setTimeout(async () => {
    try {
      const results = await searchCards(searchQuery.value)
      searchResults.value = results
    } catch (error) {
      console.error('❌ Error searching:', error)
      toastStore.addToast('Error buscando cartas', 'error')
      searchResults.value = []
    } finally {
      searching.value = false
    }
  }, 500)
}

// Seleccionar carta
const selectCard = (card: Card) => {
  selectedCard.value = card
  // Limpiar búsqueda para que vea solo el formulario
  searchQuery.value = ''
  searchResults.value = []
}

// Limpiar selección
const clearSelection = () => {
  selectedCard.value = null
  quantity.value = 1
  condition.value = 'NM'
  foil.value = false
  deckName.value = ''
}

// Agregar carta
const handleAddCard = async () => {
  if (!selectedCard.value || !quantity.value || quantity.value < 1) {
    toastStore.addToast('Completa todos los campos', 'error')
    return
  }

  try {
    const cardData = {
      scryfallId: selectedCard.value.scryfallId,
      name: selectedCard.value.name,
      edition: selectedCard.value.edition,
      editionCode: selectedCard.value.editionCode,
      image: selectedCard.value.image,
      quantity: quantity.value,
      condition: condition.value,
      foil: foil.value,
      price: selectedCard.value.price,
      status: 'collection' as const,
      deckName: deckName.value || 'default', // ✅ IMPORTANTE: Valor por defecto si está vacío
      type: selectedCard.value.type,
      rarity: selectedCard.value.rarity,
    }

    console.log('📝 Adding card:', cardData)

    await collectionStore.addCard(cardData)

    toastStore.addToast(`✅ ${selectedCard.value.name} agregada`, 'success')

    emit('added', cardData)
    handleClose()
  } catch (error) {
    console.error('❌ Error adding card:', error)
    toastStore.addToast('Error agregando carta', 'error')
  }
}

// Cerrar modal
const handleClose = () => {
  searchQuery.value = ''
  searchResults.value = []
  clearSelection()
  emit('close')
}
</script>

<style scoped>
.modal-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 80vh;
  overflow-y: auto;
}

.search-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.helper-text {
  font-size: 12px;
  color: #EEEEEE;
  opacity: 0.7;
  margin: 0;
}

.results-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.results-label {
  font-size: 12px;
  color: #CCFF00;
  text-transform: uppercase;
  margin: 0;
  font-weight: bold;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-item {
  display: grid;
  grid-template-columns: 60px 1fr;
  gap: 12px;
  padding: 12px;
  border: 1px solid #EEEEEE;
  border-opacity: 0.3;
  cursor: pointer;
  transition: all 150ms ease-out;
  background: #000000;
}

.result-item:hover {
  border-color: #CCFF00;
  border-opacity: 0.5;
  background: #CCFF00;
  background-opacity: 0.05;
}

.card-image {
  width: 60px;
  height: 84px;
  object-fit: cover;
  border: 1px solid #EEEEEE;
  border-opacity: 0.2;
}

.card-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.card-info h4 {
  margin: 0;
  font-size: 13px;
  color: #EEEEEE;
  font-weight: bold;
}

.edition {
  margin: 0;
  font-size: 11px;
  color: #EEEEEE;
  opacity: 0.6;
}

.price {
  margin: 0;
  font-size: 12px;
  color: #CCFF00;
  font-weight: bold;
}

.no-results {
  text-align: center;
  color: #EEEEEE;
  opacity: 0.5;
  font-size: 13px;
  margin: 20px 0;
}

.text-center {
  text-align: center;
  color: #EEEEEE;
  opacity: 0.7;
  font-size: 13px;
}

.divider {
  height: 1px;
  background: #EEEEEE;
  opacity: 0.2;
  margin: 16px 0;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.selected-card {
  display: grid;
  grid-template-columns: 80px 1fr 40px;
  gap: 12px;
  padding: 12px;
  border: 2px solid #CCFF00;
  border-opacity: 0.3;
  background: #CCFF00;
  background-opacity: 0.02;
}

.selected-image {
  width: 80px;
  height: 112px;
  object-fit: cover;
  border: 1px solid #CCFF00;
}

.selected-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.selected-info h3 {
  margin: 0;
  font-size: 14px;
  color: #CCFF00;
  font-weight: bold;
}

.selected-info p {
  margin: 0;
  font-size: 12px;
  color: #EEEEEE;
  opacity: 0.7;
}

.clear-btn {
  background: transparent;
  border: 1px solid #EEEEEE;
  color: #EEEEEE;
  border-opacity: 0.3;
  width: 40px;
  height: 40px;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 150ms ease-out;
}

.clear-btn:hover {
  border-color: #333333;
  color: #333333;
  background: #333333;
  background-opacity: 0.2;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 12px;
  color: #EEEEEE;
  text-transform: uppercase;
  font-weight: bold;
  letter-spacing: 0.5px;
}

.form-group.checkbox label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: normal;
}

.form-group.checkbox input[type='checkbox'] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #CCFF00;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.btn-primary,
.btn-secondary {
  flex: 1;
  padding: 12px 16px;
  font-size: 13px;
  font-weight: bold;
  text-transform: uppercase;
  border: none;
  cursor: pointer;
  transition: all 150ms ease-out;
  font-family: 'IBM Plex Mono', monospace;
}

.btn-primary {
  background: #CCFF00;
  color: #000000;
  border: 2px solid #CCFF00;
}

.btn-primary:hover:not(:disabled) {
  background: #BBDD00;
  border-color: #BBDD00;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: transparent;
  color: #EEEEEE;
  border: 2px solid #EEEEEE;
  border-opacity: 0.5;
}

.btn-secondary:hover {
  border-color: #EEEEEE;
  border-opacity: 1;
  background: #EEEEEE;
  background-opacity: 0.05;
}
</style>