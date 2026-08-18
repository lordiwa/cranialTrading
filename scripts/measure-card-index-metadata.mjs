#!/usr/bin/env node
/**
 * measure-card-index-metadata — mide (SOLO LECTURA) si las entradas del
 * card_index conservan TODOS sus campos al cambiar de estado, y compara dos
 * mediciones con grupo de control.
 *
 * POR QUE EXISTE (TASK-245 AC7). Un cambio de estado — una carta por click
 * derecho, o masivo con "seleccionar todos" — reescribia la entrada del
 * indice a partir del documento de usuario SOLO, sin unir contra
 * scryfall_cache. En las cuentas viejas ese documento no tiene
 * type_line/cmc/colors/rarity, asi que la entrada quedaba con t='', cm=0,
 * co=[], r=''. Medido en dev el 2026-08-18: 6787/6787 cartas tocadas
 * perdieron type_line; tierras visibles en el indice 7129 -> 376.
 *
 * NO ESCRIBE NADA. Nunca. Solo `get()` sobre users/{uid}/card_index.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EL ORDEN IMPORTA, Y NO ES EL INTUITIVO (ronda de review, HIGH-1).
 *
 * Hay que REPARAR el indice ANTES de medir. Si el masivo se hace sobre las
 * cartas que YA estan vaciadas (la cuenta de dev tiene 6787 asi), la
 * comparacion es '' -> '' en las dos puntas: nada empeora, y un instrumento
 * ingenuo canta PASA con el defecto entero puesto. Solo prueba algo una
 * carta que TENIA metadatos en el ANTES. Por eso el veredicto exige, como
 * condicion dura, que las cartas tocadas tuvieran type_line antes.
 *
 * PROCEDIMIENTO:
 *   gcloud auth application-default login                       # una vez
 *
 *   # 0) REPARAR primero: deja el indice con sus metadatos puestos, para que
 *   #    el ANTES tenga algo que perder. Invoca la buildCardIndex desplegada.
 *   node scripts/card-index-fixture.mjs --repair --uid=<uid>
 *
 *   # 1) ANTES
 *   node scripts/measure-card-index-metadata.mjs --uid=<uid> --out=before.json
 *
 *   # 2) en la app: seleccionar N cartas y cambiarles el estado. ANOTAR N.
 *   #    ESPERAR a que termine de verdad: un masivo de ~6750 cartas son 14
 *   #    llamadas SECUENCIALES de 500 mutaciones, cada una con transacciones
 *   #    a concurrencia 6 sobre chunks de ~800 KB. Son minutos, no 10 s. El
 *   #    camino de UNA carta ademas tiene un debounce de 2 s.
 *
 *   # 3) DESPUES
 *   node scripts/measure-card-index-metadata.mjs --uid=<uid> --out=after.json
 *
 *   # 4) veredicto. --expect-touched es OBLIGATORIO: sin el, medir demasiado
 *   #    pronto achica el grupo tocado EN SILENCIO en vez de ponerse rojo.
 *   node scripts/measure-card-index-metadata.mjs --compare before.json after.json \
 *        --expect-touched=<N>
 *
 * Si `touched` no coincide con N, el veredicto es NO CONCLUYENTE: volver a
 * sacar el DESPUES (paso 3) y comparar de nuevo. Nunca "casi".
 * ─────────────────────────────────────────────────────────────────────────
 *
 * QUE COMPARA. TODOS los campos de la entrada, no una muestra: st, t, cm,
 * co, r, n, q, p, f, sc, e, pw, to, fa, pm, kw, lg, ca, cn, pb, df, s.
 * `st` es el unico que puede cambiar (es lo que el usuario pidio cambiar);
 * cualquier otro que se mueva es una regresion de AC4 y se reporta por
 * nombre de campo, para que se vea CUAL se perdio.
 *
 * LOS DOS GRUPOS:
 *   TOCADAS  — cambiaron de st entre las dos mediciones. Solo las que
 *              ademas TENIAN type_line en el ANTES aportan evidencia.
 *   CONTROL  — no cambiaron de st. Deben quedar identicas; si el control se
 *              mueve, hubo otra actividad en la cuenta y la medicion no es
 *              concluyente. OJO: una carta cuyo delta NO se aplico tambien
 *              cae aca y puntua como limpia — por eso existe
 *              --expect-touched, que es lo unico que distingue "se aplico
 *              bien" de "no se aplico".
 *
 * NO ES ATOMICO respecto de la app: si alguien la usa entre las dos
 * lecturas, aparece como movimiento. Repetir antes de concluir.
 *
 * La cuenta objetivo sale de TEST_USER_A_EMAIL (.env.local) salvo --uid.
 * El proyecto sale de FIREBASE_PROJECT / VITE_FIREBASE_PROJECT_ID.
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

/**
 * Todos los campos de una entrada menos `i` (la clave). `st` va aparte: es
 * el unico que el usuario pidio cambiar. El resto DEBE quedar igual (AC4).
 */
