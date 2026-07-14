<script setup lang="ts">
import { ref, watch } from 'vue'
import { useToastStore } from '../../stores/toast'
import { useI18n } from '../../composables/useI18n'
import BaseButton from '../ui/BaseButton.vue'
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

const loading = ref(false)
const setLoading = (v: boolean) => { loading.value = v }
defineExpose({ setLoading })

const handleCreate = () => {
  if (!form.value.name.trim()) {
    toastStore.show(t('decks.createModal.validation.nameRequired'), 'error')
    return
  }
  emit('create', { ...form.value })
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
    <div class="space-y-5">
      <!-- Title -->
      <div>
        <h2 class="font-display text-h2 font-bold text-silver tracking-[-0.01em]">{{ t('binders.create.title') }}</h2>
        <p class="text-small text-silver-70 mt-1">{{ t('binders.create.subtitle') }}</p>
      </div>

      <!-- Form -->
      <div class="space-y-5">
        <!-- Name -->
        <div>
          <label for="create-binder-name" class="text-small font-semibold text-silver-70 block mb-1.5">{{ t('binders.create.name') }}</label>
          <input
              id="create-binder-name"
              v-model="form.name"
              type="text"
              :placeholder="t('binders.create.namePlaceholder')"
              class="w-full min-h-[44px] px-3.5 bg-surface-1 border border-line rounded-md text-silver placeholder:text-silver-30 text-small focus:outline-none focus:border-neon focus:shadow-glow-neon transition-all duration-200 ease-v2"
              @keydown.enter="handleCreate"
          />
        </div>

        <!-- Description -->
        <div>
          <label for="create-binder-description" class="text-small font-semibold text-silver-70 block mb-1.5">{{ t('binders.create.description') }}</label>
          <textarea
              id="create-binder-description"
              v-model="form.description"
              :placeholder="t('binders.create.descPlaceholder')"
              rows="2"
              class="w-full px-3.5 py-2.5 bg-surface-1 border border-line rounded-md text-silver placeholder:text-silver-30 font-sans text-small focus:outline-none focus:border-neon focus:shadow-glow-neon transition-all duration-200 ease-v2 resize-none"
          />
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-2 justify-end pt-4 border-t border-line">
        <BaseButton
            variant="secondary"
            class="uppercase tracking-[.1em] !text-[12px]"
            :disabled="loading"
            @click="emit('close')"
        >
          {{ t('binders.create.cancel') }}
        </BaseButton>
        <BaseButton
            variant="filled"
            class="uppercase tracking-[.1em] !text-[12px]"
            :disabled="loading"
            @click="handleCreate"
        >
          {{ loading ? '...' : t('binders.create.submit') }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>
