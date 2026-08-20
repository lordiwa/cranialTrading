// SOLO LECTURA. Cuenta por color LEYENDO EL INDICE construido, aplicando la
// misma regla que el filtro del servidor: OR-inclusiva por letra sobre `co`, y
// para las TIERRAS tambien `pm` (lo que producen). Acotado a tierras a
// proposito, igual que el servidor: matchear pm en no-tierras metria a Birds of
// Paradise en los 5 chips.
//
// PARA QUE SIRVE: es el control independiente contra el cual comparar lo que
// muestra la UI. Si la pantalla dice otra cosa que esto, la UI miente.
// Se RE-MIDE en el momento; no se compara contra ningun numero escrito.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT;
const uid = process.env.SELLER_UID;
if (!projectId || !uid) { console.error('faltan FIREBASE_PROJECT y/o SELLER_UID'); process.exit(1); }
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const snap = await db.collection(`users/${uid}/public_card_index`).get();
const meta = snap.docs.find(d => d.id === '_meta');
if (!meta) { console.error('sin _meta: el indice no esta construido'); process.exit(1); }

const entries = [];
for (const d of snap.docs) {
  if (d.id === '_meta') continue;
  const data = d.data() || {};
  for (const e of (data.entries || [])) entries.push(e);
}

const LETRAS = ['W', 'U', 'B', 'R', 'G'];
const esTierra = (e) => String(e.t || '').toLowerCase().includes('land');
const conteo = Object.fromEntries(LETRAS.map(l => [l, 0]));
let sinColorUsable = 0, tierras = 0, tierrasQueProducen = 0;

for (const e of entries) {
  const co = Array.isArray(e.co) ? e.co : [];
  const pm = Array.isArray(e.pm) ? e.pm : [];
  const tierra = esTierra(e);
  if (tierra) tierras += 1;
  const fuentes = new Set(co);
  if (tierra && pm.length) { tierrasQueProducen += 1; for (const l of pm) fuentes.add(l); }
  let alguno = false;
  for (const l of LETRAS) if (fuentes.has(l)) { conteo[l] += 1; alguno = true; }
  if (!alguno) sinColorUsable += 1;
}

console.log(JSON.stringify({
  projectId, uid,
  entradasEnElIndice: entries.length,
  metaCount: meta.data().count,
  totalChunks: meta.data().totalChunks,
  tierras,
  tierrasQueProducenAlgunColor: tierrasQueProducen,
  sinNingunColorUsable: sinColorUsable,
  PORCOLOR_conReglaDeTierras: conteo,
}, null, 1));
process.exit(0);
