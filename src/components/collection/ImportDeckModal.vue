<!-- src/components/collection/ImportDeckModal.vue -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseButton from '../ui/BaseButton.vue'
import IconV2 from '../ui/IconV2.vue'
import { useI18n } from '../../composables/useI18n'
import { type CardCondition, type CardStatus } from '../../types/card'
import { type DeckFormat } from '../../types/deck'
import { extractDeckId, fetchMoxfieldDeck, type MoxfieldCard, type MoxfieldDeck, moxfieldToCardList } from '../../services/moxfield'
import { isCsvFormat, isUrzasGathererCsv, parseCsvDeckImport, type ParsedCsvCard, parseUrzasGathererCsv } from '../../utils/cardHelpers'

const props = withDefaults(defineProps<{
  show: boolean
  isBinder?: boolean
  defaultStatus?: CardStatus
}>(), {
  isBinder: false,
  defaultStatus: 'collection',
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'import', opts: { deckText: string, condition: CardCondition, includeSideboard: boolean, deckName?: string, makePublic?: boolean, format?: DeckFormat, commander?: string, status?: CardStatus }): void
  (e: 'importDirect', cards: ReturnType<typeof moxfieldToCardList>, deckName: string | undefined, condition: CardCondition, makePublic?: boolean, format?: DeckFormat, commander?: string, status?: CardStatus): void
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
const moxfieldDeckData = ref<MoxfieldDeck | null>(null)
const isCsv = ref(false)
const csvIsUG = ref(false)
const csvParsedCards = ref<ParsedCsvCard[]>([])
const csvFileInput = ref<HTMLInputElement | null>(null)

// NEW: deck name input (optional). Prefill with preview.name when available
const deckNameInput = ref('')
// option to make all imported cards public
const makeAllPublic = ref(false)

// Import status
const importStatus = ref<CardStatus>(props.defaultStatus)

const statusOptions = computed(() => [
  { value: 'collection', label: t('common.status.collection') },
  { value: 'sale', label: t('common.status.sale') },
  { value: 'trade', label: t('common.status.trade') },
  { value: 'wishlist', label: t('common.status.wishlist') },
])

// Reset importStatus to defaultStatus when modal opens
watch(() => props.show, (visible) => {
  if (visible) {
    importStatus.value = props.defaultStatus
  }
})

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

interface ParsePreview { total: number; mainboard: number; sideboard: number; name?: string; cards?: string[] }

const parseMoxfieldInput = async (deckId: string): Promise<ParsePreview | null> => {
  const result = await fetchMoxfieldDeck(deckId)
  if (!result.data) {
    errorMsg.value = result.error ?? t('decks.importModal.errorUnknown')
    return null
  }
  const deck = result.data
  moxfieldDeckData.value = deck
  const mainboardCards = deck.boards?.mainboard?.cards ?? {}
  const sideboardCards = deck.boards?.sideboard?.cards ?? {}
  const commanderCards = deck.boards?.commanders?.cards ?? {}
  const mainboardCount = Object.values(mainboardCards).reduce((sum: number, item: MoxfieldCard) => sum + item.quantity, 0)
  const sideboardCount = Object.values(sideboardCards).reduce((sum: number, item: MoxfieldCard) => sum + item.quantity, 0)
  const commanderCount = Object.values(commanderCards).reduce((sum: number, item: MoxfieldCard) => sum + item.quantity, 0)
  const cardNames = Object.values(mainboardCards).map((item: MoxfieldCard) => item.card?.name ?? '').filter(Boolean)
  deckNameInput.value = deck.name ?? ''
  if (deck.format === 'commander' || deck.format === 'edh') {
    deckFormat.value = 'commander'
    if (Object.keys(commanderCards).length > 0) {
      const firstCommander = Object.values(commanderCards)[0] as MoxfieldCard | undefined
      commanderName.value = firstCommander?.card?.name ?? ''
    }
  }
  return { total: mainboardCount + sideboardCount + commanderCount, mainboard: mainboardCount + commanderCount, sideboard: sideboardCount, name: deck.name, cards: cardNames }
}

const parseCsvInput = (text: string): ParsePreview => {
  const isUG = isUrzasGathererCsv(text)
  const cards = isUG ? parseUrzasGathererCsv(text) : parseCsvDeckImport(text)
  csvIsUG.value = isUG
  csvParsedCards.value = cards
  const totalQty = cards.reduce((sum, c) => sum + c.quantity, 0)
  return { total: totalQty, mainboard: totalQty, sideboard: 0, cards: cards.map(c => c.name) }
}

const parsePlainTextInput = (text: string): ParsePreview => {
  const lines = text.split('\n')
  let mainboard = 0
  let sideboard = 0
  let inSideboard = false
  const cardNames: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === 'SIDEBOARD:') { inSideboard = true; continue }
    // eslint-disable-next-line security/detect-unsafe-regex
    const match = /^(\d+)\s+(.+?)(?:\s*\([^)]+\).*)?$/.exec(trimmed)
    const matchQty = match?.[1]
    const matchName = match?.[2]
    if (match && matchQty && matchName) {
      const qty = Number.parseInt(matchQty, 10)
      if (!inSideboard) cardNames.push(matchName.trim())
      if (inSideboard) sideboard += qty
      else mainboard += qty
    }
  }
  return { total: mainboard + sideboard, mainboard, sideboard, cards: cardNames }
}

