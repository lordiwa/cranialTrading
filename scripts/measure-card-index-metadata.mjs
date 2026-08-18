#!/usr/bin/env node
/**
 * measure-card-index-metadata — mide (SOLO LECTURA) si las entradas del
 * card_index conservan sus metadatos de Scryfall, y compara dos mediciones.
 *
 * POR QUE EXISTE (TASK-245 AC7). Un cambio de estado — una carta por click
 * derecho, o masivo con "seleccionar todos" — reescribia la entrada del
 * indice a partir del documento de usuario SOLO, sin unir contra
 * scryfall_cache. En las cuentas viejas ese documento no tiene
 * type_line/cmc/colors/rarity, asi que la entrada quedaba con t='', cm=0,
 * co=[], r=''. Medido en dev el 2026-08-18: 6787/6787 cartas tocadas
 * perdieron type_line; tierras visibles en el indice 7129 -> 376. Este
 * script es el instrumento de esa medicion, para repetirla despues del
 * arreglo con un grupo de control.
 *
 * NO ESCRIBE NADA. Nunca. Solo `get()` sobre users/{uid}/card_index.
 *
 * USO:
 *   gcloud auth application-default login
 *
 *   # 1) antes del cambio masivo
 *   node scripts/measure-card-index-metadata.mjs --uid=<uid> --out=before.json
 *   # 2) hacer el cambio de estado en la app y ESPERAR ~10 s (el flush del
 *   #    delta esta debounceado 2 s; el masivo escribe por lotes de 500)
 *   # 3) despues
 *   node scripts/measure-card-index-metadata.mjs --uid=<uid> --out=after.json
 *   # 4) diferencia, con grupo de control automatico
 *   node scripts/measure-card-index-metadata.mjs --compare before.json after.json
 *
 * La cuenta objetivo sale de TEST_USER_A_EMAIL (.env.local) salvo --uid.
 * El proyecto sale de FIREBASE_PROJECT / VITE_FIREBASE_PROJECT_ID.
 *
 * QUE MIRA. Por cada entrada guarda solo lo que hace falta para el veredicto:
 * st (estado), t (type_line), cm (cmc), co (colores), r (rareza). El
 * --compare parte las cartas en dos grupos:
 *   TOCADAS  — las que cambiaron de st entre las dos mediciones.
 *   CONTROL  — las que NO cambiaron de st. Deben quedar identicas; si el
 *              control se mueve, la medicion no es concluyente (hubo otra
 *              actividad en la cuenta) y hay que repetirla.
 *
 * NO ES ATOMICO respecto de la app: si alguien usa la cuenta entre las dos
 * lecturas, aparece como movimiento. Repetir antes de concluir.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(repoRoot, '.env.local') });
dotenv.config({ path: path.join(repoRoot, '.env.development') });

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

/** Una entrada del indice cuenta como "tierra" por su type_line. */
const isLand = (t) => typeof t === 'string' && /\bLand\b/i.test(t);
/** Sin metadatos = sin type_line. Es el sintoma que se midio. */
const missingType = (t) => !t;

function summarize(entries) {
  const byStatus = new Map();
  let lands = 0;
  let noType = 0;
  for (const e of Object.values(entries)) {
    const st = e.st || 'collection';
    if (!byStatus.has(st)) byStatus.set(st, { total: 0, noType: 0, lands: 0 });
    const bucket = byStatus.get(st);
    bucket.total++;
    if (missingType(e.t)) { bucket.noType++; noType++; }
    if (isLand(e.t)) { bucket.lands++; lands++; }
  }
  return { total: Object.keys(entries).length, lands, noType, byStatus };
}

function printSummary(label, entries) {
  const s = summarize(entries);
  console.log(`\n=== ${label} ===`);
  console.log(`entradas en el indice ......... ${s.total}`);
  console.log(`tierras (type_line ~ Land) .... ${s.lands}`);
  console.log(`SIN type_line ................. ${s.noType} (${((s.noType / (s.total || 1)) * 100).toFixed(1)}%)`);
  console.log('por estado:');
  for (const [st, b] of [...s.byStatus].sort()) {
    console.log(`  ${st.padEnd(12)} total ${String(b.total).padStart(7)}   sin type_line ${String(b.noType).padStart(7)} (${((b.noType / (b.total || 1)) * 100).toFixed(1)}%)   tierras ${String(b.lands).padStart(7)}`);
  }
  return s;
}

