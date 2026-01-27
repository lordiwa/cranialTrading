<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseSelect from '../ui/BaseSelect.vue'
import BaseModal from '../ui/BaseModal.vue'
import type { CreateDeckInput } from '../../types/deck'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  create: [data: CreateDeckInput & { deckList?: string }]
}>()

const form = ref<CreateDeckInput>({
  name: '',
  format: 'custom',
  description: '',
  colors: [],
})

// Lista de cartas para importar (opcional)
const deckList = ref('')

// Preview de la lista
const deckListPreview = computed(() => {
  if (!deckList.value.trim()) return null

  const lines = deckList.value.split('\n').filter(l => l.trim())
  let mainboard = 0
  let sideboard = 0
  let inSideboard = false

  for (const line of lines) {
    const trimmed = line.trim().toLowerCase()
    if (trimmed.includes('sideboard')) {
      inSideboard = true
      continue
    }
    const match = line.match(/^(\d+)/)
    if (match) {
      const qty = Number.parseInt(match[1])
      if (inSideboard) {
        sideboard += qty
      } else {
        mainboard += qty
      }
    }
  }

  return { mainboard, sideboard, total: mainboard + sideboard }
})

const formatOptions = [
  { value: 'vintage', label: 'Vintage' },
  { value: 'modern', label: 'Modern' },
  { value: 'commander', label: 'Commander' },
  { value: 'standard', label: 'Standard' },
  { value: 'custom', label: 'Custom' },
]

const colorOptions = [
  { value: 'W', label: '⚪ Blanco' },
  { value: 'U', label: '🔵 Azul' },
  { value: 'B', label: '⚫ Negro' },
  { value: 'R', label: '🔴 Rojo' },
  { value: 'G', label: '🟢 Verde' },
]

const toggleColor = (color: string) => {
  const idx = form.value.colors.indexOf(color)
  if (idx >= 0) {
    form.value.colors.splice(idx, 1)
  } else {
    form.value.colors.push(color)
  }
}

const handleCreate = () => {
  if (!form.value.name.trim()) {
    alert('El nombre del mazo es requerido')
    return
  }
  emit('create', {
    ...form.value,
    deckList: deckList.value.trim() || undefined
  })
  resetForm()
}

const resetForm = () => {
  form.value = {
    name: '',
    format: 'custom',
    description: '',
    colors: [],
  }
  deckList.value = ''
}

watch(() => props.show, (show) => {
  if (!show) {
    resetForm()
  }
})
</script>

<template>
  <BaseModal :show="show" @close="emit('close')">
    <div class="space-y-6">
      <!-- Title -->
      <div>
        <h2 class="text-h2 font-bold text-silver mb-1">CREAR NUEVO MAZO</h2>
        <p class="text-small text-silver-70">Define los detalles básicos de tu mazo</p>
      </div>

      <!-- Form -->
      <div class="space-y-4">
        <!-- Name -->
        <div>
          <label class="text-small text-silver-70 block mb-2">Nombre del Mazo *</label>
          <BaseInput
              v-model="form.name"
              placeholder="Ej: RDW Modern"
              type="text"
              @keydown.enter="handleCreate"
          />
        </div>

        <!-- Format -->
        <div>
          <label class="text-small text-silver-70 block mb-2">Formato</label>
          <BaseSelect
              v-model="form.format"
              :options="formatOptions"
          />
        </div>

        <!-- Description -->
        <div>
          <label class="text-small text-silver-70 block mb-2">Descripción</label>
          <textarea
              v-model="form.description"
              placeholder="Describe tu estrategia, meta, notas..."
              class="w-full px-4 py-3 bg-secondary border border-silver-30 text-silver placeholder:text-silver-50 font-mono text-small focus:outline-none focus:border-neon transition-150 resize-none h-20"
          />
        </div>

        <!-- Deck List (opcional) -->
        <div>
          <label class="text-small text-silver-70 block mb-2">
            Lista de cartas (opcional)
          </label>
          <textarea
              v-model="deckList"
              placeholder="Pega tu lista aquí:&#10;4 Lightning Bolt&#10;4 Monastery Swiftspear&#10;SIDEBOARD:&#10;2 Blood Moon"
              class="w-full px-4 py-3 bg-secondary border border-silver-30 text-silver placeholder:text-silver-50 font-mono text-tiny focus:outline-none focus:border-neon transition-150 resize-none h-32"
          />
          <!-- Preview -->
          <div v-if="deckListPreview" class="mt-2 p-2 border border-silver-30 bg-primary">
            <p class="text-tiny text-neon font-bold">
              {{ deckListPreview.total }} cartas detectadas
            </p>
            <p class="text-tiny text-silver-70">
              Mainboard: {{ deckListPreview.mainboard }} | Sideboard: {{ deckListPreview.sideboard }}
            </p>
          </div>
        </div>

        <!-- Colors -->
        <div>
          <label class="text-small text-silver-70 block mb-2">Colores</label>
          <div class="flex flex-wrap gap-2">
            <button
                v-for="color in colorOptions"
                :key="color.value"
                @click="toggleColor(color.value)"
                :class="[
                  'px-3 py-2 border-2 text-small font-bold transition-150',
                  form.colors.includes(color.value)
                    ? 'bg-neon-10 border-neon text-neon'
                    : 'border-silver-30 text-silver-70 hover:border-neon'
                ]"
            >
              {{ color.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-3 pt-4">
        <BaseButton
            class="flex-1"
            @click="handleCreate"
        >
          CREAR MAZO
        </BaseButton>
        <BaseButton
            variant="secondary"
            class="flex-1"
            @click="emit('close')"
        >
          CANCELAR
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>