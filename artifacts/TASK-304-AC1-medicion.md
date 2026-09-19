# TASK-304 AC1 — control negativo por medición directa (2026-09-19)

El AC1 pide leer, con el Admin SDK, el documento de la carta en las tres colecciones y
registrar qué campo de precio tiene cada una — para "cerrar la hipótesis del escritor
asimétrico ANTES de tocar código". Hecho. **La hipótesis del ticket queda DESCARTADA por
medición**, y el arreglo que el ticket insinuaba habría sido trabajo perdido.

Instrumento: `artifacts/scratch-304-paridad-precios.mjs` (solo lectura, default
`cranial-trading-dev`). Vendedor del terreno de wargaming: `qa_buyer`, uid
`UJCGikuyX3bZOLYtBv1DnilSZUq2`.

## Lo medido

**1. Las tres colecciones están en paridad PERFECTA sobre el precio del vendedor.**

```
users/{uid}/cards  public=true & sale|trade : 11
public_cards (userId==uid)                  : 11
public_card_index entradas                  : 11  (2 docs, _meta.count 11)

11 cartas comparadas | 0 con `price` divergente entre las tres colecciones
```

**2. Ninguna de las tres colecciones guarda un precio de Card Kingdom, de TCG ni de buylist.**
Campos reales de un documento de `public_cards`:

```
avatarUrl, cardId, cardName, cardNameLower, condition, edition, foil, image, location,
price, quantity, scryfallId, setCode, status, updatedAt, userId, username
```

No hay `ckPrice`, no hay `buylistPrice`, no hay `ckReferencePrice`. Lo mismo en
`users/{uid}/cards` y en las entradas del índice.

**3. Las claves de búsqueda de precio son IDÉNTICAS en las dos vistas.** Comparé
`setCode` y `scryfallId` carta por carta entre el documento del dueño y la entrada del
índice: **0 diferencias sobre 11**. Y ninguna entrada del índice está sin `sc`: 0 de 11 en
esta cuenta, y 0 de 602 en `qa_mtg`.

## Qué significa, y por qué cambia el arreglo

La hipótesis que el ticket traía —"las dos colecciones se enriquecen por caminos
independientes y ninguna reconcilia contra la otra, así que cuál de las dos sabe depende de
cuál corrió último"— **es falsa**. No hay dos escritores de precios de referencia porque **no
hay ningún escritor de precios de referencia**: CK, TCG y buylist no viven en Firestore.

Vienen de `src/services/mtgjson.ts` (`getCardPrices`, que lee el dataset de MTGJSON con los
precios de `paper.cardkingdom.retail` y `paper.cardkingdom.buylist`), consumido por
`src/composables/useCardPrices.ts`. **Las dos vistas usan EL MISMO composable**: el perfil
público monta `CollectionGrid.vue` igual que `/collection`, y la grilla delega en
`CollectionGridCardFull/Compact.vue`, que llaman
`useCardPrices(() => props.card.scryfallId, () => props.card.setCode)`.

Mismo composable, mismas claves, mismo dato de origen → **la divergencia es de CARRERA, no de
dato**. `useCardPrices` tiene un `pricesCache` a nivel de MÓDULO (compartido por toda la SPA)
y un `fetchPrices` asíncrono que solo cachea los resultados con valor
(`if (fetchedPrices)`, línea 69). Si la resolución no llega a tiempo para el render de una
vista y nada la vuelve a disparar, esa columna queda vacía para siempre en esa vista, mientras
la otra —que ganó la carrera— muestra el número.

Eso explica las dos cosas que el hallazgo no podía explicar:

- **por qué la deriva va en las dos direcciones** (10 discrepantes sobre 12, cinco a favor del
  público y cinco a favor del dueño): gana el que resolvió primero en esa corrida;
- **por qué Wrath of God y Giant Growth DIERON VUELTA su discrepancia en cuatro días**: no
  cambió ningún dato, cambió quién ganó la carrera.

También explica por qué esperar 8, 11 y 14 segundos no hizo aparecer el valor: no es lentitud,
es que no hay reintento.

## Dónde hay que mirar para arreglarlo

`src/services/mtgjson.ts` (`getCardPrices`) y `src/composables/useCardPrices.ts`
(`pricesCache` de módulo + el disparo único de `fetchPrices` desde los componentes de grilla).
NO es un trabajo de reconciliación de colecciones de Firestore, y cualquier script de
paridad sobre `public_cards` sería trabajo perdido acá.

## La trampa que esto casi repite

Es el mismo modo de fallo que la lección del 2026-08-24 anotada en el bundle: *"la familia
card_index es tan dominante en este proyecto que se volvió la hipótesis por defecto; esta vez
era inocente y casi mando al developer a perseguirla"*. Acá pasó igual con la paridad
`cards` / `public_cards` / `public_card_index`: el ticket la nombraba como causa probable, las
tres están impecables, y despachar el arreglo sin medir habría mandado a un developer a
reconciliar colecciones que ya coinciden.

**Residual honesto:** la conclusión sobre la carrera en `useCardPrices` está MEDIDA en su
premisa (las tres colecciones coinciden y no guardan precios de referencia; las claves de
búsqueda son idénticas) pero **LEÍDA en su mecanismo** (el caché de módulo y el disparo único).
No instrumenté el navegador para ver las dos carreras. Confirmarlo es la primera tarea del
developer que tome el ticket, no algo que este documento dé por probado.
