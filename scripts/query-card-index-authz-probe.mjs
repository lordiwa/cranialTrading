#!/usr/bin/env node
/**
 * TASK-214 — empirical BEFORE evidence for the queryCardIndex authz gap.
 *
 * This is evidence, not a repro-and-fix harness: it must run and capture its
 * output BEFORE firestore.rules:117 is tightened, because after that change
 * the same requests will legitimately fail and the "before" state becomes
 * unobservable. See TASK-214 AC1.
 *
 * Provisions TWO disposable accounts (attacker + victim), has the victim
 * write a few real card docs to their OWN account (legitimate — their own
 * token, their own uid) and self-trigger buildCardIndex (legitimate — no
 * payload, self-only regardless of the TASK-211 fix state), then — logged
 * in as the ATTACKER — proves two independent things:
 *
 *   (a) exports.queryCardIndex, called with { userId: <victim uid> },
 *       returns the victim's card_index contents to the attacker.
 *   (b) a direct Firestore REST read of users/{victim}/card_index/chunk_0,
 *       authenticated as the attacker (not the victim), succeeds — this is
 *       firestore.rules:117 (`allow read: if request.auth != null`) doing
 *       it, with no Cloud Function involved at all. This is why TASK-214's
 *       AC3 fixes the RULE, not just the function: patching queryCardIndex
 *       alone leaves (b) wide open via the SDK directly.
 *
 * Both accounts are disposable, self-provisioned, and self-deleted at the
 * end (including their Firestore docs, which auth account deletion does
 * NOT clean up on its own) — never point either role at TEST_USER_A or any
 * personal account.
 *
 * Usage:
 *   FIREBASE_PROJECT=cranial-trading-dev node scripts/query-card-index-authz-probe.mjs
 *
 * VITE_FIREBASE_API_KEY is read from .env.local / .env.development via
 * dotenv — do not read env files by hand (quoted values break the API key).
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
const region = process.env.FIREBASE_FUNCTIONS_REGION || 'us-central1';
const keepAccounts = process.env.KEEP_ACCOUNTS === '1';

const REAL_ACCOUNT_DENYLIST = [process.env.TEST_USER_A_EMAIL, 'srparca@gmail.com'].filter(Boolean);

if (!apiKey) {
  console.error('Falta VITE_FIREBASE_API_KEY (.env.local o .env.development, o export a mano).');
  process.exit(1);
}

const identityUrl = (m) => `https://identitytoolkit.googleapis.com/v1/accounts:${m}?key=${apiKey}`;
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

function randomSuffix() {
  return crypto.randomBytes(6).toString('hex');
}

function assertDisposable(email) {
  if (REAL_ACCOUNT_DENYLIST.includes(email)) {
    throw new Error(`Email generado coincide con una cuenta real conocida (${email}). Abortado.`);
  }
}

async function signUp(role) {
  const email = `probe-qci-${role}-${Date.now()}-${randomSuffix()}@example.com`;
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

/** Escribe un doc de carta minimo en users/{uid}/cards con el token del propio dueno. */
async function writeCard(uid, token, name) {
  const res = await fetch(`${firestoreBase}/users/${uid}/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      fields: {
        name: { stringValue: name },
        scryfallId: { stringValue: `probe-${randomSuffix()}` },
        status: { stringValue: 'collection' },
        quantity: { integerValue: '1' },
        price: { doubleValue: 1 },
        edition: { stringValue: 'Probe Set' },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`No se pudo escribir carta de prueba: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }
}

async function callFunction(name, token, data) {
  const res = await fetch(`https://${region}-${projectId}.cloudfunctions.net/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { ok: res.ok, status: res.status, json, text };
}

/** Lee users/{uid}/card_index/chunk_0 con el token dado (posiblemente ajeno). */
async function readChunk0(uid, readerToken) {
  const res = await fetch(`${firestoreBase}/users/${uid}/card_index/chunk_0`, {
    headers: { Authorization: `Bearer ${readerToken}` },
  });
  if (res.status === 404) return { exists: false, status: 404 };
  const text = await res.text();
  if (!res.ok) return { exists: false, status: res.status, body: text.slice(0, 200) };
  const doc = JSON.parse(text);
  return { exists: true, status: 200, raw: doc };
}

async function deleteAllDocs(collectionPath, token) {
  const res = await fetch(`${firestoreBase}/${collectionPath}?pageSize=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;
  const body = await res.json();
  const docs = body.documents || [];
  for (const doc of docs) {
    await fetch(doc.name.replace('projects/', 'https://firestore.googleapis.com/v1/projects/'), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }
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

  try {
    console.log('Victima escribe 3 cartas propias (legitimo: su propio token)...');
    await writeCard(victim.uid, victim.idToken, 'Probe Card 1');
    await writeCard(victim.uid, victim.idToken, 'Probe Card 2');
    await writeCard(victim.uid, victim.idToken, 'Probe Card 3');
    console.log('  OK: 3 cartas escritas.');

    console.log('Victima auto-reconstruye su propio card_index (buildCardIndex, self, sin payload)...');
    const buildRes = await callFunction('buildCardIndex', victim.idToken, {});
    console.log(`  HTTP ${buildRes.status} — ${buildRes.text.slice(0, 200)}`);
    if (!buildRes.ok) {
      throw new Error('buildCardIndex (self) fallo — no se puede continuar sin un card_index de victima para probar.');
    }

    console.log('');
    console.log('=== (a) exports.queryCardIndex con userId ajeno, logueado como atacante ===');
    const queryRes = await callFunction('queryCardIndex', attacker.idToken, {
      userId: victim.uid,
      page: 0,
      pageSize: 50,
    });
    console.log(`HTTP ${queryRes.status}`);
    console.log(queryRes.text.slice(0, 1000));
    const returnedNames = (queryRes.json?.result?.cards || queryRes.json?.cards || [])
      .map((c) => c.n || c.name)
      .filter(Boolean);
    const leakedViaFunction = returnedNames.some((n) => String(n).startsWith('Probe Card'));

    console.log('');
    console.log('=== (b) lectura REST directa de users/{victima}/card_index/chunk_0 con token del atacante ===');
    const directRead = await readChunk0(victim.uid, attacker.idToken);
    console.log(`HTTP ${directRead.status} — exists=${directRead.exists}`);
    if (directRead.exists) {
      console.log(`  Campos presentes: ${Object.keys(directRead.raw.fields || {}).join(', ')}`);
    }
    const leakedViaRules = directRead.exists && directRead.status === 200;

    console.log('');
    console.log('=== VEREDICTO ===');
    console.log(`(a) queryCardIndex devolvio cartas de la victima al atacante: ${leakedViaFunction ? 'SI — VULNERABLE' : 'no'}`);
    console.log(`(b) lectura REST directa del card_index ajeno con firestore.rules actuales: ${leakedViaRules ? 'SI — VULNERABLE' : 'no'}`);
    if (leakedViaFunction || leakedViaRules) {
      console.log('');
      console.log('CONFIRMADO: hoy se puede leer el card_index de otra cuenta, por (a) la funcion y/o (b) el SDK directo.');
      process.exitCode = 0;
    } else {
      console.log('');
      console.log('NO CONFIRMADO en esta corrida — revisar manualmente el detalle de arriba.');
      process.exitCode = 1;
    }

    console.log('');
    console.log('Limpiando datos de la victima (cartas + card_index) con su propio token...');
    await deleteAllDocs(`users/${victim.uid}/cards`, victim.idToken);
    await deleteAllDocs(`users/${victim.uid}/card_index`, victim.idToken);
  } finally {
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
