/* ==========================================================================
   JetFor · Mapa de Controle de Manutenção — lógica do app (Fase 2 dinâmica)
   ========================================================================== */
'use strict';

// ---------- estado ----------
let STATE = null;           // {aeronave, contadores, tarefas}
let DB = null;              // firestore (se conectado)
let DOCREF = null;
let ONLINE = false;
let SUPPRESS = false;       // evita loop de escrita durante snapshot
const LSKEY = 'jetfor_mapa_PTLJQ';

// ---------- unidades / rótulos ----------
const BASE_LABEL = {
  celula_horas:'Célula · h', celula_pousos:'Célula · pousos', celula_ciclos:'Célula · ciclos',
  motor1_horas:'Motor 1 · h', motor1_ciclos:'Motor 1 · ciclos', motor1_pousos:'Motor 1 · pousos',
  motor2_horas:'Motor 2 · h', motor2_ciclos:'Motor 2 · ciclos', motor2_pousos:'Motor 2 · pousos',
  helice1_horas:'Hélice 1 · h', helice2_horas:'Hélice 2 · h', helice1_ciclos:'Hélice 1 · cic', helice2_ciclos:'Hélice 2 · cic',
  helice_horas:'Hélice · h', calendario:'Calendário'
};
function baseUnit(base){
  if(!base||base==='calendario') return '';
  if(base.endsWith('_pousos')) return 'pou';
  if(base.endsWith('_ciclos')) return 'cic';
  return 'h';
}
const CAT_LABEL={celula:'Célula',motor:'Motor',helice:'Hélice',ica:'ICA'};
const TIPO_LABEL={horas:'Horas',ciclos:'Ciclos',pousos:'Pousos',calendario:'Calendário'};
// limiar de "próximo do vencimento" por unidade
const WARN = { h:50, pou:100, cic:100, dias:60 };

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const num = v => (v===''||v==null||isNaN(parseFloat(v))) ? null : parseFloat(v);
function fmtN(v,dec=1){ if(v==null) return '—'; return v.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:dec}); }
function todayISO(){ const d=new Date(); return d.toISOString().slice(0,10); }
function addMonths(iso,m){ if(!iso||m==null) return null; const d=new Date(iso+'T00:00:00'); d.setMonth(d.getMonth()+parseInt(m)); return d; }
function daysBetween(fromISO,toDate){ if(!toDate) return null; const a=new Date(fromISO+'T00:00:00'); return Math.round((toDate-a)/86400000); }
function fmtDate(d){ if(!d) return '—'; return d.toLocaleDateString('pt-BR'); }
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),2200); }

// ---------- CÁLCULO (replica as fórmulas do Excel) ----------
function compute(task){
  const r = { num:null, cal:null, status:'ok' };
  // parte numérica (horas/pousos/ciclos)
  if(task.base && task.base!=='calendario'){
    const counter = STATE.contadores[task.base];
    let venc = null;
    if(task.intervalo!=null && task.exec!=null) venc = task.exec + task.intervalo;   // VENC = EXEC + INTERVALO
    else if(task.vencFixo!=null) venc = task.vencFixo;                                // limite fixo (LLP)
    const unit = baseUnit(task.base) || 'h';
    const disp = (venc!=null && counter!=null) ? +(venc - counter).toFixed(1) : null; // DISP = VENC − contador
    r.num = { venc, disp, unit };
  }
  // parte calendário (co-limite ou tarefa só-calendário)
  if(task.cal && task.cal.exec){
    const vd = addMonths(task.cal.exec, task.cal.meses);
    const dd = daysBetween(STATE.hoje||todayISO(), vd);
    r.cal = { venc:vd, disp:dd };
  }
  // status = pior caso entre numérico e calendário
  const cands=[];
  if(r.num && r.num.disp!=null) cands.push({disp:r.num.disp, warn:WARN[r.num.unit]||50});
  if(r.cal && r.cal.disp!=null) cands.push({disp:r.cal.disp, warn:WARN.dias});
  let st='ok';
  for(const c of cands){
    if(c.disp<0){ st='od'; break; }
    if(c.disp<=c.warn) st='wn';
  }
  r.status=st;
  return r;
}

// ---------- PERSISTÊNCIA (multi-aeronave) ----------
// STATE.acmaps = { 'PT-LJQ':{aeronave,contadores,tarefas,da}, ... }
// STATE.contadores/tarefas apontam para a aeronave ativa (STATE.currentAC).
function cur(){ return STATE.acmaps[STATE.currentAC]; }
function saveLocal(){ try{ localStorage.setItem('jetfor_mapa_v2', JSON.stringify({acmaps:STATE.acmaps,frota:STATE.frota,hoje:STATE.hoje,currentAC:STATE.currentAC,osProx:STATE.osProx})); }catch(e){} }
function loadLocal(){ try{ const s=localStorage.getItem('jetfor_mapa_v2'); return s?JSON.parse(s):null; }catch(e){ return null; } }
function acDoc(ac){ return DB.collection(window.FIRESTORE_COLECAO||'mapas').doc(ac); }

async function saveAll(){
  saveLocal();
  if(ONLINE && DB){
    try{
      SUPPRESS=true;
      const m=cur();
      await acDoc(STATE.currentAC).set({aeronave:m.aeronave,contadores:m.contadores,tarefas:m.tarefas,da:m.da,osHistorico:(m.osHistorico||[]),updatedAt:new Date().toISOString()});
      await acDoc('_geral').set({frota:STATE.frota,hoje:STATE.hoje,osProx:(STATE.osProx||{}),updatedAt:new Date().toISOString()});
      SUPPRESS=false;
      toast('✔ Salvo no Firebase (nuvem)');
    }catch(e){ SUPPRESS=false; toast('⚠ Erro ao salvar na nuvem — salvo local'); console.error(e); }
  } else {
    toast('✔ Salvo neste navegador');
  }
}

