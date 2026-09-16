// Comparar documentos publicos REALES contra entradas del indice, dos veces
// separadas en el tiempo. Una foto no es un estado.
//
// LIMITACION (TASK-290 AC7): este script compara
// users/<SELLER>/public_card_index contra users/<SELLER>/cards where
// public==true. NUNCA lee la coleccion RAIZ `public_cards` (userId==SELLER),
// que es la fuente real de la que se DERIVA el indice (ver
// buildPublicCardsQuerySpec en functions/lib/publicCardIndexExecutor.js) y
// la que se vacio en el incidente que motivo TASK-290 (400 de 2202
// esperados, medido 2026-09-16). Si `public_cards` (raiz) y
// `users/<SELLER>/cards where public==true` alguna vez divergen entre si
// (p.ej. un borrado directo sobre la raiz que no toco `cards`), este script
// reporta divergencia(idx-doc)=0 igual, porque el indice puede estar
// perfectamente sincronizado con una raiz ya vaciada — no detecta ESE caso.
// No corregido aca a proposito: es un script scratch de diagnostico puntual,
// no superficie de producto; scripts/repair-public-cards-parity.mjs (TASK-290)
// es el que sí compara y repara contra la coleccion raiz.
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
