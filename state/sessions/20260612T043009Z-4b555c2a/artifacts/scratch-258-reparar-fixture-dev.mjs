// TASK-258 — repara el fixture sin normalizar de DEV, autorizado por Rafael 2026-08-21.
// Solo cranial-trading-dev. Reversible: el estado previo queda impreso.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (process.env.FIREBASE_PROJECT !== 'cranial-trading-dev') { console.error('solo dev'); process.exit(1); }
initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT });
const db = getFirestore();
const UID = 'jV6gJqf3csPA4vRfO2k9Vb5ejYo2';
const VIEJO = 'RafaMoose', NUEVO = 'rafamoose';
const apply = process.argv.includes('--yes');

const uSnap = await db.collection('users').doc(UID).get();
const iVSnap = await db.collection('usernames').doc(VIEJO).get();
const iNSnap = await db.collection('usernames').doc(NUEVO).get();
console.log('ANTES:', JSON.stringify({
  usersUsername: uSnap.data()?.username ?? null,
  indiceViejo: iVSnap.exists ? iVSnap.data() : null,
  indiceNuevo: iNSnap.exists ? iNSnap.data() : null,
}, null, 2));
if (iNSnap.exists && iNSnap.data().uid !== UID) { console.error('ABORTA: /usernames/' + NUEVO + ' ya existe y apunta a OTRO uid'); process.exit(1); }
if (!apply) { console.log('\nDRY RUN. --yes para aplicar.'); process.exit(0); }

// Orden: crear el indice nuevo ANTES de borrar el viejo, para no dejar una ventana sin ningun indice.
await db.collection('usernames').doc(NUEVO).set({ uid: UID, createdAt: iVSnap.data()?.createdAt ?? new Date() });
console.log('creado /usernames/' + NUEVO);
await db.collection('users').doc(UID).update({ username: NUEVO });
console.log('actualizado /users/' + UID + '.username ->', NUEVO);
await db.collection('usernames').doc(VIEJO).delete();
console.log('borrado /usernames/' + VIEJO);
process.exit(0);
