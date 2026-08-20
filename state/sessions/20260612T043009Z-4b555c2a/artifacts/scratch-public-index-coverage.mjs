// SOLO LECTURA. Cobertura del public_card_index en FIREBASE_PROJECT.
// public_cards es coleccion RAIZ con campo userId. El indice vive en
// users/{uid}/public_card_index (chunks + doc _meta).
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT;
if (!projectId) { console.error('falta FIREBASE_PROJECT'); process.exit(1); }
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const totalPub = (await db.collection('public_cards').count().get()).data().count;
const users = await db.collection('users').select().get();

const rows = [];
for (const u of users.docs) {
  const uid = u.id;
  const pubCount = (await db.collection('public_cards').where('userId', '==', uid).count().get()).data().count;
  if (pubCount === 0) continue;
  const idxSnap = await db.collection(`users/${uid}/public_card_index`).get();
  const metaDoc = idxSnap.docs.find(d => d.id === '_meta');
  const meta = metaDoc ? metaDoc.data() : null;
  rows.push({
    uid, pubCount,
    tieneIndice: !!meta,
    idxCount: meta ? (meta.count ?? null) : null,
    chunks: idxSnap.docs.filter(d => d.id !== '_meta').length,
    totalChunks: meta ? (meta.totalChunks ?? null) : null,
    schemaVersion: meta ? (meta.schemaVersion ?? null) : null,
  });
}

const sinIndice = rows.filter(r => !r.tieneIndice);
const conIndice = rows.filter(r => r.tieneIndice);
const desfasados = conIndice.filter(r => Number(r.idxCount) !== r.pubCount);
const chunksFaltantes = conIndice.filter(r => Number(r.totalChunks) !== r.chunks);
const sumaSinIndice = sinIndice.reduce((a, r) => a + r.pubCount, 0);

console.log(JSON.stringify({
  projectId,
  usuariosTotal: users.size,
  documentosPublicCardsTotal: totalPub,
  vendedoresConCartasPublicas: rows.length,
  SIN_INDICE: sinIndice.length,
  cartasAfectadasSinIndice: sumaSinIndice,
  conIndice: conIndice.length,
  desfasados: desfasados.length,
  chunksFaltantes: chunksFaltantes.length,
  detalle: rows.sort((a, b) => b.pubCount - a.pubCount),
}, null, 1));
process.exit(0);
