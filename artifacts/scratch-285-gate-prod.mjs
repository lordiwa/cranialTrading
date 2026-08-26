import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'gate'+Date.now());
const db = getFirestore(app);
try {
  const u = await getAuth(app).getUserByEmail('qa@cranialtrading.com');
  console.log('qa@ EXISTE en Auth de prod. uid:', u.uid);
  const cards = await db.collection('users').doc(u.uid).collection('cards').count().get();
  console.log('cartas en la cuenta qa@ de prod:', cards.data().count);
  const idx = await db.collection('users').doc(u.uid).collection('card_index').get();
  let n=0; for (const c of idx.docs) n += (c.data().cards ?? []).length;
  console.log('entradas de card_index:', n);
} catch (e) {
  console.log('FALLA DEL GATE:', e.code ?? e.message);
}
process.exit(0);
