import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'cache');
const db = getFirestore(app);
const uid = 'Rt5DOfZXBtPZkEpK4N5pW6a5FXs1';
const idxSnap = await db.collection('users').doc(uid).collection('card_index').get();
const ids = new Set();
for (const c of idxSnap.docs) for (const e of (c.data().cards ?? [])) if (e?.s) ids.add(String(e.s));
console.log('scryfallIds unicos en el indice:', ids.size);
const list = [...ids];
const sampleIds = list.slice(0, 300);
let found = 0, withType = 0, withColors = 0, withRarity = 0, withCmc = 0;
let firstDoc = null;
for (const id of sampleIds) {
  const d = await db.collection('scryfall_cache').doc(id).get();
  if (!d.exists) continue;
  found++;
  const v = d.data();
  if (!firstDoc) firstDoc = v;
  if (v.type_line) withType++;
  if (Array.isArray(v.colors)) withColors++;
  if (v.rarity) withRarity++;
  if (typeof v.cmc === 'number') withCmc++;
}
console.log('muestra:', sampleIds.length, '| en scryfall_cache:', found, '| con type_line:', withType, '| con colors[]:', withColors, '| con rarity:', withRarity, '| con cmc:', withCmc);
console.log('CAMPOS del cache:', Object.keys(firstDoc ?? {}).sort().join(', '));
const total = await db.collection('scryfall_cache').count().get();
console.log('docs totales en scryfall_cache:', total.data().count);
process.exit(0);
