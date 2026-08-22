import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'b');
const db = getFirestore(app); const auth = getAuth(app);
let all = []; let r = await auth.listUsers(1000); all.push(...r.users);
while (r.pageToken) { r = await auth.listUsers(1000, r.pageToken); all.push(...r.users); }
const QA = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const out = {
  auth_accounts: all.length,
  users_docs: (await db.collection('users').count().get()).data().count,
  usernames_docs: (await db.collection('usernames').count().get()).data().count,
  qa_decks: (await db.collection('users').doc(QA).collection('decks').count().get()).data().count,
  qa_binders: (await db.collection('users').doc(QA).collection('binders').count().get()).data().count,
  qa_cards: (await db.collection('users').doc(QA).collection('cards').count().get()).data().count,
  public_cards: (await db.collection('public_cards').count().get()).data().count,
};
console.log(JSON.stringify(out, null, 2));
console.log('\n--- /usernames ---');
for (const d of (await db.collection('usernames').get()).docs) console.log(' ', d.id, '->', JSON.stringify(d.data()));
console.log('\n--- cuentas Auth ---');
for (const u of all) console.log(' ', u.email, '|', u.uid, '|', u.metadata.creationTime);
process.exit(0);
