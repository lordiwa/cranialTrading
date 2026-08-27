// TASK-289 AC1 — CONTROL NEGATIVO contra la Cloud Function REALMENTE DESPLEGADA
// en dev, ANTES de desplegar el arreglo. Mide que una carta de tipo multiple no
// aparece bajo su categoria secundaria. Usa cartas YA publicadas: no siembra nada.
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });
dotenv.config({ path: '.env.local' });

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
});
const cred = await signInWithEmailAndPassword(getAuth(app), process.env.TEST_USER_A_EMAIL, process.env.TEST_USER_A_PASSWORD);
console.log('logueado como', cred.user.email, '| proyecto', process.env.VITE_FIREBASE_PROJECT_ID);

const SELLER = '90PkdmyFKrVm1RLDXjInJdlYXy73';
const q = httpsCallable(getFunctions(app), 'queryPublicCardIndex');

// Core Prowler = "Artifact Creature". Primaria por precedencia = creature.
// Con la regla EXCLUSIVA vieja, pedir type:['artifact'] NO lo devuelve.
const buscar = async (tipos) => {
  const res = await q({ userId: SELLER, filters: { type: tipos, search: 'Core Prowler' }, page: 0, pageSize: 200 });
  const d = res.data || {};
  const cards = d.cards || [];
  // La asercion va por `total`, no por el nombre dentro de `cards`: la forma de
  // los items de `cards` no es `name` y una asercion por nombre daba SIEMPRE
  // false, o sea que no podia fallar por la razon correcta. total=1 vs total=0
  // sobre la MISMA carta es lo que prueba la pertenencia.
  console.log('  type=' + JSON.stringify(tipos) + ' -> total=' + d.total + ' (items en pagina: ' + cards.length + ')');
  return { total: d.total, presente: d.total > 0, facets: d.facets && d.facets.type };
};

console.log('--- AC1: control negativo contra la function DESPLEGADA (codigo viejo) ---');
const creature = await buscar(['creature']);
const artifact = await buscar(['artifact']);
console.log('facets.type con type=[artifact]:', JSON.stringify(artifact.facets));
console.log('');
console.log('AC1 (pre-deploy, regla exclusiva): creature=1 y artifact=0 -> DEFECTO REPRODUCIDO');
console.log('AC7 (post-deploy, pertenencia multiple): creature=1 y artifact=1 -> ARREGLADO');
const veredicto = creature.presente && !artifact.presente ? 'PRE-DEPLOY: defecto reproducido'
  : creature.presente && artifact.presente ? 'POST-DEPLOY: arreglado (la carta sale bajo AMBOS chips)'
  : 'INESPERADO — creature=' + creature.total + ' artifact=' + artifact.total;
console.log('RESULTADO:', veredicto);
process.exit(0);
