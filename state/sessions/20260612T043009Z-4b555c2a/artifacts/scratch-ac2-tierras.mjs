// SOLO LECTURA. Cuanto cambia el conteo por color si las TIERRAS cuentan por
// lo que PRODUCEN (produced_mana), que es lo que hace la UI hoy.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' });
const db = getFirestore();
const UID = 'Rt5DOfZXBtPZkEpK4N5pW6a5FXs1';
const pub = await db.collection('public_cards').where('userId','==',UID).get();
const ids = [...new Set(pub.docs.map(d=>d.get('scryfallId')).filter(Boolean))];
const cache = new Map();
for (let i=0;i<ids.length;i+=30){
  const lote=ids.slice(i,i+30);
  const s=await db.collection('scryfall_cache').where('__name__','in',lote.map(x=>db.doc(`scryfall_cache/${x}`))).get();
  for(const d of s.docs) cache.set(d.id,d.data());
}
const tl=(c)=>{ if(c?.type_line) return c.type_line;
  const f=Array.isArray(c?.card_faces)?c.card_faces:[]; return f.map(x=>x.type_line||'').join(' // '); };
const colorDe=(c)=>{ if(!c) return null;
  if(Array.isArray(c.colors)) return c.colors;
  const f=Array.isArray(c.card_faces)?c.card_faces:[];
  const u=[...new Set(f.flatMap(x=>Array.isArray(x.colors)?x.colors:[]))];
  if(u.length||f.some(x=>Array.isArray(x.colors))) return u;
  if(Array.isArray(c.color_identity)) return c.color_identity; return null; };
const soloCo={}, conTierras={}; let tierras=0, tierrasQueProducen=0;
for(const d of pub.docs){
  const c=cache.get(d.get('scryfallId')); if(!c) continue;
  const esTierra=/\bLand\b/i.test(tl(c));
  const co=colorDe(c);
  if(co) for(const L of ['W','U','B','R','G']) if(co.includes(L)) soloCo[L]=(soloCo[L]||0)+1;
  let efect=co;
  if(esTierra){ tierras++;
    const pm=Array.isArray(c.produced_mana)?c.produced_mana.filter(x=>'WUBRG'.includes(x)):[];
    if(pm.length){ tierrasQueProducen++; efect=pm; } }
  if(efect) for(const L of ['W','U','B','R','G']) if(efect.includes(L)) conTierras[L]=(conTierras[L]||0)+1;
}
const f=(o)=>({blancas:o.W||0,azules:o.U||0,negras:o.B||0,rojas:o.R||0,verdes:o.G||0});
console.log(JSON.stringify({
  documentos:pub.size, tierras_documentos:tierras, tierras_que_producen_color:tierrasQueProducen,
  SOLO_colors:f(soloCo), CON_tierras_por_produced_mana:f(conTierras),
  diferencia:Object.fromEntries(['W','U','B','R','G'].map(L=>[L,(conTierras[L]||0)-(soloCo[L]||0)])),
},null,1));
process.exit(0);
