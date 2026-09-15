# Decisiones de producto

Registro de decisiones de producto que no son obvias desde el código —
cuándo se tomaron, por qué, y qué reemplazan si revierten una decisión
anterior. Cada entrada va fechada y referencia el ticket que la originó.

---

## 2026-09-15 — TASK-298: el precio de la transacción es SIEMPRE el que publicó el vendedor

**Origen:** cierre del wargaming de usabilidad adversarial contra producción
del 2026-09-15 (hallazgo WG-008). Auditando el carrito de intercambio
línea por línea contra el precio real guardado en la colección del
vendedor, 12 de 14 líneas cobraban un precio que el vendedor nunca puso —
en ambas direcciones (hasta 63% menos y hasta 94% más), y los `BuyRequest`
ya persistidos en producción llevaban esos precios equivocados.

**Decisión:** el precio de cada línea del carrito (`ExchangeCartItem.price`)
y el precio persistido en un `BuyRequest` (`items[].price`, `totalValue`)
son **siempre** el precio que el vendedor publicó en su colección. Ninguna
fuente de precio de terceros — en particular el retail de Card Kingdom vía
MTGJSON — puede pisar ese valor.

El retail de Card Kingdom se conserva **solo como referencia de mercado**:
se guarda en un campo aparte y rotulado (`ExchangeCartItem.ckReferencePrice`,
poblado en background por `_upgradePriceFromCK` en
`src/stores/exchangeCart.ts`) y, si se muestra en la UI, debe presentarse
claramente etiquetado como "CK" / referencia, nunca como el monto a cobrar.

**Motivo:** desde SCRUM-70 (buy requests), el carrito dejó de ser un
artefacto efímero de la sesión del visitante — al enviarlo, persiste un
`BuyRequest` real en `/users/{ownerUid}/buyRequests` sobre el que el
vendedor actúa: "Marcar como vendida" (`fulfillRequest` en
`src/stores/buyRequests.ts`) descuenta inventario de su colección usando
esos mismos precios y cantidades. Un precio que el vendedor no publicó ya
no es "indicativo": es un pedido real por un monto que nunca aceptó.

**Esto revierte la decisión de TASK-119** (grooming 2026-07-17): esa
decisión implementó el upgrade CK-first — capturar el precio del vendedor
(TCG) al agregar al carrito y luego pisarlo en background con el retail de
Card Kingdom apenas resolvía el lookup — sobre la premisa explícita de que
**"el cart es efímero y el monto es indicativo"**. Esa premisa murió el día
que el carrito pasó a alimentar un `BuyRequest` persistente y accionable
(SCRUM-70, posterior a TASK-119): ya no hay ningún punto en el flujo donde
el monto sea meramente indicativo — es el monto que el comprador promete
pagar y el vendedor usa para descontar su stock.

**Implementación (TASK-298):** `_upgradePriceFromCK` en
`src/stores/exchangeCart.ts` ya no escribe `item.price`; escribe
`item.ckReferencePrice` (campo opcional en `ExchangeCartItem`, para no
romper carritos ya guardados en `localStorage` antes de este cambio).
`submitBuyRequest` (`src/stores/buyRequests.ts`) y `computeTotalValue`
(`src/utils/buyRequest.ts`) no cambiaron — ya operaban sobre `item.price`
tal cual llega; el fix está enteramente en que ese campo deje de mutarse.
