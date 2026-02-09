<!-- src/components/collection/ImportDeckModal.vue -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseInput from '../ui/BaseInput.vue'
import { useI18n } from '../../composables/useI18n'
import { type CardCondition, type CardStatus } from '../../types/card'
import { type DeckFormat } from '../../types/deck'
import { extractDeckId, fetchMoxfieldDeck, moxfieldToCardList } from '../../services/moxfield'
import { isCsvFormat, parseCsvDeckImport, type ParsedCsvCard } from '../../utils/cardHelpers'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'import', deckText: string, condition: CardCondition, includeSideboard: boolean, deckName?: string, makePublic?: boolean, format?: DeckFormat, commander?: string, status?: CardStatus): void
  (e: 'importDirect', cards: any[], deckName: string | undefined, condition: CardCondition, makePublic?: boolean, format?: DeckFormat, commander?: string, status?: CardStatus): void
  (e: 'importCsv', cards: ParsedCsvCard[], deckName: string | undefined, makePublic?: boolean, format?: DeckFormat, commander?: string, status?: CardStatus): void
}>()

const { t } = useI18n()

const inputText = ref('')
const condition = ref<CardCondition>('NM')
const includeSideboard = ref(true)
const parsing = ref(false)
const preview = ref<{ total: number; mainboard: number; sideboard: number; name?: string; cards?: string[] } | null>(null)
const errorMsg = ref('')
const isLink = ref(false)
const moxfieldDeckData = ref<any>(null)
const isCsv = ref(false)
const csvParsedCards = ref<ParsedCsvCard[]>([])
const csvFileInput = ref<HTMLInputElement | null>(null)

// NEW: deck name input (optional). Prefill with preview.name when available
const deckNameInput = ref('')
// option to make all imported cards public
const makeAllPublic = ref(false)

// Import status
const importStatus = ref<CardStatus>('collection')

const statusOptions = computed(() => [
  { value: 'collection', label: t('common.status.collection') },
  { value: 'sale', label: t('common.status.sale') },
  { value: 'trade', label: t('common.status.trade') },
  { value: 'wishlist', label: t('common.status.wishlist') },
])

// Auto-enable makeAllPublic when status is sale or trade
watch(importStatus, (newStatus) => {
  if (newStatus === 'sale' || newStatus === 'trade') {
    makeAllPublic.value = true
  }
})

// Formato del deck
const deckFormat = ref<DeckFormat>('modern')
// Comandante (solo para Commander)
const commanderName = ref('')

const formatOptions = computed(() => [
  { value: 'standard', label: t('common.formats.standard') },
  { value: 'modern', label: t('common.formats.modern') },
  { value: 'commander', label: t('common.formats.commander') },
  { value: 'vintage', label: t('common.formats.vintage') },
  { value: 'custom', label: t('common.formats.custom') },
])

// Mostrar selector de comandante solo si es Commander
const isCommander = computed(() => deckFormat.value === 'commander')

watch(preview, (p) => {
  if (p?.name) deckNameInput.value = p.name
})

const conditionOptions = computed(() => [
  { value: 'M', label: t('common.conditions.M') },
  { value: 'NM', label: t('common.conditions.NM') },
  { value: 'LP', label: t('common.conditions.LP') },
  { value: 'MP', label: t('common.conditions.MP') },
  { value: 'HP', label: t('common.conditions.HP') },
  { value: 'PO', label: t('common.conditions.PO') },
])

const handleParse = async () => {
  if (!inputText.value.trim()) return

  parsing.value = true
  errorMsg.value = ''
  moxfieldDeckData.value = null
  isCsv.value = false
  csvParsedCards.value = []

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

    const cardNames = Object.values(mainboardCards).map((item: any) => item.card?.name || '').filter(Boolean)

    preview.value = {
      total: mainboardCount + sideboardCount + commanderCount,
      mainboard: mainboardCount + commanderCount,
      sideboard: sideboardCount,
      name: deck.name,
      cards: cardNames,
    }
    deckNameInput.value = deck.name || ''

    // Auto-detectar formato Commander
    if (deck.format === 'commander' || deck.format === 'edh') {
      deckFormat.value = 'commander'
      if (Object.keys(commanderCards).length > 0) {
        const firstCommander = Object.values(commanderCards)[0] as any
        commanderName.value = firstCommander?.card?.name || ''
      }
    }
  } else if (isCsvFormat(inputText.value)) {
    // CSV de ManaBox
    isLink.value = false
    isCsv.value = true
    const cards = parseCsvDeckImport(inputText.value)
    csvParsedCards.value = cards

    const totalQty = cards.reduce((sum, c) => sum + c.quantity, 0)
    const cardNames = cards.map(c => c.name)

    preview.value = {
      total: totalQty,
      mainboard: totalQty,
      sideboard: 0,
      cards: cardNames,
    }
  } else {
    // Es texto normal (lista de cartas o export de Moxfield)
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

      const match = /^(\d+)\s+(.+?)(?:\s*\([^)]+\).*)?$/.exec(trimmed)
      const matchQty = match?.[1]
      const matchName = match?.[2]
      if (match && matchQty && matchName) {
        const qty = Number.parseInt(matchQty)
        const name = matchName.trim()
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
  }

  parsing.value = false
}

