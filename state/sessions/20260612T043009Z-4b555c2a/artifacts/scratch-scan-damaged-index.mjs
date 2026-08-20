// SOLO LECTURA. Cuantas cuentas de produccion tienen el card_index con los
// metadatos vaciados (familia TASK-245). Forma real MEDIDA: doc 'chunk_N',
// campo 'cards', mas 'count'/'version'/'updatedAt'.
// Marcador de dano: entrada con type_line ('t') vacio. Scryfall SIEMPRE manda
// type_line para una carta real, asi que t==='' = entrada escrita sin unir
// contra scryfall_cache. Lee SOLO chunk_0 por cuenta para acotar el coste.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT });
const db = getFirestore();
const users = await db.collection('users').select().get();
const filas = []; let sinIndice = 0; let clavesVistas = new Set();
for (const u of users.docs) {
  const d = await db.doc(`users/${u.id}/card_index/chunk_0`).get();
  if (!d.exists) { sinIndice++; continue; }
  const data = d.data();
  const cards = Array.isArray(data.cards) ? data.cards : [];
  if (cards.length === 0) { filas.push({ uid: u.id, n: 0, ratio: null, v: data.version ?? null }); continue; }
  for (const k of Object.keys(cards[0])) clavesVistas.add(k);
  const vacias = cards.filter(c => !c || !c.t || c.t === '').length;
  filas.push({ uid: u.id, n: cards.length, vacias, ratio: +(vacias / cards.length).toFixed(3),
               v: data.version ?? null, count: data.count ?? null });
}
const conDatos = filas.filter(f => f.ratio !== null);
const dan = conDatos.filter(f => f.ratio >= 0.5);
const par = conDatos.filter(f => f.ratio > 0.05 && f.ratio < 0.5);
const san = conDatos.filter(f => f.ratio <= 0.05);
console.log(JSON.stringify({
  proyecto: process.env.FIREBASE_PROJECT, usuarios: users.size, sinIndice,
  conIndice: conDatos.length,
  DANADAS_50pct_o_mas: dan.length, parciales_5_a_50: par.length, sanas_5pct_o_menos: san.length,
  cartasVaciadasTotal: conDatos.reduce((a,f)=>a+(f.vacias||0),0),
  cartasTotalEnChunk0: conDatos.reduce((a,f)=>a+f.n,0),
  versiones: [...new Set(conDatos.map(f=>f.v))].sort(),
  clavesDeEntrada: [...clavesVistas].sort(),
  peores: conDatos.sort((a,b)=>b.ratio-a.ratio).slice(0,12)
    .map(f=>({uid:f.uid.slice(0,8), n:f.n, vacias:f.vacias, ratio:f.ratio, v:f.v})),
}, null, 1));
process.exit(0);
