#!/usr/bin/env node
/**
 * backfill-card-chunk-id — TASK-230 AC2/AC3.
 *
 * Assigns every users/{uid}/cards/{id} document its sticky `chunkId` field:
 * the chunk the card_index would put it in TODAY, computed as
 * floor(position / INDEX_CHUNK_SIZE) where position is the card's 0-based
 * index when the account's cards are read in the SAME order buildCardIndex
 * uses (ascending by documentId(), see functions/index.js:983). This
 * reproduces exactly the reparto actual — the design decision assumed by
 * TASK-230.
 *
 * REANUDABLE POR CURSOR (--run only): progress is persisted to a state file
 * after every page (default: .backfill-card-chunk-id-state.<projectId>.json,
 * override with --state=<path>). Re-running after an interrupt resumes each
 * account from its last completed page instead of re-reading from position 0.
 *
 * IDEMPOTENTE: a card that already has a chunkId field is never rewritten —
 * only counted as "already had it". Running --run twice in a row (or resuming
 * after a partial run) writes nothing new the second time.
 *
 * --status IS DELIBERATELY STATELESS — it never reads nor writes the state
 * file, full stop. It always does a fresh, from-position-0 read-only scan.
 * This is what makes the three failure modes below impossible instead of
 * merely unlikely (review finding HIGH-1, TASK-230):
 *   A. --status then --run: if --status touched the state file, it would
 *      mark every account "done" from its own preview pass, and the
 *      following --run would report the PREVIEW's numbers as if it had
 *      written them, while actually writing nothing (inverted AC3 — a
 *      backfill that did nothing reporting success).
 *   B. dev then prod (or vice versa) sharing one state file: a uid that
 *      exists in both projects would be marked done by one project's run and
 *      silently skipped by the other's. The default state filename embeds
 *      projectId specifically to make this impossible even with the same
 *      cwd, not just "unlikely with different --state flags".
 *   C. --status after --run reporting stale/cached numbers instead of
 *      measuring: moot now that --status never reads persisted state at all.
 *
 * Recorre las cuentas de a una, en orden estable (por uid), y para cada una
 * imprime cuantas cartas ya tenian el campo, cuantas se escribieron (o se
 * escribirian, en --status), y cuantas quedaron sin el campo (cero si la
 * cuenta terminó completa). Al final imprime el mismo triple total agregado —
 * un backfill incompleto tiene que ser visible, nunca silencioso (AC3).
 *
 * NO TOCA card_index, ni el camino de lectura, ni el de escritura del
 * indice — solo agrega el campo a los documentos de carta.
 *
 * USO:
 *   gcloud auth application-default login
 *   node scripts/backfill-card-chunk-id.mjs --status                 # solo mide, nunca toca disco ni escribe
 *   node scripts/backfill-card-chunk-id.mjs --run                    # escribe + persiste cursor (dev por default)
 *   node scripts/backfill-card-chunk-id.mjs --run --project=cranial-trading-dev
 *   node scripts/backfill-card-chunk-id.mjs --run --project=cranial-trading --i-know-this-is-prod
 *
 * Por seguridad, escribir contra el proyecto de produccion (cranial-trading)
 * exige --i-know-this-is-prod ademas de --run: un typo de --project no debe
 * poder mutar produccion.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { accountMissingCount, accountStatusLabel, computeVerdict } from './backfillCardChunkIdHelpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(repoRoot, '.env.local') });
dotenv.config({ path: path.join(repoRoot, '.env.development') });

// Must match INDEX_CHUNK_SIZE in src/stores/collection.ts and
// functions/index.js — the whole point of this backfill is to reproduce
// their existing positional chunking, not to invent a new one.
const INDEX_CHUNK_SIZE = 2000;
const PAGE_SIZE = 2000;
const WRITE_BATCH_SIZE = 400; // Firestore hard limit is 500 writes/batch

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const RUN = has('--run');
const STATUS_ONLY = has('--status');

// Argv validation errors: collected instead of exiting immediately (MEDIUM-1
// — process.exit() right after a console call can truncate output on
// Windows because Node does not drain pending async writes to a redirected
// stream first; process.exitCode + a normal return lets the process exit
// naturally once everything has flushed). initializeApp/getFirestore and the
// rest of the script only run when there are none.
const argErrors = [];
if (!RUN && !STATUS_ONLY) {
  argErrors.push('Falta el modo. Uno de: --status (solo mide, no toca disco) --run (escribe).');
}
if (RUN && STATUS_ONLY) {
  argErrors.push('--run y --status son mutuamente excluyentes.');
}

const projectId = val('project') || process.env.FIREBASE_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || 'cranial-trading-dev';
if (RUN && projectId === 'cranial-trading' && !has('--i-know-this-is-prod')) {
  argErrors.push(`--run apunta a produccion (${projectId}) sin --i-know-this-is-prod. Abortado.`);
  argErrors.push('El AC5 de TASK-230 (correr esto en prod) lo cierra un humano explicitamente, no el agente.');
}

// Default state filename embeds projectId (HIGH-1 escenario B): dev y prod
// nunca pueden pisarse el cursor el uno al otro aunque compartan cwd.
const stateFile = path.resolve(repoRoot, val('state', `.backfill-card-chunk-id-state.${projectId}.json`));

let db = null;
if (argErrors.length === 0) {
  initializeApp({ credential: applicationDefault(), projectId });
  db = getFirestore();
}

function loadState() {
  if (!fs.existsSync(stateFile)) return {};
  return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
}

function saveState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

/**
 * Process one account's users/{uid}/cards collection. Reads in ascending
 * documentId() order (same order buildCardIndex reads in), paginated.
 *
 * RUN mode resumes from `st.cursor`/`st.nextIndex` (loaded from `state`) and
 * persists progress to disk after every page — a kill mid-account loses at
 * most one page of progress, not the whole account.
 *
 * STATUS mode (`state` is `null`) NEVER reads or writes `state`/the state
 * file at all: it always scans fresh from position 0 in memory only, and
 * never calls saveState. See the file header for why this statelessness is
 * load-bearing, not incidental (HIGH-1 escenarios A/C).
 */
