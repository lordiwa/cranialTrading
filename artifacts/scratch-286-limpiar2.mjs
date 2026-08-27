import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'c2'+Date.now());
const db = getFirestore(app);
const ref = db.collection('users').doc('90PkdmyFKrVm1RLDXjInJdlYXy73');
await ref.collection('cards').doc('F8jdNuOpYLhhxiRd2T1s').delete();
const c = await ref.collection('cards').count().get();
console.log('borrada. DOCS:', c.data().count, '(baseline 2202)');
