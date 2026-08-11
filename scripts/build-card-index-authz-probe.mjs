#!/usr/bin/env node
/**
 * TASK-211 — empirical before/after probe for the buildCardIndex authz bug.
 *
 * Provisions TWO disposable, EMPTY (0 cards) accounts itself (attacker +
 * victim), logs in as the attacker, and invokes the DEPLOYED buildCardIndex
 * Cloud Function passing the victim's uid in the payload — the exact shape
 * the vulnerable client code never sent, but the vulnerable server code
 * happily accepted (`request.data?.userId || request.auth.uid`).
 *
 * WHY DISPOSABLE + EMPTY ACCOUNTS (do not change this design):
 *   Both accounts must be created fresh by this script and have 0 cards.
 *   NEVER point either role at TEST_USER_A (CI account, ~59k cards, ~113s
 *   rebuild, collides with E2E) or at a personal account. In
 *   functions/index.js `totalChunks = Math.ceil(0 / INDEX_CHUNK_SIZE) || 1`
 *   is always >= 1 — even a 0-card account gets a `chunk_0` written on
 *   rebuild. That's the whole signal: no cards are needed to prove the bug.
 *   This is enforced at runtime below (assertDisposable + assertEmpty), not
 *   just in this comment.
 *
 * WHAT THE SCRIPT DOES, END TO END:
 *   1. Creates account A (attacker) and account B (victim) via Identity
 *      Toolkit signUp (self-provisioned, random email/password).
 *   2. Aborts if either generated email collides with a known real account,
 *      or if the two accounts somehow got the same uid.
 *   3. Aborts if either account is found to already have card documents
 *      (should be structurally impossible for a brand-new signUp, but this
 *      is a runtime guard, not a comment).
 *   4. Reads both accounts' users/{uid}/card_index/chunk_0 BEFORE the call
 *      (expected: absent for both — neither has ever been indexed).
 *   5. Invokes the deployed buildCardIndex as the attacker with
 *      { data: { userId: <victim uid> } }.
 *   6. Reads both chunk_0 docs again AFTER the call and derives the verdict
 *      itself — no manual inspection required:
 *        - victim's chunk_0 went from absent -> present  => VULNERABLE
 *          (the deployed function rebuilt the account named in the
 *          payload, not the caller's own account).
 *        - attacker's chunk_0 went from absent -> present, victim's stayed
 *          absent                                         => FIXED
 *          (the function ignored the payload's userId and rebuilt the
 *          caller's own account instead).
 *        - anything else (both touched, neither touched, non-2xx HTTP)
 *          => AMBIGUOUS, printed with the raw before/after state so a human
 *          can look at exactly what happened.
 *   7. Deletes both disposable accounts via self-delete (their own idToken,
 *      no admin credentials needed), unless KEEP_ACCOUNTS=1.
 *
 * card_index reads use the *caller's own* idToken: firestore.rules grants
 * `allow read: if request.auth != null` on card_index (any authenticated
 * user, not just the owner) — see firestore.rules ~line 116. So the
 * attacker's own token is enough to read the victim's chunk_0 too; no need
 * to sign back in as the victim for that. Reading each account's `cards`
 * collection for the emptiness guard DOES require request.auth.uid ==
 * userId (firestore.rules ~line 48), so that check runs with each account's
 * own token.
 *
 * Usage:
 *   FIREBASE_PROJECT=cranial-trading-dev node scripts/build-card-index-authz-probe.mjs
 *
 * VITE_FIREBASE_API_KEY is read from .env.local / .env.development like the
 * other scripts in this folder — no need to pass it by hand. Pass it via env
 * only to override.
 *
 * Never print passwords. Account emails are auto-generated disposable
 * addresses (not real accounts) but are still not printed — only uids,
 * which carry no secret.
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

// Known real accounts this probe must never touch, even by accident (e.g. an
// env var override colliding with them). Checked against generated emails
// below — belt-and-suspenders since the emails are random, not user input.
const REAL_ACCOUNT_DENYLIST = [process.env.TEST_USER_A_EMAIL, 'srparca@gmail.com'].filter(Boolean);

if (!apiKey) {
  console.error('Falta VITE_FIREBASE_API_KEY (.env.local o .env.development, o export a mano).');
  process.exit(1);
}

const identityUrl = (m) => `https://identitytoolkit.googleapis.com/v1/accounts:${m}?key=${apiKey}`;
const firestoreDocUrl = (uid, docPath) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/${docPath}`;

function randomSuffix() {
  return crypto.randomBytes(6).toString('hex');
}

function assertDisposable(email) {
  if (REAL_ACCOUNT_DENYLIST.includes(email)) {
    throw new Error(`Email generado coincide con una cuenta real conocida (${email}). Abortado.`);
  }
}

async function signUp(role) {
  const email = `probe-${role}-${Date.now()}-${randomSuffix()}@example.com`;
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
  const { idToken, localId, refreshToken } = await res.json();
  return { role, email, password, uid: localId, idToken, refreshToken };
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

/** Guard: aborta si la cuenta ya tiene documentos de carta (no deberia pasar). */
async function assertEmpty(account) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${account.uid}/cards?pageSize=1`,
    { headers: { Authorization: `Bearer ${account.idToken}` } }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`No se pudo verificar que ${account.role} (uid ${account.uid}) este vacia: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }
  const body = await res.json();
  const hasCards = Array.isArray(body.documents) && body.documents.length > 0;
  if (hasCards) {
    throw new Error(
      `GUARD: la cuenta ${account.role} (uid ${account.uid}) tiene cartas — no es descartable/vacia. Abortado sin invocar buildCardIndex.`
    );
  }
}

