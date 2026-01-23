<!-- src/components/preferences/ImportPreferencesModal.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import { CardCondition } from '../../types/card'
import { extractDeckId, fetchMoxfieldDeck, moxfieldToCardList } from '../../services/moxfield'

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
const errorMsg = ref('')
const isLink = ref(false)
const moxfieldDeckData = ref<any>(null)

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
  errorMsg.value = ''
  moxfieldDeckData.value = null

  // Detectar si es link o ID de Moxfield
  const deckId = extractDeckId(inputText.value)

  if (deckId) {
    // Intentar obtener via Cloud Function
    isLink.value = true
    const result = await fetchMoxfieldDeck(deckId)

    if (!result.data) {
      parsing.value = false
      errorMsg.value = result.error || 'Error desconocido'
      return
    }

    // Éxito - procesar el deck
    const deck = result.data
    moxfieldDeckData.value = deck

    // Nueva estructura: deck.boards.mainboard.cards
    const mainboardCards = deck.boards?.mainboard?.cards || {}
    const sideboardCards = deck.boards?.sideboard?.cards || {}
    const commanderCards = deck.boards?.commanders?.cards || {}

    const mainboardCount = Object.values(mainboardCards).reduce((sum: number, item: any) => sum + item.quantity, 0)
    const sideboardCount = Object.values(sideboardCards).reduce((sum: number, item: any) => sum + item.quantity, 0)
    const commanderCount = Object.values(commanderCards).reduce((sum: number, item: any) => sum + item.quantity, 0)

    preview.value = {
      total: mainboardCount + sideboardCount + commanderCount,
      mainboard: mainboardCount + commanderCount,
      sideboard: sideboardCount,
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

const handleImport = () => {
  if (isLink.value && moxfieldDeckData.value) {
    // Importación directa desde API de Moxfield
    const cards = moxfieldToCardList(moxfieldDeckData.value, includeSideboard.value)
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
  errorMsg.value = ''
  isLink.value = false
  moxfieldDeckData.value = null
  emit('close')
}
</script>

<template>
  <BaseModal :show="show" title="IMPORTAR COMO BUSCO" @close="handleClose">
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

      <!-- Instrucciones para Moxfield -->
      <div v-if="errorMsg === 'MOXFIELD_LINK_DETECTED'" class="border border-neon bg-neon/10 p-md space-y-2">
        <p class="text-small text-neon font-bold">Link de Moxfield detectado</p>
        <p class="text-small text-silver">Moxfield no permite importar directamente. Sigue estos pasos:</p>
        <ol class="text-small text-silver-70 list-decimal list-inside space-y-1">
          <li>Abre el deck en Moxfield</li>
          <li>Click en <span class="text-neon">Export</span> (arriba a la derecha)</li>
          <li>Click en <span class="text-neon">Copy to Clipboard</span></li>
          <li>Pega el texto aquí</li>
        </ol>
      </div>

      <!-- Error message -->
      <div v-else-if="errorMsg" class="border border-rust bg-rust/10 p-md">
        <p class="text-small text-rust">{{ errorMsg }}</p>
      </div>

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

      <div v-if="preview" class="bg-primary-dark border border-silver-30 p-sm">
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