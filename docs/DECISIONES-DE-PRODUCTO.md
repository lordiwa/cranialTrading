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
en ambas direcciones, y los `BuyRequest` ya persistidos en producción
llevaban esos precios equivocados. El rango medido en las 12 líneas va de
**−92,2%** (Serra Angel, $4.50 → $0.35, la que más abarata) a **+1280%**
(Swamp, $0.05 → $0.69, la que más encarece). Los dos casos originalmente
citados como titulares del hallazgo — Wrath of God (−63,2%) y Elspeth
(+93,4%) — son ilustrativos pero **no son los extremos**; quedó mal escrito
en una revisión anterior de este documento, corregido acá el 2026-09-15
tras medir las 12 filas una por una (no volver a citar "63%/94%" como el
rango).

Las 12 líneas medidas, de la que más abarata a la que más encarece:
Serra Angel −92,2%; Angel of the Ruins −79,6%; Aether Charge −70,8%;
Lightning Bolt −66,8%; Wrath of God −63,2%; Giant Growth −53,3%;
Darksteel Citadel +13,7%; Dazzling Angel +40,0%; Sol Ring +84,3%;
Elspeth +93,4%; Echoing Ruin +250,0%; Swamp +1280,0%.

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

### Nota de seguimiento (2026-09-15) — migración de carritos envenenados en localStorage

El arreglo de arriba no repara los carritos que YA estaban guardados en el
`localStorage` de un visitante con `item.price` pisado por el retail de CK
— el bug estuvo en producción. Nada en el camino de lectura los repara:
`_upgradePriceFromCK` solo escribe `ckReferencePrice`, nunca `price`, y
`addItem` sobre un ítem ya existente en el carrito solo suma cantidad, no
re-cotiza precio. Un carrito así, si se envía HOY con el arreglo ya
desplegado, sigue persistiendo un `BuyRequest` con el precio equivocado —
el TTL de 7 días (`expiresAt`) acota la ventana pero no la cierra.

**Decisión:** invalidar los carritos anteriores al arreglo rotando la
clave de `localStorage` (`STORAGE_KEY` en `src/stores/exchangeCart.ts`, de
`cranial_exchange_carts` a `cranial_exchange_carts_v2`). `_load()` ya no ve
nada guardado bajo la clave vieja — el carrito envenenado no carga, como
si el visitante nunca hubiera empezado uno.

**Por qué esta y no otra:** re-cotizar el precio del vendedor al cargar el
carrito no es posible desde el propio carrito — ese precio se perdió el
momento en que CK lo pisó, no está guardado en ningún lado del documento.
Recuperarlo exigiría una consulta de red por ítem al cargar, con sus
propios modos de falla, y una re-cotización equivocada es la misma clase
de bug que se está arreglando acá. Aceptar el residual en silencio tampoco
es opción: el costo no es "un carrito raro", es un pedido real que el
vendedor tiene que honrar o disputar.

**Costo aceptado a sabiendas:** un visitante con un carrito a medio armar
en el momento del deploy lo pierde una vez y tiene que volver a agregar
las cartas. Se acepta porque un carrito perdido es visible y el visitante
lo entiende (agrega de nuevo); un precio silenciosamente equivocado no se
nota hasta que alguien audita línea por línea, como pasó acá.
