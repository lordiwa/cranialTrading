import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { getCardPrices } from '@/services/mtgjson'
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

  // Background CK-first price upgrade (TASK-119). addItem captures card.price
  // (TCG) synchronously for zero perceived latency; this fires-and-forget from
  // addItem and upgrades the item's price in place once the CK lookup resolves.
  // Explicit fallback: if CK has no data for the set/card, or the lookup fails,
  // the captured TCG price is left untouched. Foil-aware: foil items only
  // upgrade when CK publishes an actual retailFoil price — a missing
  // retailFoil does NOT fall back to the non-foil retail (that would
  // misrepresent a foil card's price), so the captured TCG price wins
  // instead (owner decision). Non-foil items use retail as before.
  async function _upgradePriceFromCK(username: string, scryfallId: string, cardId: string, setCode?: string) {
    try {
      const prices = await getCardPrices(scryfallId, setCode)
      const ck = prices?.cardKingdom
      if (!ck) return

      // Re-fetch the item: it may have been removed, or its foil status
      // changed, while the lookup was in flight.
      const item = _findItem(username, scryfallId, cardId)
      if (!item) return

      const ckRetail = item.foil ? ck.retailFoil : ck.retail
      // Guard against a 0/null CK price clobbering a real captured TCG price.
      if (ckRetail == null || ckRetail <= 0) return

      item.price = ckRetail
      _persist()
    } catch {
      // Network/parse failure — keep the captured TCG price, no toast spam.
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────

  function addItem(username: string, item: ExchangeCartItem, setCode?: string) {
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

    // Fire-and-forget — addItem stays synchronous, price upgrades in the background.
    void _upgradePriceFromCK(username, item.scryfallId, item.cardId, setCode)
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
