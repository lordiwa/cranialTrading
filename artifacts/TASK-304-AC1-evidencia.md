# TASK-304 AC1 — medido con el Admin SDK contra dev, 2026-09-20

> **Por qué está acá y no en el ticket:** `appendComment` rechazó la escritura porque
> `tasks/TASK-304.json` ya tiene un comentario **inválido de schema** (`author:
> "orquestador-qa"`, fuera del enum; sin `at`; con la propiedad extra `created_at`),
> escrito a mano en algún momento saltando las guardas. El guard valida el payload
> ENTERO, así que la corrupción preexistente bloquea toda escritura nueva sobre ese
> ticket. No se reparó a mano: el contrato prohíbe editar `comments` por `Edit` crudo.
> Pegar este contenido en el ticket en cuanto se resuelva. Ver
> `artifacts/COMENTARIOS-INVALIDOS-2026-09-20.md`.

**La hipótesis del escritor asimétrico entre colecciones queda DESCARTADA, y aparece la causa real.**

Instrumentos (solo lectura, no se escribió un solo dato): `artifacts/scratch-304-ac1.mjs` y
`artifacts/scratch-304-forma.mjs`.

## Lo medido

Paridad de **conteo**, perfecta:

| Colección | Documentos |
|---|---|
| `users/{uid}/cards` con `public=true` | 2202 |
| `public_cards` (raíz, `userId==uid`) | 2202 |
| `public_card_index` | 8 chunks + `_meta`, `count=2202`, 2202 entradas |

La reparación de TASK-290 aguantó.

**Forma real de los documentos** — leída de un volcado completo, no supuesta:

- `users/{uid}/cards`: `{ scryfallId, name, edition, quantity, condition, foil, price, image, status, public, setCode, chunkId, createdAt, updatedAt }`
- `public_cards` (raíz): `{ cardId, userId, username, avatarUrl, cardName, cardNameLower, scryfallId, setCode, status, price, edition, condition, foil, quantity, image, location, updatedAt }`
- `public_card_index`: entradas abreviadas `{ s, i, n, nl, q, p, st, f, cn, sc, ed, t, cm, co, pm, r, kw, pw, to, fa, lg, ca }`

## El hallazgo que cierra el AC1

**Ninguna de las tres colecciones guarda precio de Card Kingdom ni de buylist.** Las tres llevan
un solo campo de precio: `price` / `price` / `p`.

Los precios de CK, TCG y buylist que muestran las dos vistas **no salen de Firestore**, así que no
puede haber un escritor asimétrico entre colecciones: no hay nada que escribir asimétricamente. La
hipótesis original del hallazgo, y también la revisión del comentario anterior sobre "dos
colecciones que se enriquecen por caminos independientes", apuntaban al lugar equivocado.

## La causa, localizada en el código

Las dos vistas usan **el mismo** camino de precios:

```
CollectionGrid
  -> CollectionGridCardCompact.vue:54 / CollectionGridCardFull.vue:119
  -> useCardPrices()
  -> services/mtgjson.getCardPrices(scryfallId, setCode)
```

`UserProfileView.vue` monta el **mismo** `CollectionGrid`. La fuente es única y la vista es la misma.

**La asimetría está en la PRECARGA, y es de tiempo, no de dato:**

- `CollectionView.vue:14` y `:1296` montan `CollectionTotalsPanel`, que corre `useCollectionTotals`,
  que en `composables/useCollectionTotals.ts:238-241` hace `preloadSetMappings(uniqueSetCodes)` —
  precarga en lotes paralelos los mapeos MTGJSON de **todos** los set codes de la colección.
- `UserProfileView.vue` **no** monta `CollectionTotalsPanel` ni usa `useCollectionTotals` (grep vacío
  en los dos). En el perfil público cada carta tiene que traerse su propio mapeo de set,
  perezosamente y de a una, desde `getCardPrices` (`mtgjson.ts:565-568`).
- Y hay un efecto de **trinquete**: `failedSets` (`mtgjson.ts:82`, `:497`, `:537`) es un `Set` de
  módulo por sesión — un set que falla UNA vez queda salteado para toda la sesión, así que la carta
  nunca recupera su precio por más que se espere.

**Esto explica lo que ninguna hipótesis anterior explicaba:** por qué la deriva va en las dos
direcciones, y por qué Wrath of God y Giant Growth dieron vuelta su discrepancia entre dos
mediciones separadas por cuatro días. Qué vista "sabe" más no depende de quién escribió último,
sino de qué mapeos de set alcanzaron a cargarse dentro de la ventana de observación en **esa**
sesión de navegador. Con esperas de 8, 11 y 14 segundos se estaba midiendo una carrera, no un estado.

## Consecuencia para el arreglo (el AC4 pide que la decisión quede registrada)

El AC4 ofrece dos caminos: "el enriquecimiento corre sobre las tres colecciones" **o** "se lee desde
una única fuente". Lo medido dice que **ya** se lee desde una única fuente — el problema no es la
fuente sino la precarga.

El arreglo natural es que el perfil público precargue sus mapeos de set igual que lo hace la vista
del dueño, y que `failedSets` deje de ser un trinquete permanente de sesión. Queda como
**recomendación medida, no como decisión cerrada**: la elige el developer con el código delante.

## Aviso para quien retome

Las 10 cartas que nombra la regresión (Wrath of God, Giant Growth, Darksteel Citadel, Swamp,
Elspeth Storm Slayer, Sol Ring, Aether Charge, Serra Angel) **ya no existen** en la cuenta de dev:
la re-siembra de TASK-290 cambió el conjunto. Solo sobreviven Lightning Bolt (3 copias), Dazzling
Angel (1) y Sol Ring (1).

**El AC7 no se puede cumplir literalmente** (pide repetir la lectura cruzada de Wrath of God contra
el entorno desplegado): hay que elegir cartas nuevas del conjunto actual.

## Error propio, registrado para que no se cite mal esta medición

Mi primera pasada reportó cero coincidencias por nombre entre `cards` y `public_cards`, y cero
campos de precio en el índice. Las dos cifras eran **artefactos de mi propio script**, no hallazgos:
`public_cards` usa `cardName` (no `name`) y el índice usa la clave abreviada `p`. Lo detecté
volcando un documento entero de cada colección en vez de confiar en mi regex.

Si alguien cita este documento, que cite la sección **Forma real**, que sale de un volcado completo.
