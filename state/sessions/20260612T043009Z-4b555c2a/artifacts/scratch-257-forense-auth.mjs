// SOLO LECTURA. Quien es la cuenta SBeZwweb... en Firebase Auth y que cuentas
// se crearon en la ultima hora.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT });
const auth = getAuth();
const target = 'SBeZwweb8jQ87DMOYaOYe9J0yxX2';
try {
  const u = await auth.getUser(target);
  console.log('=== CUENTA SOSPECHOSA ===');
  console.log(JSON.stringify({ uid: u.uid, email: u.email, displayName: u.displayName,
    providers: u.providerData.map(p => p.providerId), created: u.metadata.creationTime,
    lastSignIn: u.metadata.lastSignInTime, emailVerified: u.emailVerified }, null, 2));
} catch (e) { console.log('no existe en Auth:', e.code); }

console.log('=== CUENTAS DE AUTH CREADAS EN LA ULTIMA HORA ===');
const corte = Date.now() - 3600_000;
let total = 0, recientes = [];
let page = await auth.listUsers(1000);
while (true) {
  for (const u of page.users) {
    total++;
    if (new Date(u.metadata.creationTime).getTime() >= corte) {
      recientes.push({ uid: u.uid, email: u.email, providers: u.providerData.map(p => p.providerId), created: u.metadata.creationTime });
    }
  }
  if (!page.pageToken) break;
  page = await auth.listUsers(1000, page.pageToken);
}
recientes.sort((a,b) => new Date(a.created) - new Date(b.created));
console.log(JSON.stringify({ totalCuentasAuth: total, creadasUltimaHora: recientes.length }, null, 2));
for (const r of recientes) console.log(' ', r.created, '|', r.uid, '|', r.email, '|', r.providers.join(','));
process.exit(0);
