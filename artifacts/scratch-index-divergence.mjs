import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'id');
const db = getFirestore(app);
const QA = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const ref = db.collection('users').doc(QA);
const cards = await ref.collection('cards').get();
const idx = new Set();
let dupes = 0; const seen = new Set();
for (const c of (await ref.collection('card_index').get()).docs) {
  for (const e of (c.data().cards ?? [])) {
    const i = String(e?.i);
    if (seen.has(i)) dupes++; else seen.add(i);
    idx.add(i);
  }
}
const faltan = [], sobran = new Set(idx);
for (const d of cards.docs) {
  sobran.delete(d.id);
  if (!idx.has(d.id)) faltan.push({ id: d.id, name: d.get('name'), status: d.get('status'), createdAt: d.get('createdAt')?.toDate?.().toISOString() });
}
console.log('documentos:', cards.size, '| entradas unicas en indice:', idx.size, '| duplicadas:', dupes);
console.log('\nDOCUMENTOS SIN ENTRADA EN EL INDICE (' + faltan.length + '):');
for (const f of faltan) console.log('  ', f.id, '|', f.name, '| status:', f.status, '|', f.createdAt);
console.log('\nENTRADAS DE INDICE SIN DOCUMENTO, o sea fantasmas (' + sobran.size + '):');
for (const s of sobran) console.log('  ', s);
process.exit(0);
