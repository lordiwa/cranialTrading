import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'userdoc');
const db = getFirestore(app);
const uid = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const snap = await db.collection('users').doc(uid).get();
console.log(JSON.stringify(snap.data(), null, 2));
process.exit(0);
