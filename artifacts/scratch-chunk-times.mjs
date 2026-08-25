import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'ct');
const db = getFirestore(app);
const snap = await db.collection('users').doc('Rt5DOfZXBtPZkEpK4N5pW6a5FXs1').collection('card_index').get();
for (const d of snap.docs) {
  const bytes = Buffer.byteLength(JSON.stringify(d.data()), 'utf8');
  console.log(d.id, '| entradas:', (d.data().cards ?? []).length, '| tamano aprox:', (bytes/1024).toFixed(0) + ' KB', '| updatedAt:', d.get('updatedAt')?.toDate?.().toISOString() ?? '(sin campo)');
}
process.exit(0);
