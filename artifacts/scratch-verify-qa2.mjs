import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'v');
const db = getFirestore(app);
for (const uid of ['90PkdmyFKrVm1RLDXjInJdlYXy73','Y3LH090ljOWcc6gk5NL5EcsGBUi1']) {
  const n = (await db.collection('public_cards').where('userId','==',uid).count().get()).data().count;
  console.log('public_cards userId=' + uid + ':', n);
}
const s = await db.collection('public_cards').where('userId','==','Y3LH090ljOWcc6gk5NL5EcsGBUi1').limit(1).get();
console.log('campos de una muestra qa2:', Object.keys(s.docs[0].data()).sort().join(','));
process.exit(0);
