import { createRequire } from 'module';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const require = createRequire('C:/Users/srpar/WebstormProjects/cranialTrading/x.js');
const { buildPublicIndex:build, diagnosePublicIndex:diag, planPublicIndexReconciliation:plan } =
  require('C:/Users/srpar/WebstormProjects/cranialTrading/functions/lib/publicCardIndex.js');
initializeApp({ credential: applicationDefault(), projectId: 'cranial-trading' });
const db = getFirestore();
const UID='Rt5DOfZXBtPZkEpK4N5pW6a5FXs1';
const docs=(await db.collection('public_cards').where('userId','==',UID).get()).docs.map(d=>d.data());
const ids=[...new Set(docs.map(c=>c.scryfallId).filter(Boolean))];
const cache=new Map();
for(let i=0;i<ids.length;i+=300){const g=await db.getAll(...ids.slice(i,i+300).map(id=>db.collection('scryfall_cache').doc(id)));for(const x of g) if(x.exists) cache.set(x.id,x.data().card||x.data());}
const res=build(docs,cache), meta=res.meta;

console.log('=== HIGH-1: entrada DUPLICADA en el indice ===');
const dup=JSON.parse(JSON.stringify(res.chunks));
dup['0'].entries.push({...dup['1'].entries[0], q: 999});
const d=diag(dup,meta,docs,cache);
const tot=Object.values(dup).reduce((a,c)=>a+c.entries.length,0);
console.log('entradas en el indice=%d vs cartas reales=%d (SOBRA %d)', tot, docs.length, tot-docs.length);
console.log('diagnostico -> isDivergent=%s missing=%d orphaned=%d misplaced=%d',
  d.isDivergent,(d.missing||[]).length,(d.orphaned||[]).length,(d.misplaced||[]).length);
const p=plan(d,res);
console.log('plan -> rebuild=%s escribe=%d | %s', p.rebuildRequired, Object.keys(p.chunksToWrite||{}).length, (p.reason||'').slice(0,55));

console.log('=== HIGH-2: el vendedor ACHICA la cuenta ===');
const pocas=docs.slice(0,8), fresh=build(pocas,cache);
console.log('meta vieja=%d chunks | meta nueva=%d | docs de chunk que siguen existiendo=%d',
  meta.totalChunks, fresh.meta.totalChunks, Object.keys(res.chunks).length);
const d2=diag(res.chunks, meta, pocas, cache), p2=plan(d2,fresh);
console.log('pasada 1 -> rebuild=%s escribe=%d | borrado: %s',
  p2.rebuildRequired, Object.keys(p2.chunksToWrite||{}).length, p2.chunksToDelete?JSON.stringify(p2.chunksToDelete):'NO EXISTE EL CAMPO');
// pasada 2 HONRANDO el borrado
const ok={...res.chunks}; for(const [k,v] of Object.entries(p2.chunksToWrite||{})) ok[k]=v;
for(const id of (p2.chunksToDelete||[])) delete ok[String(id)];
const d3=diag(ok, p2.meta||fresh.meta, pocas, cache);
console.log('pasada 2 CON borrado    -> isDivergent=%s orphaned=%d mismatch=%s', d3.isDivergent,(d3.orphaned||[]).length,d3.totalChunksMismatch);
// pasada 2 IGNORANDO el borrado (lo que haria un caller distraido en la 2b)
const mal={...res.chunks}; for(const [k,v] of Object.entries(p2.chunksToWrite||{})) mal[k]=v;
const d4=diag(mal, p2.meta||fresh.meta, pocas, cache);
console.log('pasada 2 SIN borrado    -> isDivergent=%s orphaned=%d mismatch=%s', d4.isDivergent,(d4.orphaned||[]).length,d4.totalChunksMismatch);

console.log('=== HIGH-1: converge el plan? ===');
const arreglado={...dup}; for(const [k,v] of Object.entries(p.chunksToWrite||{})) arreglado[k]=v;
const tot2=Object.values(arreglado).reduce((a,c)=>a+c.entries.length,0);
const d5=diag(arreglado,meta,docs,cache);
console.log('entradas tras aplicar el plan=%d (real %d) | isDivergent=%s duplicated=%d',
  tot2, docs.length, d5.isDivergent, (d5.duplicated||[]).length);
