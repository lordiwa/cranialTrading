// SOLO LECTURA. Escaneo COMPLETO (todos los chunks) de las cuentas de
// produccion que tienen card_index. Marcador de dano TASK-245: t vacio.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT });
const db = getFirestore();
const users = await db.collection('users').select().get();
const out = [];
for (const u of users.docs) {
  const snap = await db.collection(`users/${u.id}/card_index`).get();
  if (snap.empty) continue;
  let n = 0, vaciasT = 0, vaciasCo = 0, vaciasR = 0, cm0 = 0;
  const versiones = new Set();
  for (const d of snap.docs) {
    const data = d.data();
    if (data.version !== undefined) versiones.add(data.version);
    for (const c of (Array.isArray(data.cards) ? data.cards : [])) {
      n++;
      if (!c || !c.t) vaciasT++;
      if (!c || !Array.isArray(c.co) || c.co.length === 0) vaciasCo++;
      if (!c || !c.r) vaciasR++;
      if (!c || !c.cm) cm0++;
    }
  }
  out.push({ uid: u.id.slice(0,8), chunks: snap.size, cartas: n,
    sinTypeLine: vaciasT, ratioT: n ? +(vaciasT/n).toFixed(4) : null,
    sinRareza: vaciasR, sinColores_ojo_incoloras_cuentan: vaciasCo, cmcCero: cm0,
    versiones: [...versiones] });
}
console.log(JSON.stringify({ proyecto: process.env.FIREBASE_PROJECT, cuentasConIndice: out.length, cuentas: out }, null, 1));
process.exit(0);
