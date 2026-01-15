<!-- src/components/collection/ImportDeckModal.vue -->
<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseLoader from '../ui/BaseLoader.vue'
import BaseInput from '../ui/BaseInput.vue'
import { CardCondition } from '../../types/card'
import { DeckFormat } from '../../types/deck'
import { extractDeckId, fetchMoxfieldDeck, moxfieldToCardList } from '../../services/moxfield'
import { parseMoxfieldDeck } from '../../utils/deckParser'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'import', deckText: string, condition: CardCondition, includeSideboard: boolean, deckName?: string, makePublic?: boolean, format?: DeckFormat, commander?: string): void
  (e: 'importDirect', cards: any[], deckName: string | undefined, condition: CardCondition, makePublic?: boolean, format?: DeckFormat, commander?: string): void
}>()

const inputText = ref('')
const condition = ref<CardCondition>('NM')
const includeSideboard = ref(false)
const parsing = ref(false)
const preview = ref<{ total: number; mainboard: number; sideboard: number; name?: string; cards?: string[] } | null>(null)
const isLink = ref(false)

// NEW: deck name input (optional). Prefill with preview.name when available
const deckNameInput = ref('')
// option to make all imported cards public
const makeAllPublic = ref(false)

// Formato del deck
const deckFormat = ref<DeckFormat>('modern')
// Comandante (solo para Commander)
const commanderName = ref('')

const formatOptions = [
  { value: 'standard', label: 'Standard' },
  { value: 'modern', label: 'Modern' },
  { value: 'commander', label: 'Commander / EDH' },
  { value: 'vintage', label: 'Vintage' },
  { value: 'custom', label: 'Custom / Casual' },
]

// Mostrar selector de comandante solo si es Commander
const isCommander = computed(() => deckFormat.value === 'commander')

watch(preview, (p) => {
  if (p?.name) deckNameInput.value = p.name
})

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

    // Extraer nombres de cartas para selector de comandante
    const cardNames = Object.values(deck.mainboard).map((item: any) => item.card?.name || '').filter(Boolean)

    preview.value = {
      total: mainboard + sideboard,
      mainboard,
      sideboard,
      name: deck.name,
      cards: cardNames,
    }
    // prefill deck name
    deckNameInput.value = deck.name || ''

    // Si Moxfield indica que es Commander, auto-seleccionar formato
    if (deck.format === 'commander' || deck.format === 'edh') {
      deckFormat.value = 'commander'
      // Intentar detectar el comandante (primera carta legendary creature)
      if (deck.commanders && Object.keys(deck.commanders).length > 0) {
        const firstCommander = Object.values(deck.commanders)[0] as any
        commanderName.value = firstCommander?.card?.name || ''
      }
    }
  } else {
    // Es texto normal
    isLink.value = false
    const lines = inputText.value.split('\n')
    let mainboard = 0
    let sideboard = 0
    let inSideboard = false
    const cardNames: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed === 'SIDEBOARD:') {
        inSideboard = true
        continue
      }

      // Extraer cantidad y nombre: "4 Lightning Bolt" o "4 Lightning Bolt (M10) 123"
      const match = trimmed.match(/^(\d+)\s+(.+?)(?:\s*\([^)]+\).*)?$/)
      if (match) {
        const qty = parseInt(match[1])
        const name = match[2].trim()
        if (!inSideboard) {
          cardNames.push(name)
        }
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
      cards: cardNames,
    }
    // do not overwrite user's deckNameInput when parsing text
  }

  parsing.value = false
}

const handleImport = async () => {
  // normalize deck name: trim and emit undefined if empty
  const nameToSend = deckNameInput.value?.trim() || undefined
  const commanderToSend = isCommander.value ? commanderName.value?.trim() || undefined : undefined

  if (isLink.value) {
    // Importación desde API de Moxfield
    const deckId = extractDeckId(inputText.value)
    if (!deckId) return

    const deck = await fetchMoxfieldDeck(deckId)
    if (!deck) return

    const cards = moxfieldToCardList(deck, includeSideboard.value)
    emit('importDirect', cards, nameToSend, condition.value, makeAllPublic.value, deckFormat.value, commanderToSend)
  } else {
    // Importación desde texto
    emit('import', inputText.value, condition.value, includeSideboard.value, nameToSend, makeAllPublic.value, deckFormat.value, commanderToSend)
  }
}

const handleClose = () => {
  inputText.value = ''
  preview.value = null
  includeSideboard.value = false
  condition.value = 'NM'
  isLink.value = false
  deckNameInput.value = ''
  deckFormat.value = 'modern'
  commanderName.value = ''
  emit('close')
}
</script>

<template>
  <BaseModal :show="show" title="IMPORTAR MAZO" @close="handleClose">
    <div class="space-y-md">
      <div>
        <label class="text-small text-silver-70 block mb-2">
          Link de Moxfield o texto del mazo
        </label>
        <textarea
            v-model="inputText"
            placeholder="https://moxfield.com/decks/...&#10;o&#10;3 Arid Mesa (MH2) 244&#10;2 Artist's Talent (BLB) 124&#10;..."
            class="w-full bg-primary border border-silver px-4 py-md text-small text-silver placeholder:text-silver-50 transition-fast focus:outline-none focus:border-2 focus:border-neon font-mono"
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

      <div v-if="preview" class="border border-silver-30 p-md space-y-xs">
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
        <label class="text-small text-silver-70 block mb-2">Condición por defecto</label>
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

      <!-- Deck name input (optional) -->
      <div v-if="preview">
        <label class="text-small text-silver-70 block mb-2">Nombre del mazo (opcional)</label>
        <BaseInput v-model="deckNameInput" placeholder="Dejar vacío para generar un nombre aleatorio" />
      </div>

      <!-- Formato del deck -->
      <div v-if="preview">
        <label class="text-small text-silver-70 block mb-2">Formato</label>
        <BaseSelect
            v-model="deckFormat"
            :options="formatOptions"
        />
      </div>

      <!-- Commander (solo si es Commander) -->
      <div v-if="preview && isCommander">
        <label class="text-small text-silver-70 block mb-2">Comandante</label>
        <BaseInput
            v-model="commanderName"
            placeholder="Nombre del comandante..."
            list="commander-suggestions"
        />
        <!-- Sugerencias de cartas del deck -->
        <datalist id="commander-suggestions">
          <option v-for="card in preview.cards" :key="card" :value="card" />
        </datalist>
        <p class="text-tiny text-silver-50 mt-1">
          Escribe el nombre o selecciona de las cartas importadas
        </p>
      </div>

      <!-- Make all imported cards public? -->
      <div v-if="preview" class="pt-2">
        <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
          <input v-model="makeAllPublic" type="checkbox" class="w-4 h-4" />
          <span>Hacer todas estas cartas públicas</span>
        </label>
      </div>

      <BaseButton
          v-if="preview"
          @click="handleImport"
          class="w-full"
      >
        IMPORTAR {{ includeSideboard ? preview.total : preview.mainboard }} CARTAS
      </BaseButton>
    </div>
  </BaseModal>
</template>