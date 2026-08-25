import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'rs');
const db = getFirestore(app);
const ref = db.collection('users').doc('Rt5DOfZXBtPZkEpK4N5pW6a5FXs1');
const all = await ref.collection('cards').get();
const idx = new Set(); let idxTotal = 0;
for (const c of (await ref.collection('card_index').get()).docs)
  for (const e of (c.data().cards ?? [])) { idxTotal++; idx.add(String(e?.i)); }
console.log('docs:', all.size, '| entradas de indice:', idxTotal, '| unicas:', idx.size, '| divergencia docs-indice:', all.size - idx.size);
const fantasmas = [...idx].filter(i => !all.docs.some(d => d.id === i));
console.log('entradas de indice SIN documento:', fantasmas.length);
const sinIndice = all.docs.filter(d => !idx.has(d.id));
console.log('documentos SIN entrada de indice:', sinIndice.length);
for (const name of ['Ghostly Prison', 'Grand Abolisher']) {
  const hits = all.docs.filter(d => String(d.get('name') ?? '').toLowerCase() === name.toLowerCase());
  console.log('\n' + name + ':', hits.length, 'doc(s)');
  for (const h of hits) console.log('   ', h.id, '| qty', h.get('quantity'), '| status', h.get('status'), '| upd', h.get('updatedAt')?.toDate?.().toISOString(), '| en indice:', idx.has(h.id) ? 'SI' : 'NO');
}
process.exit(0);