const METADATA_FIELDS = ['s', 'n', 'q', 'p', 'cm', 'co', 'r', 't', 'f', 'sc', 'e', 'pw', 'to', 'fa', 'pm', 'kw', 'lg', 'ca', 'cn', 'pb', 'df'];

/** Una entrada del indice cuenta como "tierra" por su type_line. */
const isLand = (t) => typeof t === 'string' && /\bLand\b/i.test(t);
/** Sin metadatos = sin type_line. Es el sintoma que se midio. */
const missingType = (t) => !t;

const norm = (v) => JSON.stringify(v ?? null);

/** Devuelve los nombres de campo que difieren (sin contar st). */
function changedFields(a, b) {
  return METADATA_FIELDS.filter((f) => norm(a[f]) !== norm(b[f]));
}

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

/**
 * Lee los chunks EN ORDEN NUMERICO y se queda con la PRIMERA aparicion de
 * cada id — exactamente lo que hace la app al armar la grilla
 * (src/stores/collection.ts, loadFromIndex). Con orden lexicografico
 * (chunk_10 antes que chunk_9) y "gana el ultimo", en una cuenta con ids
 * duplicados entre chunks se estaria midiendo un indice que el usuario
 * nunca ve.
 */
async function readIndexEntries(uid) {
  const db = getFirestore();
  const snap = await db.collection(`users/${uid}/card_index`).get();

  const chunkNumberOf = (id) => {
    const n = parseInt(String(id).replace('chunk_', ''), 10);
    return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
  };
  const ordered = [...snap.docs].sort((a, b) => chunkNumberOf(a.id) - chunkNumberOf(b.id));

  const entries = {};
  let duplicates = 0;
  let invalidChunks = 0;
  for (const doc of ordered) {
    if (!/^chunk_\d+$/.test(doc.id)) {
      invalidChunks++;
      console.warn(`AVISO: chunk con id no numerico (${doc.id}) — corrupcion estructural; se lee igual, al final`);
    }
    const cards = Array.isArray(doc.data().cards) ? doc.data().cards : [];
    for (const c of cards) {
      if (entries[c.i]) { duplicates++; continue; } // gana la primera, como la app
      entries[c.i] = c;
    }
  }
  console.log(`leidos ${ordered.length} chunks, ${Object.keys(entries).length} entradas${duplicates ? `, ${duplicates} ids duplicados descartados (gana la primera aparicion, como la app)` : ''}${invalidChunks ? `, ${invalidChunks} chunks con id invalido` : ''}`);
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

function compare(beforeFile, afterFile) {
  const expectTouchedRaw = val('expect-touched');
  const expectTouched = expectTouchedRaw === null ? null : parseInt(expectTouchedRaw, 10);

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

  // HIGH-1: solo una carta que TENIA type_line antes puede demostrar que no
  // se perdio. Las que ya estaban vacias comparan '' -> '' y no aportan.
  const touchedWithEvidence = touched.filter(([, b]) => !missingType(b.t));
  const touchedNoEvidence = touched.length - touchedWithEvidence.length;

  const touchedChanged = touched.filter(([, b, a]) => changedFields(b, a).length > 0);
  const controlChanged = control.filter(([, b, a]) => changedFields(b, a).length > 0);

  // MEDIUM-1: que campo concreto se movio, no solo cuantas cartas.
  const fieldTally = new Map();
  for (const [, b, a] of [...touchedChanged, ...controlChanged]) {
    for (const f of changedFields(b, a)) fieldTally.set(f, (fieldTally.get(f) || 0) + 1);
  }

  console.log('\n=== VEREDICTO (TASK-245 AC7) ===');
  console.log(`cartas TOCADAS (cambiaron de estado) ......... ${touched.length}${expectTouched !== null ? `   (esperadas ${expectTouched})` : ''}`);
  console.log(`  de esas, CON metadatos en el ANTES ........ ${touchedWithEvidence.length}   <-- las unicas que prueban algo; debe ser > 0`);
  console.log(`  de esas, ya vacias antes (no aportan) ..... ${touchedNoEvidence}`);
  console.log(`  de esas, con ALGUN campo alterado ......... ${touchedChanged.length}   <-- debe ser 0`);
  console.log(`cartas de CONTROL (no cambiaron de estado) ... ${control.length}`);
  console.log(`  de esas, con algun campo alterado ......... ${controlChanged.length}   <-- debe ser 0`);
  console.log(`tierras en el indice: ${sBefore.lands} -> ${sAfter.lands}   <-- no debe bajar`);
  console.log(`sin type_line en total: ${sBefore.noType} -> ${sAfter.noType}   <-- no debe subir`);
  if (goneFromIndex.length || newInIndex.length) {
    console.log(`entradas que salieron del indice: ${goneFromIndex.length}; entradas nuevas: ${newInIndex.length}`);
  }
  if (fieldTally.size > 0) {
    console.log('campos que se movieron (cuantas cartas cada uno):');
    for (const [f, n] of [...fieldTally].sort((x, y) => y[1] - x[1])) console.log(`  ${f} : ${n}`);
  }

  for (const [id, b, a] of [...touchedChanged, ...controlChanged].slice(0, 10)) {
    const fields = changedFields(b, a);
    console.log(`  EJEMPLO ${id}: st ${b.st}->${a.st}  campos ${fields.join(',')}  ` +
      fields.slice(0, 4).map((f) => `${f} ${norm(b[f])}->${norm(a[f])}`).join('  '));
  }

  const problems = [];
  if (expectTouched === null) problems.push('falta --expect-touched=<N> (cuantas cartas se seleccionaron realmente en la app)');
  else if (touched.length !== expectTouched) problems.push(`se tocaron ${touched.length} cartas y se esperaban ${expectTouched} — el masivo no termino, o se midio demasiado pronto`);
  if (touchedWithEvidence.length === 0) problems.push('ninguna carta tocada tenia type_line en el ANTES — la medicion no puede demostrar nada; reparar el indice (--repair) y repetir');
  if (touchedChanged.length > 0) problems.push(`${touchedChanged.length} carta(s) tocada(s) perdieron o cambiaron algun campo`);
  if (controlChanged.length > 0) problems.push(`${controlChanged.length} carta(s) de control se movieron — hubo otra actividad en la cuenta`);
  if (sAfter.lands < sBefore.lands) problems.push(`las tierras bajaron (${sBefore.lands} -> ${sAfter.lands})`);
  if (sAfter.noType > sBefore.noType) problems.push(`subieron las entradas sin type_line (${sBefore.noType} -> ${sAfter.noType})`);

  if (problems.length > 0) {
    console.log('\nMOTIVOS:');
    for (const p of problems) console.log(`  - ${p}`);
  }
  console.log(`\nRESULTADO: ${problems.length === 0 ? 'PASA' : 'NO PASA / NO CONCLUYENTE'}`);
  process.exit(problems.length === 0 ? 0 : 1);
}

async function main() {
  const positional = argv.filter((a) => !a.startsWith('--'));
  if (has('--compare')) {
    if (positional.length !== 2) {
      console.error('Uso: --compare <antes.json> <despues.json> --expect-touched=<N>');
      process.exit(1);
    }
    compare(positional[0], positional[1]);
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