// ---------- FIREBASE ----------
let SNAP_UNSUB=null;
function initFirebase(){
  const cfg = window.FIREBASE_CONFIG || {};
  if(!cfg.apiKey || !cfg.projectId){ setBadge(false); return; }
  try{
    firebase.initializeApp(cfg);
    DB = firebase.firestore();
    ONLINE = true; setBadge(true);
    // dados gerais (frota/hoje)
    acDoc('_geral').get().then(snap=>{
      if(!snap.exists){ acDoc('_geral').set({frota:STATE.frota,hoje:STATE.hoje,osProx:(STATE.osProx||{}),updatedAt:new Date().toISOString()}); }
      else { const d=snap.data()||{}; if(d.osProx) STATE.osProx=d.osProx; }
    }).catch(()=>{});
    subscribeAC(STATE.currentAC);
  }catch(e){ console.error(e); ONLINE=false; setBadge(false); }
}
function subscribeAC(ac){
  if(!ONLINE||!DB) return;
  if(SNAP_UNSUB){ SNAP_UNSUB(); SNAP_UNSUB=null; }
  acDoc(ac).get().then(snap=>{
    if(!snap.exists){ const m=STATE.acmaps[ac]; acDoc(ac).set({aeronave:m.aeronave,contadores:m.contadores,tarefas:m.tarefas,da:m.da,updatedAt:new Date().toISOString()}); }
  }).catch(()=>{});
  SNAP_UNSUB=acDoc(ac).onSnapshot(snap=>{
    if(SUPPRESS) return;
    const d=snap.data(); if(!d) return;
    const m=STATE.acmaps[ac];
    if(d.contadores) m.contadores=d.contadores;
    if(d.tarefas) m.tarefas=d.tarefas;
    if(d.aeronave) m.aeronave=d.aeronave;
    if(d.da) m.da=d.da;
    if(d.osHistorico) m.osHistorico=d.osHistorico;
    if(ac===STATE.currentAC){ STATE.contadores=m.contadores; STATE.tarefas=m.tarefas; renderCounters(); renderTable(); }
  });
}
function setBadge(on){
  const b=$('#connBadge');
  if(on){ b.className='badge on'; b.textContent='● Firebase conectado'; }
  else  { b.className='badge off'; b.textContent='● Local (sem nuvem)'; }
}

// ---------- CONTADORES (render) — grupos derivados do cadastro (nº motores/hélices) ----------
function buildCounterGroups(){
  const ac = (cur()&&cur().aeronave)||{};
  const nM = ac.nMotores!=null? ac.nMotores : 2;
  const nH = ac.nHelices!=null? ac.nHelices : 0;
  const groups=[{key:'celula',dot:'#14284B',title:'Célula (Aeronave)',fields:[['celula_horas','Horas'],['celula_pousos','Pousos'],['celula_ciclos','Ciclos']]}];
  const mcols=['#1c5bb8','#b8631c','#2E7D32','#8a3ffa'];
  for(let i=1;i<=nM;i++) groups.push({key:'motor'+i,dot:mcols[(i-1)%4],title:'Motor '+i,fields:[['motor'+i+'_horas','Horas'],['motor'+i+'_ciclos','Ciclos']]});
  for(let i=1;i<=nH;i++) groups.push({key:'helice'+i,dot:'#6b3fa0',title:'Hélice '+i,fields:[['helice'+i+'_horas','Horas'],['helice'+i+'_ciclos','Ciclos']]});
  return groups;
}
function renderCounters(){
  const g=$('#cgrid'); g.innerHTML='';
  const info = {};
  buildCounterGroups().forEach(grp=>{
    const div=document.createElement('div'); div.className='cgroup';
    let html=`<div class="ctitle"><span class="dot" style="background:${grp.dot}"></span>${grp.title}</div>`;
    grp.fields.forEach(([k,lab])=>{
      const val = STATE.contadores[k]!=null ? STATE.contadores[k] : '';
      html+=`<div class="cfield"><label>${lab}</label><input type="number" step="any" data-ctr="${k}" value="${val}"></div>`;
    });
    if(grp.note && info[grp.note]) html+=`<div class="cnote">${info[grp.note]}</div>`;
    div.innerHTML=html; g.appendChild(div);
  });
  g.querySelectorAll('input[data-ctr]').forEach(inp=>{
    inp.addEventListener('input',()=>{ STATE.contadores[inp.dataset.ctr]=num(inp.value); renderTable(); saveLocalDebounced(); });
  });
  $('#hoje').value = STATE.hoje||todayISO();
}
let _lsT=null; function saveLocalDebounced(){ clearTimeout(_lsT); _lsT=setTimeout(saveLocal,500); }

// ---------- TABELA (render) ----------
function renderTable(){
  const q=($('#q').value||'').toLowerCase().trim();
  const fg=$('#fgrupo').value, fs=$('#fstatus').value;
  const tb=$('#tbody'); tb.innerHTML='';
  let counts={od:0,wn:0,ok:0,all:0};

  // agrupar por 'grupo' preservando ordem
  const order=[]; const byG={};
  STATE.tarefas.forEach(t=>{ if(!byG[t.grupo]){ byG[t.grupo]=[]; order.push(t.grupo); } byG[t.grupo].push(t); });

  let nr=0;
  order.forEach(gname=>{
    const rows=byG[gname];
    const visible=[];
    rows.forEach(t=>{
      if(t.categoria==='ica') return;   // ICA/Documentos vão em aba separada
      const c=compute(t);
      counts.all++; counts[c.status]++;
      if(fg && t.grupo!==fg) return;
      if(fs && c.status!==fs) return;
      if(q){
        const hay=(t.nome+' '+t.grupo+' '+(t.pn||'')+' '+(t.sn||'')+' '+(t.obs||'')).toLowerCase();
        if(!hay.includes(q)) return;
      }
      visible.push([t,c]);
    });
    if(!visible.length) return;
    // linha de grupo
    const gr=document.createElement('tr'); gr.className='grp';
    gr.innerHTML=`<td colspan="14">${gname}</td>`; tb.appendChild(gr);
    visible.forEach(([t,c])=>{ nr++; tb.appendChild(rowEl(t,c,nr)); });
  });
  // seleção / O.S.
  const chkAll=$('#chkAll'); if(chkAll) chkAll.checked=false;
  tb.querySelectorAll('.rowchk').forEach(cb=>cb.addEventListener('change',updateOSsel));
  updateOSsel();

  // KPIs
  $('#kpis').innerHTML =
    `<span class="kpi all">Total ${counts.all}</span>`+
    `<span class="kpi od">🔴 ${counts.od}</span>`+
    `<span class="kpi wn">🟠 ${counts.wn}</span>`+
    `<span class="kpi ok">🟢 ${counts.ok}</span>`;
}

