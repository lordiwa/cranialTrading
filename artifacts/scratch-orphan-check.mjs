import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'o');
const db = getFirestore(app);
for (const d of (await db.collection('usernames').get()).docs) {
  const uid = d.data().uid;
  const u = await db.collection('users').doc(uid).get();
  const declared = u.exists ? u.data().username : '(SIN DOC /users)';
  const coherent = String(declared).toLowerCase() === d.id.toLowerCase();
  console.log((coherent ? 'OK      ' : 'HUERFANO') + '  /usernames/' + d.id + '  -> uid ' + uid + '  doc.username=' + JSON.stringify(declared));
}
process.exit(0);
