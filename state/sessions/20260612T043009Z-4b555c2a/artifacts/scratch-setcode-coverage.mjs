// SOLO LECTURA. Mide si el camino del HIGH-1 (setCode ausente -> backfill de
// Scryfall) es EJERCITABLE en el proyecto indicado por FIREBASE_PROJECT.
// Pregunta concreta: cuantos public_cards no tienen setCode, y de esos,
// cuantos tienen doc en scryfall_cache con campo `set` (los cubre el fallback
// barato) contra cuantos NO estan en la cache (los unicos que ejercitan el
// backfill contra la API de Scryfall).
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT;
if (!projectId) { console.error('falta FIREBASE_PROJECT'); process.exit(1); }
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const snap = await db.collection('public_cards').get();
const total = snap.size;

const sinSetCode = [];
const porUsuario = new Map();
for (const d of snap.docs) {
  const data = d.data();
  const uid = data.userId || '(sin userId)';
  const acc = porUsuario.get(uid) || { docs: 0, sinSetCode: 0 };
  acc.docs += 1;
  if (!data.setCode) { acc.sinSetCode += 1; sinSetCode.push({ id: d.id, scryfallId: data.scryfallId, name: data.name }); }
  porUsuario.set(uid, acc);
}

// Para los que no tienen setCode: estan en scryfall_cache? tienen `set`?
const ids = [...new Set(sinSetCode.map(r => r.scryfallId).filter(Boolean))];
let enCacheConSet = 0, enCacheSinSet = 0, noEnCache = 0;
const ejemplosNoEnCache = [];
for (let i = 0; i < ids.length; i += 300) {
  const lote = ids.slice(i, i + 300);
  const docs = await db.getAll(...lote.map(id => db.doc(`scryfall_cache/${id}`)));
  for (const doc of docs) {
    if (!doc.exists) { noEnCache += 1; if (ejemplosNoEnCache.length < 5) ejemplosNoEnCache.push(doc.id); continue; }
    const c = doc.data();
    if (c && c.set) enCacheConSet += 1; else enCacheSinSet += 1;
  }
}

console.log(JSON.stringify({
  projectId,
  documentosPublicCards: total,
  sinSetCode: sinSetCode.length,
  pctSinSetCode: total ? +(sinSetCode.length * 100 / total).toFixed(1) : 0,
  scryfallIdsUnicosSinSetCode: ids.length,
  // el fallback barato (cache.set) cubre estos:
  cubiertosPorFallbackCache: enCacheConSet,
  // estos NO: son los que obligan a llamar a Scryfall en el reconcile
  EJERCITAN_BACKFILL_SCRYFALL: noEnCache,
  enCachePeroSinCampoSet: enCacheSinSet,
  ejemplosNoEnCache,
  porUsuario: [...porUsuario.entries()].map(([uid, v]) => ({ uid, ...v })).sort((a, b) => b.docs - a.docs),
}, null, 1));
process.exit(0);
