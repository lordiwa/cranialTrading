// SOLO LECTURA. Cierra: huecos de la cache, y el techo de memoria/tiempo del filtro server-side.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' });
const db = getFirestore();

const all = await db.collection('public_cards').get();
const ids = [...new Set(all.docs.map((d) => d.data().scryfallId).filter(Boolean))];
const cache = new Map();
for (let i = 0; i < ids.length; i += 300) {
  const docs = await db.getAll(...ids.slice(i, i + 300).map((id) => db.collection('scryfall_cache').doc(id)));
  for (const d of docs) if (d.exists) cache.set(d.id, d.data().card || d.data());
}

// --- HUECO 1: cuantas cartas de la cache no tienen colors NI color_identity ---
let sinColors = 0, sinAmbos = 0, sinType = 0, conFaces = 0;
for (const c of cache.values()) {
  const hasC = Array.isArray(c.colors), hasCI = Array.isArray(c.color_identity);
  if (!hasC) sinColors++;
  if (!hasC && !hasCI) sinAmbos++;
  if (!c.type_line) sinType++;
  if (Array.isArray(c.card_faces) && c.card_faces.length > 1) conFaces++;
}
console.log('cache n=%d | sin colors=%d | sin colors NI color_identity=%d | sin type_line=%d | dobles cara=%d',
  cache.size, sinColors, sinAmbos, sinType, conFaces);
// de los que no tienen colors, cuantos SI tienen color_identity utilizable
const soloCI = [...cache.values()].filter((c) => !Array.isArray(c.colors) && Array.isArray(c.color_identity));
console.log('recuperables por color_identity =', soloCI.length);
// y en las dobles cara, donde viven los colors
const face = [...cache.values()].find((c) => Array.isArray(c.card_faces) && c.card_faces.length > 1 && !Array.isArray(c.colors));
if (face) console.log('ejemplo doble cara sin colors raiz -> face[0] tiene colors?', Array.isArray(face.card_faces[0]?.colors), '| color_identity raiz?', Array.isArray(face.color_identity));

// --- HUECO 2: los 17 scryfallId que NO estan en la cache ---
const faltan = ids.filter((id) => !cache.has(id));
console.log('scryfallId sin cache = %d', faltan.length);
const ejemplos = all.docs.filter((d) => faltan.includes(d.data().scryfallId)).slice(0, 5).map((d) => d.data().cardName);
console.log('  ejemplos:', ejemplos.join(' | '));

// --- INCERTIDUMBRE 1: tiempo y memoria de expandir+filtrar a escala de mercado ---
const compact = [];
for (const d of all.docs) {
  const c = d.data(); const s = cache.get(c.scryfallId) || {};
  compact.push({ i: c.scryfallId, n: c.cardName, nl: c.cardNameLower, q: c.quantity, p: c.price,
    st: c.status, f: c.foil, cd: c.condition, e: c.setCode,
    t: s.type_line || '', cm: s.cmc ?? 0, co: s.colors || s.color_identity || [],
    r: (s.rarity || '').charAt(0), k: s.keywords || [] });
}
const CHUNK = 400;
for (const target of [8388, 25000, 100000, 250000]) {
  const reps = Math.ceil(target / compact.length);
  const big = [];
  for (let r = 0; r < reps && big.length < target; r++) for (const e of compact) { if (big.length >= target) break; big.push(e); }
  // simular chunks serializados como los guardaria Firestore
  const chunks = [];
  for (let i = 0; i < big.length; i += CHUNK) chunks.push(JSON.stringify(big.slice(i, i + CHUNK)));
  const bytes = chunks.reduce((a, s) => a + Buffer.byteLength(s, 'utf8'), 0);
  global.gc?.();
  const m0 = process.memoryUsage().heapUsed, t0 = Date.now();
  const expandido = chunks.flatMap((s) => JSON.parse(s));
  const filtrado = expandido.filter((e) => e.co.includes('B') && e.nl?.includes('blight'));
  const t1 = Date.now(), m1 = process.memoryUsage().heapUsed;
  console.log('n=%d chunks=%d bytes=%s MB | expandir+filtrar %d ms | heap +%s MB | hits=%d',
    target, chunks.length, (bytes / 1048576).toFixed(1), t1 - t0, ((m1 - m0) / 1048576).toFixed(0), filtrado.length);
}
