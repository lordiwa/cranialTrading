import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'statuscheck');
const db = getFirestore(app);
const uid = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const snap = await db.collection('users').doc(uid).collection('cards').get();
const byStatus = {};
let publicTrue = 0, publicFalse = 0, publicMissing = 0;
for (const d of snap.docs) {
  const data = d.data();
  byStatus[data.status] = (byStatus[data.status]||0)+1;
  if (data.public === true) publicTrue++;
  else if (data.public === false) publicFalse++;
  else publicMissing++;
}
console.log('total', snap.size, 'byStatus', byStatus, 'public true/false/missing', publicTrue, publicFalse, publicMissing);
process.exit(0);
