# Carga de Colección — Cranial Trading

## Flujo

```
Usuario abre CollectionView
         │
         ▼
   onMounted() en CollectionView.vue
   (en paralelo: loadCollection + loadDecks + loadBinders)
         │
         ▼
   collectionStore.loadCollection()
   Browser SDK: getDocs(users/{uid}/cards)
   ⚠️ Lee TODA la colección de golpe
         │
         ▼
   Chunking local (2,000 docs/chunk)
   backgroundSafeDelay(0) entre chunks → UI no se congela
         │
         ▼
   cards = shallowRef<Card[]>     ← asignación única
   rebuildCardIndex()             ← Map<id, Card> para O(1)
         │
         ▼
   loading = false → UI muestra CollectionGrid
         │
         └──▶ enrichCardsWithMissingMetadata() [background]
              Scryfall batch fetch → writeBatch 400/batch
```

## UI durante la carga

| Estado | Qué ve el usuario |
|--------|-------------------|
| `loading && cards.length === 0` | 10 SkeletonCards |
| `!loading && cards.length === 0` | Mensaje "colección vacía" |
| `!loading && cards.length > 0` | CollectionGrid con load-more de 50 |

## Cloud Function disponible (NO usada)

`loadCollectionChunk` existe en `functions/index.js` con:
- Paginación cursor-based (`startAfter(lastId)`)
- 10,000 cards/chunk
- Summary con counts por status (5 queries paralelas)
- **No se invoca** — la carga actual usa browser SDK directo

## Estado reactivo

| Variable | Tipo | Por qué |
|----------|------|---------|
| `cards` | `shallowRef<Card[]>` | Evita deep reactivity en 59k+ cards |
| `cardsById` | `Map<string, Card>` | Lookup O(1), no reactivo |
| `loading` | `ref<boolean>` | Controla skeleton UI |
| `importing` | `ref<boolean>` | Bloquea enrichment durante import |

## Archivos clave

| Archivo | Qué hace |
|---------|----------|
| `views/CollectionView.vue` | `onMounted()` trigger, skeleton UI |
| `stores/collection.ts` | `loadCollection()`, `rebuildCardIndex()`, enrichment |
| `functions/index.js` | `loadCollectionChunk()` (disponible, sin uso) |
| `services/scryfall.ts` | `getCardsByIds()` para enrichment |
