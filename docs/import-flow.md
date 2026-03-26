# Importación de Cartas — Cranial Trading

## Flujo

```
Usuario pega texto/CSV/link Moxfield
         │
         ▼
   ImportDeckModal.vue
   (auto-detecta formato, parsea, preview)
         │
         ▼
   CollectionView.vue
   (construye array de cartas)
         │
         ▼
   collectionStore.confirmImport()
   (chunking: 500 cartas por llamada)
         │  httpsCallable
         ▼
   Cloud Function: bulkImportCards
   (db.batch().set() server-side)
         │
         ▼
   Firestore: /users/{uid}/cards/{id}
         │
         ├──▶ Binders (max 10k/binder, split "1/6", "2/6"...)
         └──▶ Enriquecimiento Scryfall (background, 400/batch)
```

## Por qué Cloud Function

Browser SDK limita ~10k writes pendientes. Server-side es ~50x más rápido.

## Límites

| Qué | Límite | Solución |
|-----|--------|----------|
| Doc Firestore | 1MB | Binders split a 10k |
| Browser writes | ~10k ops | Cloud Function |
| Cloud Function | 120s / 512MB | Chunks de 500 |
| Scryfall API | rate limit | Enrich diferido |

## Formatos soportados

- **Texto**: `4 Lightning Bolt (M21)`
- **CSV**: ManaBox, Moxfield, Urza's Gatherer (auto-detect)
- **Moxfield link**: fetch via proxy Cloud Function

## Archivos clave

| Archivo | Qué hace |
|---------|----------|
| `components/collection/ImportDeckModal.vue` | UI + parsing |
| `views/CollectionView.vue` | Handlers de import |
| `stores/collection.ts` | `confirmImport()`, estado |
| `services/cloudFunctions.ts` | Wrapper httpsCallable |
| `functions/index.js` | `bulkImportCards` server |
| `utils/cardHelpers.ts` | Parsers CSV |
