import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'ga');
const db = getFirestore(app);
const users = await db.collection('users').get();
console.log('usuarios en prod:', users.size);
for (const u of users.docs) {
  const cards = await u.ref.collection('cards').where('name', '>=', 'Grand Abolisher').where('name', '<=', 'Grand Abolisher').get();
  const all = await u.ref.collection('cards').get();
  const hits = all.docs.filter(d => String(d.get('name') ?? '').toLowerCase().includes('grand abolisher'));
  if (hits.length === 0) continue;
  console.log('\n=== user', u.id, '| username:', u.get('username'), '| docs totales:', all.size, '| prefix-query:', cards.size);
  const idx = new Map();
  let idxTotal = 0;
  for (const c of (await u.ref.collection('card_index').get()).docs) {
    for (const e of (c.data().cards ?? [])) { idxTotal++; idx.set(String(e?.i), { chunk: c.id, e }); }
  }
  console.log('  entradas totales en card_index:', idxTotal, '| docs totales:', all.size, '| divergencia:', all.size - idx.size);
  for (const h of hits) {
    const inIdx = idx.get(h.id);
    console.log('  DOC', h.id, '| name:', h.get('name'), '| qty:', h.get('quantity'), '| status:', h.get('status'), '| edition:', h.get('edition'), '| foil:', h.get('foil'), '| cond:', h.get('condition'), '| scryfallId:', h.get('scryfallId'), '| createdAt:', h.get('createdAt')?.toDate?.().toISOString(), '| updatedAt:', h.get('updatedAt')?.toDate?.().toISOString(), '| EN INDICE:', inIdx ? ('SI (chunk ' + inIdx.chunk + ')') : 'NO');
  }
}
process.exit(0);
