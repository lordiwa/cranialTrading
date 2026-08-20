#!/usr/bin/env node
/**
 * detect-invisible-cards — mide (SOLO LECTURA) cuantas cartas de una cuenta
 * tienen documento vivo en users/{uid}/cards SIN entrada correspondiente en
 * users/{uid}/card_index.
 *
 * POR QUE EXISTE (TASK-255 AC8). El bug reportado por Rafael el 2026-08-20
 * (un cambio de estado colgado dejo el delta de borrado del indice aplicado
 * pero el documento vivo) no tenia, hasta este ticket, ninguna forma
 * repetible de detectarse — se encontro a mano, leyendo Firestore
 * directamente con la sesion del propio dueno. Este script formaliza esa
 * misma comparacion.
 *
 * NO ESCRIBE NADA. Nunca. Solo listDocuments()/get() de lectura.
 *
 * QUE HACE. Lista los ids de TODOS los documentos vivos de users/{uid}/cards
 * (listDocuments() — no lee campos, solo referencias, barato) y los compara
 * contra los ids presentes en users/{uid}/card_index (misma lectura de
 * chunks que measure-card-index-metadata.mjs usa, primera aparicion gana,
 * igual que la app). Cualquier id que este en "cards" y no en "card_index"
 * es una carta invisible: existe, pero no aparece en ninguna vista
 * alimentada por el indice (grilla, busqueda, paginacion).
 *
 * USO:
 *   gcloud auth application-default login                       # una vez
 *   node scripts/detect-invisible-cards.mjs --uid=<uid>
 *   node scripts/detect-invisible-cards.mjs --uid=<uid> --list   # imprime cada id invisible
 *
 * Sin --uid, usa TEST_USER_A_EMAIL de .env.local (mismo default que
 * measure-card-index-metadata.mjs). El proyecto sale de FIREBASE_PROJECT /
 * VITE_FIREBASE_PROJECT_ID, default cranial-trading-dev.
 *
 * Exit code: 0 si cero cartas invisibles, 1 si hay al menos una (para poder
 * usarse como chequeo en un pipeline, no solo a mano).
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
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
 * Ids de TODOS los documentos vivos en users/{uid}/cards. listDocuments()
 * en vez de get(): solo trae DocumentReferences, no lee el contenido de
 * cada carta — barato incluso en cuentas de 100k+ (project_market_collection_sizes).
 */
async function readCardDocIds(uid) {
  const db = getFirestore();
  const refs = await db.collection(`users/${uid}/cards`).listDocuments();
  return new Set(refs.map((r) => r.id));
}

/**
 * Ids presentes en el card_index, leyendo los chunks en orden numerico y
 * quedandose con la primera aparicion de cada id — mismo criterio que la
 * app (src/stores/collection.ts loadFromIndex) y que
 * measure-card-index-metadata.mjs.
 */
async function readIndexIds(uid) {
  const db = getFirestore();
  const snap = await db.collection(`users/${uid}/card_index`).get();

  const chunkNumberOf = (id) => {
    const n = parseInt(String(id).replace('chunk_', ''), 10);
    return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
  };
  const ordered = [...snap.docs].sort((a, b) => chunkNumberOf(a.id) - chunkNumberOf(b.id));

  const ids = new Set();
  let chunkCount = 0;
  for (const doc of ordered) {
    chunkCount++;
    const cards = Array.isArray(doc.data().cards) ? doc.data().cards : [];
    for (const c of cards) ids.add(c.i);
  }
  return { ids, chunkCount };
}

async function resolveUid() {
  const explicit = val('uid');
  if (explicit) return explicit;
  const email = process.env.TEST_USER_A_EMAIL;
  if (!email) throw new Error('No hay --uid ni TEST_USER_A_EMAIL en .env.local');
  const user = await getAuth().getUserByEmail(email);
  return user.uid;
}

async function main() {
  const projectId = process.env.FIREBASE_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || 'cranial-trading-dev';
  initializeApp({ credential: applicationDefault(), projectId });
  console.log(`proyecto: ${projectId}`);

  const uid = await resolveUid();
  console.log(`cuenta: ${uid}`);

  const [cardIds, indexResult] = await Promise.all([readCardDocIds(uid), readIndexIds(uid)]);
  const { ids: indexIds, chunkCount } = indexResult;

  const invisible = [...cardIds].filter((id) => !indexIds.has(id));
  // El caso inverso (entrada de indice sin documento — "phantom", el
  // opuesto de este ticket) se reporta tambien porque es igual de barato
  // de calcular aca y es informacion util, aunque no es lo que TASK-255 mide.
  const phantom = [...indexIds].filter((id) => !cardIds.has(id));

  console.log(`\ndocumentos vivos en users/${uid}/cards ......... ${cardIds.size}`);
  console.log(`chunks leidos en card_index ..................... ${chunkCount}`);
  console.log(`entradas en card_index .......................... ${indexIds.size}`);
  console.log(`\nCARTAS INVISIBLES (documento vivo, sin entrada de indice) ... ${invisible.length}`);
  console.log(`entradas fantasma (indice, sin documento) ................... ${phantom.length}`);

  if (has('--list')) {
    if (invisible.length > 0) {
      console.log('\nids invisibles:');
      for (const id of invisible) console.log(`  ${id}`);
    }
    if (phantom.length > 0) {
      console.log('\nids fantasma:');
      for (const id of phantom) console.log(`  ${id}`);
    }
  }

  console.log(`\nRESULTADO: ${invisible.length === 0 ? 'OK — divergencia cero' : 'DIVERGENCIA — hay cartas invisibles'}`);
  process.exit(invisible.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