const handleParse = async () => {
  if (!inputText.value.trim()) return

  parsing.value = true
  errorMsg.value = ''
  moxfieldDeckData.value = null
  isCsv.value = false
  csvParsedCards.value = []

  const deckId = extractDeckId(inputText.value)

  if (deckId) {
    isLink.value = true
    const result = await parseMoxfieldInput(deckId)
    if (!result) { parsing.value = false; return }
    preview.value = result
  } else if (isCsvFormat(inputText.value)) {
    isLink.value = false
    isCsv.value = true
    preview.value = parseCsvInput(inputText.value)
  } else {
    isLink.value = false
    preview.value = parsePlainTextInput(inputText.value)
  }

  parsing.value = false
}

const handleImport = () => {
  const nameToSend = deckNameInput.value?.trim() || undefined
  const commanderToSend = isCommander.value ? commanderName.value?.trim() || undefined : undefined

  const statusToSend = importStatus.value === 'collection' ? undefined : importStatus.value

  if (isCsv.value && csvParsedCards.value.length > 0) {
    // Importación desde CSV (ManaBox / Moxfield)
    emit('importCsv', csvParsedCards.value, nameToSend, makeAllPublic.value, deckFormat.value, commanderToSend, statusToSend)
  } else if (isLink.value && moxfieldDeckData.value) {
    // Importación directa desde API de Moxfield
    const cards = moxfieldToCardList(moxfieldDeckData.value, includeSideboard.value)
    emit('importDirect', cards, nameToSend, condition.value, makeAllPublic.value, deckFormat.value, commanderToSend, statusToSend)
  } else {
    // Importación desde texto
    emit('import', { deckText: inputText.value, condition: condition.value, includeSideboard: includeSideboard.value, deckName: nameToSend, makePublic: makeAllPublic.value, format: deckFormat.value, commander: commanderToSend, status: statusToSend })
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
  csvIsUG.value = false
  csvParsedCards.value = []
  importStatus.value = props.defaultStatus
  emit('close')
}

const handleCsvFile = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  inputText.value = await file.text()
  preview.value = null
}
</script>

