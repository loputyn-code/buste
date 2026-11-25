const fs=require('fs');
const src=fs.readFileSync(__dirname+'/../app.js','utf8');
const logic=src.split('/*LOGIC-START*/')[1].split('/*LOGIC-END*/')[0];
const assert=require('assert');
const api=new Function(logic+';return {compute,genRecurring,parseAmount,quotaFor,dueDates,nextDue,addMonthsClamp,docsFromState,stateFromDocs,serializeDocs,cleanState,seedDemo,emptyState,centsToInput,uid}')();
const {compute,genRecurring,parseAmount,dueDates,nextDue,addMonthsClamp,docsFromState,stateFromDocs,cleanState,seedDemo,emptyState,centsToInput}=api;

// importi
assert.strictEqual(parseAmount('12,50'),1250);
assert.strictEqual(parseAmount('1.234,56'),123456);
assert.strictEqual(parseAmount('12.5'),1250);
assert.strictEqual(parseAmount('1.234'),123400);
assert.strictEqual(parseAmount('€ 50'),5000);
assert.ok(Number.isNaN(parseAmount('abc')));
assert.strictEqual(centsToInput(5000),'50');assert.strictEqual(centsToInput(1250),'12,50');

// riporto: Spesa 50/mese, speso 20 a ottobre, 70 a novembre
const S=emptyState();
S.env.push({id:'sp',name:'Spesa',c:3,q:[{m:'2026-10',a:5000}]},{id:'vet',name:'Vet',c:1,q:[{m:'2026-10',a:10000}]});
S.tx.push({id:'a',d:'2026-10-10',e:'sp',a:-2000},{id:'b',d:'2026-11-03',e:'sp',a:-7000},{id:'s',d:'2026-10-01',e:'pool',a:150000});
let C=compute(S,'2026-11');
assert.strictEqual(C.acct.sp['2026-10'].avail,3000);          // 50-20
assert.strictEqual(C.acct.sp['2026-11'].carry,3000);
assert.strictEqual(C.acct.sp['2026-11'].avail,3000+5000-7000); // 10,00
assert.strictEqual(C.acct.vet['2026-11'].avail,20000);          // 100 non speso si accumula
// pool: 1500 - 150 a ottobre, poi -150 a novembre
assert.strictEqual(C.acct.pool['2026-10'].avail,150000-15000);
assert.strictEqual(C.acct.pool['2026-11'].avail,150000-30000);
// totale conservato = entrate - spese
const tot=m=>Object.values(C.acct).reduce((n,a)=>n+a[m].avail,0);
assert.strictEqual(tot('2026-11'),150000-2000-7000);

// spostamento
S.tr.push({id:'t',d:'2026-11-05',f:'vet',t:'sp',a:4000});
C=compute(S,'2026-11');
assert.strictEqual(C.acct.sp['2026-11'].avail,1000+4000);
assert.strictEqual(C.acct.vet['2026-11'].avail,16000);
assert.strictEqual(tot('2026-11'),150000-9000);

// sforamento: il saldo negativo si porta al mese dopo
S.tx.push({id:'c',d:'2026-11-20',e:'sp',a:-20000});
C=compute(S,'2026-12');
assert.strictEqual(C.acct.sp['2026-11'].avail,5000-20000);
assert.strictEqual(C.acct.sp['2026-12'].avail,5000-20000+5000);

// quota che cambia da un mese in poi
S.env[0].q.push({m:'2026-12',a:8000});
C=compute(S,'2027-01');
assert.strictEqual(C.acct.sp['2026-12'].quota,8000);
assert.strictEqual(C.acct.sp['2026-10'].quota,5000);

// ricorrenze
assert.strictEqual(addMonthsClamp('2026-01-31',1),'2026-02-28');
assert.strictEqual(addMonthsClamp('2026-01-31',2),'2026-03-31');
const R={id:'r1',n:'Netflix',k:'out',e:'sp',a:1299,f:'m1',s:'2026-09-05',g:null,on:true};
assert.deepStrictEqual(dueDates(R,'2026-11-19'),['2026-09-05','2026-10-05','2026-11-05']);
assert.strictEqual(nextDue(R,'2026-11-19'),'2026-12-05');
const S2=emptyState();S2.rules.push(R);S2.env.push({id:'sp',name:'x',c:1,q:[]});
assert.ok(genRecurring(S2,'2026-11-19'));assert.strictEqual(S2.tx.length,3);
assert.ok(!genRecurring(S2,'2026-11-19'));assert.strictEqual(S2.tx.length,3);       // idempotente
S2.tx.pop();                                                                          // salto una scadenza cancellandola
assert.ok(!genRecurring(S2,'2026-11-19'));assert.strictEqual(S2.tx.length,2);         // non ricompare
genRecurring(S2,'2026-12-06');assert.strictEqual(S2.tx.length,3);                    // la successiva sì
const W={id:'w',n:'x',k:'in',e:'pool',a:100,f:'w2',s:'2026-11-01',g:null,on:true};
assert.deepStrictEqual(dueDates(W,'2026-11-30'),['2026-11-01','2026-11-15','2026-11-29']);

// salvataggio a documenti e ritorno
const D=docsFromState(S);const back=stateFromDocs(JSON.parse(JSON.stringify(D)));
assert.deepStrictEqual(JSON.parse(JSON.stringify(docsFromState(back))),JSON.parse(JSON.stringify(D)));
assert.ok(D['tx-2026-10']&&D['tx-2026-11']);

// import ripulito + demo
const cs=cleanState(JSON.parse(JSON.stringify(S)));assert.strictEqual(cs.env.length,2);assert.strictEqual(cs.tx.length,S.tx.length);
const demo=seedDemo();const Cd=compute(demo,new Date().toISOString().slice(0,7));
console.log('demo envelopes',demo.env.length,'tx',demo.tx.length,'pool',Cd.acct.pool[new Date().toISOString().slice(0,7)].avail);
console.log('OK tutti i test');