// ---------- seleção / Ordem de Serviço ----------
function selectedIds(){ return [...document.querySelectorAll('#tbl .rowchk:checked')].map(c=>c.dataset.id); }
function updateOSsel(){
  const n=selectedIds().length;
  const b=$('#btnOS'); if(!b) return;
  $('#osCount').textContent=n;
  b.style.display = n>0 ? '' : 'none';
}
function osNextLabel(){
  const y=(STATE.hoje||todayISO()).slice(0,4);
  const map=STATE.osProx||{}; const n=map[y]!=null?map[y]:(y==='2026'?10:1);
  return {y,n,label:String(n).padStart(3,'0')+'/'+y};
}
function gerarOS(){
  const ids=selectedIds(); if(!ids.length){ toast('Selecione itens'); return; }
  const m=cur(); const a=m.aeronave||{}; const C=m.contadores||{};
  const items=ids.map(id=>m.tarefas.find(t=>t.id===id)).filter(Boolean);
  const os=osNextLabel();
  const hoje=new Date((STATE.hoje||todayISO())+'T00:00:00').toLocaleDateString('pt-BR');
  const g=v=>v!=null?fmtN(v,1):'';
  const nM=a.nMotores!=null?a.nMotores:2, nH=a.nHelices!=null?a.nHelices:0;
  let util=`<tr><th>AERONAVE</th><td colspan="2">TSN: ${g(C.celula_horas)}</td><td colspan="2">TSO: —</td><td>CSN: ${g(C.celula_ciclos)}</td><td>CSO: —</td></tr>`;
  for(let i=1;i<=nM;i++) util+=`<tr><th>Motor ${i}</th><td>P/N <input></td><td>S/N <input></td><td>TSN: ${g(C['motor'+i+'_horas'])}</td><td>TSO <input style="width:70px"></td><td>CSN: ${g(C['motor'+i+'_ciclos'])}</td><td>CSO <input style="width:70px"></td></tr>`;
  for(let i=1;i<=nH;i++) util+=`<tr><th>Hélice ${i}</th><td>P/N <input></td><td>S/N <input></td><td>TSN: ${g(C['helice'+i+'_horas'])}</td><td>TSO <input style="width:70px"></td><td colspan="2">—</td></tr>`;
  const servicos=items.map((t,i)=>`<div class="ossvc"><b>${i+1})</b> ${esc(t.nome)}${t.pn?' — P/N '+esc(t.pn):''}${t.sn?' · S/N '+esc(t.sn):''}</div>`).join('');
  $('#osBody').innerHTML=`
    <div class="osdoc">
      <div class="fh"><div class="fh-l"><span class="fh-jf">✈ JETFOR</span><span class="fh-emp">JETFOR TÁXI AÉREO LTDA. · COA 2007-07-2CHQ-02-02</span></div>
        <div class="fh-r"><b>ORDEM DE SERVIÇO</b></div></div>
      <table class="ff"><tr><th>Matrícula</th><td>${esc(a.matricula||STATE.currentAC)}</td><th>Nº de Série</th><td>${esc(a.sn||'')}</td>
        <th>O.S. Nº</th><td><input id="osNum" value="${os.label}" style="width:90px"></td><th>Data de Abertura</th><td>${hoje}</td></tr>
        <tr><th>Oficina executora (RBAC 145)</th><td colspan="7"><input placeholder="Ex.: USA - Uirapuru Serviços Aeronáuticos Ltda"></td></tr></table>
      <div class="fsec">Registro de Utilização</div>
      <table class="ff util">${util}</table>
      <div class="fsec">Solicitação — Serviços a executar (${items.length})</div>
      <div class="ossvcs">${servicos}</div>
      <table class="ff"><tr><th>Diretor de Manutenção</th><td>Leonardo Filipe de Araujo</td><th>CANAC/CREA</th><td>CREA 1713750589</td><th>Assinatura</th><td></td></tr></table>
      <div class="fsec">Execução</div>
      <table class="ff"><tr><th>Nº da O.S.</th><td><input></td><th>Data de Encerramento</th><td><input placeholder="__/__/____"></td></tr></table>
      <div class="osdecl"><b>DECLARAÇÃO DE LIBERAÇÃO PARA RETORNO AO SERVIÇO</b><br>
        Declaro que os serviços acima foram executados de acordo com as instruções técnicas e a legislação vigente. Os itens em ACR (se houver) foram transferidos para nova Ordem de Serviço. O(s) produto(s) aeronáutico(s) afetado(s) por esta Ordem de Serviço está(ão) aeronavegável(is) e autorizado(s) para retorno ao serviço.</div>
      <div class="fsign"><div class="fsign-line">_______________________________________</div>Responsável: Leonardo Filipe de Araujo · CREA 1713750589</div>
    </div>`;
  $('#osOverlay').classList.add('show'); document.body.classList.add('osopen');
}
function registrarOS(){
  const m=cur(); const os=osNextLabel();
  const numEl=$('#osNum'); const numero=numEl?numEl.value.trim():os.label;
  const ids=selectedIds(); const items=ids.map(id=>m.tarefas.find(t=>t.id===id)).filter(Boolean);
  if(!m.osHistorico) m.osHistorico=[];
  m.osHistorico.push({numero, data:(STATE.hoje||todayISO()), itens:items.map(t=>t.nome), qtd:items.length});
  // incrementa sequência do ano
  const y=(STATE.hoje||todayISO()).slice(0,4);
  STATE.osProx=STATE.osProx||{}; STATE.osProx[y]=(STATE.osProx[y]!=null?STATE.osProx[y]:(y==='2026'?10:1))+1;
  saveAll(); toast('✔ O.S. '+numero+' registrada no histórico');
  $('#osOverlay').classList.remove('show'); document.body.classList.remove('osopen');
}
function renderHistoricoOS(){
  const h0=(cur().osHistorico)||[];
  let h=`<div class="panel"><h2><span class="tag">O.S.</span> Histórico de Ordens de Serviço — ${esc(STATE.currentAC)}</h2><div class="pbody">`;
  const prox=osNextLabel().label;
  h+=`<p class="lead">Próxima O.S. a emitir: <b>${prox}</b>. Ao registrar uma O.S., a numeração avança sozinha.</p>`;
  if(!h0.length){ h+='<p class="lead">Nenhuma O.S. registrada ainda para esta aeronave.</p>'; }
  else{
    h+=`<div class="tblwrap"><table class="da"><thead><tr><th>O.S. Nº</th><th>Data</th><th class="num">Itens</th><th>Serviços</th></tr></thead><tbody>`;
    h0.slice().reverse().forEach(o=>{ h+=`<tr><td><b>${esc(o.numero)}</b></td><td>${fmtDate(new Date((o.data||'')+'T00:00:00'))}</td><td class="num">${o.qtd||(o.itens?o.itens.length:0)}</td><td class="obscell">${esc((o.itens||[]).join(' · '))}</td></tr>`; });
    h+=`</tbody></table></div>`;
  }
  h+=`</div></div>`;
  $('#mapa-sheet').innerHTML=h;
}
function baseTagClass(base){
  if(base&&base.startsWith('motor1')) return 'm1';
  if(base&&base.startsWith('motor2')) return 'm2';
  if(base==='calendario') return 'cal';
  return '';
}
function rowEl(t,c,n){
  const tr=document.createElement('tr'); tr.className=c.status;
  const unit = c.num? c.num.unit : '';
  const venc = c.num? (c.num.venc!=null? fmtN(c.num.venc,1)+' '+unit : '—') : '—';
  let disp='—';
  if(c.num && c.num.disp!=null){
    const neg=c.num.disp<0;
    disp=`<span class="${neg?'disp-neg':''}">${fmtN(c.num.disp,1)} ${unit}</span>`;
  }
  let calHtml='—';
  if(c.cal){
    const dd=c.cal.disp; const neg=dd!=null&&dd<0;
    calHtml=`${fmtDate(c.cal.venc)} <span class="${neg?'disp-neg':''}">(${dd!=null?dd+'d':'—'})</span>`;
  }
  const inter = (t.intervalo!=null? fmtN(t.intervalo,0)+' '+unit : (t.vencFixo!=null?'fixo':'—'));
  const exec = (t.exec!=null? fmtN(t.exec,1)+' '+unit : '—');
  const pill = `<span class="pill ${c.status}">${c.status==='od'?'VENCIDO':c.status==='wn'?'PRÓXIMO':'EM DIA'}</span>`;
  const obs = t.obs ? `<span title="${esc(t.obs)}">${esc(t.obs)}</span>` : '<span class="muted">—</span>';
  tr.innerHTML =
    `<td class="sel no-print"><input type="checkbox" class="rowchk" data-id="${esc(t.id)}"></td>`+
    `<td class="nrcol">${n}</td>`+
    `<td>${esc(t.nome)}</td>`+
    `<td class="muted">${esc(t.pn||'')}</td>`+
    `<td class="muted" title="${esc(t.sn||'')}">${esc(t.sn||'')}</td>`+
    `<td><span class="basetag ${baseTagClass(t.base)}">${BASE_LABEL[t.base]||t.base}</span></td>`+
    `<td class="num">${inter}</td>`+
    `<td class="num">${exec}</td>`+
    `<td class="num">${venc}</td>`+
    `<td class="num">${disp}</td>`+
    `<td>${calHtml}</td>`+
    `<td class="obscell">${obs}</td>`+
    `<td>${pill}</td>`+
    `<td class="act no-print"><button class="btn o sm" data-edit="${t.id}">✎</button></td>`;
  tr.querySelector('[data-edit]').addEventListener('click',()=>openModal(t.id));
  return tr;
}
function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

