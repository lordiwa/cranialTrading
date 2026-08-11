#!/usr/bin/env node
/**
 * TASK-215 AC1 — empirical evidence for whether the eleven `users/{userId}`
 * subcollections that carry `allow read: if request.auth != null` (no
 * owner check) are actually readable by ANY authenticated user, not just
 * the owner. firestore.rules says so on paper (see lines around
 * decks/preferences/savedMatches/savedContacts/priceHistory/
 * cardPriceHistory/matches_nuevos/matches_guardados/matches_eliminados/
 * contactos_guardados/binders) — this script executes the read against a
 * real dev project instead of trusting the rules text.
 *
 * Design mirrors scripts/query-card-index-authz-probe.mjs (TASK-214):
 * two disposable accounts (attacker + victim), victim writes with her OWN
 * token (legitimate), attacker reads with HIS OWN token (this is what's
 * being measured — must not depend on any permissive rule to set up the
 * scenario). Both accounts and all docs are deleted at the end.
 *
 * Only a minimal document is written per subcollection — proving a READ is
 * possible does not require the real shape of a deck/binder/match/etc.
 *
 * DEV ONLY. Never point either role at TEST_USER_A or any personal account.
 *
 * Usage:
 *   FIREBASE_PROJECT=cranial-trading-dev node scripts/query-subcollections-authz-probe.mjs
 */
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(repoRoot, '.env.local') });
dotenv.config({ path: path.join(repoRoot, '.env.development') });

const projectId = process.env.FIREBASE_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || 'cranial-trading-dev';
const apiKey = process.env.VITE_FIREBASE_API_KEY;
const keepAccounts = process.env.KEEP_ACCOUNTS === '1';

if (projectId !== 'cranial-trading-dev') {
  console.error(`GUARD: este probe es solo para dev. FIREBASE_PROJECT resolvio a "${projectId}", se esperaba "cranial-trading-dev". Abortado.`);
  process.exit(1);
}

const REAL_ACCOUNT_DENYLIST = [process.env.TEST_USER_A_EMAIL, 'srparca@gmail.com'].filter(Boolean);

if (!apiKey) {
  console.error('Falta VITE_FIREBASE_API_KEY (.env.local o .env.development, o export a mano).');
  process.exit(1);
}

const identityUrl = (m) => `https://identitytoolkit.googleapis.com/v1/accounts:${m}?key=${apiKey}`;
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

// Las once subcolecciones bajo prueba (AC1 de TASK-215).
const SUBCOLLECTIONS = [
  'decks',
  'preferences',
  'savedMatches',
  'savedContacts',
  'priceHistory',
  'cardPriceHistory',
  'matches_nuevos',
  'matches_guardados',
  'matches_eliminados',
  'contactos_guardados',
  'binders',
];

function randomSuffix() {
  return crypto.randomBytes(6).toString('hex');
}

function assertDisposable(email) {
  if (REAL_ACCOUNT_DENYLIST.includes(email)) {
    throw new Error(`Email generado coincide con una cuenta real conocida (${email}). Abortado.`);
  }
}

async function signUp(role) {
  const email = `probe-subcoll-${role}-${Date.now()}-${randomSuffix()}@example.com`;
  assertDisposable(email);
  const password = crypto.randomBytes(16).toString('base64');

  const res = await fetch(identityUrl('signUp'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`signUp(${role}) fallo: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }
  const { idToken, localId } = await res.json();
  return { role, email, uid: localId, idToken };
}

async function deleteAccount(account) {
  const res = await fetch(identityUrl('delete'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: account.idToken }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`  AVISO: no se pudo borrar la cuenta ${account.role} (uid ${account.uid}): HTTP ${res.status} — ${body.slice(0, 200)}`);
    return false;
  }
  return true;
}

/** Escribe un doc minimo en users/{uid}/{subcollection} con el token del propio dueno. */
async function writeMinimalDoc(uid, token, subcollection) {
  const res = await fetch(`${firestoreBase}/users/${uid}/${subcollection}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      fields: {
        probe: { booleanValue: true },
        subcollection: { stringValue: subcollection },
        createdBy: { stringValue: 'query-subcollections-authz-probe' },
      },
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, body: text.slice(0, 200) };
  }
  const doc = JSON.parse(text);
  // doc.name = projects/{p}/databases/(default)/documents/users/{uid}/{sub}/{docId}
  const docId = doc.name.split('/').pop();
  return { ok: true, status: res.status, docId };
}

