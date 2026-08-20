// SOLO LECTURA. MEDIUM-1 de la ronda 3: existen cartas sale/trade SIN campo
// `public`? Si existen, el guard nuevo (isPublicCard = public === true) las
// trata como no-publicas y reintroduce el fantasma de HIGH-2.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT });
const db = getFirestore();
const users = await db.collection('users').select().get();
let totSaleTrade = 0, sinCampo = 0, pubTrue = 0, pubFalse = 0;
const culpables = [];
for (const u of users.docs) {
  const snap = await db.collection(`users/${u.id}/cards`).where('status', 'in', ['sale', 'trade']).get();
  if (snap.empty) continue;
  let sc = 0;
  for (const d of snap.docs) {
    totSaleTrade++;
    const p = d.get('public');
    if (p === undefined || p === null) { sinCampo++; sc++; }
    else if (p === true) pubTrue++;
    else pubFalse++;
  }
  if (sc > 0) culpables.push({ uid: u.id.slice(0, 8), saleTrade: snap.size, sinCampoPublic: sc });
}
console.log(JSON.stringify({
  proyecto: process.env.FIREBASE_PROJECT,
  cartasSaleOTrade: totSaleTrade,
  SIN_campo_public: sinCampo,
  public_true: pubTrue, public_false: pubFalse,
  cuentasAfectadas: culpables.length, detalle: culpables.slice(0, 10),
}, null, 1));
process.exit(0);