// ---------- FILTRO grupos ----------
function fillGroupFilters(){
  const gs=[...new Set(STATE.tarefas.map(t=>t.grupo))];
  const sel=$('#fgrupo'); const cur=sel.value;
  sel.innerHTML='<option value="">Todos os grupos</option>'+gs.map(g=>`<option>${esc(g)}</option>`).join('');
  sel.value=cur;
  $('#grupos').innerHTML=gs.map(g=>`<option value="${esc(g)}">`).join('');
}

// ---------- MODAL (edição/criação) ----------
let editingId=null;
function openModal(id){
  editingId=id;
  const t = id? STATE.tarefas.find(x=>x.id===id) : {base:'celula_horas'};
  $('#modalTitle').textContent = id? 'Editar tarefa' : 'Nova tarefa';
  $('#f_nome').value=t.nome||''; $('#f_grupo').value=t.grupo||'';
  $('#f_base').value=t.base||'celula_horas';
  $('#f_pn').value=t.pn||''; $('#f_sn').value=t.sn||'';
  $('#f_intervalo').value=t.intervalo!=null?t.intervalo:''; $('#f_exec').value=t.exec!=null?t.exec:'';
  $('#f_vencfixo').value=t.vencFixo!=null?t.vencFixo:'';
  $('#f_calmeses').value=t.cal&&t.cal.meses!=null?t.cal.meses:''; $('#f_calexec').value=t.cal&&t.cal.exec?t.cal.exec:'';
  $('#f_obs').value=t.obs||'';
  $('#btnDelete').style.display = id?'inline-block':'none';
  $('#overlay').classList.add('show');
}
function closeModal(){ $('#overlay').classList.remove('show'); editingId=null; }
function saveModal(){
  const rec={
    nome:$('#f_nome').value.trim(), grupo:($('#f_grupo').value.trim()||'Diversos'),
    base:$('#f_base').value, pn:$('#f_pn').value.trim(), sn:$('#f_sn').value.trim(),
    intervalo:num($('#f_intervalo').value), exec:num($('#f_exec').value), vencFixo:num($('#f_vencfixo').value),
    obs:$('#f_obs').value.trim(), motor:null
  };
  if(rec.base.startsWith('motor1')) rec.motor='motor1';
  else if(rec.base.startsWith('motor2')) rec.motor='motor2';
  const cm=num($('#f_calmeses').value), ce=$('#f_calexec').value;
  if(cm!=null && ce) rec.cal={meses:cm,exec:ce};
  if(!rec.nome){ toast('Informe a nomenclatura'); return; }
  if(editingId){ const i=STATE.tarefas.findIndex(x=>x.id===editingId); STATE.tarefas[i]=Object.assign({id:editingId},rec); }
  else { rec.id='t'+Date.now(); STATE.tarefas.push(rec); }
  closeModal(); fillGroupFilters(); renderTable(); saveAll();
}
function deleteTask(){
  if(!editingId) return;
  STATE.tarefas=STATE.tarefas.filter(x=>x.id!==editingId);
  closeModal(); fillGroupFilters(); renderTable(); saveAll();
}

