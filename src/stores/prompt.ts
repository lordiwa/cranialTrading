import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface PromptOptions {
  title?: string
  message: string
  inputLabel?: string
  defaultValue?: number
  min?: number
  max?: number
  confirmText?: string
  cancelText?: string
}

interface PromptState {
  title: string
  message: string
  inputLabel: string
  defaultValue: number
  min: number
  max: number
  confirmText: string
  cancelText: string
}

export const usePromptStore = defineStore('prompt', () => {
  const isOpen = ref(false)
  const key = ref(0)
  const inputValue = ref(1)
  const options = ref<PromptState>({
    title: '',
    message: '',
    inputLabel: '',
    defaultValue: 1,
    min: 1,
    max: 99,
    confirmText: 'ACEPTAR',
    cancelText: 'CANCELAR',
  })

  let resolvePromise: ((value: number | null) => void) | null = null
  // outer null = no action yet, { value: null } = cancelled, { value: N } = confirmed
  const pendingResult = ref<{ value: number | null } | null>(null)

  const show = (opts: PromptOptions): Promise<number | null> => {
    const min = opts.min ?? 1
    const max = opts.max ?? 99
    const defaultVal = opts.defaultValue ?? min

    options.value = {
      title: opts.title ?? '',
      message: opts.message,
      inputLabel: opts.inputLabel ?? '',
      defaultValue: defaultVal,
      min,
      max,
      confirmText: opts.confirmText ?? 'ACEPTAR',
      cancelText: opts.cancelText ?? 'CANCELAR',
    }
    inputValue.value = defaultVal
    key.value++
    isOpen.value = true

    return new Promise((resolve) => {
      resolvePromise = resolve
    })
  }

  const confirm = () => {
    if (!isOpen.value) return
    const min = options.value.min
    const max = options.value.max
    let val = inputValue.value
    if (isNaN(val)) val = min
    val = Math.max(min, Math.min(max, val))
    pendingResult.value = { value: val }
    isOpen.value = false
  }

  const cancel = () => {
    if (!isOpen.value) return
    pendingResult.value = { value: null }
    isOpen.value = false
  }

  const onAfterLeave = () => {
    if (resolvePromise !== null && pendingResult.value !== null) {
      resolvePromise(pendingResult.value.value)
      resolvePromise = null
      pendingResult.value = null
    }
  }

  return {
    isOpen,
    key,
    options,
    inputValue,
    show,
    confirm,
    cancel,
    onAfterLeave,
  }
})
