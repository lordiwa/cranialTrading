// Comparar documentos publicos REALES contra entradas del indice, dos veces
// separadas en el tiempo. Una foto no es un estado.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'd289');
const db = getFirestore(app);
const SELLER = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const medir = async (etiqueta) => {
  const meta = await db.collection('users').doc(SELLER).collection('public_card_index').doc('_meta').get();
  const chunks = await db.collection('users').doc(SELLER).collection('public_card_index').get();
  let entries = 0;
  for (const c of chunks.docs) { const d = c.data(); if (Array.isArray(d.entries)) entries += d.entries.length; }
  const pub = await db.collection('users').doc(SELLER).collection('cards').where('public','==',true).count().get();
  const m = meta.data() || {};
  console.log(etiqueta, '| _meta.count:', m.count, '| _meta.totalChunks:', m.totalChunks,
    '| entradas reales:', entries, '| docs public=true:', pub.data().count,
    '| divergencia(idx-doc):', entries - pub.data().count);
};
await medir('T0');
await new Promise(r => setTimeout(r, 45000));
await medir('T1 (+45s)');
process.exit(0);
