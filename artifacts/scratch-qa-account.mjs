import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
const projectId = process.argv[2];
const app = initializeApp({ credential: applicationDefault(), projectId }, 'qa-' + projectId);
const db = getFirestore(app); const auth = getAuth(app);

let all = []; let r = await auth.listUsers(1000); all.push(...r.users);
while (r.pageToken) { r = await auth.listUsers(1000, r.pageToken); all.push(...r.users); }
console.log('CUENTAS EN AUTH:', all.length);
for (const u of all) console.log('  ', u.email, '| uid:', u.uid, '| verificado:', u.emailVerified);

const cols = await db.listCollections();
console.log('\ncolecciones raiz:', cols.map(c => c.id).join(', '));
for (const c of cols) {
  if (c.id === 'scryfall_cache') { console.log(`  /${c.id}: (cache, no se toca)`); continue; }
  const s = await c.count().get(); console.log(`  /${c.id}: ${s.data().count} docs`);
}
const users = await db.collection('users').get();
for (const u of users.docs) {
  const d = u.data();
  console.log('\n--- /users/' + u.id + ' ---');
  console.log('  username:', JSON.stringify(d.username), '| location:', JSON.stringify(d.location));
  console.log('  photoURL:', d.photoURL ? 'presente' : 'AUSENTE', '| email:', d.email);
  for (const sc of await u.ref.listCollections()) {
    const s = await sc.count().get();
    console.log(`  ${sc.id}: ${s.data().count}`);
  }
}
const un = await db.collection('usernames').get();
console.log('\n/usernames:');
un.forEach(d => console.log('  ', JSON.stringify(d.id), '->', JSON.stringify(d.data())));
const pc = await db.collection('public_cards').count().get();
console.log('\n/public_cards:', pc.data().count);
process.exit(0);
