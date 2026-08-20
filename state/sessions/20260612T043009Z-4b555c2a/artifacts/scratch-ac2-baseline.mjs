// SOLO LECTURA. Re-mide el objetivo del AC2/AC3 contra PRODUCCION, HOY, para
// no verificar la tanda 3 contra numeros de ayer (rebaseline antes de juzgar).
// UNIDAD: DOCUMENTOS de public_cards, que es lo que declara el AC2.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' });
const db = getFirestore();
const UID = 'Rt5DOfZXBtPZkEpK4N5pW6a5FXs1';

const pub = await db.collection('public_cards').where('userId', '==', UID).get();
const ids = [...new Set(pub.docs.map(d => d.get('scryfallId')).filter(Boolean))];

// scryfall_cache en lotes de 30 (limite de 'in')
const cache = new Map();
for (let i = 0; i < ids.length; i += 30) {
  const lote = ids.slice(i, i + 30);
  const snap = await db.collection('scryfall_cache').where('__name__', 'in',
    lote.map(x => db.doc(`scryfall_cache/${x}`))).get();
  for (const d of snap.docs) cache.set(d.id, d.data());
}

const colorDe = (c) => {
  if (!c) return null;
  if (Array.isArray(c.colors)) return c.colors;
  const f = Array.isArray(c.card_faces) ? c.card_faces : [];
  const u = [...new Set(f.flatMap(x => Array.isArray(x.colors) ? x.colors : []))];
  if (u.length || f.some(x => Array.isArray(x.colors))) return u;
  if (Array.isArray(c.color_identity)) return c.color_identity;
  return null;
};

const cuenta = {}; let sinFuente = 0, sinCache = 0;
for (const d of pub.docs) {
  const c = cache.get(d.get('scryfallId'));
  if (!c) { sinCache++; continue; }
  const col = colorDe(c);
  if (col === null) { sinFuente++; continue; }
  for (const L of ['W','U','B','R','G']) if (col.includes(L)) cuenta[L] = (cuenta[L]||0)+1;
}

const term = 'blight';
const conts = pub.docs.filter(d => (d.get('cardNameLower') || String(d.get('cardName')||'').toLowerCase()).includes(term));
const pref  = pub.docs.filter(d => (d.get('cardNameLower') || String(d.get('cardName')||'').toLowerCase()).startsWith(term));

console.log(JSON.stringify({
  DOCUMENTOS_public_cards: pub.size, scryfallId_unicos: ids.length,
  en_scryfall_cache: cache.size, sin_doc_en_cache: sinCache, sin_fuente_de_color: sinFuente,
  DOCUMENTOS_por_color: { blancas: cuenta.W||0, azules: cuenta.U||0, negras: cuenta.B||0, rojas: cuenta.R||0, verdes: cuenta.G||0 },
  blight_substring_DOCS: conts.length, blight_prefijo_DOCS: pref.length,
  blight_nombres_unicos: [...new Set(conts.map(d => d.get('cardName')))].sort(),
}, null, 1));
process.exit(0);
