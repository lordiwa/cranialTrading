import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'filtros');
const db = getFirestore(app);
const uid = 'Rt5DOfZXBtPZkEpK4N5pW6a5FXs1';
const ref = db.collection('users').doc(uid);

// 1) ENTRADAS DEL INDICE: cuantas conservan metadatos de filtro
const idxSnap = await ref.collection('card_index').get();
let total = 0, noType = 0, noColors = 0, noRarity = 0, noCmc = 0, noSet = 0;
const sample = [];
for (const chunk of idxSnap.docs) {
  for (const e of (chunk.data().cards ?? [])) {
    total++;
    if (!e?.t) noType++;
    if (!Array.isArray(e?.co) || e.co.length === 0) noColors++;
    if (!e?.r) noRarity++;
    if (!e?.cm && e?.cm !== 0) noCmc++;
    if (!e?.sc) noSet++;
    if (sample.length < 3) sample.push(e);
  }
}
console.log('CHUNKS:', idxSnap.size, '| ENTRADAS:', total);
console.log('sin type_line (t):', noType, '| sin colors (co):', noColors, '| sin rarity (r):', noRarity, '| sin cmc:', noCmc, '| sin setCode (sc):', noSet);
console.log('MUESTRA:', JSON.stringify(sample, null, 1).slice(0, 1200));

// 2) DOCUMENTOS: tienen los datos crudos?
const cards = await ref.collection('cards').limit(400).get();
let dNoType = 0, dNoColors = 0, dNoRarity = 0;
for (const d of cards.docs) {
  const c = d.data();
  if (!c.type_line && !c.typeLine) dNoType++;
  if (!Array.isArray(c.colors) || c.colors.length === 0) dNoColors++;
  if (!c.rarity) dNoRarity++;
}
console.log('DOCS muestreados:', cards.size, '| sin type_line:', dNoType, '| sin colors:', dNoColors, '| sin rarity:', dNoRarity);
console.log('CAMPOS de un doc:', Object.keys(cards.docs[0]?.data() ?? {}).sort().join(', '));
process.exit(0);
