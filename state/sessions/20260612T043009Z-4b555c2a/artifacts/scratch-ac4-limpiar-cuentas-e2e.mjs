// TASK-257 AC4 — limpieza de las cuentas que crea e2e:auth en DEV.
// Compara dos snapshots de scratch-ac4-usernames-audit.mjs y borra SOLO lo que
// aparecio entre uno y otro: docs nuevos en /users y en /usernames.
// NO toca Firebase Auth (decision heredada de TASK-256 / pregunta abierta 2026-08-19).
// Uso: FIREBASE_PROJECT=cranial-trading-dev node scratch-ac4-limpiar-cuentas-e2e.mjs antes.json despues.json [--yes]
import { readFileSync } from 'node:fs';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT;
if (projectId !== 'cranial-trading-dev') { console.error('este script SOLO corre contra cranial-trading-dev'); process.exit(1); }
const [antesPath, despuesPath] = process.argv.slice(2, 4);
const apply = process.argv.includes('--yes');

const antes = JSON.parse(readFileSync(antesPath, 'utf8'));
const despues = JSON.parse(readFileSync(despuesPath, 'utf8'));

const uidsAntes = new Set(antes.users.map((u) => u.uid));
const normsAntes = new Set(antes.index.map((i) => i.norm));
const usersNuevos = despues.users.filter((u) => !uidsAntes.has(u.uid));
const indexNuevos = despues.index.filter((i) => !normsAntes.has(i.norm));

console.log(JSON.stringify({ usersNuevos: usersNuevos.length, indexNuevos: indexNuevos.length }, null, 2));
for (const u of usersNuevos) console.log('  /users/' + u.uid, '->', u.username);
for (const i of indexNuevos) console.log('  /usernames/' + i.norm, '->', i.uid, '(doc dice: ' + i.docUsername + ')');

if (!apply) { console.log('\nDRY RUN. Pasar --yes para borrar.'); process.exit(0); }

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
let borrados = 0;
for (const u of usersNuevos) { await db.recursiveDelete(db.collection('users').doc(u.uid)); borrados++; console.log('borrado /users/' + u.uid); }
for (const i of indexNuevos) { await db.collection('usernames').doc(i.norm).delete(); borrados++; console.log('borrado /usernames/' + i.norm); }
console.log(JSON.stringify({ borrados }));
process.exit(0);
