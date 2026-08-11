#!/usr/bin/env node
/**
 * card-index-fixture — pone y quita la divergencia de card_index a voluntad.
 *
 * POR QUE EXISTE. TASK-208 describe un estado en el que el card_index dice una
 * cosa y los documentos de users/{uid}/cards dicen otra, y NO converge solo. La
 * grilla se arma con el indice, asi que el usuario ve un inventario que no
 * tiene. Hasta ahora la unica reproduccion viva era la cuenta de dev, dejada
 * sucia a mano: costaba una cuenta entera, ensuciaba E2E, y se perdia para
 * siempre al repararla. Esto la vuelve una herramienta.
 *
 * QUE REPRODUCE Y QUE NO — LEER ESTO ANTES DE SACAR CONCLUSIONES.
 *   --break reproduce el ESTADO, no la CAUSA. Escribe el indice directamente y
 *   NO toca los documentos, que es exactamente la firma de TASK-208. Pero NO
 *   demuestra que la app pueda llegar sola a ese estado: el camino real es una
 *   accion masiva que se agota a mitad (TASK-206) sobre un motor que devuelve
 *   ok:true igual (TASK-207). Sirve como fixture para probar deteccion,
 *   convergencia y reparacion. NO sirve como evidencia de que la causa exista.
 *
 * COMO ESTA GUARDADO EL INDICE (functions/index.js):
 *   users/{uid}/card_index/chunk_N  ->  { cards: [...], count, version: 3 }
 *   cada carta va comprimida:  i=id  st=status  r=rareza(1a letra)
 *                              co=colores[]  p=precio  n=nombre  q=cantidad
 *
 * USO:
 *   gcloud auth application-default login
 *
 *   node scripts/card-index-fixture.mjs --status
 *   node scripts/card-index-fixture.mjs --break --count=58 --from=sale --to=trade \
 *                                       --colors=W --rarity=mythic --min-price=10
 *   node scripts/card-index-fixture.mjs --restore
 *   node scripts/card-index-fixture.mjs --restore --force  # pisa un drift detectado
 *   node scripts/card-index-fixture.mjs --repair
 *
 * --status no escribe nada. --restore SI puede dejar algo que no se deshace: si
 * detecta drift (alguna carta ya no tiene el estado que puso --break, o ya no
 * esta en el indice) aborta ANTES de escribir y exige --force para continuar —
 * pero con --force, o si no hay drift, escribe y borra el fixture como
 * siempre, y a partir de ahi la unica vuelta atras es --repair (reconstruir,
 * no deshacer). --break guarda
 * SIEMPRE el estado previo en .card-index-fixture.json antes de tocar nada, y se
 * niega a correr si ya hay un fixture puesto sin restaurar.
 *
 * NUNCA correr --break, --restore o --repair con E2E corriendo sobre la misma
 * cuenta (TEST_USER_A es la del CI): los tres hacen read-modify-write sin
 * transaccion sobre los mismos 30 chunks que un rebuild real puede estar
 * reescribiendo a mitad de camino. Verificar `gh run list` antes de escribir.
 *
 * --repair invoca la Cloud Function buildCardIndex DESPLEGADA, la misma que
 * llama la app, en vez de recalcular el indice aca. Es a proposito: recalcularlo
 * duplicaria la codificacion de toIndexCard y bastaria un cambio en
 * functions/index.js para que este script "reparara" a un formato viejo.
 *
 * La cuenta objetivo sale de TEST_USER_A_EMAIL (.env.local) salvo que se pase
 * --uid. Este script nunca imprime la contrasenia ni el email.
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

const STATE_FILE = path.join(repoRoot, '.card-index-fixture.json');
const CHUNK_PREFIX = 'chunk_';

// ---------------------------------------------------------------- argumentos

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const MODES = ['status', 'break', 'restore', 'repair'];
const mode = MODES.find((m) => has(`--${m}`));

if (!mode) {
  console.error(`Falta el modo. Uno de: ${MODES.map((m) => `--${m}`).join(' ')}`);
  console.error('Ver la cabecera del archivo para el uso completo.');
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || 'cranial-trading-dev';

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

// ------------------------------------------------------------------ helpers

/** Resuelve el uid objetivo: --uid explicito, o el de TEST_USER_A_EMAIL. */
async function resolveUid() {
  const explicit = val('uid');
  if (explicit) return explicit;

  const email = process.env.TEST_USER_A_EMAIL;
  if (!email) {
    throw new Error('No hay --uid ni TEST_USER_A_EMAIL en .env.local');
  }
  const user = await getAuth().getUserByEmail(email);
  return user.uid;
}

