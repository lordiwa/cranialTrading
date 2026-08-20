// SOLO LECTURA. Descubre la forma real del card_index en produccion.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT });
const db = getFirestore();
const users = await db.collection('users').select().get();
let mostrados = 0;
for (const u of users.docs) {
  const snap = await db.collection(`users/${u.id}/card_index`).limit(5).get();
  if (snap.empty) continue;
  const ids = snap.docs.map(d => d.id);
  const primero = snap.docs.find(d => d.id !== '_meta') || snap.docs[0];
  const data = primero.data();
  console.log(JSON.stringify({
    uid: u.id.slice(0, 8), docIds: ids, inspeccionado: primero.id,
    claves: Object.keys(data).slice(0, 12),
    entriesEsArray: Array.isArray(data.entries),
    nEntries: Array.isArray(data.entries) ? data.entries.length : null,
    muestraEntrada: Array.isArray(data.entries) && data.entries[0] ? Object.keys(data.entries[0]) : null,
  }));
  if (++mostrados >= 3) break;
}
if (mostrados === 0) console.log(JSON.stringify({ resultado: 'NINGUN usuario tiene documentos en card_index', usuarios: users.size }));
process.exit(0);