const handleImport = () => {
  const nameToSend = deckNameInput.value?.trim() || undefined
  const commanderToSend = isCommander.value ? commanderName.value?.trim() || undefined : undefined

  const statusToSend = importStatus.value !== 'collection' ? importStatus.value : undefined

  if (isCsv.value && csvParsedCards.value.length > 0) {
    // Importación desde CSV de ManaBox
    emit('importCsv', csvParsedCards.value, nameToSend, makeAllPublic.value, deckFormat.value, commanderToSend, statusToSend)
  } else if (isLink.value && moxfieldDeckData.value) {
    // Importación directa desde API de Moxfield
    const cards = moxfieldToCardList(moxfieldDeckData.value, includeSideboard.value)
    emit('importDirect', cards, nameToSend, condition.value, makeAllPublic.value, deckFormat.value, commanderToSend, statusToSend)
  } else {
    // Importación desde texto
    emit('import', inputText.value, condition.value, includeSideboard.value, nameToSend, makeAllPublic.value, deckFormat.value, commanderToSend, statusToSend)
  }
}

const handleClose = () => {
  inputText.value = ''
  preview.value = null
  includeSideboard.value = true
  condition.value = 'NM'
  deckNameInput.value = ''
  deckFormat.value = 'modern'
  commanderName.value = ''
  errorMsg.value = ''
  isLink.value = false
  moxfieldDeckData.value = null
  isCsv.value = false
  csvParsedCards.value = []
  importStatus.value = 'collection'
  emit('close')
}

const handleCsvFile = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    inputText.value = (e.target?.result as string) || ''
    preview.value = null
  }
  reader.readAsText(file)
}
</script>

