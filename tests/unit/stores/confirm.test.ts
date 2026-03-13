import { setActivePinia, createPinia } from 'pinia'
import { useConfirmStore } from '../../../src/stores/confirm'

describe('confirm store', () => {
  let confirmStore: ReturnType<typeof useConfirmStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    confirmStore = useConfirmStore()
  })

  it('resolves true on confirm after leave transition', async () => {
    const promise = confirmStore.show({ message: 'Test?' })
    confirmStore.confirm()
    expect(confirmStore.isOpen).toBe(false)
    confirmStore.onAfterLeave()
    expect(await promise).toBe(true)
  })

  it('resolves false on cancel after leave transition', async () => {
    const promise = confirmStore.show({ message: 'Test?' })
    confirmStore.cancel()
    expect(confirmStore.isOpen).toBe(false)
    confirmStore.onAfterLeave()
    expect(await promise).toBe(false)
  })

  it('increments key on each show() call for sequential confirms', async () => {
    expect(confirmStore.key).toBe(0)

    const p1 = confirmStore.show({ message: 'First?' })
    expect(confirmStore.key).toBe(1)
    confirmStore.confirm()
    confirmStore.onAfterLeave()
    await p1

    const p2 = confirmStore.show({ message: 'Second?' })
    expect(confirmStore.key).toBe(2)
    expect(confirmStore.isOpen).toBe(true)
    expect(confirmStore.options.message).toBe('Second?')
    confirmStore.confirm()
    confirmStore.onAfterLeave()
    await p2
  })

  it('supports sequential show/confirm cycles without stale state', async () => {
    // Simulate the exact bug scenario: two confirms in sequence
    const p1 = confirmStore.show({
      title: 'Remove from deck',
      message: 'Remove card from deck?',
      confirmVariant: 'danger'
    })
    expect(confirmStore.isOpen).toBe(true)
    confirmStore.confirm()
    confirmStore.onAfterLeave()
    const r1 = await p1
    expect(r1).toBe(true)
    expect(confirmStore.isOpen).toBe(false)

    // Second confirm should work immediately after
    const p2 = confirmStore.show({
      title: 'Remove from collection',
      message: 'Also remove from collection?',
      confirmVariant: 'danger'
    })
    expect(confirmStore.isOpen).toBe(true)
    expect(confirmStore.options.message).toBe('Also remove from collection?')
    confirmStore.cancel()
    confirmStore.onAfterLeave()
    const r2 = await p2
    expect(r2).toBe(false)
  })

  it('guards against double-fire of confirm during leave', async () => {
    const promise = confirmStore.show({ message: 'Test?' })
    confirmStore.confirm()
    // Second confirm should be a no-op (isOpen is already false)
    confirmStore.confirm()
    confirmStore.onAfterLeave()
    expect(await promise).toBe(true)
  })

  it('guards against double-fire of cancel during leave', async () => {
    const promise = confirmStore.show({ message: 'Test?' })
    confirmStore.cancel()
    // Second cancel should be a no-op (isOpen is already false)
    confirmStore.cancel()
    confirmStore.onAfterLeave()
    expect(await promise).toBe(false)
  })

  it('onAfterLeave is a no-op when no pending result', () => {
    // Should not throw
    confirmStore.onAfterLeave()
  })
})