/**
 * Lee el estado de TODOS los documentos de carta. Solo proyecta `status`:
 * son decenas de miles de documentos y no hace falta nada mas.
 *
 * NO ATOMICO: pagina ~30 consultas por cursor sobre 59k documentos (decenas
 * de segundos), mientras el indice se lee en un solo get(). Actividad de la
 * app o de E2E durante esa ventana puede aparecer como divergencia falsa en
 * --status. Ver el aviso que imprime cmdStatus.
 */
async function readDocStatuses(uid) {
  const col = db.collection(`users/${uid}/cards`);
  const byId = new Map();
  let last = null;
  const PAGE = 2000;

  for (;;) {
    let q = col.select('status').orderBy('__name__').limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) byId.set(d.id, d.get('status') || 'collection');
    last = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < PAGE) break;
  }
  return byId;
}

/**
 * Lee los chunks del indice EN ORDEN NUMERICO. getDocs devuelve orden
 * lexicografico, donde chunk_10 va antes que chunk_2 — la trampa que causo
 * TASK-168. Devuelve los documentos crudos para poder reescribirlos.
 *
 * Devuelve { chunks, invalidIds }: un doc chunk_x (sufijo no numerico) pasa
 * el filtro startsWith pero no es un chunk valido (Number('x') es NaN, ordena
 * mal y ninguna deteccion de faltantes lo agarra), asi que se excluye de
 * `chunks` y se reporta aparte en `invalidIds` — el llamador decide si eso
 * basta para no confiar en el resto de la lectura (cmdStatus lo hace).
 */
async function readIndexChunks(uid) {
  const snap = await db.collection(`users/${uid}/card_index`).get();
  const parsed = snap.docs
    .filter((d) => d.id.startsWith(CHUNK_PREFIX))
    .map((d) => ({ id: d.id, n: Number(d.id.slice(CHUNK_PREFIX.length)), data: d.data() }));

  const invalidIds = parsed.filter((c) => Number.isNaN(c.n)).map((c) => c.id);
  const chunks = parsed.filter((c) => !Number.isNaN(c.n)).sort((a, b) => a.n - b.n);
  return { chunks, invalidIds };
}

/** id -> estado, segun el indice. Reporta duplicados, que serian corrupcion. */
function indexStatuses(chunks) {
  const byId = new Map();
  let duplicates = 0;
  for (const c of chunks) {
    for (const card of c.data.cards || []) {
      if (byId.has(card.i)) duplicates++;
      byId.set(card.i, card.st || 'collection');
    }
  }
  return { byId, duplicates };
}

function tally(map) {
  const out = {};
  for (const v of map.values()) out[v] = (out[v] || 0) + 1;
  return out;
}

function fmtTally(t) {
  const keys = Object.keys(t).sort();
  return keys.length ? keys.map((k) => `${k}=${t[k]}`).join('  ') : '(vacio)';
}

// ------------------------------------------------------------------- status

