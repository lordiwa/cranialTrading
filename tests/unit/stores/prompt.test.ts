import { setActivePinia, createPinia } from 'pinia'
import { usePromptStore } from '../../../src/stores/prompt'

describe('prompt store', () => {
  let promptStore: ReturnType<typeof usePromptStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    promptStore = usePromptStore()
  })

  it('resolves with input value on confirm after leave transition', async () => {
    const promise = promptStore.show({ message: 'How many?', defaultValue: 3 })
    expect(promptStore.isOpen).toBe(true)
    expect(promptStore.inputValue).toBe(3)
    promptStore.inputValue = 5
    promptStore.confirm()
    expect(promptStore.isOpen).toBe(false)
    promptStore.onAfterLeave()
    expect(await promise).toBe(5)
  })

  it('resolves with null on cancel after leave transition', async () => {
    const promise = promptStore.show({ message: 'How many?' })
    promptStore.cancel()
    expect(promptStore.isOpen).toBe(false)
    promptStore.onAfterLeave()
    expect(await promise).toBeNull()
  })

  it('clamps input to min on confirm', async () => {
    const promise = promptStore.show({ message: 'How many?', min: 1, max: 10, defaultValue: 5 })
    promptStore.inputValue = -3
    promptStore.confirm()
    promptStore.onAfterLeave()
    expect(await promise).toBe(1)
  })

  it('clamps input to max on confirm', async () => {
    const promise = promptStore.show({ message: 'How many?', min: 1, max: 10, defaultValue: 5 })
    promptStore.inputValue = 25
    promptStore.confirm()
    promptStore.onAfterLeave()
    expect(await promise).toBe(10)
  })

  it('uses default min=1 and max=99 when not specified', async () => {
    const promise = promptStore.show({ message: 'How many?', defaultValue: 50 })
    promptStore.inputValue = 0
    promptStore.confirm()
    promptStore.onAfterLeave()
    expect(await promise).toBe(1)
  })

  it('sequential prompt cycles work (animation-safe via onAfterLeave)', async () => {
    const p1 = promptStore.show({ message: 'First?', defaultValue: 2 })
    expect(promptStore.key).toBe(1)
    promptStore.inputValue = 3
    promptStore.confirm()
    promptStore.onAfterLeave()
    expect(await p1).toBe(3)

    const p2 = promptStore.show({ message: 'Second?', defaultValue: 7 })
    expect(promptStore.key).toBe(2)
    expect(promptStore.isOpen).toBe(true)
    expect(promptStore.options.message).toBe('Second?')
    promptStore.cancel()
    promptStore.onAfterLeave()
    expect(await p2).toBeNull()
  })

  it('no-op when confirm called while closed', () => {
    promptStore.confirm()
    // Should not throw
  })

  it('no-op when cancel called while closed', () => {
    promptStore.cancel()
    // Should not throw
  })

  it('onAfterLeave is a no-op when no pending result', () => {
    promptStore.onAfterLeave()
    // Should not throw
  })

  it('applies default values correctly', async () => {
    const promise = promptStore.show({ message: 'Test' })
    expect(promptStore.inputValue).toBe(1) // default defaultValue
    expect(promptStore.options.min).toBe(1)
    expect(promptStore.options.max).toBe(99)
    expect(promptStore.options.confirmText).toBe('ACEPTAR')
    expect(promptStore.options.cancelText).toBe('CANCELAR')
    promptStore.cancel()
    promptStore.onAfterLeave()
    await promise
  })

  it('treats NaN input as min value on confirm', async () => {
    const promise = promptStore.show({ message: 'How many?', min: 1, max: 10 })
    promptStore.inputValue = NaN
    promptStore.confirm()
    promptStore.onAfterLeave()
    expect(await promise).toBe(1)
  })
})
