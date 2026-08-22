import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'd275');
const db = getFirestore(app);
const CUENTAS = [
  ['qa  (1878 importadas)', '90PkdmyFKrVm1RLDXjInJdlYXy73'],
  ['qa2 (5658 importadas)', 'Y3LH090ljOWcc6gk5NL5EcsGBUi1'],
];
for (const [label, uid] of CUENTAS) {
  const ref = db.collection('users').doc(uid);
  const cards = await ref.collection('cards').get();
  const chunks = await ref.collection('card_index').get();
  const idx = new Set(); let entradas = 0;
  const porChunk = [];
  for (const c of chunks.docs) {
    const arr = c.data().cards ?? [];
    porChunk.push(`${c.id}:${arr.length}`);
    entradas += arr.length;
    for (const e of arr) idx.add(String(e?.i));
  }
  const faltan = cards.docs.filter((d) => !idx.has(d.id));
  const porEstado = {};
  for (const f of faltan) porEstado[f.get('status')] = (porEstado[f.get('status')] ?? 0) + 1;
  console.log('=== ' + label + ' ===');
  console.log('  documentos:', cards.size, '| entradas:', entradas, '| unicas:', idx.size, '| chunks:', porChunk.join(' '));
  console.log('  FALTAN EN EL INDICE:', faltan.length, '| por estado:', JSON.stringify(porEstado));
  const orden = cards.docs.map((d) => d.id);
  const posiciones = faltan.map((f) => orden.indexOf(f.id));
  console.log('  posiciones en el orden por id:', JSON.stringify(posiciones.slice(0, 30)), posiciones.length > 30 ? '...' : '');
  console.log('  primeros faltantes:', faltan.slice(0, 8).map((f) => f.get('name')).join(' | '));
}
process.exit(0);
