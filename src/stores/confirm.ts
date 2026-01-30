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
  const options = ref<ConfirmOptions>({
    title: '',
    message: '',
    confirmText: 'ACEPTAR',
    cancelText: 'CANCELAR',
    confirmVariant: 'primary',
    showCancel: true
  })

  let resolvePromise: ((value: boolean) => void) | null = null

  const show = (opts: ConfirmOptions): Promise<boolean> => {
    options.value = {
      title: opts.title || '',
      message: opts.message,
      confirmText: opts.confirmText || 'ACEPTAR',
      cancelText: opts.cancelText || 'CANCELAR',
      confirmVariant: opts.confirmVariant || 'primary',
      showCancel: opts.showCancel !== false
    }
    isOpen.value = true

    return new Promise((resolve) => {
      resolvePromise = resolve
    })
  }

  const confirm = () => {
    isOpen.value = false
    if (resolvePromise) {
      resolvePromise(true)
      resolvePromise = null
    }
  }

  const cancel = () => {
    isOpen.value = false
    if (resolvePromise) {
      resolvePromise(false)
      resolvePromise = null
    }
  }

  return {
    isOpen,
    options,
    show,
    confirm,
    cancel
  }
})
