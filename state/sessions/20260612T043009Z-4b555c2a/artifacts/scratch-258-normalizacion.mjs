// SOLO LECTURA. Mide indices /usernames y campos users.username que NO estan
// normalizados (normalizeUsername = trim().toLowerCase()).
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const projectId = process.env.FIREBASE_PROJECT;
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const norm = (r) => String(r ?? '').trim().toLowerCase();

const users = (await db.collection('users').get()).docs.map(d => ({ uid: d.id, username: d.data().username ?? null }));
const idx = (await db.collection('usernames').get()).docs.map(d => ({ key: d.id, uid: d.data().uid ?? null, createdAt: d.data().createdAt?.toDate?.()?.toISOString?.() ?? null }));

const idxSinNormalizar = idx.filter(i => i.key !== norm(i.key));
const userSinNormalizar = users.filter(u => u.username !== null && u.username !== norm(u.username));

// resuelve como lo hace la app: busca /usernames/<norm>, verifica doc, si no, legacy where(username==norm)
const irresolubles = [];
for (const u of users) {
  if (u.username === null) continue;
  const n = norm(u.username);
  const hit = idx.find(i => i.key === n);
  const porIndice = hit && users.find(x => x.uid === hit.uid)?.username === n;
  const porLegacy = users.some(x => x.username === n);
  if (!porIndice && !porLegacy) irresolubles.push({ uid: u.uid, username: u.username, buscaria: n });
}

console.log(JSON.stringify({ projectId, users: users.length, usernames: idx.length,
  idxSinNormalizar: idxSinNormalizar.length, userSinNormalizar: userSinNormalizar.length,
  perfilesIRRESOLUBLES: irresolubles.length }, null, 2));
for (const i of idxSinNormalizar) console.log('  IDX sin normalizar:', i.key, '->', i.uid, '| createdAt', i.createdAt);
for (const u of userSinNormalizar) console.log('  USER sin normalizar:', u.uid, '->', u.username);
for (const r of irresolubles) console.log('  IRRESOLUBLE: /@' + r.username, '(buscaria', r.buscaria + ')');
process.exit(0);