<template>
  <BaseModal :show="show" :title="t('decks.importModal.title')" @close="handleClose">
    <div class="space-y-md">
      <div>
        <label for="import-deck-input" class="text-small text-silver-70 block mb-2">
          {{ t('decks.importModal.inputLabel') }}
        </label>
        <textarea
            id="import-deck-input"
            v-model="inputText"
            placeholder="https://moxfield.com/decks/...&#10;o&#10;3 Arid Mesa (MH2) 244&#10;2 Artist's Talent (BLB) 124&#10;...&#10;o&#10;CSV de ManaBox"
            class="w-full bg-primary border border-silver px-4 py-md text-small text-silver placeholder:text-silver-50 transition-fast focus:outline-none focus:border-2 focus:border-neon font-mono"
            rows="8"
            @input="preview = null"
        />
        <input
            ref="csvFileInput"
            type="file"
            accept=".csv"
            class="hidden"
            @change="handleCsvFile"
        />
        <button
            type="button"
            class="mt-2 text-tiny text-silver-50 hover:text-neon transition-fast underline"
            @click="csvFileInput?.click()"
        >
          {{ t('decks.importModal.csvUpload') }}
        </button>
      </div>

      <BaseButton
          variant="secondary"
          size="small"
          @click="handleParse"
          :disabled="!inputText.trim() || parsing"
          class="w-full"
      >
        {{ parsing ? t('decks.importModal.analyzing') : t('decks.importModal.analyze') }}
      </BaseButton>

      <!-- Instrucciones para Moxfield -->
      <div v-if="errorMsg === 'MOXFIELD_LINK_DETECTED'" class="border border-neon bg-neon/10 p-md space-y-2">
        <p class="text-small text-neon font-bold">{{ t('decks.importModal.moxfieldDetected.title') }}</p>
        <p class="text-small text-silver">{{ t('decks.importModal.moxfieldDetected.instruction') }}</p>
        <ol class="text-small text-silver-70 list-decimal list-inside space-y-1">
          <li>{{ t('decks.importModal.moxfieldDetected.step1') }}</li>
          <li>{{ t('decks.importModal.moxfieldDetected.step2') }}</li>
          <li>{{ t('decks.importModal.moxfieldDetected.step3') }}</li>
          <li>{{ t('decks.importModal.moxfieldDetected.step4') }}</li>
        </ol>
      </div>

      <!-- Error message -->
      <div v-else-if="errorMsg" class="border border-rust bg-rust/10 p-md">
        <p class="text-small text-rust">{{ errorMsg }}</p>
      </div>

      <!-- CSV detected indicator -->
      <div v-if="preview && isCsv" class="border border-neon bg-neon/10 p-md">
        <p class="text-small text-neon font-bold">{{ t('decks.importModal.csvDetected') }}</p>
        <p class="text-small text-silver mt-1">{{ t('decks.importModal.csvCards', { count: csvParsedCards.length }) }}</p>
      </div>

      <div v-if="preview" class="border border-silver-30 p-md space-y-xs">
        <p v-if="preview.name" class="text-body font-bold text-neon mb-3">
          {{ preview.name }}
        </p>
        <p class="text-small text-silver">
          {{ t('decks.importModal.preview.total', { total: preview.total }) }}
        </p>
        <p class="text-small text-silver-70">
          {{ t('decks.importModal.preview.detail', { mainboard: preview.mainboard, sideboard: preview.sideboard }) }}
        </p>
      </div>

      <!-- Condition selector (not shown for CSV — conditions come from CSV) -->
      <div v-if="preview && !isCsv">
        <label for="import-deck-condition" class="text-small text-silver-70 block mb-2">{{ t('decks.importModal.options.conditionLabel') }}</label>
        <BaseSelect
            id="import-deck-condition"
            v-model="condition"
            :options="conditionOptions"
        />
      </div>
      <div v-if="preview && isCsv">
        <p class="text-tiny text-silver-50">{{ t('decks.importModal.csvConditionNote') }}</p>
      </div>

      <div v-if="preview && preview.sideboard > 0">
        <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
          <input
              v-model="includeSideboard"
              type="checkbox"
              class="w-4 h-4"
          />
          <span>{{ t('decks.importModal.options.includeSideboard') }}</span>
        </label>
      </div>

      <!-- Deck name input (optional) -->
      <div v-if="preview">
        <label for="import-deck-name" class="text-small text-silver-70 block mb-2">{{ t('decks.importModal.options.deckNameLabel') }}</label>
        <BaseInput id="import-deck-name" v-model="deckNameInput" :placeholder="t('decks.importModal.options.deckNamePlaceholder')" />
      </div>

      <!-- Formato del deck -->
      <div v-if="preview">
        <label for="import-deck-format" class="text-small text-silver-70 block mb-2">{{ t('decks.importModal.options.formatLabel') }}</label>
        <BaseSelect
            id="import-deck-format"
            v-model="deckFormat"
            :options="formatOptions"
        />
      </div>

      <!-- Import status selector -->
      <div v-if="preview">
        <label for="import-deck-status" class="text-small text-silver-70 block mb-2">{{ t('decks.importModal.options.statusLabel') }}</label>
        <BaseSelect
            id="import-deck-status"
            v-model="importStatus"
            :options="statusOptions"
        />
      </div>

      <!-- Commander (solo si es Commander) -->
      <div v-if="preview && isCommander">
        <label for="import-deck-commander" class="text-small text-silver-70 block mb-2">{{ t('decks.importModal.options.commanderLabel') }}</label>
        <BaseInput
            id="import-deck-commander"
            v-model="commanderName"
            :placeholder="t('decks.importModal.options.commanderPlaceholder')"
            list="commander-suggestions"
        />
        <!-- Sugerencias de cartas del deck -->
        <datalist id="commander-suggestions">
          <option v-for="card in preview.cards" :key="card" :value="card" />
        </datalist>
        <p class="text-tiny text-silver-50 mt-1">
          {{ t('decks.importModal.options.commanderHint') }}
        </p>
      </div>

      <!-- Make all imported cards public? -->
      <div v-if="preview" class="pt-2">
        <label class="flex items-center gap-2 text-small text-silver cursor-pointer">
          <input v-model="makeAllPublic" type="checkbox" class="w-4 h-4" />
          <span>{{ t('decks.importModal.options.makePublic') }}</span>
        </label>
      </div>

      <BaseButton
          v-if="preview"
          @click="handleImport"
          class="w-full"
      >
        {{ t('decks.importModal.submit', { count: includeSideboard ? preview.total : preview.mainboard }) }}
      </BaseButton>
    </div>
  </BaseModal>
</template>