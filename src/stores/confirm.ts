import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmVariant?: 'primary' | 'danger' | 'secondary'
  showCancel?: boolean
}

export const useConfirmStore = defineStore('confirm', () => {
  const isOpen = ref(false)
  const key = ref(0)
  const options = ref<ConfirmOptions>({
    title: '',
    message: '',
    confirmText: 'ACEPTAR',
    cancelText: 'CANCELAR',
    confirmVariant: 'primary',
    showCancel: true
  })

  let resolvePromise: ((value: boolean) => void) | null = null
  const pendingResult = ref<boolean | null>(null)

  const show = (opts: ConfirmOptions): Promise<boolean> => {
    options.value = {
      title: opts.title ?? '',
      message: opts.message,
      confirmText: opts.confirmText ?? 'ACEPTAR',
      cancelText: opts.cancelText ?? 'CANCELAR',
      confirmVariant: opts.confirmVariant ?? 'primary',
      showCancel: opts.showCancel !== false
    }
    key.value++
    isOpen.value = true

    return new Promise((resolve) => {
      resolvePromise = resolve
    })
  }

  const confirm = () => {
    if (!isOpen.value) return
    pendingResult.value = true
    isOpen.value = false
  }

  const cancel = () => {
    if (!isOpen.value) return
    pendingResult.value = false
    isOpen.value = false
  }

  const onAfterLeave = () => {
    if (resolvePromise !== null && pendingResult.value !== null) {
      resolvePromise(pendingResult.value)
      resolvePromise = null
      pendingResult.value = null
    }
  }

  return {
    isOpen,
    key,
    options,
    show,
    confirm,
    cancel,
    onAfterLeave
  }
})
