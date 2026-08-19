// SOLO LECTURA. Corre el modulo NUEVO contra los datos REALES de produccion.
import { createRequire } from 'module';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const require = createRequire(import.meta.url);
const mod = require('./functions/lib/publicCardEntry.js');
console.log('exporta:', Object.keys(mod).join(', '));
const { buildPublicEntry, publicChunkId } = mod;

initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' });
const db = getFirestore();
const UID = 'Rt5DOfZXBtPZkEpK4N5pW6a5FXs1';

const all = await db.collection('public_cards').get();
const ids = [...new Set(all.docs.map((d) => d.data().scryfallId).filter(Boolean))];
const cache = new Map();
for (let i = 0; i < ids.length; i += 300) {
  const docs = await db.getAll(...ids.slice(i, i + 300).map((id) => db.collection('scryfall_cache').doc(id)));
  for (const d of docs) if (d.exists) cache.set(d.id, d.data().card || d.data());
}

const mine = all.docs.filter((d) => d.data().userId === UID);
const entries = mine.map((d) => buildPublicEntry(d.data(), cache.get(d.data().scryfallId) || null));
const co = (e) => e.co || e.colors || [];
console.log('entradas construidas =', entries.length);
console.log('claves de una entrada:', Object.keys(entries[0]).join(','));

// AC2: el numero tiene que salir 1.412 documentos negros
for (const [l, esperado] of [['B',1412],['W',1457],['U',1354],['R',1619],['G',1161]]) {
  const n = entries.filter((e) => co(e).includes(l)).length;
  console.log('color %s -> %d documentos (esperado por medicion independiente: %d) %s',
    l, n, esperado, n === esperado ? 'IGUAL' : `DIFIERE en ${n - esperado}`);
}

// AC3: substring
const nl = (e) => e.nl || '';
console.log("'blight' substring -> %d documentos (esperado 14)", entries.filter((e) => nl(e).includes('blight')).length);

// AC9: recuperacion real de los huecos
const sinCache = entries.filter((e) => e.x === 1);
console.log('marcadas sin cache (x:1) = %d (esperado 17 globales; en esta cuenta puede ser menos)', sinCache.length);
const dobles = mine.filter((d) => { const s = cache.get(d.data().scryfallId); return s && Array.isArray(s.card_faces) && s.card_faces.length > 1 && !Array.isArray(s.colors); });
const doblesRecuperadas = dobles.filter((d) => co(buildPublicEntry(d.data(), cache.get(d.data().scryfallId))).length > 0);
console.log('dobles cara sin colors en raiz: %d | con colores RECUPERADOS por el fallback: %d', dobles.length, doblesRecuperadas.length);
const sinNada = mine.filter((d) => { const s = cache.get(d.data().scryfallId); return s && !Array.isArray(s.colors) && !Array.isArray(s.color_identity) && !(Array.isArray(s.card_faces) && s.card_faces.length); });
console.log('sin colors NI color_identity NI faces: %d (quedan sin color, es correcto si son incoloras)', sinNada.length);
const sinType = entries.filter((e) => !(e.t || e.type_line || '')).length;
console.log('entradas sin type_line = %d', sinType);

// AC10: distribucion y remapeo al crecer
const dist = new Map();
for (const e of entries) { const c = publicChunkId(e.s || e.i, 17); dist.set(c, (dist.get(c) || 0) + 1); }
const v = [...dist.values()];
console.log('chunks usados=%d de 17 | min=%d max=%d media=%d', dist.size, Math.min(...v), Math.max(...v), Math.round(entries.length / dist.size));
let remapeadas = 0;
for (const e of entries) if (publicChunkId(e.s || e.i, 17) !== publicChunkId(e.s || e.i, 18)) remapeadas++;
console.log('REMAPEO al pasar de 17 a 18 chunks: %d de %d (%.0f%%)', remapeadas, entries.length, (remapeadas/entries.length)*100);
// peso real de un chunk
const c0 = entries.filter((e) => publicChunkId(e.s || e.i, 17) === 0);
console.log('chunk 0: %d entradas, %d bytes (limite Firestore 1 MB)', c0.length, Buffer.byteLength(JSON.stringify(c0), 'utf8'));
console.log('bytes por entrada = %d', Math.round(Buffer.byteLength(JSON.stringify(entries), 'utf8') / entries.length));