// ---------- EXPORT / IMPORT ----------
function exportJSON(){
  const data={acmaps:STATE.acmaps,frota:STATE.frota,hoje:STATE.hoje,currentAC:STATE.currentAC};
  const blob=new Blob([JSON.stringify(data,null,1)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='JetFor_Mapas.json'; a.click();
}
function importJSON(file){
  const rd=new FileReader();
  rd.onload=()=>{ try{ const d=JSON.parse(rd.result);
    if(d.acmaps){ STATE.acmaps=d.acmaps; STATE.currentAC=(d.currentAC&&d.acmaps[d.currentAC])?d.currentAC:Object.keys(d.acmaps)[0]; STATE.contadores=cur().contadores; STATE.tarefas=cur().tarefas; }
    else { if(d.contadores) STATE.contadores=d.contadores; if(d.tarefas) STATE.tarefas=d.tarefas; }
    if(d.frota) STATE.frota=d.frota;
    if(d.hoje) STATE.hoje=d.hoje;
    buildMapaSubtabs(); renderAll(); if($('#view-inicio').dataset.done) drawFleet(); saveAll(); toast('✔ Importado');
  }catch(e){ toast('Arquivo inválido'); } };
  rd.readAsText(file);
}

// ---------- render tudo ----------
function renderAll(){ renderCounters(); fillGroupFilters(); renderTable(); }

// ---------- OBRIGAÇÕES MGM (seção referência) ----------
function renderObrig(){
  const F=window.JETFOR_FREQ; if(!F) return;
  const el=$('#view-obrig'); if(el.dataset.done) return;
  const yn = v => v==='SIM' ? '<span class="badge2 sim">SIM</span>' : v==='NÃO' ? '<span class="badge2 nao">NÃO</span>' : esc(v);
  const mk = v => (v==='✓') ? '<td class="c yes">✓</td>' : '<td class="c no">–</td>';

  // 1) Frota e enquadramento
  let frota = `<div class="panel"><h2><span class="tag">1</span> Frota e enquadramento SASC</h2><div class="pbody">
    <p class="lead">Classificação pela configuração de assentos certificada no TCDS (10+ assentos, excluindo piloto ⇒ RBAC 135.411(a)(2) ⇒ entra no SASC/PMAC).</p>
    <div class="tblwrap"><table class="ref"><thead><tr>${F.frotaHead.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>`;
  F.frota.forEach(r=>{ frota+=`<tr>${r.map((c,i)=> i===5?`<td>${yn(c)}</td>`:`<td>${esc(c)}</td>`).join('')}</tr>`; });
  frota+=`</tbody></table></div></div></div>`;

  // 2) Atividades e frequências (matriz por aeronave)
  const acCols=F.aircraft.map(a=>`<th style="writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;font-size:10px">${esc(a)}</th>`).join('');
  function ativBlock(title,rows){
    let h=`<tr class="subhdr"><td colspan="${5+F.aircraft.length}">${title}</td></tr>`;
    rows.forEach(r=>{ h+=`<tr><td class="c">${esc(r.n)}</td><td>${esc(r.atividade)}</td><td>${esc(r.freq)}</td>`+
      `<td>${esc(r.base)}</td><td>${esc(r.aplic)}</td>${r.marks.map(mk).join('')}</tr>`; });
    return h;
  }
  let ativ=`<div class="panel"><h2><span class="tag">2</span> Atividades e frequências — por aeronave</h2><div class="pbody">
    <p class="lead">Atividades gerais valem para toda a frota. As atividades do PMAC/SASC valem só para a frota SASC (10+ assentos): PR-ARN, Citation 550 e S550 (em inclusão).</p>
    <div class="tblwrap"><table class="ref matrix"><thead><tr>
      <th>Nº</th><th>Atividade</th><th>Frequência</th><th>Base normativa</th><th>Aplicabilidade</th>${acCols}
    </tr></thead><tbody>`;
  ativ+=ativBlock('ATIVIDADES GERAIS — TODA A FROTA',F.gerais);
  ativ+=ativBlock('ATIVIDADES SOMENTE DA FROTA SASC (10+ assentos)',F.sasc);
  ativ+=`</tbody></table></div></div></div>`;

  // 3) Aplicabilidade MGM (10 elementos PMAC)
  let aplic=`<div class="panel"><h2><span class="tag">3</span> Aplicabilidade — 10 elementos do PMAC no MGM</h2><div class="pbody">
    <div class="tblwrap"><table class="ref"><thead><tr><th>Elemento do PMAC</th><th>Capítulo do MGM</th><th>Base</th></tr></thead><tbody>`;
  F.aplic.forEach(r=>{ aplic+=`<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`; });
  aplic+=`</tbody></table></div></div></div>`;

  // 4) Metodologia
  let met=`<div class="panel"><h2><span class="tag">4</span> Metodologia e fases</h2><div class="pbody"><ul class="metod">`;
  F.metod.slice(1).forEach(l=>{ if(l && !l.startsWith('METODOLOGIA')) met+=`<li>${esc(l)}</li>`; });
  met+=`</ul></div></div>`;

  el.innerHTML = frota+ativ+aplic+met+
    `<p class="muted" style="font-size:11px;text-align:center">Fonte: MGM Rev 9.01 · IS 120-016 · RBAC 135.411/415/417 — documento de apoio, confira sempre a revisão vigente.</p>`;
  el.dataset.done='1';
}
// ---------- IIO (bloco detalhado, MGM 8.4.13) ----------
function iioHtml(){
  const I=window.JETFOR_IIO; if(!I) return '';
  let h=`<div class="comobox"><b>O que é IIO:</b> ${esc(I.definicao)}</div>`;
  h+=`<div class="iio-regra"><b>⚠ Regra de ouro:</b> ${esc(I.regraOuro)}</div>`;
  h+=`<div class="proc"><b>Códigos de requisito:</b><ul class="cods">`+
     I.codigos.map(c=>`<li><span class="cod">${esc(c.c)}</span> ${esc(c.t)}</li>`).join('')+`</ul></div>`;
  h+=`<div class="proc"><b>Lista de IIO por sistema (MGM 8.4.13 · Tabela 8.2):</b><div class="iiogrid">`;
  I.sistemas.forEach(s=>{
    h+=`<div class="iiosis"><div class="iiosis-t">${esc(s.sis)}</div>`+
       s.itens.map(it=>`<div class="iioitem"><span>${esc(it[0])}</span><span class="cod2">${esc(it[1])}</span></div>`).join('')+
       `</div>`;
  });
  h+=`</div></div>`;
  h+=`<div class="iio2col"><div class="iiobox nao"><b>❌ O que NÃO é IIO:</b><ul>`+
     I.naoIIO.map(x=>`<li>${esc(x)}</li>`).join('')+`</ul></div>`;
  h+=`<div class="iiobox sim"><b>✅ Vira IIO quando:</b><ul>`+
     I.viraIIO.map(x=>`<li>${esc(x)}</li>`).join('')+`</ul></div></div>`;
  return h;
}
function detalheAtiv(a){
  if(/\bIIO\b/.test(a.atv) && window.JETFOR_IIO) return iioHtml();
  if(a.comoHtml) return a.comoHtml;
  return `<div class="comobox"><b>Como fazer:</b> ${esc(a.como||'—')}</div>`;
}

// ---------- INÍCIO (Dashboard da frota) ----------
function drawFleet(){
  const fleet=STATE.frota||[], ats=window.JETFOR_DASH.atividades;
  const nS=fleet.filter(f=>f.sasc).length, nN=fleet.length-nS;
  const g=ats.filter(a=>a.escopo==='Geral').length, s=ats.length-g;
  $('#dashKpis').innerHTML=[['Aeronaves',fleet.length,''],['Frota SASC',nS,'sasc'],['Não-SASC',nN,'non'],['Ativ. gerais',g,''],['Ativ. SASC',s,'sasc']]
    .map(k=>`<div class="kpi2 ${k[2]}"><div class="n">${k[1]}</div><div class="l">${k[0]}</div></div>`).join('');
  $('#dashFleet').innerHTML=fleet.map((f,i)=>{
    const clic=f.mapa?'clik':'';
    return `<div class="ac ${f.sasc?'sasc':''} ${clic}" data-i="${i}">
      <div class="ac-top"><div class="mat">${esc(f.mat)}</div>
        <div class="ac-btns no-print"><button class="acbtn" data-edit="${i}" title="Editar">✎</button><button class="acbtn del" data-del="${i}" title="Remover">🗑</button></div></div>
      <div class="mod">${esc(f.modelo)}</div>
      <span class="badge ${f.sasc?'s':'n'}">${f.sasc?'SASC':'NÃO-SASC'}</span>
      <span class="badge n" style="background:#22406E">${esc(f.enq)}</span>
      <div class="row"><b>TCDS:</b> ${esc(f.tcds)}</div>
      <div class="row"><b>Assentos (excl. piloto):</b> ${esc(f.assentos)}</div>
      <div class="row">${esc(f.obs)}</div>
      ${f.mapa?`<div class="verMapa" data-map="${i}">Ver mapa de manutenção →</div>`:`<div class="row" style="color:#b0b6c0">Mapa em breve</div>`}
    </div>`;}).join('')+`<button class="ac addac no-print" id="btnAddAc">＋<br>Adicionar aeronave</button>`;
  const openFromCard=i=>{ const f=fleet[i]; if(f&&f.mapa) openMap(f.mapa); else switchView('mapa'); };
  $('#dashFleet').querySelectorAll('[data-map]').forEach(x=>x.addEventListener('click',e=>{e.stopPropagation();openFromCard(+x.dataset.map);}));
  $('#dashFleet').querySelectorAll('.ac.clik').forEach(card=>card.addEventListener('click',()=>openFromCard(+card.dataset.i)));
  $('#dashFleet').querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openAcModal(+b.dataset.edit);}));
  $('#dashFleet').querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();delAc(+b.dataset.del);}));
  $('#btnAddAc').addEventListener('click',()=>openAcModal(null));
}
function renderInicio(){
  const D=window.JETFOR_DASH; if(!D) return;
  if(!STATE.frota) STATE.frota=D.fleet.map(x=>Object.assign({},x));
  const el=$('#view-inicio'); if(el.dataset.done){ drawFleet(); return; }
  const ats=D.atividades;
  el.innerHTML=`
    <div class="kpis2" id="dashKpis"></div>
    <h2>Frota &amp; Enquadramento SASC</h2>
    <div class="fleet" id="dashFleet"></div>
    <h2>Atividades &amp; Frequências</h2>
    ${D.modeloOperacional?`<div class="modelobox"><b>Modelo operacional:</b> ${esc(D.modeloOperacional)}</div>`:''}
    <div class="filters">
      <select id="dEsc"><option value="">Escopo: todos</option><option value="Geral">Geral (toda a frota)</option><option value="SASC">Somente SASC</option></select>
      <select id="dResp"><option value="">Responsável: todos</option><option value="JetFor">JetFor (controle)</option><option value="Oficina 145">Oficina 145</option><option value="ambos">JetFor + Oficina</option></select>
      <select id="dFreq"></select>
      <input id="dBusca" placeholder="Buscar atividade ou norma..."/>
    </div>
    <div class="tblwrap"><table class="dash"><thead><tr><th style="width:38%">Atividade</th><th>Frequência</th><th>Base</th><th>Escopo</th><th>Responsável</th></tr></thead><tbody id="dTb"></tbody></table></div>
    <div class="note" id="dCount"></div>
    <div class="note"><b>Como ler:</b> atividades <span class="tag g">Geral</span> valem para toda a frota; <span class="tag s">SASC</span> só para aeronaves 10+ assentos. <b>Responsável:</b> <span class="rtag jf">JetFor</span> = controle/administração feito internamente; <span class="rtag of">Oficina 145</span> = execução física por oficina contratada; <span class="rtag amb">JetFor + Oficina</span> = JetFor controla e a oficina executa. Clique numa linha para ver o "como fazer".</div>`;
  drawFleet();
  // filtros atividades
  const freqs=[...new Set(ats.map(a=>a.freq))];
  $('#dFreq').innerHTML='<option value="">Frequência: todas</option>'+freqs.map(x=>`<option>${esc(x)}</option>`).join('');
  function respTag(resp){
    if(!resp) return '';
    const jf=resp.includes('JetFor'), of=resp.includes('Oficina');
    const cls = jf&&of?'amb':jf?'jf':'of';
    return `<span class="rtag ${cls}">${esc(resp)}</span>`;
  }
  function draw(){
    const esc_=$('#dEsc').value, fq=$('#dFreq').value, rf=$('#dResp').value, q=($('#dBusca').value||'').toLowerCase();
    const rows=ats.filter(a=>{
      if(esc_&&a.escopo!==esc_) return false;
      if(fq&&a.freq!==fq) return false;
      if(rf){
        if(rf==='ambos'){ if(!(a.resp&&a.resp.includes('JetFor')&&a.resp.includes('Oficina'))) return false; }
        else if(rf==='JetFor'){ if(a.resp!=='JetFor') return false; }
        else if(rf==='Oficina 145'){ if(a.resp!=='Oficina 145') return false; }
      }
      if(q&&!(a.atv.toLowerCase().includes(q)||a.base.toLowerCase().includes(q)||(a.resp||'').toLowerCase().includes(q))) return false;
      return true;
    });
    $('#dTb').innerHTML=rows.map((a,i)=>{
      const temComo=!!a.como;
      return `<tr class="atvrow ${temComo?'expandable':''}" data-i="${i}">
        <td><span class="caret">${temComo?'▸':''}</span>${esc(a.atv)}</td>
        <td class="freq">${esc(a.freq)}</td><td>${esc(a.base)}</td>
        <td><span class="tag ${a.escopo==='SASC'?'s':'g'}">${a.escopo}</span></td>
        <td>${respTag(a.resp)}</td></tr>
        <tr class="atvdet" data-di="${i}" style="display:none"><td colspan="5">
          ${detalheAtiv(a)}</td></tr>`;
    }).join('')||'<tr><td colspan="5" style="color:#999">Nenhuma atividade com esses filtros.</td></tr>';
    $('#dTb').querySelectorAll('tr.expandable').forEach(tr=>{
      tr.addEventListener('click',()=>{
        const i=tr.dataset.i, det=$('#dTb').querySelector(`tr.atvdet[data-di="${i}"]`);
        const open=det.style.display!=='none';
        det.style.display=open?'none':'';
        tr.classList.toggle('open',!open);
        const c=tr.querySelector('.caret'); if(c) c.textContent=open?'▸':'▾';
      });
    });
    $('#dCount').textContent=rows.length+' de '+ats.length+' atividades exibidas. Clique numa linha para ver como fazer.';
  }
  ['dEsc','dFreq','dResp'].forEach(id=>$('#'+id).addEventListener('change',draw));
  $('#dBusca').addEventListener('input',draw);
  draw();
  el.dataset.done='1';
}

