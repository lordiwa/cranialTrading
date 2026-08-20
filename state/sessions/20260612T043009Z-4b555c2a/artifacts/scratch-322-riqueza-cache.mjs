// SOLO LECTURA. Pregunta del reviewer (MEDIUM-4): de los docs de scryfall_cache
// que EXISTEN pero NO tienen `set` (la forma dominante del backfill, 322 en
// prod), cuantos traen campos ricos que un merge mal hecho borraria?
// Si son pocos, el riesgo es chico. Si son muchos, no.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT;
if (!projectId) { console.error('falta FIREBASE_PROJECT'); process.exit(1); }
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const snap = await db.collection('public_cards').get();
const ids = [...new Set(snap.docs.filter(d => !d.data().setCode).map(d => d.data().scryfallId).filter(Boolean))];

const RICOS = ['keywords', 'full_art', 'produced_mana', 'power', 'toughness', 'type_line', 'colors', 'color_identity', 'card_faces', 'oracle_text', 'cmc', 'rarity'];
const conteo = Object.fromEntries(RICOS.map(k => [k, 0]));
let parciales = 0;
let sinNingunRico = 0;
const histograma = new Map();

for (let i = 0; i < ids.length; i += 300) {
  const docs = await db.getAll(...ids.slice(i, i + 300).map(id => db.doc(`scryfall_cache/${id}`)));
  for (const doc of docs) {
    if (!doc.exists) continue;
    const c = doc.data() || {};
    if (c.set) continue;           // no es de los 322
    parciales += 1;
    let n = 0;
    for (const k of RICOS) {
      const v = c[k];
      const tiene = Array.isArray(v) ? v.length > 0 : (v !== undefined && v !== null && v !== '');
      if (tiene) { conteo[k] += 1; n += 1; }
    }
    if (n === 0) sinNingunRico += 1;
    histograma.set(n, (histograma.get(n) || 0) + 1);
    if (parciales <= 3) console.error('MUESTRA ' + doc.id + ': ' + JSON.stringify(Object.keys(c).sort()));
  }
}

console.log(JSON.stringify({
  projectId,
  docsParciales_existen_sin_set: parciales,
  sinNingunCampoRico: sinNingunRico,
  camposRicosPresentes: conteo,
  histogramaCamposRicosPorDoc: [...histograma.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => ({ campos: n, docs: c })),
}, null, 1));
process.exit(0);
