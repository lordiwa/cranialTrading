// SOLO LECTURA sobre produccion. No escribe nada.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'prod');
const db = getFirestore(app), auth = getAuth(app);
const EMAIL = 'qa@cranialtrading.com';
let u = null;
try { u = await auth.getUserByEmail(EMAIL); } catch (e) { console.log('Auth ' + EMAIL + ':', e.code); }
if (u) {
  console.log('Auth ' + EMAIL + ': EXISTE | uid', u.uid, '| verificado', u.emailVerified, '| creada', u.metadata.creationTime);
  const ref = db.collection('users').doc(u.uid);
  console.log('  /users doc:', (await ref.get()).exists);
  for (const c of await ref.listCollections()) console.log('  ', c.id + ':', (await c.count().get()).data().count);
}
console.log('\ncolecciones raiz de PRODUCCION:');
for (const c of await db.listCollections()) {
  if (c.id === 'scryfall_cache') { console.log('  /' + c.id + ': (cache, no se cuenta)'); continue; }
  console.log('  /' + c.id + ':', (await c.count().get()).data().count);
}
process.exit(0);
