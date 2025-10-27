<script setup lang="ts">
import { ref } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseLoader from '../ui/BaseLoader.vue'
import { CardCondition } from '../../types/card'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  import: [deckText: string, condition: CardCondition, includeSideboard: boolean]
}>()

const deckText = ref('')
const condition = ref<CardCondition>('NM')
const includeSideboard = ref(false)
const parsing = ref(false)
const preview = ref<{ total: number; mainboard: number; sideboard: number } | null>(null)

const conditionOptions = [
  { value: 'M', label: 'M - Mint' },
  { value: 'NM', label: 'NM - Near Mint' },
  { value: 'LP', label: 'LP - Light Play' },
  { value: 'MP', label: 'MP - Moderate Play' },
  { value: 'HP', label: 'HP - Heavy Play' },
  { value: 'PO', label: 'PO - Poor' },
]

const handleParse = () => {
  if (!deckText.value.trim()) return

  parsing.value = true

  // Simple parse para preview
  const lines = deckText.value.split('\n')
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

  parsing.value = false
}

const handleImport = () => {
  emit('import', deckText.value, condition.value, includeSideboard.value)
}

const handleClose = () => {
  deckText.value = ''
  preview.value = null
  includeSideboard.value = false
  condition.value = 'NM'
  emit('close')
}
</script>

<template>
  <BaseModal :show="show" title="IMPORTAR MAZO" @close="handleClose">
    <div class="space-y-4">
      <div>
        <label class="text-small text-silver-70 block mb-2">
          Pega tu lista desde Moxfield
        </label>
        <textarea
            v-model="deckText"
            placeholder="3 Arid Mesa (MH2) 244&#10;2 Artist's Talent (BLB) 124&#10;..."
            class="w-full bg-primary border border-silver px-4 py-3 text-small text-silver placeholder:text-silver-50 transition-fast focus:outline-none focus:border-2 focus:border-neon font-mono"
            rows="10"
            @input="preview = null"
        />
      </div>

      <BaseButton
          variant="secondary"
          size="small"
          @click="handleParse"
          :disabled="!deckText.trim() || parsing"
          class="w-full"
      >
        {{ parsing ? 'ANALIZANDO...' : 'ANALIZAR' }}
      </BaseButton>

      <div v-if="preview" class="border border-silver-30 p-4 space-y-2">
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