async function processAccount(uid, state) {
  const colRef = db.collection(`users/${uid}/cards`);
  // `failed` is intentionally NEVER loaded from disk — it describes only
  // THIS invocation's write attempts. Persisting it across runs would make a
  // page that failed once and then succeeded on a later re-run keep
  // reporting "sin campo" forever (LOW-1).
  const st = (state && state[uid]) || { done: false, cursor: null, nextIndex: 0, alreadyHad: 0, written: 0 };
  st.failed = 0;
  if (state) state[uid] = st;

  if (state && st.done) {
    return st;
  }

  for (;;) {
    let query = colRef.select('chunkId').orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (st.cursor) query = query.startAfter(st.cursor);

    // eslint-disable-next-line no-await-in-loop
    const snap = await query.get();
    if (snap.empty) {
      st.done = true;
      break;
    }

    // Position is assigned from a LOCAL copy of nextIndex first, and only
    // committed to st.nextIndex/st.cursor once every write in this page has
    // actually succeeded (see below). If a batch fails, the cursor must NOT
    // advance past it — otherwise a re-run would skip straight past the
    // failed docs (which still lack chunkId) instead of retrying them, and
    // the "quedaron SIN el campo" count would never reach zero no matter how
    // many times the script runs.
    let localIndex = st.nextIndex;
    const toWrite = [];
    let alreadyHadInPage = 0;
    for (const doc of snap.docs) {
      const hasField = doc.get('chunkId') !== undefined;
      if (hasField) {
        alreadyHadInPage += 1;
      } else {
        const chunkId = Math.floor(localIndex / INDEX_CHUNK_SIZE);
        toWrite.push({ ref: doc.ref, chunkId });
      }
      localIndex += 1;
    }

    let pageFailed = false;
    if (RUN && toWrite.length > 0) {
      for (let i = 0; i < toWrite.length; i += WRITE_BATCH_SIZE) {
        const slice = toWrite.slice(i, i + WRITE_BATCH_SIZE);
        const batch = db.batch();
        for (const { ref, chunkId } of slice) batch.update(ref, { chunkId });
        try {
          // eslint-disable-next-line no-await-in-loop
          await batch.commit();
        } catch (err) {
          console.error(`  ERROR escribiendo batch de ${slice.length} cartas en cuenta ${uid}: ${err.message}`);
          pageFailed = true;
        }
      }
    }

    if (pageFailed) {
      // Do NOT advance nextIndex/cursor: this page (and everything after it,
      // since position is sequential) is retried from scratch on the next
      // run instead of being silently skipped.
      st.failed += toWrite.length;
      break;
    }

    st.alreadyHad += alreadyHadInPage;
    // Reaching this line means either STATUS mode (nothing written, this is
    // a preview count) or every write in this page's batches committed
    // successfully (a failure would have `break`ed above) — toWrite.length
    // is accurate for both.
    st.written += toWrite.length;
    st.nextIndex = localIndex;
    // The cursor itself (a QueryDocumentSnapshot) isn't JSON-serializable —
    // keep its id, which orderBy(documentId()).startAfter() also accepts.
    // This MUST happen unconditionally (not just when `state` is truthy):
    // it drives the in-memory pagination for THIS call regardless of mode —
    // STATUS mode still has to advance page to page, it just never persists
    // that advancement to disk. Gating this behind `if (state)` was the
    // TASK-230 review bug: in STATUS mode the cursor never moved, so every
    // page re-read the exact same first PAGE_SIZE docs forever — a true
    // infinite loop on any account with >= PAGE_SIZE cards (reproduced
    // against dev: 39+ minutes with zero output on a ~59k-card account
    // before being killed).
    st.cursor = snap.docs[snap.docs.length - 1].id;

    if (state) {
      saveState({ ...state, [uid]: st });
    }

    if (snap.docs.length < PAGE_SIZE) {
      st.done = true;
      break;
    }
  }

  return st;
}

