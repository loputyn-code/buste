/*LOGIC-START*/
const pad=n=>String(n).padStart(2,'0');
const fmtD=t=>t.getFullYear()+'-'+pad(t.getMonth()+1)+'-'+pad(t.getDate());
const todayStr=()=>fmtD(new Date());
const ym=d=>d.slice(0,7);
const uid=()=>Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4);
const FREQ={w1:{days:7,label:'Ogni settimana'},w2:{days:14,label:'Ogni 2 settimane'},m1:{months:1,label:'Ogni mese'},m2:{months:2,label:'Ogni 2 mesi'},m3:{months:3,label:'Ogni 3 mesi'},m6:{months:6,label:'Ogni 6 mesi'},y1:{months:12,label:'Ogni anno'}};

function addM(k,n){const [y,m]=k.split('-').map(Number);const t=y*12+(m-1)+n;return Math.floor(t/12)+'-'+pad(t%12+1)}
function monthsBetween(a,b){const out=[];let k=a;while(k<=b&&out.length<1200){out.push(k);k=addM(k,1)}return out}
function dateAdd(d,days){const t=new Date(d+'T12:00:00');t.setDate(t.getDate()+days);return fmtD(t)}
function addMonthsClamp(d,n){const [y,m,day]=d.split('-').map(Number);const t=y*12+(m-1)+n;const ny=Math.floor(t/12),nm=t%12;const dim=new Date(ny,nm+1,0).getDate();return ny+'-'+pad(nm+1)+'-'+pad(Math.min(day,dim))}
function occ(r,n){const f=FREQ[r.f]||FREQ.m1;return f.days?dateAdd(r.s,f.days*n):addMonthsClamp(r.s,f.months*n)}
function dueDates(r,today){const out=[];for(let n=0;n<6000;n++){const d=occ(r,n);if(d>today)break;if(!r.g||d>r.g)out.push(d)}return out}
function nextDue(r,today){for(let n=0;n<6000;n++){const d=occ(r,n);if(d>today)return d}return null}

function parseAmount(s){
  s=String(s==null?'':s).replace(/[€\s ]/g,'');
  if(!s)return NaN;
  if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
  else{const dots=(s.match(/\./g)||[]).length;if(dots>1||(dots===1&&/\.\d{3}$/.test(s)))s=s.replace(/\./g,'')}
  if(!/^-?\d+(\.\d+)?$/.test(s))return NaN;
  return Math.round(parseFloat(s)*100);
}
const centsToInput=c=>c%100===0?String(c/100):(c/100).toFixed(2).replace('.',',');

function quotaFor(env,m){let a=0;for(const q of env.q){if(q.m<=m)a=q.a}return a}

function compute(S,upto){
  let first=upto;const agg={};
  const slot=(a,m)=>((agg[a]=agg[a]||{})[m]=(agg[a]||{})[m]||{inc:0,spent:0,tin:0,tout:0});
  for(const t of S.tx){const m=ym(t.d);if(m<first)first=m;const s=slot(t.e,m);if(t.a>=0)s.inc+=t.a;else s.spent+=-t.a}
  for(const t of S.tr){const m=ym(t.d);if(m<first)first=m;slot(t.f,m).tout+=t.a;slot(t.t,m).tin+=t.a}
  for(const e of S.env)for(const q of e.q)if(q.m<first)first=q.m;
  const months=monthsBetween(first,upto);
  const out={months,acct:{}};
  for(const a of ['pool',...S.env.map(e=>e.id)]){
    out.acct[a]={};let carry=0;
    const env=a==='pool'?null:S.env.find(e=>e.id===a);
    for(const m of months){
      const s=(agg[a]&&agg[a][m])||{inc:0,spent:0,tin:0,tout:0};
      const quota=env?quotaFor(env,m):-S.env.reduce((n,e)=>n+quotaFor(e,m),0);
      const avail=carry+quota+s.inc-s.spent+s.tin-s.tout;
      out.acct[a][m]={carry,quota,inc:s.inc,spent:s.spent,tin:s.tin,tout:s.tout,avail};
      carry=avail;
    }
  }
  return out;
}

function genRecurring(S,today){
  let changed=false;const have=new Set(S.tx.map(t=>t.id));
  for(const r of S.rules){
    if(r.on===false)continue;
    const ds=dueDates(r,today);
    for(const d of ds){
      const id='r:'+r.id+':'+d;if(have.has(id))continue;have.add(id);
      S.tx.push({id,d,e:r.e,a:r.k==='in'?r.a:-r.a,n:r.n,r:r.id});changed=true;
    }
    if(ds.length&&r.g!==ds[ds.length-1]){r.g=ds[ds.length-1];changed=true}
  }
  return changed;
}

