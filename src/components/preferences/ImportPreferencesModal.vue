<!-- src/components/preferences/ImportPreferencesModal.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '../../composables/useI18n'
import BaseModal from '../ui/BaseModal.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import { type CardCondition } from '../../types/card'
import { extractDeckId, fetchMoxfieldDeck, moxfieldToCardList } from '../../services/moxfield'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  import: [deckText: string, condition: CardCondition, includeSideboard: boolean]
  importDirect: [cards: any[], condition: CardCondition]
}>()

const { t } = useI18n()

const inputText = ref('')
const condition = ref<CardCondition>('NM')
const includeSideboard = ref(false)
const parsing = ref(false)
const preview = ref<{ total: number; mainboard: number; sideboard: number; name?: string } | null>(null)
const errorMsg = ref('')
const isLink = ref(false)
const moxfieldDeckData = ref<any>(null)

const conditionOptions = computed(() => [
  { value: 'M', label: t('common.conditions.M') },
  { value: 'NM', label: t('common.conditions.NM') },
  { value: 'LP', label: t('common.conditions.LP') },
  { value: 'MP', label: t('common.conditions.MP') },
  { value: 'HP', label: t('common.conditions.HP') },
  { value: 'PO', label: t('common.conditions.PO') },
])

const parseMoxfieldPreferences = async (deckId: string): Promise<{ total: number; mainboard: number; sideboard: number; name?: string } | null> => {
  const result = await fetchMoxfieldDeck(deckId)
  if (!result.data) {
    errorMsg.value = result.error || 'Error desconocido'
    return null
  }
  const deck = result.data
  moxfieldDeckData.value = deck
  const mainboardCards = deck.boards?.mainboard?.cards || {}
  const sideboardCards = deck.boards?.sideboard?.cards || {}
  const commanderCards = deck.boards?.commanders?.cards || {}
  const mainboardCount = Object.values(mainboardCards).reduce((sum: number, item: any) => sum + item.quantity, 0)
  const sideboardCount = Object.values(sideboardCards).reduce((sum: number, item: any) => sum + item.quantity, 0)
  const commanderCount = Object.values(commanderCards).reduce((sum: number, item: any) => sum + item.quantity, 0)
  return { total: mainboardCount + sideboardCount + commanderCount, mainboard: mainboardCount + commanderCount, sideboard: sideboardCount, name: deck.name }
}

const parseTextPreferences = (text: string): { total: number; mainboard: number; sideboard: number } => {
  const lines = text.split('\n')
  let mainboard = 0
  let sideboard = 0
  let inSideboard = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === 'SIDEBOARD:') { inSideboard = true; continue }
    const match = /^(\d+)\s+/.exec(trimmed)
    const matchQty = match?.[1]
    if (match && matchQty) {
      const qty = Number.parseInt(matchQty)
      if (inSideboard) sideboard += qty
      else mainboard += qty
    }
  }
  return { total: mainboard + sideboard, mainboard, sideboard }
}

const handleParse = async () => {
  if (!inputText.value.trim()) return

  parsing.value = true
  errorMsg.value = ''
  moxfieldDeckData.value = null

  const deckId = extractDeckId(inputText.value)

  if (deckId) {
    isLink.value = true
    const result = await parseMoxfieldPreferences(deckId)
    if (!result) { parsing.value = false; return }
    preview.value = result
  } else {
    isLink.value = false
    preview.value = parseTextPreferences(inputText.value)
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
  <BaseModal :show="show" :title="t('preferences.importModal.title')" @close="handleClose">
    <div class="space-y-md">
      <div>
        <label for="import-pref-input" class="text-small text-silver-70 block mb-2">
          {{ t('preferences.importModal.inputLabel') }}
        </label>
        <textarea
            id="import-pref-input"
            v-model="inputText"
            :placeholder="t('preferences.importModal.placeholder')"
            class="w-full bg-primary border border-silver px-4 py-md text-small text-silver placeholder:text-silver-50 transition-fast focus:outline-none focus:border-2 focus:border-neon font-sans"
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
        {{ parsing ? t('preferences.importModal.analyzing') : t('preferences.importModal.analyze') }}
      </BaseButton>

      <!-- Instrucciones para Moxfield -->
      <div v-if="errorMsg === 'MOXFIELD_LINK_DETECTED'" class="border border-neon bg-neon/10 p-md space-y-2">
        <p class="text-small text-neon font-bold">{{ t('preferences.importModal.moxfieldDetected.title') }}</p>
        <p class="text-small text-silver">{{ t('preferences.importModal.moxfieldDetected.instruction') }}</p>
        <ol class="text-small text-silver-70 list-decimal list-inside space-y-1">
          <li>{{ t('preferences.importModal.moxfieldDetected.step1') }}</li>
          <li>{{ t('preferences.importModal.moxfieldDetected.step2') }}</li>
          <li>{{ t('preferences.importModal.moxfieldDetected.step3') }}</li>
          <li>{{ t('preferences.importModal.moxfieldDetected.step4') }}</li>
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
          <span class="font-bold">{{ t('preferences.importModal.total') }}:</span> {{ preview.total }} {{ t('preferences.importModal.cards') }}
        </p>
        <p class="text-small text-silver-70">
          {{ t('preferences.importModal.mainboard') }}: {{ preview.mainboard }} | {{ t('preferences.importModal.sideboard') }}: {{ preview.sideboard }}
        </p>
      </div>

      <div v-if="preview">
        <label for="import-pref-condition" class="text-small text-silver-70 block mb-2">{{ t('preferences.importModal.minCondition') }}</label>
        <BaseSelect
            id="import-pref-condition"
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
          <span>{{ t('preferences.importModal.includeSideboard') }}</span>
        </label>
      </div>

      <div v-if="preview" class="bg-primary-dark border border-silver-30 p-sm">
        <p class="text-tiny text-silver-70">
          {{ t('preferences.importModal.infoMessage', { count: includeSideboard ? preview.total : preview.mainboard }) }}
        </p>
      </div>

      <BaseButton
          v-if="preview"
          @click="handleImport"
          class="w-full"
      >
        {{ t('preferences.importModal.importButton', { count: includeSideboard ? preview.total : preview.mainboard }) }}
      </BaseButton>
    </div>
  </BaseModal>
</template>