// ---------- Sub-abas do MAPA: DA & Boletins (por aeronave) ----------
function renderMapaSheet(k){
  const DA=cur().da; if(!DA||!DA.sheets[k]) return;
  const sh=DA.sheets[k];
  let h=`<div class="panel"><h2><span class="tag">${esc(sh.title.split('—')[0].trim())}</span> ${esc(sh.title)} — ${esc(STATE.currentAC)}</h2><div class="pbody">`;
  if(sh.stale) h+=`<div class="stale">⚠ Esta aba veio do Excel com dados de <b>outra aeronave</b> (template). Substituir pelos boletins reais do S550 quando disponíveis.</div>`;
  if(sh.info&&sh.info.length) h+=`<p class="lead" style="margin-bottom:8px">${sh.info.map(esc).join(' · ')}</p>`;
  h+=`<div class="tblwrap"><table class="da"><thead><tr>${DA.cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>`;
  sh.rows.forEach(r=>{
    if(r.sec!==undefined){ h+=`<tr class="dasec"><td colspan="${DA.cols.length}">${esc(r.sec)}</td></tr>`; return; }
    h+=`<tr>${r.c.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`;
  });
  h+=`</tbody></table></div></div></div>`;
  $('#mapa-sheet').innerHTML=h;
}
function renderICA(){
  const ica=(STATE.tarefas||[]).filter(t=>t.categoria==='ica');
  let h=`<div class="panel"><h2><span class="tag">ICA</span> ICA / Grandes Modificações — ${esc(STATE.currentAC)}</h2><div class="pbody">`;
  if(!ica.length){ h+='<p class="lead">Nenhum item de ICA/Grandes Modificações nesta aeronave.</p></div></div>'; $('#mapa-sheet').innerHTML=h; return; }
  h+=`<div class="tblwrap"><table class="da"><thead><tr><th>#</th><th>Nomenclatura</th><th>P/N</th><th>Tipo</th><th class="num">Intervalo</th><th class="num">Vence</th><th class="num">Restante</th><th>Calendário</th><th>Obs</th><th>Status</th><th class="no-print">Ações</th></tr></thead><tbody>`;
  ica.forEach((t,i)=>{
    const c=compute(t); const unit=c.num?c.num.unit:'';
    const venc=c.num&&c.num.venc!=null?fmtN(c.num.venc,1)+' '+unit:'—';
    const disp=c.num&&c.num.disp!=null?`<span class="${c.num.disp<0?'disp-neg':''}">${fmtN(c.num.disp,1)} ${unit}</span>`:'—';
    let cal='—'; if(c.cal){const dd=c.cal.disp;cal=`${fmtDate(c.cal.venc)} <span class="${dd!=null&&dd<0?'disp-neg':''}">(${dd!=null?dd+'d':'—'})</span>`;}
    const inter=t.intervalo!=null?fmtN(t.intervalo,0)+(t.tipoVenc==='calendario'?'M':' '+unit):'—';
    const pill=`<span class="pill ${c.status}">${c.status==='od'?'VENCIDO':c.status==='wn'?'PRÓXIMO':'EM DIA'}</span>`;
    h+=`<tr class="${c.status}"><td class="nrcol">${i+1}</td><td>${esc(t.nome)}</td><td class="muted">${esc(t.pn||'')}</td>`+
       `<td><span class="basetag ${t.tipoVenc==='calendario'?'cal':''}">${TIPO_LABEL[t.tipoVenc]||t.tipoVenc}</span></td>`+
       `<td class="num">${inter}</td><td class="num">${venc}</td><td class="num">${disp}</td><td>${cal}</td>`+
       `<td class="obscell">${t.obs?esc(t.obs):'<span class=muted>—</span>'}</td><td>${pill}</td>`+
       `<td class="act no-print"><button class="btn o sm" data-edit="${esc(t.id)}">✎</button></td></tr>`;
  });
  h+=`</tbody></table></div></div></div>`;
  $('#mapa-sheet').innerHTML=h;
  $('#mapa-sheet').querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openModal(b.dataset.edit)));
}
function selectMapaSubtab(k){
  document.querySelectorAll('#mapaSubtabs .subtab').forEach(b=>b.classList.toggle('active',b.dataset.sheet===k));
  if(k==='mapa'){ $('#mapa-main').style.display=''; $('#mapa-sheet').style.display='none'; }
  else if(k==='ica'){ $('#mapa-main').style.display='none'; renderICA(); $('#mapa-sheet').style.display=''; }
  else if(k==='hist'){ $('#mapa-main').style.display='none'; renderHistoricoOS(); $('#mapa-sheet').style.display=''; }
  else { $('#mapa-main').style.display='none'; renderMapaSheet(k); $('#mapa-sheet').style.display=''; }
  window.scrollTo(0,0);
}
function buildMapaSubtabs(){
  const da=cur().da||{sheets:{}}; const bar=$('#mapaSubtabs');
  let h='<button class="subtab active" data-sheet="mapa">Mapa de Manutenção</button>';
  const temICA=(cur().tarefas||[]).some(t=>t.categoria==='ica');
  if(temICA) h+='<button class="subtab" data-sheet="ica">ICA / Grandes Modificações</button>';
  Object.keys(da.sheets||{}).forEach(k=>{ h+=`<button class="subtab" data-sheet="${k}">${esc(da.sheets[k].title||k)}</button>`; });
  h+='<button class="subtab" data-sheet="hist">Histórico de O.S.</button>';
  bar.innerHTML=h;
  bar.querySelectorAll('.subtab').forEach(b=>b.addEventListener('click',()=>selectMapaSubtab(b.dataset.sheet)));
}
// ---------- trocar de aeronave ----------
function openMap(ac){
  if(!ac || !STATE.acmaps[ac]){ switchView('mapa'); return; }
  STATE.currentAC=ac;
  const m=cur(); STATE.contadores=m.contadores; STATE.tarefas=m.tarefas;
  const a=m.aeronave||{};
  const label=`${a.matricula||ac} · ${a.modelo||''}${a.sn?' · S/N '+a.sn:''}`;
  $('#acbadge').textContent='✈ '+label;
  $('#acinfo').textContent=label+(a.ano?' · '+a.ano:'');
  buildMapaSubtabs();
  fillGroupFilters(); renderCounters(); renderTable();
  selectMapaSubtab('mapa');
  subscribeAC(ac);
  switchView('mapa');
}

