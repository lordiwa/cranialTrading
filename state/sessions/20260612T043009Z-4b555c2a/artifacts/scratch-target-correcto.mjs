// Numero objetivo del AC2 con la semantica CORRECTA de color.
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' });
const db = getFirestore();
const UID='Rt5DOfZXBtPZkEpK4N5pW6a5FXs1';
const mine=(await db.collection('public_cards').where('userId','==',UID).get()).docs.map(d=>d.data());
const ids=[...new Set(mine.map(c=>c.scryfallId).filter(Boolean))];
const cache=new Map();
for(let i=0;i<ids.length;i+=300){const docs=await db.getAll(...ids.slice(i,i+300).map(id=>db.collection('scryfall_cache').doc(id)));for(const x of docs) if(x.exists) cache.set(x.id,x.data().card||x.data());}

// SEMANTICA CORRECTA: colors presente (aunque vacio) manda. Ausente -> union de card_faces. Nunca color_identity para "color de la carta".
function coloresCorrectos(c){
  if(!c) return null;                                   // sin cache: desconocido, no cero
  if(Array.isArray(c.colors)) return c.colors;          // [] = incolora, es un dato, no un hueco
  if(Array.isArray(c.card_faces)){
    const u=[]; for(const f of c.card_faces) for(const x of (f.colors||[])) if(!u.includes(x)) u.push(x);
    return u;
  }
  if(Array.isArray(c.color_identity)) return c.color_identity; // ultimo recurso, marcado
  return null;
}
console.log('%-6s %8s %8s %8s','color','RAIZ','CORRECTO','MODULO');
for(const l of ['B','W','U','R','G']){
  const raiz=mine.filter(c=>(cache.get(c.scryfallId)?.colors??[]).includes(l)).length;
  const corr=mine.filter(c=>(coloresCorrectos(cache.get(c.scryfallId))||[]).includes(l)).length;
  const modulo=mine.filter(c=>{const s=cache.get(c.scryfallId); if(!s) return false;
    if(Array.isArray(s.colors)&&s.colors.length>0) return s.colors.includes(l);
    if(Array.isArray(s.color_identity)&&s.color_identity.length>0) return s.color_identity.includes(l);
    if(Array.isArray(s.card_faces)){const u=[];for(const f of s.card_faces)for(const x of (f.colors||[]))u.push(x);return u.includes(l);} return false;}).length;
  console.log('%-6s %8d %8d %8d',l,raiz,corr,modulo);
}
const desconocidas=mine.filter(c=>coloresCorrectos(cache.get(c.scryfallId))===null).length;
const incoloras=mine.filter(c=>{const r=coloresCorrectos(cache.get(c.scryfallId));return r&&r.length===0;}).length;
console.log('sin dato de color (no cacheadas) = %d | incoloras legitimas = %d', desconocidas, incoloras);
console.log("'blight' por cardNameLower substring = %d", mine.filter(c=>(c.cardNameLower||'').includes('blight')).length);