async function main() {
  if (argErrors.length > 0) {
    for (const msg of argErrors) console.error(msg);
    process.exitCode = 1;
    return;
  }

  const mode = RUN ? 'run' : 'status';
  console.log(`Proyecto: ${projectId} — modo: ${RUN ? 'RUN (escribe, persiste cursor)' : 'STATUS (solo mide, sin estado en disco)'}`);
  console.log('');

  // STATUS mode passes `state = null` all the way through: processAccount
  // never reads or writes it, so a --status run can NEVER mark an account
  // "done" for a later --run, and can never itself be fooled by a --run's
  // leftover state (HIGH-1 escenarios A/C).
  const state = RUN ? loadState() : null;

  const usersSnap = await db.collection('users').listDocuments();
  const uids = usersSnap.map((ref) => ref.id).sort();

  let totalAlreadyHad = 0;
  let totalWritten = 0;
  let totalFailed = 0;
  let accountsWithCards = 0;
  let accountsIncomplete = 0;

  for (const uid of uids) {
    // eslint-disable-next-line no-await-in-loop
    const st = await processAccount(uid, state);
    const seen = st.alreadyHad + st.written + st.failed;
    if (seen === 0 && st.done) continue; // no cards on this account — skip from the report entirely

    accountsWithCards += 1;
    totalAlreadyHad += st.alreadyHad;
    totalWritten += st.written;
    totalFailed += st.failed;
    if (!st.done) accountsIncomplete += 1;

    const label = accountStatusLabel(mode, st);
    console.log(`${uid}: ya tenian=${st.alreadyHad}  ${RUN ? 'escritas' : 'a-escribir'}=${st.written}  sin-campo=${accountMissingCount(mode, st)}  [${label}]`);
  }

  const { totalMissing, clean } = computeVerdict(mode, { totalWritten, totalFailed, accountsIncomplete });

  console.log('');
  console.log('TOTAL');
  console.log(`  cuentas con cartas       : ${accountsWithCards}`);
  console.log(`  ya tenian el campo       : ${totalAlreadyHad}`);
  console.log(`  ${RUN ? 'se escribieron          ' : 'se escribirian (dry-run)'} : ${totalWritten}`);
  console.log(`  quedaron SIN el campo    : ${totalMissing}`);
  if (accountsIncomplete > 0) {
    console.log('');
    console.log(`AVISO: ${accountsIncomplete} cuenta(s) quedaron interrumpidas (proceso cortado a mitad).`);
    console.log(RUN
      ? 'Volver a correr `--run` retoma por cursor — no relee desde cero.'
      : '--status no persiste nada: esto solo puede pasar si se corto ESTA corrida.');
  }
  if (RUN && totalFailed > 0) {
    console.log('');
    console.log('AVISO: hubo fallos de escritura — revisar el log de errores arriba. El cursor');
    console.log('de esas cuentas NO avanzo mas alla de la pagina fallida, asi que volver a');
    console.log('correr `--run` reintenta esas mismas cartas desde donde quedaron.');
  }
  if (!RUN && totalMissing > 0) {
    console.log('');
    console.log(`AVISO: ${totalMissing} carta(s) todavia NO tienen chunkId — correr \`--run\` para escribirlas.`);
  }

  console.log('');
  console.log(clean ? 'VEREDICTO: 0 cartas sin chunkId.' : 'VEREDICTO: backfill incompleto — ver AVISOs arriba.');
  process.exitCode = clean ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
