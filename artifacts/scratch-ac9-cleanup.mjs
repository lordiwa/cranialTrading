/**
 * TASK-271 AC9 — limpieza de la basura que la suite YA dejo en dev.
 * DRY-RUN por defecto. Solo borra si se le pasa --apply.
 *
 * NO TOCA, a proposito:
 *  - /usernames/qa ni /usernames/qa2: huerfanos VIVOS como evidencia de TASK-268.
 *  - las cuentas qa@ y qa2@: son las cuentas de QA de la suite.
 *  - las 2 cartas Lightning Bolt de wishlist: evidencia del grupo A de TASK-275,
 *    donde todavia no se sabe si les falta la entrada de card_index o si el
 *    indice excluye wishlist por diseno. Borrarlas taparia esa pregunta.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const APPLY = process.argv.includes('--apply');
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'ac9');
const db = getFirestore(app), auth = getAuth(app);

const QA = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const PROTEGIDOS = new Set(['qa', 'qa2', 'qa_mtg', 'qa2_mtg']);
const CUENTAS_QA = new Set([QA, 'Y3LH090ljOWcc6gk5NL5EcsGBUi1']);

const plan = { cuentas: [], mazos: [], cartasIntactas: [] };

let r = await auth.listUsers(1000); const todas = [...r.users];
while (r.pageToken) { r = await auth.listUsers(1000, r.pageToken); todas.push(...r.users); }
for (const u of todas) {
  if (CUENTAS_QA.has(u.uid)) continue;
  if (!/@e2etest\.com$/.test(u.email ?? '')) { console.log('SALTEADA (no parece E2E):', u.email, u.uid); continue; }
  const doc = await db.collection('users').doc(u.uid).get();
  const subs = [];
  if (doc.exists) for (const c of await doc.ref.listCollections()) subs.push(`${c.id}:${(await c.count().get()).data().count}`);
  const uns = (await db.collection('usernames').where('uid', '==', u.uid).get()).docs
    .map((d) => d.id).filter((id) => !PROTEGIDOS.has(id));
  plan.cuentas.push({ uid: u.uid, email: u.email, userDoc: doc.exists, subs, usernames: uns });
}
for (const d of (await db.collection('users').doc(QA).collection('decks').get()).docs) {
  if (/^Editor Test \d+$/.test(String(d.get('name') ?? ''))) plan.mazos.push({ id: d.id, name: d.get('name') });
}
for (const d of (await db.collection('users').doc(QA).collection('cards').where('status', '==', 'wishlist').get()).docs) {
  plan.cartasIntactas.push({ id: d.id, name: d.get('name') });
}

console.log(JSON.stringify(plan, null, 2));
console.log('\nA BORRAR:', plan.cuentas.length, 'cuentas |', plan.mazos.length, 'mazos');
console.log('A DEJAR INTACTAS:', plan.cartasIntactas.length, 'cartas de wishlist (evidencia de TASK-275)');

if (!APPLY) { console.log('\nDRY-RUN. Nada borrado. Pasar --apply para ejecutar.'); process.exit(0); }

// Orden deliberado, el mismo de e2e/helpers/admin.ts deleteAccount: /usernames
// PRIMERO y Auth AL FINAL. Si esto se corta a la mitad, lo peor que queda es una
// cuenta sin username reservado; nunca una entrada de /usernames apuntando a una
// cuenta borrada, que es el huerfano que investiga TASK-268.
console.log('\n--- APLICANDO ---');
for (const c of plan.cuentas) {
  for (const un of c.usernames) { await db.collection('usernames').doc(un).delete(); console.log('  borrado /usernames/' + un); }
  if (c.userDoc) { await db.collection('users').doc(c.uid).delete(); console.log('  borrado /users/' + c.uid); }
  await auth.deleteUser(c.uid).catch((e) => { if (e.code !== 'auth/user-not-found') throw e; });
  console.log('  borrada cuenta Auth', c.email);
}
for (const m of plan.mazos) {
  await db.collection('users').doc(QA).collection('decks').doc(m.id).delete();
  console.log('  borrado mazo', JSON.stringify(m.name), m.id);
}
console.log('\nDEJADAS A PROPOSITO (TASK-275):', plan.cartasIntactas.map((c) => c.id).join(', '));
process.exit(0);
