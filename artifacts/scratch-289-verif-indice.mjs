// Verificar por lectura DIRECTA (sin pasar por la function) si Core Prowler
// sigue en el public_card_index del vendedor, y con que campos.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'v289');
const db = getFirestore(app);
const SELLER = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const chunks = await db.collection('users').doc(SELLER).collection('public_card_index').get();
let entries = [];
for (const c of chunks.docs) {
  const d = c.data();
  if (Array.isArray(d.entries)) entries = entries.concat(d.entries);
  else console.log('doc sin entries:', c.id, Object.keys(d).join(','));
}
console.log('chunks:', chunks.size, '| entries totales:', entries.length);
const hit = entries.filter(e => String(e.n || '').toLowerCase().includes('prowler'));
console.log('entradas con "prowler":', hit.length);
for (const h of hit) console.log('  ', JSON.stringify(h));
process.exit(0);
