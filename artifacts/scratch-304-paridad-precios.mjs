/**
 * TASK-304 AC1 — control negativo por MEDICION DIRECTA, no por UI.
 *
 * El AC1 pide leer, para la misma carta, los campos de precio en las TRES
 * colecciones y registrar cual tiene que:
 *   1. users/{uid}/cards/{cardId}          (lo que ve el DUEÑO en /collection)
 *   2. public_cards  (raiz, where userId==uid)   (la fuente del indice)
 *   3. users/{uid}/public_card_index/*     (lo que ve el VISITANTE en /@usuario)
 *
 * La hipotesis del hallazgo original ("el enriquecimiento de Card Kingdom corre
 * solo sobre el indice publico") YA NO ALCANZA: la regresion del paso 5 midio 10
 * discrepancias sobre 12 cartas y en LAS DOS DIRECCIONES. Este script existe para
 * decidir por medicion cual de las tres colecciones tiene cada dato, en vez de
 * seguir deduciendolo de la pantalla.
 *
 * Solo lectura. No escribe un byte. Default cranial-trading-dev.
 *
 *   node artifacts/scratch-304-paridad-precios.mjs [--uid=<uid>] [--project=cranial-trading-dev]
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const PROJECT = args.project || 'cranial-trading-dev';
if (PROJECT !== 'cranial-trading-dev' && !args['i-know-what-im-doing']) {
  console.error(`Rechazado: --project=${PROJECT} sin --i-know-what-im-doing. Misma baranda que el resto de scripts/.`);
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const db = getFirestore();

/** Los tres campos de precio que la UI muestra como columnas CK / TCG / BL. */
const CAMPOS = ['ckPrice', 'ckReferencePrice', 'tcgPrice', 'price', 'buylistPrice', 'blPrice', 'prices'];

function extraerPrecios(data) {
  const out = {};
  for (const c of CAMPOS) if (data[c] !== undefined) out[c] = data[c];
  return out;
}

function clave(d) {
  return `${d.name ?? d.cardName ?? '?'} | ${d.edition ?? d.setName ?? '?'} | ${d.condition ?? '?'}`;
}

async function resolverUid() {
  if (args.uid) return args.uid;
  const snap = await db.collection('users').get();
  const candidatos = snap.docs.map((d) => ({ uid: d.id, username: d.data().username }));
  console.log('Cuentas en el proyecto:', JSON.stringify(candidatos));
  if (candidatos.length === 1) return candidatos[0].uid;
  throw new Error('Hay mas de una cuenta: pasá --uid=<uid> explicito.');
}

const uid = await resolverUid();
console.log(`\nProyecto ${PROJECT} — vendedor ${uid}\n`);

// 1. Coleccion del dueño, solo lo publicado (es lo unico comparable).
const cardsSnap = await db.collection(`users/${uid}/cards`).get();
const duenoPublicadas = cardsSnap.docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((c) => c.public === true && (c.status === 'sale' || c.status === 'trade'));

// 2. public_cards raiz.
const pubSnap = await db.collection('public_cards').where('userId', '==', uid).get();
const publicas = pubSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

// 3. El indice derivado.
const idxSnap = await db.collection(`users/${uid}/public_card_index`).get();
const entradasIdx = [];
for (const d of idxSnap.docs) {
  if (d.id === '_meta') continue;
  const data = d.data();
  for (const e of data.entries ?? data.cards ?? []) entradasIdx.push(e);
}

console.log(`CONTEO CRUDO`);
console.log(`  users/${uid}/cards  public=true & sale|trade : ${duenoPublicadas.length}`);
console.log(`  public_cards (userId==uid)                   : ${publicas.length}`);
console.log(`  public_card_index entradas                   : ${entradasIdx.length}  (${idxSnap.size} docs)`);

// Indexar por cardId para comparar la MISMA carta en las tres.
const porId = new Map();
for (const c of duenoPublicadas) porId.set(c.id, { dueno: c });
for (const p of publicas) {
  const k = p.cardId ?? p.id;
  porId.set(k, { ...(porId.get(k) ?? {}), publico: p });
}
for (const e of entradasIdx) {
  const k = e.cardId ?? e.id;
  porId.set(k, { ...(porId.get(k) ?? {}), indice: e });
}

let discrepantes = 0;
console.log(`\nCOMPARACION POR CARTA (solo las que difieren en algun campo de precio)\n`);
for (const [id, tri] of porId) {
  const a = tri.dueno ? extraerPrecios(tri.dueno) : null;
  const b = tri.publico ? extraerPrecios(tri.publico) : null;
  const c = tri.indice ? extraerPrecios(tri.indice) : null;
  const ja = JSON.stringify(a), jb = JSON.stringify(b), jc = JSON.stringify(c);
  if (ja === jb && jb === jc) continue;
  discrepantes++;
  const nombre = clave(tri.dueno ?? tri.publico ?? tri.indice ?? {});
  console.log(`- ${nombre}   [${id}]`);
  console.log(`    dueño   : ${tri.dueno ? ja : '(AUSENTE de users/cards)'}`);
  console.log(`    publico : ${tri.publico ? jb : '(AUSENTE de public_cards)'}`);
  console.log(`    indice  : ${tri.indice ? jc : '(AUSENTE del public_card_index)'}`);
}

console.log(`\nRESUMEN: ${discrepantes} cartas con precios distintos entre las tres colecciones, sobre ${porId.size} cartas vistas.`);
console.log(`Si discrepantes > 0, el defecto es del DATO y no de la vista: ninguna de las tres reconcilia contra otra.`);