// ---------- FROTA: adicionar / editar / remover ----------
let acEditIdx=null;
function openAcModal(i){
  acEditIdx=i;
  const f = (i!=null && STATE.frota[i]) ? STATE.frota[i] : {enq:'135.411(a)(1)'};
  $('#acTitle').textContent = i!=null ? 'Editar aeronave' : 'Adicionar aeronave';
  $('#ac_mat').value=f.mat||''; $('#ac_modelo').value=f.modelo||''; $('#ac_fab').value=f.fab||'';
  $('#ac_tcds').value=f.tcds||''; $('#ac_assentos').value=f.assentos||'';
  $('#ac_enq').value=f.enq||'135.411(a)(1)'; $('#ac_obs').value=f.obs||'';
  $('#ac_mapa').checked=!!f.mapa;
  $('#acDelete').style.display = i!=null ? 'inline-block':'none';
  $('#acOverlay').classList.add('show');
}
function closeAcModal(){ $('#acOverlay').classList.remove('show'); acEditIdx=null; }
function saveAcModal(){
  const enq=$('#ac_enq').value;
  const rec={
    mat:$('#ac_mat').value.trim()||'(sem matrícula)', modelo:$('#ac_modelo').value.trim(),
    fab:$('#ac_fab').value.trim(), tcds:$('#ac_tcds').value.trim()||'a levantar',
    assentos:$('#ac_assentos').value.trim(), enq:enq,
    sasc: enq.includes('(a)(2)'),
    obs:$('#ac_obs').value.trim(),
    mapa: $('#ac_mapa').checked ? ($('#ac_mat').value.trim()||'aeronave') : null
  };
  if(!rec.modelo){ toast('Informe o modelo'); return; }
  if(acEditIdx!=null) STATE.frota[acEditIdx]=Object.assign({},STATE.frota[acEditIdx],rec);
  else STATE.frota.push(rec);
  closeAcModal(); drawFleet(); saveAll();
}
function delAc(i){
  const f=STATE.frota[i]; if(!f) return;
  if(!window.confirm(`Remover a aeronave ${f.mat} (${f.modelo}) do escopo?`)) return;
  STATE.frota.splice(i,1); drawFleet(); saveAll(); toast('Aeronave removida');
}