/** Lee un doc puntual con el token dado (posiblemente ajeno). */
async function readDoc(uid, subcollection, docId, readerToken) {
  const res = await fetch(`${firestoreBase}/users/${uid}/${subcollection}/${docId}`, {
    headers: { Authorization: `Bearer ${readerToken}` },
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, body: text.slice(0, 200) };
}

async function deleteDoc(uid, subcollection, docId, token) {
  if (!docId) return;
  await fetch(`${firestoreBase}/users/${uid}/${subcollection}/${docId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function main() {
  console.log(`Proyecto: ${projectId}`);
  console.log('Provisionando cuenta atacante y cuenta victima (descartables)...');

  const attacker = await signUp('attacker');
  const victim = await signUp('victim');

  if (attacker.uid === victim.uid) {
    throw new Error('GUARD: atacante y victima resolvieron al mismo uid. Abortado.');
  }
  console.log(`  Atacante uid: ${attacker.uid}`);
  console.log(`  Victima  uid: ${victim.uid}`);
  console.log('');

  const results = [];
  const writtenDocs = {}; // subcollection -> docId

  try {
    console.log('Victima escribe un documento minimo por subcoleccion (su propio token)...');
    for (const sub of SUBCOLLECTIONS) {
      const writeRes = await writeMinimalDoc(victim.uid, victim.idToken, sub);
      if (writeRes.ok) {
        writtenDocs[sub] = writeRes.docId;
        console.log(`  OK  ${sub} -> docId ${writeRes.docId}`);
      } else {
        console.log(`  FALLO escritura en ${sub}: HTTP ${writeRes.status} — ${writeRes.body}`);
        results.push({ sub, verdict: 'NO_PROBADO (escritura de la victima fallo)', writeStatus: writeRes.status, readStatus: null });
      }
    }

    console.log('');
    console.log('Atacante intenta leer cada subcoleccion de la victima con SU PROPIO token...');
    for (const sub of SUBCOLLECTIONS) {
      const docId = writtenDocs[sub];
      if (!docId) continue; // ya registrado como NO_PROBADO arriba
      const readRes = await readDoc(victim.uid, sub, docId, attacker.idToken);
      const verdict = readRes.status === 200 ? 'LEGIBLE (200)' : readRes.status === 403 ? 'CERRADA (403)' : `INESPERADO (${readRes.status})`;
      console.log(`  ${sub}: HTTP ${readRes.status} -> ${verdict}`);
      results.push({ sub, verdict, writeStatus: 200, readStatus: readRes.status });
    }

    // Direccion 2 (regresion): la VICTIMA lee sus propias once subcolecciones
    // con su propio token. Un cambio de reglas que cierre de mas (ej. typo en
    // el uid comparado, o un `if false` por error) se veria identico a un
    // cambio correcto si solo se mide la lectura ajena. Este bloque es el
    // candado contra ese falso positivo.
    console.log('');
    console.log('Victima intenta leer sus PROPIAS subcolecciones con su propio token...');
    const ownerResults = [];
    for (const sub of SUBCOLLECTIONS) {
      const docId = writtenDocs[sub];
      if (!docId) {
        ownerResults.push({ sub, verdict: 'NO_PROBADO (escritura de la victima fallo)', readStatus: null });
        continue;
      }
      const readRes = await readDoc(victim.uid, sub, docId, victim.idToken);
      const verdict = readRes.status === 200 ? 'OK (200)' : `ROTO (${readRes.status})`;
      console.log(`  ${sub}: HTTP ${readRes.status} -> ${verdict}`);
      ownerResults.push({ sub, verdict, readStatus: readRes.status });
    }

    console.log('');
    console.log('=== TABLA FINAL ===');
    console.log('subcoleccion'.padEnd(20) + 'lectura ajena'.padEnd(20) + 'lectura propia');
    console.log('-'.repeat(60));
    for (const r of results) {
      const own = ownerResults.find((o) => o.sub === r.sub);
      console.log(r.sub.padEnd(20) + r.verdict.padEnd(20) + (own ? own.verdict : 'N/A'));
    }

    const leakable = results.filter((r) => r.readStatus === 200);
    const closed = results.filter((r) => r.readStatus === 403);
    const untested = results.filter((r) => r.readStatus == null);
    const ownerOk = ownerResults.filter((r) => r.readStatus === 200);
    const ownerBroken = ownerResults.filter((r) => r.readStatus != null && r.readStatus !== 200);

    console.log('');
    console.log(`Legibles por cualquier cuenta autenticada (ajena): ${leakable.length}/${SUBCOLLECTIONS.length}`);
    console.log(`Cerradas para la cuenta ajena (403 pese a la regla esperada): ${closed.length}/${SUBCOLLECTIONS.length}`);
    if (closed.length > 0) {
      console.log(`  SORPRESA — cerradas: ${closed.map((r) => r.sub).join(', ')}`);
    }
    if (untested.length > 0) {
      console.log(`No probadas (escritura de la victima fallo): ${untested.map((r) => r.sub).join(', ')}`);
    }
    console.log(`Lectura propia OK (la victima se lee a si misma): ${ownerOk.length}/${SUBCOLLECTIONS.length}`);
    if (ownerBroken.length > 0) {
      console.log(`  REGRESION — el dueno no puede leer sus propios datos: ${ownerBroken.map((r) => r.sub).join(', ')}`);
    }
  } finally {
    console.log('');
    console.log('Limpiando documentos de prueba (token de la victima, dueno legitimo)...');
    for (const [sub, docId] of Object.entries(writtenDocs)) {
      await deleteDoc(victim.uid, sub, docId, victim.idToken);
    }
    console.log('  OK: documentos borrados.');

    if (keepAccounts) {
      console.log('');
      console.log(`KEEP_ACCOUNTS=1: cuentas NO borradas. uids: atacante=${attacker.uid} victima=${victim.uid}`);
    } else {
      console.log('');
      console.log('Borrando cuentas descartables...');
      const ca = await deleteAccount(attacker);
      const cv = await deleteAccount(victim);
      if (ca && cv) {
        console.log('  OK: ambas cuentas borradas.');
      } else {
        console.log(`  uids para limpieza manual si hace falta: atacante=${attacker.uid} victima=${victim.uid}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
