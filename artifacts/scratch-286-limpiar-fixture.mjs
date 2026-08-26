import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'cl'+Date.now());
const db = getFirestore(app);
const ref = db.collection('users').doc('90PkdmyFKrVm1RLDXjInJdlYXy73');
// SOLO los 3 ids que cree yo a las 22:30:07 en la verificacion de TASK-285
const mios = ['B6MufYRTQ7FXKSmE2r3Q','s97K2WbTfedRCWBmch92','x8rgdHGFrKp5ZVNzoIOT'];
for (const id of mios) {
  const d = await ref.collection('cards').doc(id).get();
  if (!d.exists) { console.log(id, 'ya no existe'); continue; }
  console.log('borrando', id, d.get('name'), d.get('setCode'), 'creada', d.get('createdAt')?.toDate?.().toISOString());
  await ref.collection('cards').doc(id).delete();
}
const decks = await ref.collection('decks').get();
for (const dk of decks.docs) {
  if (dk.get('name') === 'VERIF-285') { console.log('borrando mazo', dk.id, dk.get('name')); await dk.ref.delete(); }
}
const c = await ref.collection('cards').count().get();
console.log('DOCS restantes:', c.data().count, '(baseline esperado: 2202)');
