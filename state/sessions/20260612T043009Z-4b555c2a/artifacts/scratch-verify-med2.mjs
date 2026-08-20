// MEDIUM-2: la secuencia NATURAL de la 2b produce una "reparacion incremental" que VACIA un chunk con cartas vivas.
import { createRequire } from 'module';
const require = createRequire('C:/Users/srpar/WebstormProjects/cranialTrading/x.js');
const { buildPublicIndex:build, diagnosePublicIndex:diag, planPublicIndexReconciliation:plan } =
  require('C:/Users/srpar/WebstormProjects/cranialTrading/functions/lib/publicCardIndex.js');
const uuid=(n)=>`${String(n).padStart(8,'0')}-1111-2222-3333-444444444444`;
const card=(n)=>({scryfallId:uuid(n),cardId:`c${n}`,cardName:`Carta ${n}`,cardNameLower:`carta ${n}`,
  quantity:1,price:1,status:'sale',foil:false,condition:'NM',setCode:'xxx',edition:'Set',userId:'u',updatedAt:null});
const docs=[...Array(7)].map((_,i)=>card(i));
const cache=new Map();

// el indice se construyo con chunkTargetSize 2 -> 4 chunks
const res=build(docs,cache,{chunkTargetSize:2});
console.log('indice construido: %d chunks, meta=%j', Object.keys(res.chunks).length, res.meta);

// falta una carta (se agrego despues)
const docs8=docs.concat([card(99)]);
// SECUENCIA NATURAL DE LA 2B: diagnostico sin options (cae a meta.chunkTargetSize=2)
const d=diag(res.chunks,res.meta,docs8,cache);
// pero el build fresco sin options usa el DEFAULT 400 -> 1 chunk
const fresh=build(docs8,cache);
console.log('diagnostico -> mismatch=%s missing=%d | freshBuild.meta=%j', d.totalChunksMismatch,(d.missing||[]).length,fresh.meta);
const p=plan(d,fresh);
console.log('plan -> rebuild=%s  chunks a escribir=%j', p.rebuildRequired, Object.keys(p.chunksToWrite||{}));
for(const [k,v] of Object.entries(p.chunksToWrite||{})) console.log('   chunk %s -> %d entradas %s', k, v.entries.length, v.entries.length===0?'<-- VACIO':'');
console.log('plan.meta=%j  (docs de chunk presentes: %d)', p.meta, Object.keys(res.chunks).length);

// que pasa si la 2b aplica esto
const despues={...res.chunks}; for(const [k,v] of Object.entries(p.chunksToWrite||{})) despues[k]=v;
const perdidas=Object.values(res.chunks).reduce((a,c)=>a+c.entries.length,0)-Object.values(despues).reduce((a,c)=>a+c.entries.length,0);
console.log('CARTAS QUE DESAPARECEN DEL INDICE al aplicar la reparacion incremental: %d', perdidas);
