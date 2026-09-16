import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'cardsample');
const db = getFirestore(app);
const uid = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const snap = await db.collection('users').doc(uid).collection('cards').limit(2).get();
for (const d of snap.docs) console.log(d.id, JSON.stringify(d.data()));
process.exit(0);
