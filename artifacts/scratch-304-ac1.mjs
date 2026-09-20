// TASK-304 AC1 — control negativo: leer la MISMA carta en las TRES colecciones
// con el Admin SDK y registrar que campo de precio tiene cada una.
//
// Existe para cerrar (o refutar) el diagnostico: el hallazgo original suponia
// "el enriquecimiento de CK corre solo sobre el indice publico", pero la
// regresion del 2026-09-19 midio la deriva en LAS DOS direcciones (5 cartas
// donde el publico sabe mas, 5 donde el dueno sabe mas), asi que esa hipotesis
// ya no alcanza. Esto lee el DATO, no la vista.
//
// Solo lectura. No escribe nada. Proyecto fijo en dev.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const UID = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const app = initializeApp(
  { credential: applicationDefault(), projectId: 'cranial-trading-dev' },
  'task304ac1',
);
const db = getFirestore(app);

// Las 12 cartas que la regresion comparo, con la direccion medida el 2026-09-19.
const NOMBRES = [
  'Wrath of God', 'Giant Growth', 'Lightning Bolt', 'Dazzling Angel', 'Serra Angel',
  'Darksteel Citadel', 'Swamp', 'Elspeth Storm Slayer', 'Sol Ring', 'Aether Charge',
];

// Claves que pueden llevar precio. Se descubren, no se suponen.
const pareceDePrecio = (k) => /price|ck|cardkingdom|card_kingdom|buylist|bl_|tcg|usd|eur/i.test(k);

const resumenPrecios = (data) => {
  if (!data) return null;
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (!pareceDePrecio(k)) continue;
    out[k] = v && typeof v === 'object' ? JSON.stringify(v) : v;
  }
  return out;
};

// ---- 1. coleccion del dueno -------------------------------------------------
const cardsSnap = await db.collection('users').doc(UID).collection('cards').get();
console.log('users/%s/cards total: %d', UID, cardsSnap.size);

// ---- 2. public_cards RAIZ (userId == uid) -----------------------------------
const pcSnap = await db.collection('public_cards').where('userId', '==', UID).get();
console.log('public_cards (RAIZ, userId==uid) total: %d', pcSnap.size);

// ---- 3. indice publico: todos los chunks ------------------------------------
const idxSnap = await db.collection('users').doc(UID).collection('public_card_index').get();
const entradas = [];
let meta = null;
for (const d of idxSnap.docs) {
  if (d.id === '_meta') { meta = d.data(); continue; }
  const data = d.data();
  for (const key of ['cards', 'entries', 'items']) {
    if (Array.isArray(data[key])) entradas.push(...data[key]);
  }
}
console.log('public_card_index: %d docs (chunks+_meta), %d entradas, _meta.count=%s',
  idxSnap.size, entradas.length, meta ? meta.count : '(sin _meta)');

// ---- 4. que claves EXISTEN en cada coleccion (descubiertas, no supuestas) ----
const clavesDe = (docs, get = (d) => d.data()) => {
  const s = new Set();
  for (const d of docs.slice(0, 50)) for (const k of Object.keys(get(d) || {})) s.add(k);
  return [...s].sort();
};
console.log('\n--- CLAVES DE PRECIO PRESENTES EN CADA COLECCION ---');
console.log('cards        :', clavesDe(cardsSnap.docs).filter(pareceDePrecio).join(', ') || '(ninguna)');
console.log('public_cards :', clavesDe(pcSnap.docs).filter(pareceDePrecio).join(', ') || '(ninguna)');
console.log('index entries:', clavesDe(entradas.slice(0, 50), (e) => e).filter(pareceDePrecio).join(', ') || '(ninguna)');

// ---- 5. la comparacion carta por carta --------------------------------------
const norm = (s) => String(s || '').trim().toLowerCase();
console.log('\n--- COMPARACION POR CARTA (las 10 de la regresion) ---');
for (const nombre of NOMBRES) {
  const enCards = cardsSnap.docs.filter((d) => norm(d.data().name) === norm(nombre));
  const enPc = pcSnap.docs.filter((d) => norm(d.data().name) === norm(nombre));
  const enIdx = entradas.filter((e) => norm(e.name) === norm(nombre));
  console.log('\n### %s  (cards=%d, public_cards=%d, index=%d)',
    nombre, enCards.length, enPc.length, enIdx.length);
  for (const d of enCards) {
    const x = d.data();
    console.log('  [cards        %s] ed=%s cond=%s public=%s status=%s  %s',
      d.id.slice(0, 8), x.edition, x.condition, x.public, x.status,
      JSON.stringify(resumenPrecios(x)));
  }
  for (const d of enPc) {
    const x = d.data();
    console.log('  [public_cards %s] ed=%s cond=%s  %s',
      d.id.slice(0, 8), x.edition, x.condition, JSON.stringify(resumenPrecios(x)));
  }
  for (const e of enIdx) {
    console.log('  [index          ] ed=%s cond=%s  %s',
      e.edition, e.condition, JSON.stringify(resumenPrecios(e)));
  }
}

// ---- 6. paridad global de conteo --------------------------------------------
const cardsPublicas = cardsSnap.docs.filter((d) => d.data().public === true);
console.log('\n--- PARIDAD DE CONTEO ---');
console.log('cards public=true : %d', cardsPublicas.length);
console.log('public_cards      : %d', pcSnap.size);
console.log('index entradas    : %d', entradas.length);
