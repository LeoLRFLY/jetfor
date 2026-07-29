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
  helice_horas:'Hélice · h', calendario:'Calendário'
};
const BASE_UNIT = {
  celula_horas:'h', motor1_horas:'h', motor2_horas:'h', helice_horas:'h',
  celula_pousos:'pou', motor1_pousos:'pou', motor2_pousos:'pou',
  celula_ciclos:'cic', motor1_ciclos:'cic', motor2_ciclos:'cic'
};
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
    const unit = BASE_UNIT[task.base] || 'h';
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

// ---------- PERSISTÊNCIA ----------
function saveLocal(){ try{ localStorage.setItem(LSKEY, JSON.stringify(stripState())); }catch(e){} }
function loadLocal(){ try{ const s=localStorage.getItem(LSKEY); return s?JSON.parse(s):null; }catch(e){ return null; } }
function stripState(){ return { aeronave:STATE.aeronave, contadores:STATE.contadores, tarefas:STATE.tarefas, hoje:STATE.hoje }; }

async function saveAll(){
  saveLocal();
  if(ONLINE && DOCREF){
    try{
      SUPPRESS=true;
      await DOCREF.set(Object.assign(stripState(),{updatedAt:new Date().toISOString()}));
      SUPPRESS=false;
      toast('✔ Salvo no Firebase (nuvem)');
    }catch(e){ SUPPRESS=false; toast('⚠ Erro ao salvar na nuvem — salvo local'); console.error(e); }
  } else {
    toast('✔ Salvo neste navegador');
  }
}

// ---------- FIREBASE ----------
function initFirebase(){
  const cfg = window.FIREBASE_CONFIG || {};
  if(!cfg.apiKey || !cfg.projectId){ setBadge(false); return; }
  try{
    firebase.initializeApp(cfg);
    DB = firebase.firestore();
    DOCREF = DB.collection(window.FIRESTORE_COLECAO||'mapas').doc(window.FIRESTORE_DOC||'PT-LJQ');
    ONLINE = true; setBadge(true);
    DOCREF.get().then(snap=>{
      if(!snap.exists){ DOCREF.set(Object.assign(stripState(),{updatedAt:new Date().toISOString()})); }
    });
    DOCREF.onSnapshot(snap=>{
      if(SUPPRESS) return;
      const d=snap.data(); if(!d) return;
      STATE.aeronave=d.aeronave||STATE.aeronave;
      STATE.contadores=d.contadores||STATE.contadores;
      STATE.tarefas=d.tarefas||STATE.tarefas;
      if(d.hoje) STATE.hoje=d.hoje;
      renderAll();
    });
  }catch(e){ console.error(e); ONLINE=false; setBadge(false); }
}
function setBadge(on){
  const b=$('#connBadge');
  if(on){ b.className='badge on'; b.textContent='● Firebase conectado'; }
  else  { b.className='badge off'; b.textContent='● Local (sem nuvem)'; }
}

// ---------- CONTADORES (render) ----------
const COUNTER_GROUPS = [
  {key:'celula', dot:'#14284B', title:'Célula (Aeronave)',
   fields:[['celula_horas','Horas'],['celula_pousos','Pousos'],['celula_ciclos','Ciclos']]},
  {key:'motor1', dot:'#1c5bb8', title:'Motor 1 (LH)',
   fields:[['motor1_horas','Horas'],['motor1_ciclos','Ciclos']], note:'motor1'},
  {key:'motor2', dot:'#b8631c', title:'Motor 2 (RH)',
   fields:[['motor2_horas','Horas'],['motor2_ciclos','Ciclos']], note:'motor2'},
  {key:'helice', dot:'#6b3fa0', title:'Hélice',
   fields:[['helice_horas','Horas']], note:'helice'},
];
function renderCounters(){
  const g=$('#cgrid'); g.innerHTML='';
  const info = STATE.contadoresInfo||{};
  COUNTER_GROUPS.forEach(grp=>{
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

  order.forEach(gname=>{
    const rows=byG[gname];
    const visible=[];
    rows.forEach(t=>{
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
    gr.innerHTML=`<td colspan="12">${gname}</td>`; tb.appendChild(gr);
    visible.forEach(([t,c])=>tb.appendChild(rowEl(t,c)));
  });

  // KPIs
  $('#kpis').innerHTML =
    `<span class="kpi all">Total ${counts.all}</span>`+
    `<span class="kpi od">🔴 ${counts.od}</span>`+
    `<span class="kpi wn">🟠 ${counts.wn}</span>`+
    `<span class="kpi ok">🟢 ${counts.ok}</span>`;
}

function baseTagClass(base){
  if(base&&base.startsWith('motor1')) return 'm1';
  if(base&&base.startsWith('motor2')) return 'm2';
  if(base==='calendario') return 'cal';
  return '';
}
function rowEl(t,c){
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
    `<td>${esc(t.nome)}</td>`+
    `<td class="muted">${esc(t.pn||'')}</td>`+
    `<td class="muted">${esc(t.sn||'')}</td>`+
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
  const blob=new Blob([JSON.stringify(stripState(),null,1)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='JetFor_Mapa_PT-LJQ.json'; a.click();
}
function importJSON(file){
  const rd=new FileReader();
  rd.onload=()=>{ try{ const d=JSON.parse(rd.result);
    if(d.contadores) STATE.contadores=d.contadores;
    if(d.tarefas) STATE.tarefas=d.tarefas;
    if(d.aeronave) STATE.aeronave=d.aeronave;
    if(d.hoje) STATE.hoje=d.hoje;
    renderAll(); saveAll(); toast('✔ Importado');
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
function switchView(v){
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  $('#view-mapa').style.display = v==='mapa'?'':'none';
  $('#view-obrig').style.display = v==='obrig'?'':'none';
  if(v==='obrig') renderObrig();
  window.scrollTo(0,0);
}

// ---------- boot ----------
function boot(){
  const seed = window.JETFOR_SEED;
  $('#logo').src = seed.logo;
  const local = loadLocal();
  STATE = {
    aeronave: seed.aeronave,
    contadores: (local&&local.contadores) || seed.contadores,
    contadoresInfo: seed.contadoresInfo,
    tarefas: (local&&local.tarefas) || seed.tarefas,
    hoje: (local&&local.hoje) || todayISO()
  };
  $('#acinfo').textContent = `${seed.aeronave.matricula} · ${seed.aeronave.modelo} · S/N ${seed.aeronave.sn} · ${seed.aeronave.ano}`;
  renderAll();
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
  $('#btnImport').addEventListener('click',()=>$('#fileImport').click());
  $('#fileImport').addEventListener('change',e=>{ if(e.target.files[0]) importJSON(e.target.files[0]); e.target.value=''; });
  $('#overlay').addEventListener('click',e=>{ if(e.target.id==='overlay') closeModal(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal(); });
  document.querySelectorAll('.navbtn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
}
document.addEventListener('DOMContentLoaded',boot);
