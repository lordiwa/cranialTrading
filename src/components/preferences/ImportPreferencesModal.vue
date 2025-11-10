<!-- src/components/preferences/ImportPreferencesModal.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseLoader from '../ui/BaseLoader.vue'
import { CardCondition } from '../../types/card'
import { extractDeckId, fetchMoxfieldDeck, moxfieldToCardList } from '../../services/moxfield'
import { parseMoxfieldDeck } from '../../utils/deckParser'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  import: [deckText: string, condition: CardCondition, includeSideboard: boolean]
  importDirect: [cards: any[], condition: CardCondition]
}>()

const inputText = ref('')
const condition = ref<CardCondition>('NM')
const includeSideboard = ref(false)
const parsing = ref(false)
const preview = ref<{ total: number; mainboard: number; sideboard: number; name?: string } | null>(null)
const isLink = ref(false)

const conditionOptions = [
  { value: 'M', label: 'M - Mint' },
  { value: 'NM', label: 'NM - Near Mint' },
  { value: 'LP', label: 'LP - Light Play' },
  { value: 'MP', label: 'MP - Moderate Play' },
  { value: 'HP', label: 'HP - Heavy Play' },
  { value: 'PO', label: 'PO - Poor' },
]

const handleParse = async () => {
  if (!inputText.value.trim()) return

  parsing.value = true

  // Detectar si es link o ID de Moxfield
  const deckId = extractDeckId(inputText.value)

  if (deckId) {
    // Es un link o ID de Moxfield
    isLink.value = true
    const deck = await fetchMoxfieldDeck(deckId)

    if (!deck) {
      parsing.value = false
      return
    }

    const mainboard = Object.values(deck.mainboard).reduce((sum, item) => sum + item.quantity, 0)
    const sideboard = Object.values(deck.sideboard).reduce((sum, item) => sum + item.quantity, 0)

    preview.value = {
      total: mainboard + sideboard,
      mainboard,
      sideboard,
      name: deck.name,
    }
  } else {
    // Es texto normal
    isLink.value = false
    const lines = inputText.value.split('\n')
    let mainboard = 0
    let sideboard = 0
    let inSideboard = false

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed === 'SIDEBOARD:') {
        inSideboard = true
        continue
      }

      const match = trimmed.match(/^(\d+)\s+/)
      if (match) {
        const qty = parseInt(match[1])
        if (inSideboard) {
          sideboard += qty
        } else {
          mainboard += qty
        }
      }
    }

    preview.value = {
      total: mainboard + sideboard,
      mainboard,
      sideboard,
    }
  }

  parsing.value = false
}

const handleImport = async () => {
  if (isLink.value) {
    // Importación desde API de Moxfield
    const deckId = extractDeckId(inputText.value)
    if (!deckId) return

    const deck = await fetchMoxfieldDeck(deckId)
    if (!deck) return

    const cards = moxfieldToCardList(deck, includeSideboard.value)
    emit('importDirect', cards, condition.value)
  } else {
    // Importación desde texto
    emit('import', inputText.value, condition.value, includeSideboard.value)
  }
}

const handleClose = () => {
  inputText.value = ''
  preview.value = null
  includeSideboard.value = false
  condition.value = 'NM'
  isLink.value = false
  emit('close')
}
</script>

<template>
  <BaseModal :show="show" title="IMPORTAR COMO BUSCO" @close="handleClose">
    <div class="space-y-4">
      <div>
        <label class="text-small text-silver-70 block mb-2">
          Link de Moxfield o texto del mazo
        </label>
        <textarea
            v-model="inputText"
            placeholder="https://moxfield.com/decks/...&#10;o&#10;3 Arid Mesa (MH2) 244&#10;2 Artist's Talent (BLB) 124&#10;..."
            class="w-full bg-primary border border-silver px-4 py-3 text-small text-silver placeholder:text-silver-50 transition-fast focus:outline-none focus:border-2 focus:border-neon font-mono"
            rows="8"
            @input="preview = null"
        />
      </div>

      <BaseButton
          variant="secondary"
          size="small"
          @click="handleParse"
          :disabled="!inputText.trim() || parsing"
          class="w-full"
      >
        {{ parsing ? 'ANALIZANDO...' : 'ANALIZAR' }}
      </BaseButton>

      <div v-if="preview" class="border border-silver-30 p-4 space-y-2">
        <p v-if="preview.name" class="text-body font-bold text-neon mb-3">
          {{ preview.name }}
        </p>
        <p class="text-small text-silver">
          <span class="font-bold">Total:</span> {{ preview.total }} cartas
        </p>
        <p class="text-small text-silver-70">
          Mainboard: {{ preview.mainboard }} | Sideboard: {{ preview.sideboard }}
        </p>
      </div>

      <div v-if="preview">
        <label class="text-small text-silver-70 block mb-2">Condición mínima deseada</label>
        <BaseSelect
            v-model="condition"
            :options="conditionOptions"
        />
      </div>

      <div v-if="preview && preview.sideboard > 0">
        <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
          <input
              v-model="includeSideboard"
              type="checkbox"
              class="w-4 h-4"
          />
          <span>Incluir sideboard</span>
        </label>
      </div>

      <div v-if="preview" class="bg-primary-dark border border-silver-30 p-3">
        <p class="text-tiny text-silver-70">
          💡 Se crearán {{ includeSideboard ? preview.total : preview.mainboard }} preferencias BUSCO automáticamente.
        </p>
      </div>

      <BaseButton
          v-if="preview"
          @click="handleImport"
          class="w-full"
      >
        IMPORTAR {{ includeSideboard ? preview.total : preview.mainboard }} COMO BUSCO
      </BaseButton>
    </div>
  </BaseModal>
</template>