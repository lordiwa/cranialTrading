// TASK-303 R-1 — el test de resend afirma incondicionalmente sobre un boton que
// SettingsView.vue:444 renderiza solo con v-if="!emailVerified". Si la cuenta de
// CI esta verificada, el boton no existe, el click hace timeout y el job e2e
// queda ROJO — justo el tapon que este ticket queria evitar.
// Nadie lo habia medido. Solo lectura.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
const app = initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading-dev' }, 't303');
const u = await getAuth(app).getUser('90PkdmyFKrVm1RLDXjInJdlYXy73');
console.log('uid           :', u.uid);
console.log('email         :', u.email);
console.log('emailVerified :', u.emailVerified);
console.log('');
console.log(u.emailVerified
  ? '>>> VERIFICADA: el boton SEND EMAIL NO se renderiza. El test de resend haria TIMEOUT y pondria el CI en rojo.'
  : '>>> SIN VERIFICAR: el boton SE renderiza. El test de resend puede correr.');