async function cmdStatus(uid) {
  console.log(`Proyecto: ${projectId}`);
  console.log(`Cuenta:   ${uid}`);
  console.log('');
  console.log('NOTA: esta lectura NO es atomica. Los documentos se paginan en decenas');
  console.log('de segundos y el indice se lee aparte; actividad reciente de la app o de');
  console.log('E2E puede aparecer como divergencia transitoria. Ante VEREDICTO: DIVERGENTE,');
  console.log('re-correr antes de concluir.');
  console.log('');

  const [docs, { chunks, invalidIds }] = await Promise.all([readDocStatuses(uid), readIndexChunks(uid)]);
  const { byId: idx, duplicates } = indexStatuses(chunks);

  console.log(`Documentos reales : ${docs.size}`);
  console.log(`Cartas en indice  : ${idx.size}  (${chunks.length} chunks)`);
  if (duplicates > 0) {
    console.log(`  AVISO: ${duplicates} ids duplicados entre chunks (corrupcion, no divergencia)`);
  }
  if (invalidIds.length > 0) {
    console.log(`  AVISO: ${invalidIds.length} chunk(s) con sufijo no numerico, EXCLUIDOS de esta lectura: ${invalidIds.join(', ')}`);
    console.log('  Las cartas que contengan no se comparan: el resultado de abajo es incompleto.');
  }

  // Chunks faltantes: la firma de TASK-168. Va hasta el n MAXIMO presente, no
  // hasta chunks.length-1 — con chunks {0,1,5,6} length es 4 y el loop viejo
  // nunca llegaba a mirar si faltaba el 4.
  const maxN = chunks.reduce((m, c) => Math.max(m, c.n), -1);
  const missing = [];
  for (let i = 0; i < maxN; i++) {
    if (!chunks.some((c) => c.n === i)) missing.push(i);
  }
  if (missing.length) console.log(`  AVISO: faltan chunks ${missing.join(', ')}`);

  console.log('');
  console.log(`Estados segun documentos : ${fmtTally(tally(docs))}`);
  console.log(`Estados segun indice     : ${fmtTally(tally(idx))}`);
  console.log('');

  const mismatched = [];
  const onlyInDocs = [];
  for (const [id, st] of docs) {
    if (!idx.has(id)) onlyInDocs.push(id);
    else if (idx.get(id) !== st) mismatched.push({ id, doc: st, index: idx.get(id) });
  }
  const onlyInIndex = [...idx.keys()].filter((id) => !docs.has(id));

  console.log(`DIVERGENCIA`);
  console.log(`  estado distinto      : ${mismatched.length}`);
  console.log(`  solo en documentos   : ${onlyInDocs.length}  (el indice no las muestra)`);
  console.log(`  solo en indice       : ${onlyInIndex.length}  (FANTASMAS: se ven y no existen)`);

  // Los ids concretos importan: un rebuild los borra, y son la unica evidencia
  // de que la divergencia existio. Se imprimen con su nombre para poder
  // buscarlos a mano en la app antes de reparar.
  const detail = async (ids, label, source) => {
    if (!ids.length) return;
    console.log('');
    console.log(`  ${label}:`);
    for (const id of ids.slice(0, 20)) {
      let extra = '';
      if (source === 'doc') {
        const d = await db.doc(`users/${uid}/cards/${id}`).get();
        extra = d.exists ? `${d.get('name')} — ${d.get('status')}` : '(ya no existe)';
      } else {
        const card = chunks.flatMap((c) => c.data.cards || []).find((c) => c.i === id);
        extra = card ? `${card.n} — ${card.st}` : '(?)';
      }
      console.log(`    ${id}  ${extra}`);
    }
    if (ids.length > 20) console.log(`    ... y ${ids.length - 20} mas`);
  };
  await detail(onlyInIndex, 'FANTASMAS (en indice, sin documento)', 'index');
  await detail(onlyInDocs, 'INVISIBLES (con documento, fuera del indice)', 'doc');

  if (mismatched.length) {
    const pairs = {};
    for (const m of mismatched) {
      const k = `${m.doc} -> ${m.index}`;
      pairs[k] = (pairs[k] || 0) + 1;
    }
    console.log('');
    console.log('  Por transicion (documento -> indice):');
    for (const [k, v] of Object.entries(pairs).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${k.padEnd(28)} ${v}`);
    }
    console.log('');
    console.log('  Muestra (hasta 5):');
    for (const m of mismatched.slice(0, 5)) {
      console.log(`    ${m.id}  documento=${m.doc}  indice=${m.index}`);
    }
  }

  const dataDivergent = mismatched.length > 0 || onlyInDocs.length > 0 || onlyInIndex.length > 0;
  const clean = !dataDivergent && invalidIds.length === 0;
  console.log('');
  if (invalidIds.length > 0) {
    console.log('VEREDICTO: DIVERGENTE (corrupcion estructural — chunk(s) invalido(s), ver AVISO arriba).');
  } else {
    console.log(clean ? 'VEREDICTO: el indice coincide con los documentos.' : 'VEREDICTO: DIVERGENTE.');
  }
  // El consejo de re-correr solo aplica a la divergencia de DATOS (no atomica
  // por diseno). Un chunk con sufijo no numerico es corrupcion estructural,
  // no una lectura desalineada en el tiempo: re-correr no lo cambia.
  if (dataDivergent) {
    console.log('Antes de concluir: re-correr --status. La lectura no es atomica (ver nota');
    console.log('arriba) y actividad reciente puede producir una divergencia transitoria.');
  }

  if (fs.existsSync(STATE_FILE)) {
    const st = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    console.log('');
    console.log(`Hay un fixture PUESTO (${st.changes.length} cartas, ${st.at}). --restore lo deshace.`);
  }
  return clean ? 0 : 1;
}

// -------------------------------------------------------------------- break

function matchesFilter(card, f) {
  if (f.from && (card.st || 'collection') !== f.from) return false;
  if (f.colors && !(card.co || []).includes(f.colors)) return false;
  if (f.rarity && (card.r || '') !== f.rarity[0]) return false;
  if (f.minPrice != null && !(Number(card.p) >= f.minPrice)) return false;
  return true;
}

async function cmdBreak(uid) {
  if (fs.existsSync(STATE_FILE)) {
    console.error('Ya hay un fixture puesto y sin restaurar. Corre --restore primero,');
    console.error(`o borra ${STATE_FILE} si sabes que el indice ya esta limpio.`);
    return 1;
  }

  const filter = {
    from: val('from', 'sale'),
    colors: val('colors'),
    rarity: val('rarity'),
    minPrice: val('min-price') != null ? Number(val('min-price')) : null,
  };
  const to = val('to', 'trade');
  const rawCount = val('count');
  const count = rawCount != null ? Number(rawCount) : Infinity;

  if (rawCount != null && !(Number.isInteger(count) && count > 0)) {
    console.error(`--count=${rawCount} no es un entero positivo. Si queres "todas", omiti --count.`);
    return 1;
  }

  if (filter.from === to) {
    console.error('--from y --to son iguales: no cambiaria nada.');
    return 1;
  }

  console.log(`Proyecto: ${projectId}`);
  console.log(`Cuenta:   ${uid}`);
  console.log(`Filtro:   from=${filter.from} colors=${filter.colors ?? '*'} rarity=${filter.rarity ?? '*'} min-price=${filter.minPrice ?? '*'}`);
  console.log(`Accion:   marcar hasta ${count === Infinity ? 'todas' : count} como "${to}" EN EL INDICE, sin tocar los documentos`);
  console.log('');

  const { chunks, invalidIds } = await readIndexChunks(uid);
  if (invalidIds.length > 0) {
    console.error(`AVISO: ${invalidIds.length} chunk(s) con sufijo no numerico, ignorados: ${invalidIds.join(', ')}`);
  }
  const changes = [];
  const touched = new Set();

  for (const c of chunks) {
    const cards = c.data.cards || [];
    for (const card of cards) {
      if (changes.length >= count) break;
      if (!matchesFilter(card, filter)) continue;
      changes.push({ chunk: c.id, i: card.i, from: card.st || 'collection', to });
      card.st = to;
      touched.add(c.id);
    }
    if (changes.length >= count) break;
  }

  if (changes.length === 0) {
    console.log('Ninguna carta coincide con el filtro. No se escribio nada.');
    return 1;
  }
  if (changes.length < count && count !== Infinity) {
    console.log(`AVISO: solo ${changes.length} cartas coinciden, se pidieron ${count}.`);
  }

  // El estado previo se guarda ANTES de escribir. Si el proceso muere a mitad,
  // el archivo ya describe todo lo que se pudo haber tocado.
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ uid, projectId, at: new Date().toISOString(), filter, to, changes }, null, 2),
  );
  console.log(`Estado previo guardado en ${path.basename(STATE_FILE)} (${changes.length} cartas).`);

  for (const c of chunks) {
    if (!touched.has(c.id)) continue;
    await db.doc(`users/${uid}/card_index/${c.id}`).update({ cards: c.data.cards });
  }

  console.log(`Listo: ${changes.length} cartas divergentes en ${touched.size} chunks.`);
  console.log('Los documentos NO se tocaron: --status deberia reportar la divergencia.');
  return 0;
}

// ------------------------------------------------------------------ restore

async function cmdRestore(uid) {
  if (!fs.existsSync(STATE_FILE)) {
    console.error(`No hay ${path.basename(STATE_FILE)}: no se que restaurar.`);
    console.error('Si el indice quedo sucio igual, usa --repair.');
    return 1;
  }
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  if (state.uid !== uid) {
    console.error(`El fixture es de la cuenta ${state.uid}, no de ${uid}. No toco nada.`);
    return 1;
  }

  console.log(`Restaurando ${state.changes.length} cartas puestas el ${state.at}...`);

  const byId = new Map(state.changes.map((c) => [c.i, c.from]));
  const { chunks, invalidIds } = await readIndexChunks(uid);
  if (invalidIds.length > 0) {
    console.error(`AVISO: ${invalidIds.length} chunk(s) con sufijo no numerico, ignorados: ${invalidIds.join(', ')}`);
  }

  // PRIMERA PASADA, SOLO LECTURA: detecta drift ANTES de tocar nada. Si algo
  // mas cambio el estado de una carta desde --break, restaurar igual pisaria
  // ese cambio real. Una carta del fixture que desaparecio del indice es el
  // mismo problema (algo mas la toco) y se trata igual: se aborta sin
  // escribir salvo --force.
  const drift = [];
  const foundIds = new Set();
  for (const c of chunks) {
    for (const card of c.data.cards || []) {
      if (!byId.has(card.i)) continue;
      foundIds.add(card.i);
      if (card.st !== state.to) drift.push({ i: card.i, expected: state.to, actual: card.st });
    }
  }
  const missing = state.changes.filter((c) => !foundIds.has(c.i)).map((c) => c.i);

  if ((drift.length > 0 || missing.length > 0) && !has('--force')) {
    console.error(`ABORTADO: ${drift.length} carta(s) ya no tienen el estado que puso --break y`);
    console.error(`${missing.length} carta(s) del fixture ya no estan en el indice; algo mas las`);
    console.error('cambio (posiblemente legitimo). No se escribio nada.');
    if (drift.length) {
      console.error('Muestra de estado distinto (hasta 5):');
      for (const d of drift.slice(0, 5)) {
        console.error(`  ${d.i}  esperado=${d.expected}  actual=${d.actual}`);
      }
    }
    if (missing.length) {
      console.error('Muestra de ausentes (hasta 5):');
      for (const id of missing.slice(0, 5)) console.error(`  ${id}`);
    }
    console.error('');
    console.error(`El fixture en ${path.basename(STATE_FILE)} NO se borro: podes revisar y`);
    console.error('reintentar con --force si igual queres continuar, o dejarlo y correr');
    console.error('--repair para reconstruir desde los documentos en su lugar.');
    return 1;
  }

  const touched = new Set();
  for (const c of chunks) {
    for (const card of c.data.cards || []) {
      if (!byId.has(card.i)) continue;
      card.st = byId.get(card.i);
      touched.add(c.id);
    }
  }

  for (const c of chunks) {
    if (!touched.has(c.id)) continue;
    await db.doc(`users/${uid}/card_index/${c.id}`).update({ cards: c.data.cards });
  }

  if (drift.length > 0 || missing.length > 0) {
    console.log(`AVISO: --force siguio adelante con ${drift.length} carta(s) con drift (se les`);
    console.log('piso el estado con el que puso --break, ya no hay vuelta atras para esas) y');
    console.log(`${missing.length} carta(s) que ya no estan en el indice (a esas no se les escribio`);
    console.log('nada, no hay que restaurar; lo unico que se pierde es el registro del fixture,');
    console.log('que se borra igual).');
  }

  fs.unlinkSync(STATE_FILE);
  console.log(`Listo: ${foundIds.size} cartas restauradas. Fixture borrado.`);
  return 0;
}

// ------------------------------------------------------------------- repair

async function cmdRepair(uid) {
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  const email = process.env.TEST_USER_A_EMAIL;
  const password = process.env.TEST_USER_A_PASSWORD;

  if (!apiKey) throw new Error('Falta VITE_FIREBASE_API_KEY (.env.development)');
  if (!email || !password) throw new Error('Faltan TEST_USER_A_EMAIL/PASSWORD (.env.local)');

  console.log(`Proyecto: ${projectId}`);
  console.log(`Cuenta:   ${uid}`);
  console.log('Invocando la Cloud Function buildCardIndex desplegada (la misma que llama la app)...');

  const loginRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!loginRes.ok) {
    throw new Error(`Login fallido: HTTP ${loginRes.status}`);
  }
  const { idToken, localId } = await loginRes.json();

  if (localId !== uid) {
    console.error(`La cuenta del login (${localId}) no es la cuenta objetivo (${uid}).`);
    console.error('buildCardIndex reconstruiria el indice equivocado. Abortado.');
    return 1;
  }

  const region = process.env.FIREBASE_FUNCTIONS_REGION || 'us-central1';
  const started = Date.now();
  const fnRes = await fetch(
    `https://${region}-${projectId}.cloudfunctions.net/buildCardIndex`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ data: {} }),
    },
  );

  const body = await fnRes.text();
  if (!fnRes.ok) {
    throw new Error(`buildCardIndex fallo: HTTP ${fnRes.status} — ${body.slice(0, 300)}`);
  }

  const result = JSON.parse(body).result;
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`Listo en ${elapsed}s: ${result.totalCards} cartas -> ${result.chunks} chunks.`);

  if (fs.existsSync(STATE_FILE)) {
    const st = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (st.uid === uid) {
      fs.unlinkSync(STATE_FILE);
      console.log('El fixture quedo obsoleto tras el rebuild: borrado.');
    } else {
      console.log(`AVISO: hay un fixture puesto para otra cuenta (${st.uid}), no se toco.`);
    }
  }
  console.log('Corre --status para verificar que convergio.');
  return 0;
}

// --------------------------------------------------------------------- main

const uid = await resolveUid();
const handlers = { status: cmdStatus, break: cmdBreak, restore: cmdRestore, repair: cmdRepair };
process.exit(await handlers[mode](uid));
