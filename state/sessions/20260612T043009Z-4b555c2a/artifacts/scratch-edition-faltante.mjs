// SOLO LECTURA. Pregunta del reviewer (LOW-4): `ed` no tiene fallback a la
// cache. Para un doc de public_cards SIN setCode Y SIN edition, la busqueda por
// nombre de set en el perfil publico no funciona. Cuantos docs estan asi?
// Si son ~0, LOW-4 es cosmetico. Si son muchos, es un resto del HIGH-1.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT;
if (!projectId) { console.error('falta FIREBASE_PROJECT'); process.exit(1); }
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const snap = await db.collection('public_cards').get();
let sinEdition = 0, sinSetCode = 0, sinAmbos = 0;
const porUsuario = new Map();
const ejemplos = [];

for (const d of snap.docs) {
  const c = d.data();
  const noEd = !c.edition;
  const noSc = !c.setCode;
  if (noEd) sinEdition += 1;
  if (noSc) sinSetCode += 1;
  if (noEd && noSc) {
    sinAmbos += 1;
    const uid = c.userId || '(sin userId)';
    porUsuario.set(uid, (porUsuario.get(uid) || 0) + 1);
    if (ejemplos.length < 5) ejemplos.push({ id: d.id, scryfallId: c.scryfallId, name: c.name });
  }
}

console.log(JSON.stringify({
  projectId,
  documentosPublicCards: snap.size,
  sinEdition,
  sinSetCode,
  SIN_AMBOS_ed_y_sc: sinAmbos,
  pctSinAmbos: snap.size ? +(sinAmbos * 100 / snap.size).toFixed(2) : 0,
  porUsuario: [...porUsuario.entries()].map(([uid, n]) => ({ uid, docs: n })),
  ejemplos,
}, null, 1));
process.exit(0);
