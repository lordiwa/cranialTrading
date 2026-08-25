import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
const KEEP = 'Rt5DOfZXBtPZkEpK4N5pW6a5FXs1';
const PRESERVE_ROOT = new Set(['scryfall_cache']);
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' }, 'wipe');
const db = getFirestore(app); const auth = getAuth(app);
const DRY = process.argv[2] !== '--go';
console.log(DRY ? '=== DRY RUN ===' : '=== EJECUTANDO ===');

const roots = await db.listCollections();
console.log('colecciones raiz:', roots.map(c => c.id).join(', '));

for (const col of roots) {
  if (PRESERVE_ROOT.has(col.id)) { console.log('PRESERVADA:', col.id); continue; }
  const docs = await col.listDocuments();
  for (const d of docs) {
    if (col.id === 'users' && d.id === KEEP) { console.log('PRESERVADO: users/' + KEEP); continue; }
    if (col.id === 'usernames') {
      const snap = await d.get();
      if (snap.exists && snap.get('uid') === KEEP) { console.log('PRESERVADO: usernames/' + d.id); continue; }
    }
    if (col.id === 'contact_info' && d.id === KEEP) { console.log('PRESERVADO: contact_info/' + KEEP); continue; }
    if (col.id === 'public_preferences' && d.id === KEEP) { console.log('PRESERVADO: public_preferences/' + KEEP); continue; }
    console.log('BORRAR:', col.id + '/' + d.id);
    if (!DRY) await db.recursiveDelete(d);
  }
}

const toDelete = [];
let res = await auth.listUsers(1000);
while (true) {
  for (const u of res.users) if (u.uid !== KEEP) toDelete.push(u.uid);
  if (!res.pageToken) break;
  res = await auth.listUsers(1000, res.pageToken);
}
console.log('AUTH: borrar', toDelete.length, 'cuentas, conservar 1 (' + KEEP + ')');
if (!DRY) {
  for (let i = 0; i < toDelete.length; i += 1000) {
    const r = await auth.deleteUsers(toDelete.slice(i, i + 1000));
    console.log('  lote', i / 1000 + 1, '- exito:', r.successCount, 'fallo:', r.failureCount);
  }
}
process.exit(0);
