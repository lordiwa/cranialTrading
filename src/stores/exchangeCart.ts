import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { getCardPrices } from '@/services/mtgjson'
import type { ExchangeCart, ExchangeCartItem, ExchangeCartStorage } from '@/types/exchangeCart'

// TASK-298 follow-up (2026-09-15, wargaming WG-008 residual): the bug this
// file's fix reverts was live in production, so some browsers still hold
// carts saved under the OLD key with item.price already overwritten by CK
// retail. Nothing on the read path repairs them — _upgradePriceFromCK only
// ever writes ckReferencePrice, never price, and addItem on an existing
// item only bumps quantity. Re-deriving the seller's price at load time
// isn't possible either: it was lost the moment CK overwrote it, so
// "recovering" it would mean a fresh per-item network lookup with its own
// failure modes — the same class of bug this ticket fixes. Rotating the key
// is the cleanest fix: _load() below simply never sees data saved under the
// old key, so a poisoned cart is dropped instead of silently persisting a
// wrong-priced BuyRequest. Cost, accepted: a visitor with a half-built cart
// at deploy time loses it once and re-adds — visible and understood, unlike
// a silently wrong price. See docs/DECISIONES-DE-PRODUCTO.md.
const STORAGE_KEY = 'cranial_exchange_carts_v2'
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
          // TASK-307: addItem/updateItemQuantity clampean quantity contra
          // maxQuantity, pero un carrito rehidratado desde localStorage puede
          // haber sido editado a mano (medido en dev: item.quantity escrito
          // directo por encima de maxQuantity, sin pasar por ningun setter).
          // _load() era la unica puerta de entrada que no clampeaba — el
          // ataque real solo necesitaba abrir el carrito una vez despues de
          // editar el storage. submitBuyRequest (AC5) revalida esto de nuevo
          // contra el stock publicado antes de persistir; este clamp es la
          // primera linea de defensa, en el cliente.
          let changed = false
          for (const cart of Object.values(state.carts)) {
            for (const item of cart.items) {
              // TASK-307/316 review R-2: Math.max(1, NaN) === NaN — el clamp
              // era transparente a un item.quantity corrupto (NaN) escrito a
              // mano en localStorage, dejandolo pasar intacto. Nunca es la
              // barrera real (esto es localStorage del atacante; la barrera
              // es resolvePublishedPrices/planFulfillment del lado del
              // servidor), pero tampoco debe fingir que clampeo algo que no clampeo.
              const bounded = Number.isFinite(item.quantity) ? Math.min(Math.max(1, item.quantity), item.maxQuantity) : 1
              if (bounded !== item.quantity) {
                item.quantity = bounded
                changed = true
              }
            }
          }
          if (changed) _persist()
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

  // Background CK reference-price lookup. TASK-119 originally made this
  // OVERWRITE item.price with the CK retail ("the cart is ephemeral and the
  // amount is indicative"). TASK-298 (wargaming 2026-09-15, WG-008) reverted
  // that: the cart persists a real BuyRequest the seller acts on
  // (fulfillRequest decrements their collection), so the transaction price
  // must always be the one the seller published — see
  // docs/DECISIONES-DE-PRODUCTO.md. addItem still captures the seller's
  // card.price synchronously for zero perceived latency; this fires-and-
  // forget from addItem and, once the CK lookup resolves, populates the
  // SEPARATE, labeled `ckReferencePrice` field — item.price is never
  // touched. If CK has no data for the set/card, or the lookup fails,
  // ckReferencePrice is simply left unset. Foil-aware: foil items only
  // populate ckReferencePrice when CK publishes an actual retailFoil price —
  // a missing retailFoil does NOT fall back to the non-foil retail (that
  // would misrepresent a foil card's market reference).
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
      // Guard against a 0/null CK price being recorded as a bogus reference.
      if (ckRetail == null || ckRetail <= 0) return

      item.ckReferencePrice = ckRetail
      _persist()
    } catch {
      // Network/parse failure — no reference price, no toast spam.
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

    // TASK-307/316 review R-2: mismo guard NaN-transparente que _load() —
    // ver ese comentario para el detalle.
    item.quantity = Number.isFinite(quantity) ? Math.min(Math.max(1, quantity), item.maxQuantity) : 1
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

  /**
   * TASK-306 AC4: aplica al carrito en pantalla los precios que
   * buyRequestsStore.checkPriceChanges resolvió contra lo publicado por el
   * vendedor, para que el comprador VEA el número nuevo (y el total
   * recalculado) antes de confirmar el envío. Nunca escribe un precio que no
   * vino de esa resolución — el llamador (ExchangeCartDrawer) es quien pidió
   * el re-chequeo primero.
   */
  function applyResolvedPrices(username: string, updates: { cardId: string; price: number }[]) {
    // eslint-disable-next-line security/detect-object-injection
    const cart = state.carts[username]
    if (!cart) return
    let changed = false
    for (const update of updates) {
      const item = cart.items.find(i => i.cardId === update.cardId)
      if (item && item.price !== update.price) {
        item.price = update.price
        changed = true
      }
    }
    if (changed) _persist()
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
    applyResolvedPrices,
    clearCart,
    isItemInCart,
    cleanExpiredCarts,
  }
})
