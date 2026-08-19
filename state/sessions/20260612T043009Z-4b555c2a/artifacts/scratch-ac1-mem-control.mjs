// Control de la medicion de memoria: strings UNICOS, para anular el interning de V8.
const base = [];
for (let i = 0; i < 8388; i++) base.push({
  i: 'id', n: 'Nombre De Carta Larga', nl: 'nombre de carta larga', q: 1, p: 1.5,
  st: 'sale', f: false, cd: 'NM', e: 'set', t: 'Creature — Human Wizard', cm: 3,
  co: ['B'], r: 'r', k: ['Flying', 'Deathtouch'],
});
for (const modo of ['repetido', 'unico']) {
  for (const target of [100000, 250000]) {
    const big = [];
    for (let j = 0; j < target; j++) {
      const e = base[j % base.length];
      big.push(modo === 'unico'
        ? { ...e, i: `id-${j}-${Math.floor(j / 7)}`, n: `${e.n} ${j}`, nl: `${e.nl} ${j}` }
        : e);
    }
    const chunks = [];
    for (let i = 0; i < big.length; i += 400) chunks.push(JSON.stringify(big.slice(i, i + 400)));
    const bytes = chunks.reduce((a, s) => a + Buffer.byteLength(s, 'utf8'), 0);
    global.gc(); global.gc();
    const m0 = process.memoryUsage().heapUsed, t0 = Date.now();
    const exp = chunks.flatMap((s) => JSON.parse(s));
    const hits = exp.filter((e) => e.co.includes('B') && e.nl.includes('7')).length;
    const t1 = Date.now(), m1 = process.memoryUsage().heapUsed;
    console.log('%s n=%d | %s MB en Firestore | %d ms | heap +%s MB | hits=%d',
      modo.padEnd(9), target, (bytes / 1048576).toFixed(1), t1 - t0, ((m1 - m0) / 1048576).toFixed(0), hits);
  }
}
