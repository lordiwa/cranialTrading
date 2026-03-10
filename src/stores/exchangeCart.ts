import { defineStore } from 'pinia'
import { reactive } from 'vue'
import type { ExchangeCart, ExchangeCartItem, ExchangeCartStorage } from '@/types/exchangeCart'

const STORAGE_KEY = 'cranial_exchange_carts'
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

export const useExchangeCartStore = defineStore('exchangeCart', () => {
  const state = reactive<ExchangeCartStorage>({ carts: {} })

  // ─── Internal helpers ────────────────────────────────────────────────

  function _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // localStorage full or unavailable — silently ignore
    }
  }

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as ExchangeCartStorage
        if (parsed?.carts) {
          Object.assign(state.carts, parsed.carts)
        }
      }
    } catch {
      // Corrupted data — start fresh
    }
  }

  function _findItem(username: string, scryfallId: string, cardId: string) {
    // eslint-disable-next-line security/detect-object-injection
    const cart = state.carts[username]
    if (!cart) return null
    return cart.items.find(i => i.scryfallId === scryfallId && i.cardId === cardId) ?? null
  }

  // ─── Public API ──────────────────────────────────────────────────────

  function addItem(username: string, item: ExchangeCartItem) {
    // eslint-disable-next-line security/detect-object-injection
    if (!state.carts[username]) {
      const now = Date.now()
      // eslint-disable-next-line security/detect-object-injection
      state.carts[username] = {
        username,
        items: [],
        createdAt: now,
        expiresAt: now + SEVEN_DAYS,
      }
    }

    const existing = _findItem(username, item.scryfallId, item.cardId)
    if (existing) {
      existing.quantity = Math.min(existing.quantity + item.quantity, existing.maxQuantity)
    } else {
      // eslint-disable-next-line security/detect-object-injection
      state.carts[username].items.push({ ...item })
    }

    _persist()
  }

  function removeItem(username: string, scryfallId: string, cardId: string) {
    // eslint-disable-next-line security/detect-object-injection
    const cart = state.carts[username]
    if (!cart) return

    const idx = cart.items.findIndex(i => i.scryfallId === scryfallId && i.cardId === cardId)
    if (idx === -1) return

    cart.items.splice(idx, 1)

    if (cart.items.length === 0) {
      // eslint-disable-next-line security/detect-object-injection
      delete state.carts[username]
    }

    _persist()
  }

  function updateItemQuantity(username: string, scryfallId: string, cardId: string, quantity: number) {
    if (quantity === 0) {
      removeItem(username, scryfallId, cardId)
      return
    }

    const item = _findItem(username, scryfallId, cardId)
    if (!item) return

    item.quantity = Math.min(Math.max(1, quantity), item.maxQuantity)
    _persist()
  }

  function getCart(username: string): ExchangeCart | null {
    // eslint-disable-next-line security/detect-object-injection
    const cart = state.carts[username]
    if (!cart) return null

    if (Date.now() > cart.expiresAt) {
      // eslint-disable-next-line security/detect-object-injection
      delete state.carts[username]
      _persist()
      return null
    }

    return cart
  }

  function getCartItemCount(username: string): number {
    const cart = getCart(username)
    if (!cart) return 0
    return cart.items.length
  }

  function getCartTotalValue(username: string): number {
    const cart = getCart(username)
    if (!cart) return 0
    return cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  }

  function clearCart(username: string) {
    // eslint-disable-next-line security/detect-object-injection
    delete state.carts[username]
    _persist()
  }

  function isItemInCart(username: string, scryfallId: string, cardId: string): boolean {
    const cart = getCart(username)
    if (!cart) return false
    return cart.items.some(i => i.scryfallId === scryfallId && i.cardId === cardId)
  }

  function cleanExpiredCarts() {
    const now = Date.now()
    let changed = false
    for (const username of Object.keys(state.carts)) {
      // eslint-disable-next-line security/detect-object-injection
      const cart = state.carts[username]
      if (cart && now > cart.expiresAt) {
        // eslint-disable-next-line security/detect-object-injection
        delete state.carts[username]
        changed = true
      }
    }
    if (changed) _persist()
  }

  // Load from localStorage on init
  _load()

  return {
    addItem,
    removeItem,
    updateItemQuantity,
    getCart,
    getCartItemCount,
    getCartTotalValue,
    clearCart,
    isItemInCart,
    cleanExpiredCarts,
  }
})
