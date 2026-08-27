// TASK-289 AC1/AC7 — mide pertenencia MULTIPLE contra la Cloud Function REAL
// desplegada. Elige la carta dinamicamente entre las que estan VIVAS en el
// indice al momento de correr: el indice publico de dev se achico 400 entradas
// durante la sesion del 2026-08-27 y una carta fija (Core Prowler) dejo de
// estar. Sirve igual pre-deploy (defecto) que post-deploy (arreglado).
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp as initClient } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });
dotenv.config({ path: '.env.local' });

const SELLER = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const PRECEDENCIA = ['creature','instant','sorcery','enchantment','artifact','planeswalker','land'];

// 1) Elegir, por lectura directa, una carta VIVA en el indice con >1 categoria.
const admin = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 'ac7');
const db = getFirestore(admin);
const chunks = await db.collection('users').doc(SELLER).collection('public_card_index').get();
let entries = [];
for (const c of chunks.docs) { const d = c.data(); if (Array.isArray(d.entries)) entries = entries.concat(d.entries); }
const candidatas = entries
  .map(e => ({ n: e.n, t: String(e.t || '').toLowerCase(), cats: PRECEDENCIA.filter(w => String(e.t||'').toLowerCase().includes(w)) }))
  .filter(e => e.cats.length > 1 && e.n);
if (candidatas.length === 0) { console.log('SIN CANDIDATAS en el indice actual'); process.exit(1); }
const carta = candidatas[0];
const primaria = carta.cats[0];
const secundaria = carta.cats[1];
console.log('indice vigente:', entries.length, 'entradas |', candidatas.length, 'de tipo multiple');
console.log('carta elegida:', JSON.stringify(carta.n), '| t=', JSON.stringify(carta.t));
console.log('  primaria =', primaria, '| secundaria =', secundaria);

// 2) Consultar la function desplegada por AMBAS categorias.
const app = initClient({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
});
await signInWithEmailAndPassword(getAuth(app), process.env.TEST_USER_A_EMAIL, process.env.TEST_USER_A_PASSWORD);
const q = httpsCallable(getFunctions(app), 'queryPublicCardIndex');
const pedir = async (tipos) => {
  const res = await q({ userId: SELLER, filters: { type: tipos, search: carta.n }, page: 0, pageSize: 200 });
  const d = res.data || {};
  console.log('  type=' + JSON.stringify(tipos) + ' + search=' + JSON.stringify(carta.n) + ' -> total=' + d.total);
  return d;
};
console.log('--- consulta contra la function DESPLEGADA ---');
const a = await pedir([primaria]);
const b = await pedir([secundaria]);

// 3) El facet sigue contando por PRIMARIA: la suma NO debe exceder el total.
const sinFiltro = await q({ userId: SELLER, filters: {}, page: 0, pageSize: 1 });
const ft = (sinFiltro.data || {}).facets && sinFiltro.data.facets.type;
const suma = ft ? Object.values(ft).reduce((x,y)=>x+y,0) : null;
console.log('facets.type sin filtro:', JSON.stringify(ft));
console.log('suma de facets:', suma, '| total del vendedor:', (sinFiltro.data||{}).total,
  '| AC3 (suma == total, nunca lo excede):', suma === (sinFiltro.data||{}).total ? 'OK' : 'REVISAR');

console.log('');
console.log('VEREDICTO:', a.total > 0 && b.total > 0
  ? 'POST-DEPLOY OK — la carta sale bajo AMBAS categorias (pertenencia multiple)'
  : a.total > 0 && b.total === 0
    ? 'PRE-DEPLOY — defecto reproducido: sale bajo ' + primaria + ' pero NO bajo ' + secundaria
    : 'INESPERADO — ' + primaria + '=' + a.total + ' ' + secundaria + '=' + b.total);
process.exit(0);
