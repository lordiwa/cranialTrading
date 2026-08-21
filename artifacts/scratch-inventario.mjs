import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const projectId = process.argv[2];
if (!projectId) { console.error('falta projectId'); process.exit(1); }
const app = initializeApp({ credential: applicationDefault(), projectId }, 'inv-' + projectId);
const db = getFirestore(app);
const auth = getAuth(app);

console.log('=== PROYECTO:', projectId, '===');
const cols = await db.listCollections();
console.log('colecciones raiz:', cols.length);
let total = 0;
for (const c of cols) {
  const snap = await c.count().get();
  const n = snap.data().count;
  total += n;
  console.log(`  /${c.id}: ${n} docs`);
}
console.log('TOTAL docs en colecciones raiz:', total);

// subcolecciones bajo /users
try {
  const users = await db.collection('users').limit(50).get();
  console.log('\nsubcolecciones bajo /users (muestra de', users.size, 'usuarios):');
  const subTotals = {};
  for (const u of users.docs) {
    for (const sc of await u.ref.listCollections()) {
      const s = await sc.count().get();
      subTotals[sc.id] = (subTotals[sc.id] || 0) + s.data().count;
    }
  }
  for (const [k, v] of Object.entries(subTotals)) console.log(`  users/*/${k}: ${v} docs`);
  if (Object.keys(subTotals).length === 0) console.log('  (ninguna)');
} catch (e) { console.log('  error leyendo subcolecciones:', e.message); }

let count = 0;
let res = await auth.listUsers(1000);
count += res.users.length;
while (res.pageToken) { res = await auth.listUsers(1000, res.pageToken); count += res.users.length; }
console.log('\nCUENTAS EN AUTH:', count);
process.exit(0);
