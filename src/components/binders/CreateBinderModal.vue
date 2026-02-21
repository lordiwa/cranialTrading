<script setup lang="ts">
import { ref, watch } from 'vue'
import { useToastStore } from '../../stores/toast'
import { useI18n } from '../../composables/useI18n'
import BaseButton from '../ui/BaseButton.vue'
import BaseInput from '../ui/BaseInput.vue'
import BaseModal from '../ui/BaseModal.vue'
import type { CreateBinderInput } from '../../types/binder'

const props = defineProps<{
  show: boolean
}>()
const emit = defineEmits<{
  close: []
  create: [data: CreateBinderInput]
}>()
const toastStore = useToastStore()
const { t } = useI18n()

const form = ref<CreateBinderInput>({
  name: '',
  description: '',
})

const handleCreate = () => {
  if (!form.value.name.trim()) {
    toastStore.show(t('decks.createModal.validation.nameRequired'), 'error')
    return
  }
  emit('create', { ...form.value })
  resetForm()
}

const resetForm = () => {
  form.value = {
    name: '',
    description: '',
  }
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
        <h2 class="text-h2 font-bold text-silver mb-1">{{ t('binders.create.title') }}</h2>
        <p class="text-small text-silver-70">{{ t('binders.create.subtitle') }}</p>
      </div>

      <!-- Form -->
      <div class="space-y-4">
        <!-- Name -->
        <div>
          <label for="create-binder-name" class="text-small text-silver-70 block mb-2">{{ t('binders.create.name') }}</label>
          <BaseInput
              id="create-binder-name"
              v-model="form.name"
              :placeholder="t('binders.create.namePlaceholder')"
              type="text"
              @keydown.enter="handleCreate"
          />
        </div>

        <!-- Description -->
        <div>
          <label for="create-binder-description" class="text-small text-silver-70 block mb-2">{{ t('binders.create.description') }}</label>
          <textarea
              id="create-binder-description"
              v-model="form.description"
              :placeholder="t('binders.create.descPlaceholder')"
              class="w-full px-4 py-3 bg-secondary border border-silver-30 text-silver placeholder:text-silver-50 font-mono text-small focus:outline-none focus:border-neon transition-150 resize-none h-20"
          />
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-3 pt-4">
        <BaseButton
            class="flex-1"
            @click="handleCreate"
        >
          {{ t('binders.create.submit') }}
        </BaseButton>
        <BaseButton
            variant="secondary"
            class="flex-1"
            @click="emit('close')"
        >
          {{ t('binders.create.cancel') }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>
