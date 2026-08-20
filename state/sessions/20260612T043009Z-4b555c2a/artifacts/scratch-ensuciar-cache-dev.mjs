// ESCRIBE. SOLO DEV. Rompe a proposito el campo `set` de unos pocos docs de
// scryfall_cache en cranial-trading-dev, para que el backfill de Scryfall
// (functions/lib/publicCardCacheBackfill.js) TENGA algo que reparar.
//
// POR QUE EXISTE. Medido el 2026-08-19: en dev los 3.097 scryfallIds unicos
// sin setCode estan TODOS en scryfall_cache con `set`, asi que el fallback
// barato los cubre al 100% y los ids que obligan a llamar a Scryfall son CERO.
// Sin este paso, desplegar a dev sale verde y el modulo nuevo no ejecuta ni
// una sola vez: llegaria a produccion sin haber hecho jamas una llamada real.
//
// GUARDA LOS VALORES ORIGINALES en un JSON al lado. Eso es lo que convierte la
// verificacion posterior en un control de verdad: no alcanza con que el
// backfill escriba UN `set`, tiene que escribir EL MISMO que habia.
//
// USO:
//   node scratch-ensuciar-cache-dev.mjs            (rompe, por defecto 6 docs)
//   node scratch-ensuciar-cache-dev.mjs --verify   (compara contra el backup)
//   node scratch-ensuciar-cache-dev.mjs --restore  (deshace, por si acaso)
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DEV = 'cranial-trading-dev';
const projectId = process.env.FIREBASE_PROJECT;
if (projectId !== DEV) {
  console.error(`REFUSED: este script solo corre contra ${DEV}. FIREBASE_PROJECT=${projectId}`);
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const BACKUP = path.join(here, 'ensuciar-cache-dev.backup.json');
const modo = process.argv.includes('--verify') ? 'verify'
  : process.argv.includes('--restore') ? 'restore' : 'break';
const CUANTOS = 6;

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

if (modo === 'break') {
  if (fs.existsSync(BACKUP)) {
    console.error(`REFUSED: ya existe ${BACKUP}. Corre --restore o --verify primero, o borralo a mano.`);
    process.exit(1);
  }
  // Elegir docs REALMENTE usados por el vendedor publico de dev, si no el
  // reconcile nunca los pide y el ejercicio no prueba nada.
  const pub = await db.collection('public_cards').get();
  const ids = [...new Set(pub.docs.map(d => d.data().scryfallId).filter(Boolean))];
  const elegidos = [];
  for (let i = 0; i < ids.length && elegidos.length < CUANTOS; i += 300) {
    const docs = await db.getAll(...ids.slice(i, i + 300).map(id => db.doc(`scryfall_cache/${id}`)));
    for (const doc of docs) {
      if (elegidos.length >= CUANTOS) break;
      const c = doc.exists ? doc.data() : null;
      if (!c || !c.set) continue;
      elegidos.push({
        scryfallId: doc.id,
        name: c.name || null,
        set_original: c.set,
        set_name_original: c.set_name || null,
        produced_mana_original: c.produced_mana || null,
        keywords_original: c.keywords || null,
      });
    }
  }
  if (elegidos.length === 0) { console.error('No encontre docs con `set` para romper.'); process.exit(1); }

  fs.writeFileSync(BACKUP, JSON.stringify({ projectId, at: new Date().toISOString(), docs: elegidos }, null, 1));
  for (const e of elegidos) {
    await db.doc(`scryfall_cache/${e.scryfallId}`).update({ set: FieldValue.delete() });
  }
  console.log(JSON.stringify({
    modo, projectId, rotos: elegidos.length, backup: BACKUP,
    docs: elegidos.map(e => ({ scryfallId: e.scryfallId, name: e.name, set_original: e.set_original })),
  }, null, 1));
  process.exit(0);
}

// verify / restore necesitan el backup
if (!fs.existsSync(BACKUP)) { console.error(`No existe ${BACKUP}`); process.exit(1); }
const backup = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));

if (modo === 'restore') {
  for (const e of backup.docs) {
    await db.doc(`scryfall_cache/${e.scryfallId}`).set({ set: e.set_original }, { merge: true });
  }
  console.log(JSON.stringify({ modo, restaurados: backup.docs.length }, null, 1));
  process.exit(0);
}

// verify: el backfill escribio EL MISMO set? y preservo los campos ricos?
const filas = [];
for (const e of backup.docs) {
  const snap = await db.doc(`scryfall_cache/${e.scryfallId}`).get();
  const c = snap.exists ? snap.data() : null;
  const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  filas.push({
    scryfallId: e.scryfallId,
    name: e.name,
    set_esperado: e.set_original,
    set_actual: c ? (c.set ?? null) : null,
    SET_CORRECTO: !!c && c.set === e.set_original,
    produced_mana_preservado: igual(c && c.produced_mana, e.produced_mana_original),
    keywords_preservado: igual(c && c.keywords, e.keywords_original),
  });
}
const ok = filas.filter(f => f.SET_CORRECTO).length;
console.log(JSON.stringify({
  modo, projectId,
  docs: filas.length,
  SET_CORRECTO: ok,
  set_incorrecto_o_faltante: filas.length - ok,
  campos_ricos_perdidos: filas.filter(f => !f.produced_mana_preservado || !f.keywords_preservado).length,
  detalle: filas,
}, null, 1));
process.exit(0);