// ---------- FORMULÁRIOS ----------
function renderForms(){
  const F=window.JETFOR_FORMS; if(!F) return;
  const el=$('#view-forms'); if(el.dataset.done) return;
  const tabs=F.ordem.map((k,i)=>`<button class="subtab ${i===0?'active':''}" data-form="${k}">${esc(F.itens[k].label)}</button>`).join('');
  const outros=F.outros.map(o=>`<a class="btn o sm" href="${o.url}" target="_blank" rel="noopener">${esc(o.nome)} ↗</a>`).join(' ');
  el.innerHTML=`<div class="panel"><div class="pbody">
    <div class="subtabs">${tabs}</div>
    <div class="formactions no-print">
      <button class="btn p sm" onclick="window.print()">🖨 Imprimir / Salvar PDF</button>
      <a class="btn g sm" id="dlDocx" href="#" download>⬇ Baixar modelo .docx</a>
      <span class="muted" style="font-size:11px">Preencha na tela e imprima/salve em PDF, ou baixe o modelo Word.</span>
    </div>
    <div id="formBody"></div>
    <div class="outros no-print"><b>Outros formulários (abrir no Drive):</b><div class="outros-links">${outros}</div>
      <span class="muted" style="font-size:11px">Versões preenchíveis destes entram nas próximas etapas.</span></div>
  </div></div>`;
  function show(k){
    const it=F.itens[k];
    el.querySelectorAll('.subtab').forEach(b=>b.classList.toggle('active',b.dataset.form===k));
    $('#formBody').innerHTML=it.build();
    const dl=$('#dlDocx');
    if(it.docx){
      dl.style.display=''; dl.href=it.docx;
      if(/^https?:/.test(it.docx)){ dl.target='_blank'; dl.removeAttribute('download'); dl.textContent='↗ Abrir modelo original (Drive)'; }
      else { dl.target=''; dl.setAttribute('download',''); dl.textContent='⬇ Baixar modelo .docx'; }
    } else dl.style.display='none';
  }
  el.querySelectorAll('.subtab').forEach(b=>b.addEventListener('click',()=>show(b.dataset.form)));
  show(F.ordem[0]);
  el.dataset.done='1';
}

function switchView(v){
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  $('#view-inicio').style.display = v==='inicio'?'':'none';
  $('#view-mapa').style.display = v==='mapa'?'':'none';
  $('#view-obrig').style.display = v==='obrig'?'':'none';
  $('#view-forms').style.display = v==='forms'?'':'none';
  if(v==='inicio') renderInicio();
  if(v==='obrig') renderObrig();
  if(v==='forms') renderForms();
  window.scrollTo(0,0);
}

// ---------- boot ----------
function clone(x){ return JSON.parse(JSON.stringify(x)); }
function boot(){
  const seed = window.JETFOR_SEED;
  $('#logo').src = seed.logo;
  const local = loadLocal();
  const acmaps = (local&&local.acmaps) || clone(window.JETFOR_ACMAPS||{});
  const currentAC = (local&&local.currentAC && acmaps[local.currentAC]) ? local.currentAC : 'PT-LJQ';
  STATE = {
    acmaps: acmaps,
    currentAC: currentAC,
    contadores: acmaps[currentAC].contadores,
    tarefas: acmaps[currentAC].tarefas,
    hoje: (local&&local.hoje) || todayISO(),
    frota: (local&&local.frota) || (window.JETFOR_DASH? window.JETFOR_DASH.fleet.map(x=>Object.assign({},x)) : []),
    osProx: (local&&local.osProx) || {}
  };
  const a=acmaps[currentAC].aeronave||{};
  const label=`${a.matricula||currentAC} · ${a.modelo||''}${a.sn?' · S/N '+a.sn:''}`;
  $('#acinfo').textContent=label+(a.ano?' · '+a.ano:'');
  if($('#acbadge')) $('#acbadge').textContent='✈ '+label;
  buildMapaSubtabs();
  renderAll();
  renderInicio();   // página inicial (dashboard) é a padrão
  initFirebase();

  // eventos
  $('#q').addEventListener('input',renderTable);
  $('#fgrupo').addEventListener('change',renderTable);
  $('#fstatus').addEventListener('change',renderTable);
  $('#hoje').addEventListener('change',e=>{ STATE.hoje=e.target.value; renderTable(); saveLocalDebounced(); });
  $('#btnAdd').addEventListener('click',()=>openModal(null));
  $('#btnOk').addEventListener('click',saveModal);
  $('#btnCancel').addEventListener('click',closeModal);
  $('#btnDelete').addEventListener('click',deleteTask);
  $('#btnSave').addEventListener('click',saveAll);
  $('#btnExport').addEventListener('click',exportJSON);
  $('#chkAll').addEventListener('change',e=>{ document.querySelectorAll('#tbl .rowchk').forEach(cb=>cb.checked=e.target.checked); updateOSsel(); });
  $('#btnOS').addEventListener('click',gerarOS);
  $('#osClose').addEventListener('click',()=>{ $('#osOverlay').classList.remove('show'); document.body.classList.remove('osopen'); });
  $('#osReg').addEventListener('click',registrarOS);
  $('#osOverlay').addEventListener('click',e=>{ if(e.target.id==='osOverlay'){ $('#osOverlay').classList.remove('show'); document.body.classList.remove('osopen'); } });
  $('#btnImport').addEventListener('click',()=>$('#fileImport').click());
  $('#fileImport').addEventListener('change',e=>{ if(e.target.files[0]) importJSON(e.target.files[0]); e.target.value=''; });
  $('#overlay').addEventListener('click',e=>{ if(e.target.id==='overlay') closeModal(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal(); });
  document.querySelectorAll('.navbtn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
  /* sub-abas do mapa são ligadas dinamicamente em buildMapaSubtabs() */
  $('#acOk').addEventListener('click',saveAcModal);
  $('#acCancel').addEventListener('click',closeAcModal);
  $('#acDelete').addEventListener('click',()=>{ if(acEditIdx!=null){ const i=acEditIdx; closeAcModal(); delAc(i); } });
  $('#acOverlay').addEventListener('click',e=>{ if(e.target.id==='acOverlay') closeAcModal(); });
}
document.addEventListener('DOMContentLoaded',boot);
