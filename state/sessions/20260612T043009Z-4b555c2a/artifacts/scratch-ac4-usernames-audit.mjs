// TASK-257 AC4 — SOLO LECTURA. Snapshot de /usernames y /users y deteccion de
// indices huerfanos: un doc /usernames/<norm> cuyo uid apunta a un /users/<uid>
// que no existe, o cuyo campo username NO es <norm>.
// Uso: FIREBASE_PROJECT=cranial-trading-dev node scratch-ac4-usernames-audit.mjs <salida.json>
import { writeFileSync } from 'node:fs';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT;
if (!projectId) { console.error('falta FIREBASE_PROJECT'); process.exit(1); }
const out = process.argv[2];

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const usersSnap = await db.collection('users').get();
const users = new Map();
for (const d of usersSnap.docs) users.set(d.id, d.data().username ?? null);

const idxSnap = await db.collection('usernames').get();
const index = [];
const orphans = [];
for (const d of idxSnap.docs) {
  const uid = d.data().uid ?? null;
  const docUsername = uid !== null && users.has(uid) ? users.get(uid) : undefined;
  const entry = { norm: d.id, uid, docUsername: docUsername === undefined ? '<NO EXISTE /users/uid>' : docUsername };
  index.push(entry);
  if (docUsername === undefined || docUsername !== d.id) orphans.push(entry);
}

const result = {
  projectId,
  at: new Date().toISOString(),
  counts: { users: users.size, usernames: index.length, orphans: orphans.length },
  users: [...users.entries()].map(([uid, username]) => ({ uid, username })).sort((a, b) => a.uid.localeCompare(b.uid)),
  index: index.sort((a, b) => a.norm.localeCompare(b.norm)),
  orphans,
};
console.log(JSON.stringify(result.counts));
for (const o of orphans) console.log('HUERFANO:', JSON.stringify(o));
if (out) { writeFileSync(out, JSON.stringify(result, null, 2)); console.log('escrito', out); }
process.exit(0);