<template>
  <BaseModal :show="show" :close-on-click-outside="false" :aria-label="isBinder ? t('binders.importModal.title') : t('decks.importModal.title')" @close="handleClose">
    <div class="space-y-md">
      <div>
        <h2 class="font-display text-h2 font-bold text-silver tracking-[-0.01em] mb-1">{{ isBinder ? t('binders.importModal.title') : t('decks.importModal.title') }}</h2>
      </div>

      <!-- Dropzone (click-to-browse; matches proto's visual treatment) -->
      <input
          ref="csvFileInput"
          type="file"
          accept=".csv"
          :aria-label="t('decks.importModal.csvUpload')"
          class="hidden"
          @change="handleCsvFile"
      />
      <button
          type="button"
          class="w-full flex flex-col items-center gap-2.5 text-center px-6 py-7 bg-surface-1 border border-dashed border-line-strong rounded-lg transition-all duration-200 ease-v2 hover:border-neon-40 hover:bg-neon-10"
          @click="csvFileInput?.click()"
      >
        <IconV2 name="import" :size="36" class="text-silver-30" />
        <span class="text-small font-semibold text-silver">
          <span class="text-neon font-bold">{{ t('decks.importModal.csvUpload') }}</span>
        </span>
        <span class="flex flex-wrap gap-1.5 justify-center mt-0.5">
          <span class="text-[11px] font-semibold text-silver-50 bg-surface-2 border border-line rounded-full px-2.5 py-1">Moxfield</span>
          <span class="text-[11px] font-semibold text-silver-50 bg-surface-2 border border-line rounded-full px-2.5 py-1">ManaBox</span>
          <span class="text-[11px] font-semibold text-silver-50 bg-surface-2 border border-line rounded-full px-2.5 py-1">Urza's Gatherer</span>
          <span class="text-[11px] font-semibold text-silver-50 bg-surface-2 border border-line rounded-full px-2.5 py-1">CSV</span>
        </span>
      </button>

      <div class="flex items-center gap-3 text-silver-30 text-[12px] uppercase tracking-[.12em]">
        <span class="flex-1 h-px bg-line"></span>
        {{ t('decks.importModal.pasteDivider') }}
        <span class="flex-1 h-px bg-line"></span>
      </div>

      <div>
        <label for="import-deck-input" class="text-small font-semibold text-silver-70 block mb-1.5">{{ isBinder ? t('binders.importModal.inputLabel') : t('decks.importModal.inputLabel') }}</label>
        <textarea
            id="import-deck-input"
            v-model="inputText"
            placeholder="https://moxfield.com/decks/...&#10;o&#10;3 Arid Mesa (MH2) 244&#10;2 Artist's Talent (BLB) 124&#10;...&#10;o&#10;CSV (ManaBox / Moxfield / Urza's Gatherer)"
            class="w-full bg-surface-1 border border-line rounded-md px-3.5 py-3 text-small text-silver placeholder:text-silver-30 transition-all duration-200 ease-v2 focus:outline-none focus:border-neon focus:shadow-glow-neon"
            rows="4"
            @input="preview = null; deckNameInput = ''"
        />
      </div>

      <div class="flex items-center justify-between gap-3">
        <span class="text-tiny text-silver-50">{{ t('decks.importModal.autoDetectHint') }}</span>
        <BaseButton
            variant="primary"
            @click="handleParse"
            :disabled="!inputText.trim() || parsing"
            class="uppercase tracking-[.1em] !text-[12px] gap-2 flex-shrink-0"
        >
          <IconV2 v-if="!parsing" name="search" :size="16" />
          {{ parsing ? t('decks.importModal.analyzing') : t('decks.importModal.analyze') }}
        </BaseButton>
      </div>

      <!-- Instrucciones para Moxfield -->
      <div v-if="errorMsg === 'MOXFIELD_LINK_DETECTED'" class="bg-neon-10 border border-neon-40 rounded-lg p-md space-y-2">
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
      <div v-else-if="errorMsg" role="alert" class="border border-rust bg-rust-10 rounded-lg p-md">
        <p class="text-small text-rust">{{ errorMsg }}</p>
      </div>

      <!-- CSV detected indicator -->
      <div v-if="preview && isCsv" class="flex items-center gap-2 bg-neon-10 border border-neon-40 rounded-md px-3.5 py-2.5 text-neon font-bold text-small">
        <IconV2 name="check" :size="18" />
        <span>{{ csvIsUG ? t('decks.importModal.csvDetectedUG') : t('decks.importModal.csvDetected') }}</span>
        <span class="text-silver font-normal ml-auto">{{ t('decks.importModal.csvCards', { count: csvParsedCards.length }) }}</span>
      </div>

      <div v-if="preview" aria-live="polite" class="flex items-center justify-between gap-3 bg-surface-2 border border-line rounded-lg px-4 py-3.5">
        <div class="min-w-0">
          <p v-if="preview.name" class="font-display font-bold text-neon truncate">{{ preview.name }}</p>
          <p class="text-tiny text-silver-50 mt-0.5">
            {{ t('decks.importModal.preview.detail', { mainboard: preview.mainboard, sideboard: preview.sideboard }) }}
          </p>
        </div>
        <div class="text-right flex-shrink-0">
          <div class="font-display font-tnum text-neon text-[20px] font-bold leading-none">{{ preview.total }}</div>
          <div class="text-[11px] uppercase tracking-[.08em] text-silver-30 font-semibold mt-1">{{ t('decks.importModal.preview.cardsLabel') }}</div>
        </div>
      </div>

      <!-- Condition selector (not shown for CSV — conditions come from CSV) -->
      <div v-if="preview && !isCsv">
        <label for="import-deck-condition" class="text-small font-semibold text-silver-70 block mb-1.5">{{ t('decks.importModal.options.conditionLabel') }}</label>
        <div class="relative">
          <select
              id="import-deck-condition"
              v-model="condition"
              class="w-full appearance-none px-3.5 py-2.5 pr-8 bg-surface-1 border border-line text-silver text-small rounded-md cursor-pointer transition-all duration-200 ease-v2 hover:border-line-strong focus:outline-none focus:border-neon focus:shadow-glow-neon"
          >
            <option v-for="opt in conditionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
          <IconV2 name="chev-d" :size="14" class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-silver-50" />
        </div>
      </div>
      <div v-if="preview && isCsv">
        <p class="text-tiny text-silver-50">{{ t('decks.importModal.csvConditionNote') }}</p>
      </div>

      <button
          v-if="preview && preview.sideboard > 0"
          type="button"
          role="switch"
          :aria-checked="includeSideboard"
          class="w-full flex items-center justify-between gap-3.5 min-h-[46px] px-3.5 bg-surface-1 border border-line rounded-md"
          @click="includeSideboard = !includeSideboard"
      >
        <span class="text-[14px] font-semibold text-silver">{{ t('decks.importModal.options.includeSideboard') }}</span>
        <span
            class="relative w-[44px] h-[26px] rounded-full border flex-shrink-0 transition-colors duration-200 ease-v2"
            :class="includeSideboard ? 'bg-neon border-neon' : 'bg-surface-3 border-line'"
        >
          <span
              class="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200 ease-v2"
              :class="includeSideboard ? 'right-0.5' : 'left-0.5'"
          ></span>
        </span>
      </button>

      <!-- Deck/Binder name input (optional) -->
      <div v-if="preview">
        <label for="import-deck-name" class="text-small font-semibold text-silver-70 block mb-1.5">{{ isBinder ? t('binders.importModal.binderNameLabel') : t('decks.importModal.options.deckNameLabel') }}</label>
        <input
            id="import-deck-name"
            v-model="deckNameInput"
            type="text"
            :placeholder="isBinder ? t('binders.importModal.binderNamePlaceholder') : t('decks.importModal.options.deckNamePlaceholder')"
            class="w-full min-h-[44px] px-3.5 bg-surface-1 border border-line rounded-md text-silver text-small placeholder:text-silver-30 transition-all duration-200 ease-v2 focus:outline-none focus:border-neon focus:shadow-glow-neon"
        />
      </div>

      <!-- Formato del deck (hidden for binders) -->
      <div v-if="preview && !isBinder">
        <label for="import-deck-format" class="text-small font-semibold text-silver-70 block mb-1.5">{{ t('decks.importModal.options.formatLabel') }}</label>
        <div class="relative">
          <select
              id="import-deck-format"
              v-model="deckFormat"
              class="w-full appearance-none px-3.5 py-2.5 pr-8 bg-surface-1 border border-line text-silver text-small rounded-md cursor-pointer transition-all duration-200 ease-v2 hover:border-line-strong focus:outline-none focus:border-neon focus:shadow-glow-neon"
          >
            <option v-for="opt in formatOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
          <IconV2 name="chev-d" :size="14" class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-silver-50" />
        </div>
      </div>

      <!-- Import status selector -->
      <div v-if="preview">
        <label for="import-deck-status" class="text-small font-semibold text-silver-70 block mb-1.5">{{ t('decks.importModal.options.statusLabel') }}</label>
        <div class="relative">
          <select
              id="import-deck-status"
              v-model="importStatus"
              class="w-full appearance-none px-3.5 py-2.5 pr-8 bg-surface-1 border border-line text-silver text-small rounded-md cursor-pointer transition-all duration-200 ease-v2 hover:border-line-strong focus:outline-none focus:border-neon focus:shadow-glow-neon"
          >
            <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
          <IconV2 name="chev-d" :size="14" class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-silver-50" />
        </div>
      </div>

      <!-- Commander (solo si es Commander, hidden for binders) -->
      <div v-if="preview && isCommander && !isBinder">
        <label for="import-deck-commander" class="text-small font-semibold text-silver-70 block mb-1.5">{{ t('decks.importModal.options.commanderLabel') }}</label>
        <input
            id="import-deck-commander"
            v-model="commanderName"
            type="text"
            :placeholder="t('decks.importModal.options.commanderPlaceholder')"
            list="commander-suggestions"
            class="w-full min-h-[44px] px-3.5 bg-surface-1 border border-line rounded-md text-silver text-small placeholder:text-silver-30 transition-all duration-200 ease-v2 focus:outline-none focus:border-neon focus:shadow-glow-neon"
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
      <button
          v-if="preview"
          type="button"
          role="switch"
          :aria-checked="makeAllPublic"
          class="w-full flex items-center justify-between gap-3.5 min-h-[46px] px-3.5 bg-surface-1 border border-line rounded-md"
          @click="makeAllPublic = !makeAllPublic"
      >
        <span class="text-[14px] font-semibold text-silver">{{ t('decks.importModal.options.makePublic') }}</span>
        <span
            class="relative w-[44px] h-[26px] rounded-full border flex-shrink-0 transition-colors duration-200 ease-v2"
            :class="makeAllPublic ? 'bg-neon border-neon' : 'bg-surface-3 border-line'"
        >
          <span
              class="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200 ease-v2"
              :class="makeAllPublic ? 'right-0.5' : 'left-0.5'"
          ></span>
        </span>
      </button>

      <div v-if="preview" class="flex gap-2 justify-end pt-2 border-t border-line">
        <BaseButton variant="secondary" class="uppercase tracking-[.1em] !text-[12px]" @click="handleClose">
          {{ t('common.actions.cancel') }}
        </BaseButton>
        <BaseButton
            variant="filled"
            class="flex-1 uppercase tracking-[.1em] !text-[12px] gap-2"
            @click="handleImport"
        >
          <IconV2 name="import" :size="16" />
          {{ t('decks.importModal.submit', { count: includeSideboard ? preview.total : preview.mainboard }) }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>