/** Devuelve { exists, updatedAt } leyendo card_index/chunk_0 con el token dado. */
async function readChunk0(uid, readerToken) {
  const res = await fetch(firestoreDocUrl(uid, 'card_index/chunk_0'), {
    headers: { Authorization: `Bearer ${readerToken}` },
  });
  if (res.status === 404) return { exists: false };
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`No se pudo leer card_index/chunk_0 de ${uid}: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }
  const doc = await res.json();
  return { exists: true, updatedAt: doc.fields?.updatedAt?.timestampValue ?? null };
}

async function main() {
  console.log(`Proyecto: ${projectId}`);
  console.log('Provisionando cuenta atacante y cuenta victima (descartables, vacias)...');

  const attacker = await signUp('attacker');
  const victim = await signUp('victim');

  if (attacker.uid === victim.uid) {
    throw new Error('GUARD: atacante y victima resolvieron al mismo uid. Abortado.');
  }
  console.log(`  Atacante uid: ${attacker.uid}`);
  console.log(`  Victima  uid: ${victim.uid}`);

  let cleaned = { attacker: false, victim: false };
  try {
    console.log('Verificando que ambas cuentas esten vacias (guard, no solo comentario)...');
    await assertEmpty(attacker);
    await assertEmpty(victim);
    console.log('  OK: 0 cartas en ambas.');

    console.log('Leyendo card_index/chunk_0 de ambas cuentas ANTES de la llamada...');
    const before = {
      attacker: await readChunk0(attacker.uid, attacker.idToken),
      victim: await readChunk0(victim.uid, attacker.idToken),
    };
    console.log(`  Atacante chunk_0: ${before.attacker.exists ? 'EXISTE' : 'ausente'}`);
    console.log(`  Victima  chunk_0: ${before.victim.exists ? 'EXISTE' : 'ausente'}`);

    console.log(
      `Invocando buildCardIndex desplegada con { userId: "${victim.uid}" }, logueado como atacante (${attacker.uid})...`
    );
    const fnRes = await fetch(`https://${region}-${projectId}.cloudfunctions.net/buildCardIndex`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${attacker.idToken}`,
      },
      body: JSON.stringify({ data: { userId: victim.uid } }),
    });
    const fnBody = await fnRes.text();
    console.log(`HTTP ${fnRes.status}`);
    console.log(fnBody);

    console.log('Leyendo card_index/chunk_0 de ambas cuentas DESPUES de la llamada...');
    const after = {
      attacker: await readChunk0(attacker.uid, attacker.idToken),
      victim: await readChunk0(victim.uid, attacker.idToken),
    };
    console.log(`  Atacante chunk_0: ${after.attacker.exists ? `EXISTE (updatedAt=${after.attacker.updatedAt})` : 'ausente'}`);
    console.log(`  Victima  chunk_0: ${after.victim.exists ? `EXISTE (updatedAt=${after.victim.updatedAt})` : 'ausente'}`);

    const victimTouched = !before.victim.exists && after.victim.exists;
    const attackerTouched = !before.attacker.exists && after.attacker.exists;

    console.log('');
    if (!fnRes.ok) {
      console.log(`VEREDICTO: AMBIGUO — la funcion respondio HTTP ${fnRes.status} (no 2xx).`);
      console.log('Ningun chunk_0 deberia haberse tocado; revisar el before/after de arriba para confirmar.');
      process.exitCode = 1;
    } else if (victimTouched && !attackerTouched) {
      console.log('VEREDICTO: VULNERABLE.');
      console.log('El chunk_0 de la VICTIMA aparecio tras la llamada — la funcion desplegada');
      console.log('confia en el userId del payload en vez de usar el uid del que llama.');
      process.exitCode = 0;
    } else if (attackerTouched && !victimTouched) {
      console.log('VEREDICTO: ARREGLADO.');
      console.log('El chunk_0 del ATACANTE aparecio (su propia cuenta se reconstruyo) y el de la');
      console.log('victima siguio ausente — la funcion desplegada ignora el userId del payload.');
      process.exitCode = 0;
    } else {
      console.log('VEREDICTO: AMBIGUO.');
      console.log(`  victimTouched=${victimTouched}  attackerTouched=${attackerTouched}`);
      console.log('Revisar el before/after de arriba a mano.');
      process.exitCode = 1;
    }
  } finally {
    if (keepAccounts) {
      console.log('');
      console.log(`KEEP_ACCOUNTS=1: cuentas NO borradas. uids: atacante=${attacker.uid} victima=${victim.uid}`);
    } else {
      console.log('');
      console.log('Borrando cuentas descartables...');
      cleaned.attacker = await deleteAccount(attacker);
      cleaned.victim = await deleteAccount(victim);
      if (cleaned.attacker && cleaned.victim) {
        console.log('  OK: ambas cuentas borradas.');
      } else {
        console.log(
          `  Estado: atacante ${cleaned.attacker ? 'borrada' : 'NO borrada (ver aviso arriba)'}, ` +
            `victima ${cleaned.victim ? 'borrada' : 'NO borrada (ver aviso arriba)'}.`
        );
        console.log(`  uids para limpieza manual si hace falta: atacante=${attacker.uid} victima=${victim.uid}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