function emptyState(){return{v:1,env:[],rules:[],tx:[],tr:[],demo:false}}
function docsFromState(S){
  const docs={cfg:{v:1,env:S.env,rules:S.rules,demo:!!S.demo}};const mm={};
  const g=k=>mm[k]=mm[k]||{tx:[],tr:[]};
  for(const t of S.tx)g(ym(t.d)).tx.push(t);
  for(const t of S.tr)g(ym(t.d)).tr.push(t);
  for(const k in mm)docs['tx-'+k]=mm[k];
  return docs;
}
function serializeDocs(docs){const o={};for(const k in docs)o[k]=JSON.stringify(docs[k]);return o}
function stateFromDocs(docs){
  const c=docs.cfg||{};const S={v:1,env:c.env||[],rules:c.rules||[],tx:[],tr:[],demo:!!c.demo};
  for(const id of Object.keys(docs).sort()){if(id.startsWith('tx-')){const d=docs[id]||{};S.tx.push(...(d.tx||[]));S.tr.push(...(d.tr||[]))}}
  return S;
}
function cleanState(o){
  if(!o||typeof o!=='object')return null;
  const arr=x=>Array.isArray(x)?x:[];const S=emptyState();const D=/^\d{4}-\d{2}-\d{2}$/,M=/^\d{4}-\d{2}$/;
  for(const e of arr(o.env)){if(e&&typeof e.id==='string'&&typeof e.name==='string'){
    const n={id:e.id,name:e.name.slice(0,60),c:(typeof e.c==='string'&&/^#[0-9a-fA-F]{6}$/.test(e.c))?e.c:Math.min(12,Math.max(1,(e.c|0)||1)),q:arr(e.q).filter(q=>q&&M.test(q.m)&&Number.isFinite(q.a)).map(q=>({m:q.m,a:Math.round(q.a)}))};
    if(e.arch)n.arch=String(e.arch);S.env.push(n)}}
  for(const t of arr(o.tx)){if(t&&typeof t.id==='string'&&D.test(t.d)&&typeof t.e==='string'&&Number.isFinite(t.a))S.tx.push({id:t.id,d:t.d,e:t.e,a:Math.round(t.a),n:String(t.n||'').slice(0,80),...(t.r?{r:String(t.r)}:{})})}
  for(const t of arr(o.tr)){if(t&&typeof t.id==='string'&&D.test(t.d)&&typeof t.f==='string'&&typeof t.t==='string'&&Number.isFinite(t.a))S.tr.push({id:t.id,d:t.d,f:t.f,t:t.t,a:Math.round(t.a),n:String(t.n||'').slice(0,80)})}
  for(const r of arr(o.rules)){if(r&&typeof r.id==='string'&&FREQ[r.f]&&D.test(r.s)&&Number.isFinite(r.a)&&(r.k==='in'||r.k==='out'))S.rules.push({id:r.id,n:String(r.n||'').slice(0,80),k:r.k,e:String(r.e||'pool'),a:Math.round(r.a),f:r.f,s:r.s,g:r.g&&D.test(r.g)?r.g:null,on:r.on!==false})}
  S.demo=!!o.demo;return S;
}
function seedDemo(){
  const t=todayStr(),m=ym(t);
  const E=(name,c,a)=>({id:uid(),name,c,q:[{m,a}]});
  const spesa=E('Spesa',3,5000),vet=E('Veterinario',1,10000),abb=E('Abbonamenti',5,1500),svago=E('Svago',7,4000);
  const S={v:1,env:[spesa,vet,abb,svago],tx:[],tr:[],demo:true,rules:[
    {id:uid(),n:'Stipendio',k:'in',e:'pool',a:150000,f:'m1',s:m+'-01',g:null,on:true},
    {id:uid(),n:'Abbonamento streaming',k:'out',e:abb.id,a:1299,f:'m1',s:m+'-05',g:null,on:true}]};
  S.tx.push({id:uid(),d:t,e:spesa.id,a:-2340,n:'Supermercato'});
  S.tx.push({id:uid(),d:m+'-01',e:vet.id,a:-3500,n:'Visita di controllo'});
  genRecurring(S,t);
  return S;
}
/*LOGIC-END*/

let S=null;
const Meta={dirty:false};
const ui={tab:'buste',m:ym(todayStr()),filter:'',mv:null,rl:null,ev:null,lastEnv:null};
const $=s=>document.querySelector(s);
const EUR=new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'});
const money=c=>EUR.format(c/100);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const monthLabel=k=>{const [y,m]=k.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('it-IT',{month:'long',year:'numeric'})};
const dayLabel=d=>new Date(d+'T12:00:00').toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'});
const longDay=d=>new Date(d+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long'});
const curM=()=>ym(todayStr());
const PAL=12;
const col=c=>typeof c==='string'?c:`var(--c${c})`;
const envIcon=c=>`<i class="dot" style="background:${col(c)}" aria-hidden="true"></i>`;
const moveIcon=`<svg width="12" height="12" viewBox="0 0 12 12" style="flex:none" aria-hidden="true"><path d="M1 4h9m0 0L7.5 1.500M10 4L7.500 6.500M11 8H2m0 0l2.500-2.500M2 8l2.500 2.500" fill="none" stroke="var(--ink-2)" stroke-width="1.500" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const byName=(a,b)=>a.name.localeCompare(b.name,'it',{sensitivity:'base',numeric:true});
const activeEnvs=()=>S.env.filter(e=>!e.arch).sort(byName);
function swatches(sel,act,id){
  const ida=id?` data-id="${id}"`:'',custom=typeof sel==='string';
  let h='<div class="sw" role="group" aria-label="Colore">';
  for(let n=1;n<=PAL;n++)h+=`<button type="button" data-act="${act}"${ida} data-v="${n}" aria-pressed="${sel===n}" aria-label="Colore ${n}" style="background:var(--c${n})"></button>`;
  return h+`<label class="sw-custom" data-on="${custom}" title="Colore a scelta"${custom?` style="--cc:${sel}"`:''}><input type="color" data-colorfor="${act}"${ida} value="${custom?sel:'#3b82e6'}" aria-label="Colore a scelta"></label></div>`;
}
const unusedColor=()=>{const used=new Set(S.env.filter(e=>!e.arch).map(e=>e.c));for(let n=1;n<=PAL;n++)if(!used.has(n))return n;return activeEnvs().length%PAL+1};
const envName=id=>id==='pool'?'Da assegnare':((S.env.find(e=>e.id===id)||{}).name||'Busta chiusa');
const envColor=id=>id==='pool'?12:((S.env.find(e=>e.id===id)||{}).c||12);
const defaultDate=()=>ui.m===curM()?todayStr():ui.m+'-01';
const defaultEnv=()=>{const a=activeEnvs();return a.find(e=>e.id===ui.lastEnv)?ui.lastEnv:(a[0]?a[0].id:'pool')};

function sumLine(r){
  const p=[];
  if(r.carry)p.push('Riporto '+money(r.carry));
  if(r.quota)p.push('Quota '+money(r.quota));
  if(r.inc)p.push('Entrate '+money(r.inc));
  const tr=r.tin-r.tout;if(tr)p.push('Spostati '+(tr>0?'+':'')+money(tr));
  if(r.spent)p.push('Speso '+money(r.spent));
  return p.length?p.join(' · '):'Nessun movimento';
}
function envRow(e,r){
  const budget=r.carry+r.quota+r.inc+r.tin-r.tout;
  const frac=r.avail<0?1:(budget>0?Math.min(1,r.spent/budget):(r.spent>0?1:0));
  return `<button class="env" data-act="env" data-id="${e.id}">${envIcon(e.c)}<span class="env-t"><b>${esc(e.name)}</b><small>${esc(sumLine(r))}</small><span class="bar"><i style="width:${Math.round(frac*100)}%;background:${r.avail<0?'var(--neg)':col(e.c)}"></i></span></span><span class="env-a num ${r.avail<0?'neg':''}">${money(r.avail)}</span></button>`;
}
function mvRow(it,kind){
  if(kind==='tr')return `<button class="mv" data-act="edit-mv" data-kind="tr" data-id="${it.id}">${moveIcon}<span class="mv-t"><b>${esc(it.n||'Spostamento')}</b><small>${esc(envName(it.f))} → ${esc(envName(it.t))}</small></span><span class="mv-a num">${money(it.a)}</span></button>`;
  const sub=[it.n?envName(it.e):'',it.r?'periodico':''].filter(Boolean).join(' · ');
  return `<button class="mv" data-act="edit-mv" data-kind="tx" data-id="${it.id}">${envIcon(envColor(it.e))}<span class="mv-t"><b>${esc(it.n||envName(it.e))}</b>${sub?`<small>${esc(sub)}</small>`:''}</span><span class="mv-a num ${it.a>0?'pos':''}">${it.a>0?'+':''}${money(it.a)}</span></button>`;
}
function monthItems(m,envId){
  const a=S.tx.filter(t=>ym(t.d)===m&&(!envId||t.e===envId)).map(t=>({k:'tx',it:t}));
  const b=S.tr.filter(t=>ym(t.d)===m&&(!envId||t.f===envId||t.t===envId)).map(t=>({k:'tr',it:t}));
  return [...a,...b].sort((x,y)=>y.it.d.localeCompare(x.it.d));
}
function statusText(){return({local:'Salvato solo su questo dispositivo',saving:'Salvataggio…',synced:'Salvato online',error:'Online non raggiungibile: i dati restano sul dispositivo',loading:'Collego il tuo spazio…'})[Sync.status]||''}

function viewBuste(){
  const C=compute(S,ui.m),P=C.acct.pool[ui.m],envs=activeEnvs();
  const total=Object.values(C.acct).reduce((n,a)=>n+a[ui.m].avail,0);
  const demo=S.demo?`<div class="card"><p><b>Questi sono dati di esempio.</b> Modificali a piacere oppure parti da zero.</p><div class="row"><button class="btn btn-p" data-act="reset-demo">Inizia da zero</button></div></div>`:'';
  const pool=`<section class="card"><p class="lbl">Da assegnare</p><p class="big num ${P.avail<0?'neg':''}">${money(P.avail)}</p>
    <p class="hint">Entrate ${money(P.inc)} · assegnato alle buste ${money(-P.quota)}${P.spent?' · speso '+money(P.spent):''}</p>
    ${P.avail<0?'<p class="warn" style="margin-top:10px">Le quote delle buste superano le entrate. Registra lo stipendio o riduci qualche quota.</p>':''}
    <div class="row"><button class="btn btn-p" data-act="move-new">Sposta denaro</button><button class="btn" data-act="add-in">Aggiungi entrata</button></div></section>`;
  const list=envs.length?`<div class="list">${envs.map(e=>envRow(e,C.acct[e.id][ui.m])).join('')}</div>`
    :`<div class="card empty"><p>Non hai ancora nessuna busta.</p><button class="btn btn-p" data-act="new-env">Crea la prima busta</button></div>`;
  return `${demo}${backupReminder()}${pool}<div class="sec"><h2>Buste</h2><button class="btn" data-act="new-env">+ Nuova busta</button></div>${list}
    <p class="help">Totale gestito: <b class="num">${money(total)}</b>. Dovrebbe coincidere con il saldo reale del conto.</p>
    <p class="help sync-t">${statusText()}</p>`;
}
function viewMov(){
  const items=monthItems(ui.m,ui.filter||null);
  const inc=S.tx.filter(t=>ym(t.d)===ui.m&&t.a>0).reduce((n,t)=>n+t.a,0);
  const out=S.tx.filter(t=>ym(t.d)===ui.m&&t.a<0).reduce((n,t)=>n-t.a,0);
  const opts=`<option value="">Tutte le buste</option><option value="pool"${ui.filter==='pool'?' selected':''}>Da assegnare</option>`+activeEnvs().map(e=>`<option value="${e.id}"${ui.filter===e.id?' selected':''}>${esc(e.name)}</option>`).join('');
  let body='';
  if(!items.length)body=`<div class="card empty"><p>Nessun movimento in questo mese.</p><button class="btn btn-p" data-act="fab">Aggiungi un movimento</button></div>`;
  else{let last='';body='<div class="list">';for(const x of items){if(x.it.d!==last){last=x.it.d;body+=`<div class="day">${dayLabel(last)}</div>`}body+=mvRow(x.it,x.k)}body+='</div>'}
  return `<div class="tiles"><div class="card"><p class="lbl">Entrate</p><b class="num pos">${money(inc)}</b></div><div class="card"><p class="lbl">Spese</p><b class="num">${money(out)}</b></div></div>
    <label class="f"><span class="lbl">Filtra</span><select id="flt" data-change="filter">${opts}</select></label>${body}`;
}
function viewRic(){
  const t=todayStr(),rules=[...S.rules].sort((a,b)=>(nextDue(a,t)||'9').localeCompare(nextDue(b,t)||'9'));
  const envs=activeEnvs(),m=ui.m<curM()?curM():ui.m,qs=envs.map(e=>({e,q:quotaFor(e,m)})).filter(x=>x.q>0),tq=qs.reduce((n,x)=>n+x.q,0);
  const quote=`<section class="card"><p class="lbl">Quote automatiche</p><p class="hint" style="margin-top:4px">Il 1° di ogni mese ogni busta riceve la sua quota dal denaro da assegnare, e il residuo resta nella busta.</p>
    ${qs.length?`<dl class="brk" style="margin-top:10px">${qs.map(x=>`<div><dt>${esc(x.e.name)}</dt><dd class="num">${money(x.q)}</dd></div>`).join('')}<div class="tot"><dt>Totale al mese</dt><dd class="num">${money(tq)}</dd></div></dl>`:'<p class="hint">Nessuna quota impostata. Aprila da una busta con “Modifica”.</p>'}</section>`;
  const list=rules.length?`<div class="list">${rules.map(r=>{const n=r.on===false?null:nextDue(r,t);
    return `<button class="rl" data-act="edit-rule" data-id="${r.id}">${envIcon(envColor(r.e))}<span class="rl-t"><b>${esc(r.n||'Senza nome')}</b><small>${FREQ[r.f].label} · ${esc(envName(r.e))} · ${r.on===false?'in pausa':n?'prossima '+longDay(n):'—'}</small></span><span class="rl-a num ${r.k==='in'?'pos':''}">${r.k==='in'?'+':'−'}${money(r.a)}</span></button>`}).join('')}</div>`
    :`<div class="card empty"><p>Nessun pagamento periodico. Aggiungi stipendio, abbonamenti, rate: si registrano da soli alla scadenza.</p></div>`;
  return `${quote}<div class="sec"><h2>Pagamenti periodici</h2><button class="btn btn-p" data-act="new-rule">+ Nuovo</button></div>${list}`;
}
function viewAltro(){
  return `<section class="card"><p class="lbl">Salvataggio</p><p style="margin-top:4px" class="sync-t">${statusText()}</p>
    <p class="hint">${Sync.col?'I dati sono nel tuo spazio privato e anche su questo dispositivo. Scarica ogni tanto un backup.':'I dati restano solo su questo dispositivo, senza account né server. Se cancelli i dati di Safari o cambi telefono si perdono: scarica ogni tanto un backup e conservalo.'}</p>
    <div class="row"><button class="btn" data-act="export">Scarica backup</button><label class="btn" for="imp" style="cursor:pointer">Carica backup</label><input id="imp" type="file" accept=".json,application/json" hidden></div></section>
  <section class="card"><p class="lbl">Come funziona</p><div class="help" style="display:grid;gap:8px;margin-top:6px">
    <p>Lo stipendio arriva in <b>Da assegnare</b>. Ogni 1° del mese le buste prendono la loro quota da lì.</p>
    <p>Le spese scalano la busta scelta. Quello che avanza resta nella busta; se sforo, il debito passa al mese dopo.</p>
    <p>Con “Sposta denaro” cambi la distribuzione quando vuoi. Gli importi periodici si registrano da soli alla data.</p></div></section>
  <section class="card"><p class="lbl">Installa sull’iPhone</p><p class="hint" style="margin-top:4px">In Safari tocca Condividi, poi “Aggiungi alla schermata Home”. Apri poi l’app sempre da quell’icona: i dati inseriti in Safari sono separati da quelli dell’icona.</p></section>
  <section class="card"><p class="lbl">Zona delicata</p><div class="row"><button class="btn btn-d" data-act="reset">Cancella tutti i dati</button></div></section>`;
}
function render(){
  if(!S){$('#view').innerHTML='<p class="muted" style="padding:24px 0;text-align:center">Carico i tuoi dati…</p>';$('#fab').hidden=true;return}
  const cm=curM();
  $('#month').textContent=monthLabel(ui.m);$('#today').hidden=ui.m===cm;
  document.querySelectorAll('.nav button').forEach(b=>{if(b.dataset.v===ui.tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  $('#view').innerHTML=({buste:viewBuste,mov:viewMov,ric:viewRic,altro:viewAltro})[ui.tab]();
  $('#fab').hidden=!(ui.tab==='buste'||ui.tab==='mov');
}
function renderStatus(){document.querySelectorAll('.sync-t').forEach(n=>n.textContent=statusText())}

function showSheet(html){const r=$('#sheet-root');r.innerHTML=`<div class="ov" data-act="close-bg"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;const i=r.querySelector('input:not([type=hidden]):not([type=checkbox]),select');if(i&&matchMedia('(pointer:fine)').matches)i.focus()}
function closeSheet(){$('#sheet-root').innerHTML='';ui.mv=ui.rl=ui.ev=null}
function setErr(msg){const n=$('#f-err');if(n)n.textContent=msg;return false}
const val=id=>{const n=document.getElementById(id);return n?n.value:null};
function acctOpts(sel,keepId){
  let h=`<option value="pool"${sel==='pool'?' selected':''}>Da assegnare</option>`;
  for(const e of [...S.env].sort((a,b)=>(!!a.arch-!!b.arch)||byName(a,b))){if(e.arch&&e.id!==keepId&&e.id!==sel)continue;h+=`<option value="${e.id}"${sel===e.id?' selected':''}>${esc(e.name)}${e.arch?' (chiusa)':''}</option>`}
  return h;
}
const freqOpts=(sel,none)=>(none?`<option value="">Non ripetere</option>`:'')+Object.entries(FREQ).map(([k,v])=>`<option value="${k}"${sel===k?' selected':''}>${v.label}</option>`).join('');
const confirmSheet=(title,msg,label,act,data='')=>showSheet(`<h2>${esc(title)}</h2><p>${esc(msg)}</p><div class="row"><button class="btn btn-d" data-act="${act}" ${data}>${esc(label)}</button><button class="btn" data-act="close">Annulla</button></div>`);

/* ---------- movimento (spesa / entrata / sposta) ---------- */
function openMove(init={}){
  let f;
  if(init.edit){
    const it=(init.edit.kind==='tr'?S.tr:S.tx).find(x=>x.id===init.edit.id);if(!it)return;
    f=init.edit.kind==='tr'?{type:'move',amt:centsToInput(it.a),from:it.f,to:it.t,date:it.d,note:it.n||'',editKind:'tr',editId:it.id}
      :{type:it.a<0?'out':'in',amt:centsToInput(Math.abs(it.a)),env:it.e,date:it.d,note:it.n||'',editKind:'tx',editId:it.id};
  }else{
    const t=init.type||'out',a=activeEnvs();
    f={type:t,amt:'',env:init.env||(t==='in'?'pool':defaultEnv()),from:init.from||'pool',to:init.to||(a[0]?a[0].id:'pool'),date:defaultDate(),note:'',rep:''};
  }
  ui.mv=f;drawMove();
}
function readMove(){const f=ui.mv;for(const [k,id] of [['amt','f-amt'],['env','f-env'],['from','f-from'],['to','f-to'],['date','f-date'],['note','f-note'],['rep','f-rep']]){const v=val(id);if(v!==null)f[k]=v}}
function drawMove(){
  const f=ui.mv,edit=!!f.editId;
  const title=edit?({move:'Modifica spostamento',in:'Modifica entrata',out:'Modifica spesa'})[f.type]:'Nuovo movimento';
  const seg=edit?'':`<div class="seg" role="group" aria-label="Tipo di movimento">${[['out','Spesa'],['in','Entrata'],['move','Sposta']].map(([v,l])=>`<button type="button" data-act="mv-type" data-v="${v}" aria-pressed="${f.type===v}">${l}</button>`).join('')}</div>`;
  const where=f.type==='move'?`<div class="two"><label class="f">Da<select id="f-from">${acctOpts(f.from,f.from)}</select></label><label class="f">A<select id="f-to">${acctOpts(f.to,f.to)}</select></label></div>`
    :`<label class="f">${f.type==='in'?'Versa in':'Busta'}<select id="f-env">${acctOpts(f.env,f.env)}</select></label>`;
  const rep=(!edit&&f.type!=='move')?`<label class="f">Ripetizione<select id="f-rep">${freqOpts(f.rep,true)}</select></label>`:'';
  showSheet(`<h2>${title}</h2><form data-form="mv" novalidate>${seg}
    <label class="f">Importo (€)<input class="amt" id="f-amt" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(f.amt)}"></label>${where}
    <div class="two"><label class="f">Data<input type="date" id="f-date" value="${esc(f.date)}"></label><label class="f">Nota<input id="f-note" maxlength="80" placeholder="Facoltativa" value="${esc(f.note)}"></label></div>${rep}
    <p class="err" id="f-err" role="alert"></p>
    <div class="row" style="margin:0"><button class="btn btn-p" type="submit">Salva</button><button class="btn" type="button" data-act="close">Annulla</button>${edit?'<button class="btn btn-d" type="button" data-act="del-mv">Elimina</button>':''}</div></form>`);
  if(!edit){const a=document.getElementById('f-amt');if(a)a.focus()}
}
function saveMove(){
  readMove();const f=ui.mv,a=parseAmount(f.amt);
  if(!(a>0))return setErr('Inserisci un importo maggiore di zero, per esempio 12,50.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(f.date))return setErr('Scegli una data.');
  const note=(f.note||'').trim().slice(0,80);
  if(f.type==='move'){
    if(f.from===f.to)return setErr('Scegli due buste diverse.');
    const row={id:f.editId||uid(),d:f.date,f:f.from,t:f.to,a,n:note};
    if(f.editId)S.tr[S.tr.findIndex(x=>x.id===f.editId)]=row;else S.tr.push(row);
  }else{
    const signed=f.type==='out'?-a:a;
    if(f.editId){const i=S.tx.findIndex(x=>x.id===f.editId);S.tx[i]={...S.tx[i],d:f.date,e:f.env,a:signed,n:note}}
    else if(f.rep){S.rules.push({id:uid(),n:note||(f.type==='in'?'Entrata periodica':'Pagamento periodico'),k:f.type,e:f.env,a,f:f.rep,s:f.date,g:null,on:true});genRecurring(S,todayStr())}
    else S.tx.push({id:uid(),d:f.date,e:f.env,a:signed,n:note});
    if(f.type==='out')ui.lastEnv=f.env;
  }
  ui.m=ym(f.date);closeSheet();persist();render();
}
function delMove(){const f=ui.mv;if(!f||!f.editId)return;if(f.editKind==='tr')S.tr=S.tr.filter(x=>x.id!==f.editId);else S.tx=S.tx.filter(x=>x.id!==f.editId);closeSheet();persist();render()}

/* ---------- busta ---------- */
function openEnv(id){
  const e=id?S.env.find(x=>x.id===id):null,m=ui.m<curM()?curM():ui.m;
  ui.ev={id:e?e.id:null,name:e?e.name:'',c:e?e.c:unusedColor(),q:e?centsToInput(quotaFor(e,m)):'',m};
  drawEnv();
}
function drawEnv(){
  const v=ui.ev,edit=!!v.id;
  showSheet(`<h2>${edit?'Modifica busta':'Nuova busta'}</h2><form data-form="env" novalidate>
    <label class="f">Nome<input id="e-name" maxlength="40" placeholder="Per esempio Veterinario" value="${esc(v.name)}"></label>
    <label class="f">Quota mensile (€)<input id="e-q" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(v.q)}"></label>
    <p class="help" style="margin-top:-6px">Si aggiunge da sola ogni 1° del mese, a partire da ${esc(monthLabel(v.m))}. I mesi passati non cambiano.</p>
    <div class="f">Colore${swatches(v.c,'env-color')}</div>
    <p class="err" id="f-err" role="alert"></p>
    <div class="row" style="margin:0"><button class="btn btn-p" type="submit">Salva</button><button class="btn" type="button" data-act="close">Annulla</button>${edit?'<button class="btn btn-d" type="button" data-act="arch-ask">Chiudi busta</button>':''}</div></form>`);
}
function saveEnv(){
  const v=ui.ev,name=(val('e-name')||'').trim(),qraw=(val('e-q')||'').trim();
  if(!name)return setErr('Dai un nome alla busta.');
  const q=qraw===''?0:parseAmount(qraw);
  if(Number.isNaN(q)||q<0)return setErr('La quota deve essere un importo, per esempio 50 o 12,50.');
  if(v.id){
    const e=S.env.find(x=>x.id===v.id);e.name=name;e.c=v.c;
    const i=e.q.findIndex(x=>x.m===v.m);
    if(i>=0)e.q[i].a=q;else if(q!==quotaFor(e,v.m))e.q.push({m:v.m,a:q});
    e.q.sort((a,b)=>a.m.localeCompare(b.m));
  }else S.env.push({id:uid(),name,c:v.c,q:q>0?[{m:v.m,a:q}]:[]});
  closeSheet();persist();render();
}
function recolor(id,c){const e=S.env.find(x=>x.id===id);if(!e||e.c===c)return;e.c=c;persist();render();openEnvDetail(id)}
function archiveEnv(id){
  const e=S.env.find(x=>x.id===id);if(!e)return;
  const avail=compute(S,curM()).acct[id][curM()].avail,t=todayStr();
  if(avail>0)S.tr.push({id:uid(),d:t,f:id,t:'pool',a:avail,n:'Chiusa la busta '+e.name});
  else if(avail<0)S.tr.push({id:uid(),d:t,f:'pool',t:id,a:-avail,n:'Chiusa la busta '+e.name});
  const nm=addM(curM(),1);e.q=e.q.filter(x=>x.m<nm);e.q.push({m:nm,a:0});e.arch=t;
  for(const r of S.rules)if(r.e===id)r.e='pool';
  closeSheet();persist();render();
}
function openEnvDetail(id){
  const e=S.env.find(x=>x.id===id);if(!e)return;
  const r=compute(S,ui.m).acct[id][ui.m],items=monthItems(ui.m,id);
  const row=(l,v,cls='')=>`<div><dt>${l}</dt><dd class="num ${cls}">${v}</dd></div>`;
  showSheet(`<div style="display:flex;gap:12px;align-items:center">${envIcon(e.c)}<div><h2>${esc(e.name)}</h2><p class="help" style="text-transform:capitalize">${esc(monthLabel(ui.m))}</p></div></div>
    <dl class="brk">${row('Riporto dal mese prima',money(r.carry),r.carry<0?'neg':'')}${row('Quota del mese','+'+money(r.quota))}${r.inc?row('Entrate','+'+money(r.inc)):''}${r.tin-r.tout?row('Spostamenti',(r.tin-r.tout>0?'+':'')+money(r.tin-r.tout)):''}${row('Spese','−'+money(r.spent))}
    <div class="tot"><dt>Disponibile</dt><dd class="num ${r.avail<0?'neg':''}">${money(r.avail)}</dd></div></dl>
    <div class="f">Colore${swatches(e.c,'env-recolor',id)}</div>
    <div class="row" style="margin:0"><button class="btn btn-p" data-act="add-out" data-id="${id}">Aggiungi spesa</button><button class="btn" data-act="move-from" data-id="${id}">Sposta denaro</button><button class="btn" data-act="edit-env" data-id="${id}">Modifica</button><button class="btn" data-act="close">Chiudi</button></div>
    ${items.length?`<h3>Movimenti del mese</h3><div class="list">${items.map(x=>mvRow(x.it,x.k)).join('')}</div>`:''}`);
}

/* ---------- pagamento periodico ---------- */
function openRule(id){
  const r=id?S.rules.find(x=>x.id===id):null;
  ui.rl=r?{id:r.id,name:r.n,type:r.k,amt:centsToInput(r.a),env:r.e,f:r.f,date:r.s,on:r.on!==false}:{id:null,name:'',type:'out',amt:'',env:defaultEnv(),f:'m1',date:defaultDate(),on:true};
  drawRule();
}
function readRule(){const v=ui.rl;for(const [k,id] of [['name','r-name'],['amt','r-amt'],['env','r-env'],['f','r-f'],['date','r-date']]){const x=val(id);if(x!==null)v[k]=x}const c=document.getElementById('r-on');if(c)v.on=c.checked}
function drawRule(){
  const v=ui.rl,edit=!!v.id;
  showSheet(`<h2>${edit?'Modifica pagamento periodico':'Nuovo pagamento periodico'}</h2><form data-form="rule" novalidate>
    <div class="seg" role="group" aria-label="Tipo">${[['out','Spesa'],['in','Entrata']].map(([k,l])=>`<button type="button" data-act="rule-type" data-v="${k}" aria-pressed="${v.type===k}">${l}</button>`).join('')}</div>
    <label class="f">Nome<input id="r-name" maxlength="80" placeholder="Per esempio Assicurazione" value="${esc(v.name)}"></label>
    <label class="f">Importo (€)<input class="amt" id="r-amt" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(v.amt)}"></label>
    <label class="f">${v.type==='in'?'Versa in':'Busta'}<select id="r-env">${acctOpts(v.env,v.env)}</select></label>
    <div class="two"><label class="f">Frequenza<select id="r-f">${freqOpts(v.f,false)}</select></label><label class="f">${edit?'Data di riferimento':'Prima scadenza'}<input type="date" id="r-date" value="${esc(v.date)}"></label></div>
    ${edit?`<label class="chk"><input type="checkbox" id="r-on"${v.on?' checked':''}>Attivo</label>`:''}
    <p class="help">Alla scadenza il movimento si registra da solo. Se una scadenza è già passata, viene registrata subito.</p>
    <p class="err" id="f-err" role="alert"></p>
    <div class="row" style="margin:0"><button class="btn btn-p" type="submit">Salva</button><button class="btn" type="button" data-act="close">Annulla</button>${edit?'<button class="btn btn-d" type="button" data-act="del-rule-ask">Elimina</button>':''}</div></form>`);
}
function saveRule(){
  readRule();const v=ui.rl,a=parseAmount(v.amt);
  if(!(a>0))return setErr('Inserisci un importo maggiore di zero.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v.date))return setErr('Scegli una data.');
  const name=(v.name||'').trim()||(v.type==='in'?'Entrata periodica':'Pagamento periodico');
  const old=v.id?S.rules.find(x=>x.id===v.id):null;
  let g=old?old.g:null;if(old&&old.on===false&&v.on)g=dateAdd(todayStr(),-1);
  const row={id:v.id||uid(),n:name,k:v.type,e:v.env,a,f:v.f,s:v.date,g,on:v.on!==false};
  if(old)S.rules[S.rules.indexOf(old)]=row;else S.rules.push(row);
  genRecurring(S,todayStr());closeSheet();persist();render();
}

/* ---------- promemoria backup (solo senza salvataggio online) ---------- */
const LS={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
function backupAge(){
  const base=LS.get('buste:backup')||LS.get('buste:since');
  if(!base){LS.set('buste:since',todayStr());return 0}
  return Math.max(0,Math.floor((new Date(todayStr()+'T12:00:00')-new Date(base+'T12:00:00'))/864e5));
}
function backupReminder(){
  if(Sync.col||S.demo||!(S.env.length||S.tx.length))return '';
  const n=backupAge();
  return n>=30?`<div class="card"><p><b>Backup consigliato.</b> Sono passati ${n} giorni dall’ultimo salvataggio su file.</p><div class="row"><button class="btn btn-p" data-act="export">Scarica backup</button></div></div>`:'';
}
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol))addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));


/* ---------- salvataggio: copia sul telefono + spazio privato online ---------- */
const Sync={status:'loading',col:null,last:{},initialized:false,pending:false,busy:false,missed:false,timer:null,loadTimer:null};
function setStatus(s){Sync.status=s;renderStatus()}
function loadLocal(){try{const raw=localStorage.getItem('buste:v1');if(!raw)return null;const o=JSON.parse(raw);Meta.dirty=!!o.dirty;return cleanState(o.S)}catch(e){return null}}
function saveLocal(){try{localStorage.setItem('buste:v1',JSON.stringify({S,dirty:Meta.dirty}))}catch(e){}}
function schedule(ms){Sync.pending=true;clearTimeout(Sync.timer);Sync.timer=setTimeout(flush,ms)}
function persist(){
  Meta.dirty=true;saveLocal();
  if(!Sync.col){setStatus('local');return}
  setStatus('saving');schedule(700);
}
async function flush(){
  if(!Sync.col)return;
  if(!Sync.initialized||Sync.busy){Sync.timer=setTimeout(flush,1000);return}
  Sync.busy=true;Sync.pending=false;
  try{
    const docs=serializeDocs(docsFromState(S));
    for(const id of new Set([...Object.keys(docs),...Object.keys(Sync.last)])){
      if(docs[id]===Sync.last[id])continue;
      const ref=Sync.col.doc(id);
      if(docs[id]===undefined){await ref.delete();delete Sync.last[id]}
      else{await ref.set(JSON.parse(docs[id]));Sync.last[id]=docs[id]}
    }
    Sync.busy=false;
    if(Sync.pending)return;
    Meta.dirty=false;saveLocal();setStatus('synced');
    if(Sync.missed){Sync.missed=false;applyRemote(mapOf(await Sync.col.get()))}
  }catch(e){Sync.busy=false;setStatus('error');schedule(8000)}
}
const mapOf=snap=>{const m={};snap.docs.forEach(d=>{m[d.id]=d.data()});return m};
function onSnap(snap){
  if(Sync.pending||Sync.busy){Sync.missed=true;return}
  applyRemote(mapOf(snap));
}
function applyRemote(remote){
  const hasCfg=!!remote.cfg;
  if(!Sync.initialized){
    Sync.initialized=true;clearTimeout(Sync.loadTimer);
    if(!hasCfg){
      if(!S)S=seedDemo();
      Sync.last={};Meta.dirty=true;saveLocal();setStatus('saving');schedule(200);render();return;
    }
    if(Meta.dirty&&S){
      Sync.last=serializeDocs(docsFromState(stateFromDocs(remote)));
      setStatus('saving');schedule(200);render();return;
    }
  }
  S=stateFromDocs(remote);
  const gen=genRecurring(S,todayStr());
  Sync.last=serializeDocs(docsFromState(stateFromDocs(remote)));
  Meta.dirty=false;saveLocal();
  if(gen)persist();else setStatus('synced');
  render();
}
async function initSync(){
  try{
    const cl=window.claude;if(!cl||!cl.use)return false;
    const [db,user]=await Promise.all([cl.use('db'),cl.use('user')]);
    if(!db||!user)return false;
    const id=await user.id();if(!id)return false;
    Sync.col=db.collection('data/users/'+id);
    Sync.loadTimer=setTimeout(()=>{if(!Sync.initialized){if(!S){S=seedDemo();saveLocal()}setStatus('error');render()}},8000);
    Sync.col.onSnapshot(onSnap,()=>setStatus('error'));
    return true;
  }catch(e){return false}
}

/* ---------- backup ---------- */
async function exportBackup(){
  const payload=JSON.stringify({app:'le-mie-buste',esportato:new Date().toISOString(),...S},null,1);
  const name='buste-backup-'+todayStr()+'.json';
  const done=()=>{LS.set('buste:backup',todayStr());if(ui.tab==='buste')render()};
  try{
    const file=new File([payload],name,{type:'application/json'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:name});done();return}
  }catch(e){if(e&&e.name==='AbortError')return}
  try{
    const url=URL.createObjectURL(new Blob([payload],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);done();return;
  }catch(e){}
  showSheet(`<h2>Backup</h2><p class="help">Non riesco a salvare il file. Copia il testo e conservalo in un posto sicuro.</p><textarea id="bk" readonly>${esc(payload)}</textarea><div class="row"><button class="btn btn-p" data-act="copy-json">Copia</button><button class="btn" data-act="close">Chiudi</button></div>`);
}

/* ---------- eventi ---------- */
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]');if(!el||!S)return;
  const a=el.dataset.act,id=el.dataset.id,v=el.dataset.v;
  if(a==='close-bg'){if(e.target===el)closeSheet();return}
  switch(a){
    case 'tab':ui.tab=v;render();scrollTo(0,0);break;
    case 'prev':ui.m=addM(ui.m,-1);if(ui.m<addM(curM(),-36))ui.m=addM(curM(),-36);render();break;
    case 'next':ui.m=addM(ui.m,1);if(ui.m>addM(curM(),12))ui.m=addM(curM(),12);render();break;
    case 'today':ui.m=curM();render();break;
    case 'fab':case 'fab-out':openMove({type:'out'});break;
    case 'fab-in':openMove({type:'in'});break;
    case 'add-in':openMove({type:'in'});break;
    case 'add-out':openMove({type:'out',env:id});break;
    case 'move-new':openMove({type:'move'});break;
    case 'move-from':{const o=activeEnvs().find(x=>x.id!==id);openMove({type:'move',from:id,to:o?o.id:'pool'});break}
    case 'edit-mv':openMove({edit:{kind:el.dataset.kind,id}});break;
    case 'mv-type':{readMove();ui.mv.type=v;if(v==='in')ui.mv.env='pool';else if(v==='out'&&ui.mv.env==='pool')ui.mv.env=defaultEnv();drawMove();break}
    case 'del-mv':delMove();break;
    case 'env':openEnvDetail(id);break;
    case 'new-env':openEnv();break;
    case 'edit-env':openEnv(id);break;
    case 'env-color':ui.ev.name=val('e-name');ui.ev.q=val('e-q');ui.ev.c=+v;drawEnv();break;
    case 'env-recolor':recolor(id,+v);break;
    case 'arch-ask':confirmSheet('Chiudere la busta?','Il saldo torna in “Da assegnare” e la busta sparisce dall’elenco. Lo storico dei movimenti resta.','Chiudi busta','arch',`data-id="${ui.ev.id}"`);break;
    case 'arch':archiveEnv(id);break;
    case 'new-rule':openRule();break;
    case 'edit-rule':openRule(id);break;
    case 'rule-type':{readRule();ui.rl.type=v;if(v==='in')ui.rl.env='pool';else if(ui.rl.env==='pool')ui.rl.env=defaultEnv();drawRule();break}
    case 'del-rule-ask':confirmSheet('Eliminare il pagamento periodico?','I movimenti già registrati restano al loro posto.','Elimina','del-rule',`data-id="${ui.rl.id}"`);break;
    case 'del-rule':S.rules=S.rules.filter(r=>r.id!==id);closeSheet();persist();render();break;
    case 'close':closeSheet();break;
    case 'export':exportBackup();break;
    case 'copy-json':{const t=$('#bk');navigator.clipboard.writeText(t.value).catch(()=>{t.select()});break}
    case 'reset':confirmSheet('Cancellare tutto?','Buste, movimenti e pagamenti periodici verranno eliminati e non si potranno recuperare. Se vuoi, scarica prima un backup.','Cancella tutto','reset-yes');break;
    case 'reset-yes':case 'reset-demo':S=emptyState();closeSheet();persist();render();break;
    case 'import-yes':if(ui.imp){S=ui.imp;ui.imp=null;genRecurring(S,todayStr());closeSheet();persist();render()}break;
  }
});
document.addEventListener('submit',e=>{
  const f=e.target.closest('form[data-form]');if(!f)return;e.preventDefault();
  ({mv:saveMove,env:saveEnv,rule:saveRule})[f.dataset.form]();
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.id==='imp'&&t.files&&t.files[0]){
    const rd=new FileReader();
    rd.onload=()=>{try{
      const o=JSON.parse(rd.result),ns=cleanState(o.state||o);
      if(!ns||(!ns.env.length&&!ns.tx.length&&!ns.rules.length))throw 0;
      ui.imp=ns;confirmSheet('Sostituire i dati?',`Il backup contiene ${ns.env.length} buste e ${ns.tx.length+ns.tr.length} movimenti. I dati attuali verranno sostituiti.`,'Sostituisci','import-yes');
    }catch(err){showSheet('<h2>File non valido</h2><p>Questo file non sembra un backup di Le mie buste.</p><div class="row"><button class="btn" data-act="close">Chiudi</button></div>')}};
    rd.readAsText(t.files[0]);t.value='';
  }else if(t.dataset&&t.dataset.colorfor){
    if(t.dataset.colorfor==='env-recolor')recolor(t.dataset.id,t.value);
    else{ui.ev.name=val('e-name');ui.ev.q=val('e-q');ui.ev.c=t.value;drawEnv()}
  }else if(t.dataset&&t.dataset.change==='filter'){ui.filter=t.value;render()}
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&S&&genRecurring(S,todayStr())){persist();render()}});

/* ---------- avvio ---------- */
(async function boot(){
  S=loadLocal();backupAge();try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
  if(S&&genRecurring(S,todayStr())){Meta.dirty=true;saveLocal()}
  render();
  const ok=await initSync();
  if(!ok){Sync.status='local';if(!S){S=seedDemo();saveLocal()}render()}
})();
