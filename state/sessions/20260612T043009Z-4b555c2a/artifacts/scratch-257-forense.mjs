import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT });
const db = getFirestore();
console.log('--- /users ---');
for (const d of (await db.collection('users').get()).docs) {
  const x = d.data();
  console.log(d.id, '| username=', x.username, '| email=', x.email, '| createdAt=', x.createdAt?.toDate?.()?.toISOString?.() ?? x.createdAt);
}
console.log('--- /usernames ---');
for (const d of (await db.collection('usernames').get()).docs) {
  console.log(d.id, '->', JSON.stringify(d.data()));
}
process.exit(0);
