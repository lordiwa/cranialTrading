// SOLO LECTURA. Cierra las incertidumbres 1, 2 y 4 de TASK-247 AC1.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' });
const db = getFirestore();

// ---- traer TODO public_cards global (8.388 docs) ----
const all = await db.collection('public_cards').get();
console.log('public_cards global =', all.size);
const ids = [...new Set(all.docs.map((d) => d.data().scryfallId).filter(Boolean))];
console.log('scryfallId unicos globales =', ids.length);

// ---- INCERTIDUMBRE 4: cobertura de scryfall_cache sobre TODO lo publico, no solo la cuenta de Rafael ----
const cache = new Map();
for (let i = 0; i < ids.length; i += 300) {
  const refs = ids.slice(i, i + 300).map((id) => db.collection('scryfall_cache').doc(id));
  const docs = await db.getAll(...refs);
  for (const d of docs) if (d.exists) cache.set(d.id, d.data().card || d.data());
}
console.log('COBERTURA scryfall_cache GLOBAL = %d/%d (%.1f%%)  faltan=%d',
  cache.size, ids.length, (cache.size / ids.length) * 100, ids.length - cache.size);

// campos utiles presentes en la cache
let conColors = 0, conType = 0, conRarity = 0, conCmc = 0, conKeywords = 0, conOracle = 0;
for (const c of cache.values()) {
  if (Array.isArray(c.colors)) conColors++;
  if (c.type_line) conType++;
  if (c.rarity) conRarity++;
  if (typeof c.cmc === 'number') conCmc++;
  if (Array.isArray(c.keywords)) conKeywords++;
  if (typeof c.oracle_text === 'string') conOracle++;
}
const n = cache.size;
console.log('en cache: colors=%d type_line=%d rarity=%d cmc=%d keywords=%d oracle_text=%d (de %d)',
  conColors, conType, conRarity, conCmc, conKeywords, conOracle, n);

// ---- verificar los NUMEROS OBJETIVO del ticket (AC2 y AC3) de forma independiente ----
const UID = 'Rt5DOfZXBtPZkEpK4N5pW6a5FXs1';
const mine = all.docs.filter((d) => d.data().userId === UID).map((d) => d.data());
const colorCount = (letter) => {
  let unicas = new Set(), copias = 0;
  for (const c of mine) {
    const s = cache.get(c.scryfallId);
    if (!s) continue;
    const co = s.colors ?? s.color_identity ?? [];
    if (co.includes(letter)) { unicas.add(c.scryfallId); copias += (c.quantity || 1); }
  }
  return { docs: mine.filter((c) => (cache.get(c.scryfallId)?.colors ?? []).includes(letter)).length, unicas: unicas.size, copias };
};
for (const l of ['B', 'W', 'U', 'R', 'G']) {
  const r = colorCount(l);
  console.log('color %s -> docs=%d cartas_unicas=%d copias=%d', l, r.docs, r.unicas, r.copias);
}
const blight = mine.filter((c) => (c.cardNameLower || c.cardName || '').toLowerCase().includes('blight'));
const blightPrefijo = mine.filter((c) => (c.cardNameLower || '').startsWith('blight'));
console.log("'blight' substring -> %d docs (%d nombres unicos) | por PREFIJO -> %d docs",
  blight.length, new Set(blight.map((c) => c.cardName)).size, blightPrefijo.length);
console.log('  nombres:', [...new Set(blight.map((c) => c.cardName))].join(' | '));
