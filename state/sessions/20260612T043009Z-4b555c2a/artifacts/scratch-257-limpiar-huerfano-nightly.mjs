// Borra SOLO la basura que dejo el nightly del 2026-08-21 (uid SBeZwweb...).
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (process.env.FIREBASE_PROJECT !== 'cranial-trading-dev') { console.error('solo dev'); process.exit(1); }
initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT });
const db = getFirestore();
const UID = 'SBeZwweb8jQ87DMOYaOYe9J0yxX2';
for (const n of ['rafael', 'unique_1787295510378']) {
  const s = await db.collection('usernames').doc(n).get();
  if (s.exists && s.data().uid === UID) { await s.ref.delete(); console.log('borrado /usernames/' + n); }
  else console.log('NO borrado /usernames/' + n + ' (no existe o apunta a otro uid)');
}
await db.recursiveDelete(db.collection('users').doc(UID));
console.log('borrado /users/' + UID);
process.exit(0);