async function readIndexEntries(uid) {
  const db = getFirestore();
  const snap = await db.collection(`users/${uid}/card_index`).get();
  const entries = {};
  let chunks = 0;
  for (const doc of snap.docs) {
    if (!/^chunk_\d+$/.test(doc.id)) {
      console.warn(`AVISO: chunk con id no numerico (${doc.id}) — corrupcion estructural, se incluye igual`);
    }
    chunks++;
    const cards = Array.isArray(doc.data().cards) ? doc.data().cards : [];
    for (const c of cards) {
      entries[c.i] = { st: c.st, t: c.t, cm: c.cm, co: c.co, r: c.r };
    }
  }
  console.log(`leidos ${chunks} chunks, ${Object.keys(entries).length} entradas`);
  return entries;
}

async function resolveUid() {
  const explicit = val('uid');
  if (explicit) return explicit;
  const email = process.env.TEST_USER_A_EMAIL;
  if (!email) throw new Error('No hay --uid ni TEST_USER_A_EMAIL en .env.local');
  const user = await getAuth().getUserByEmail(email);
  return user.uid;
}

const sameMetadata = (a, b) =>
  a.t === b.t &&
  a.cm === b.cm &&
  a.r === b.r &&
  JSON.stringify(a.co ?? []) === JSON.stringify(b.co ?? []);

function compare(beforeFile, afterFile) {
  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf-8')).entries;
  const after = JSON.parse(fs.readFileSync(afterFile, 'utf-8')).entries;

  const sBefore = printSummary(`ANTES (${path.basename(beforeFile)})`, before);
  const sAfter = printSummary(`DESPUES (${path.basename(afterFile)})`, after);

  const touched = [];
  const control = [];
  for (const [id, b] of Object.entries(before)) {
    const a = after[id];
    if (!a) continue; // desaparecio del indice: se reporta aparte
    (b.st !== a.st ? touched : control).push([id, b, a]);
  }
  const goneFromIndex = Object.keys(before).filter((id) => !after[id]);
  const newInIndex = Object.keys(after).filter((id) => !before[id]);

  const touchedLostMetadata = touched.filter(([, b, a]) => !sameMetadata(b, a));
  const controlChanged = control.filter(([, b, a]) => !sameMetadata(b, a));

  console.log('\n=== VEREDICTO (TASK-245 AC7) ===');
  console.log(`cartas TOCADAS (cambiaron de estado) ......... ${touched.length}`);
  console.log(`  de esas, con metadatos ALTERADOS .......... ${touchedLostMetadata.length}   <-- debe ser 0`);
  console.log(`cartas de CONTROL (no cambiaron de estado) ... ${control.length}`);
  console.log(`  de esas, con metadatos alterados .......... ${controlChanged.length}   <-- debe ser 0`);
  console.log(`tierras en el indice: ${sBefore.lands} -> ${sAfter.lands}   <-- no debe bajar`);
  console.log(`sin type_line en total: ${sBefore.noType} -> ${sAfter.noType}   <-- no debe subir`);
  if (goneFromIndex.length || newInIndex.length) {
    console.log(`entradas que salieron del indice: ${goneFromIndex.length}; entradas nuevas: ${newInIndex.length}`);
  }

  for (const [id, b, a] of touchedLostMetadata.slice(0, 10)) {
    console.log(`  EJEMPLO ${id}: st ${b.st}->${a.st}  t "${b.t}"->"${a.t}"  cm ${b.cm}->${a.cm}  r "${b.r}"->"${a.r}"  co ${JSON.stringify(b.co)}->${JSON.stringify(a.co)}`);
  }

  const ok =
    touched.length > 0 &&
    touchedLostMetadata.length === 0 &&
    controlChanged.length === 0 &&
    sAfter.lands >= sBefore.lands &&
    sAfter.noType <= sBefore.noType;

  if (touched.length === 0) {
    console.log('\nINCONCLUYENTE: ninguna carta cambio de estado entre las dos mediciones — el cambio masivo no llego, o se midio demasiado pronto.');
  }
  console.log(`\nRESULTADO: ${ok ? 'PASA' : 'NO PASA / INCONCLUYENTE'}`);
  process.exit(ok ? 0 : 1);
}

async function main() {
  const compareArgs = argv.filter((a) => !a.startsWith('--'));
  if (has('--compare')) {
    if (compareArgs.length !== 2) {
      console.error('Uso: --compare <antes.json> <despues.json>');
      process.exit(1);
    }
    compare(compareArgs[0], compareArgs[1]);
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || 'cranial-trading-dev';
  initializeApp({ credential: applicationDefault(), projectId });
  console.log(`proyecto: ${projectId}`);

  const uid = await resolveUid();
  const entries = await readIndexEntries(uid);
  printSummary('MEDICION', entries);

  const out = val('out');
  if (out) {
    fs.writeFileSync(out, JSON.stringify({ uid, projectId, at: new Date().toISOString(), entries }, null, 0));
    console.log(`\nguardado en ${out}`);
  } else {
    console.log('\n(sin --out: no se guardo nada para comparar despues)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
