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
  motor1_tsn:'Motor 1 · TSN', motor1_tso:'Motor 1 · TSO', motor1_csn:'Motor 1 · CSN', motor1_cso:'Motor 1 · CSO',
  motor2_tsn:'Motor 2 · TSN', motor2_tso:'Motor 2 · TSO', motor2_csn:'Motor 2 · CSN', motor2_cso:'Motor 2 · CSO',
  helice1_tsn:'Hélice 1 · TSN', helice1_tso:'Hélice 1 · TSO', helice2_tsn:'Hélice 2 · TSN', helice2_tso:'Hélice 2 · TSO',
  // legados (mantidos p/ compatibilidade de exibição)
  motor1_horas:'Motor 1 · h', motor1_ciclos:'Motor 1 · ciclos', motor2_horas:'Motor 2 · h', motor2_ciclos:'Motor 2 · ciclos',
  helice1_horas:'Hélice 1 · h', helice2_horas:'Hélice 2 · h', helice_horas:'Hélice · h', calendario:'Calendário'
};
function baseUnit(base){
  if(!base||base==='calendario') return '';
  if(base.endsWith('_pousos')) return 'pou';
  if(base.endsWith('_ciclos')||base.endsWith('_csn')||base.endsWith('_cso')) return 'cic';
  return 'h';   // horas, TSN, TSO
}
const CAT_LABEL={celula:'Célula',motor:'Motor',helice:'Hélice',ica:'ICA'};
const TIPO_LABEL={horas:'Horas',ciclos:'Ciclos',pousos:'Pousos',calendario:'Calendário',oc:'OC',na:'N/A'};
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
function compute(task){ return computeWith(task, STATE.contadores, STATE.hoje||todayISO()); }
function computeWith(task, CT, hoje){
  CT = CT||{}; hoje = hoje||todayISO();
  const r = { num:null, cal:null, status:'ok' };
  // parte numérica (horas/pousos/ciclos)
  if(task.base && task.base!=='calendario'){
    const counter = CT[task.base];
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
    const dd = daysBetween(hoje, vd);
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
function saveLocal(){ try{ localStorage.setItem('jetfor_mapa_v2', JSON.stringify({acmaps:STATE.acmaps,frota:STATE.frota,hoje:STATE.hoje,currentAC:STATE.currentAC,osProx:STATE.osProx,docsGeral:STATE.docsGeral,docCatsGeral:STATE.docCatsGeral,oficinas:STATE.oficinas,confiab:STATE.confiab})); }catch(e){} }
function loadLocal(){ try{ const s=localStorage.getItem('jetfor_mapa_v2'); return s?JSON.parse(s):null; }catch(e){ return null; } }
function acDoc(ac){ return DB.collection(window.FIRESTORE_COLECAO||'mapas').doc(ac); }

async function saveAll(){
  saveLocal();
  if(ONLINE && DB){
    try{
      SUPPRESS=true;
      const m=cur();
      await acDoc(STATE.currentAC).set({aeronave:m.aeronave,contadores:m.contadores,tarefas:m.tarefas,da:m.da,osHistorico:(m.osHistorico||[]),docs:(m.docs||[]),docCatsExtra:(m.docCatsExtra||[]),grupos:(m.grupos||[]),updatedAt:new Date().toISOString()});
      await acDoc('_geral').set({frota:STATE.frota,hoje:STATE.hoje,osProx:(STATE.osProx||{}),docsGeral:(STATE.docsGeral||[]),docCatsGeral:(STATE.docCatsGeral||[]),updatedAt:new Date().toISOString()});
      await acDoc('_oficinas').set({oficinas:(STATE.oficinas||[]),updatedAt:new Date().toISOString()});
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
      if(!snap.exists){ acDoc('_geral').set({frota:STATE.frota,hoje:STATE.hoje,osProx:(STATE.osProx||{}),docsGeral:(STATE.docsGeral||[]),updatedAt:new Date().toISOString()}); }
      else { const d=snap.data()||{}; if(d.osProx) STATE.osProx=d.osProx; if(d.docsGeral) STATE.docsGeral=d.docsGeral; if(d.docCatsGeral) STATE.docCatsGeral=d.docCatsGeral; if(Array.isArray(d.confiab)) STATE.confiab=d.confiab; if(d.frota){ STATE.frota=d.frota; if($('#view-inicio').dataset.done) drawFleet(); } if($('#view-geral') && $('#view-geral').style.display!=='none') renderDocsGeral(); const cv=$('#view-confiab'); if(cv && cv.style.display!=='none') renderConfiabList(); }
    }).catch(()=>{});
    acDoc('_oficinas').get().then(snap=>{
      if(snap.exists){ const d=snap.data()||{}; if(d.oficinas){ STATE.oficinas=d.oficinas; if($('#view-oficinas').style.display!=='none') renderOficinas(); } }
    }).catch(()=>{});
    initStorage();
    seedAllAC();
    subscribeAC(STATE.currentAC);
  }catch(e){ console.error(e); ONLINE=false; setBadge(false); }
}
// grava no Firestore o doc completo de CADA aeronave que ainda não existe na nuvem
function seedAllAC(){
  if(!ONLINE||!DB) return;
  Object.keys(STATE.acmaps||{}).forEach(ac=>{
    acDoc(ac).get().then(snap=>{
      if(!snap.exists){
        const m=STATE.acmaps[ac];
        acDoc(ac).set({aeronave:m.aeronave,contadores:m.contadores,tarefas:m.tarefas,da:m.da,osHistorico:(m.osHistorico||[]),updatedAt:new Date().toISOString()})
          .catch(e=>console.error('seed '+ac,e));
      } else if(ac!==STATE.currentAC){
        // carrega os dados reais (contadores + baixas) das OUTRAS aeronaves p/ o status do card ficar correto
        const d=snap.data()||{}; const m=STATE.acmaps[ac]; if(!m) return;
        if(d.contadores) m.contadores=d.contadores;
        if(d.tarefas) m.tarefas=d.tarefas;
        if(d.da) m.da=d.da;
        migrateEngineCounters(m); applyFullRebuild(m,ac); reclassIca(m); applyTaskPatch(m,ac); reclassGroups(m,ac);
        if($('#view-inicio').dataset.done) drawFleet();
      }
    }).catch(e=>console.error('seed get '+ac,e));
  });
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
    if(d.docs) m.docs=d.docs;
    if(d.docCatsExtra) m.docCatsExtra=d.docCatsExtra;
    if(d.grupos) m.grupos=d.grupos;
    migrateEngineCounters(m); applyFullRebuild(m,ac); reclassIca(m); applyTaskPatch(m,ac); reclassGroups(m,ac);
    if(ac===STATE.currentAC){ STATE.contadores=m.contadores; STATE.tarefas=m.tarefas; renderCounters(); renderTable(); }
  });
}
function setBadge(on){
  const b=$('#connBadge');
  if(on){ b.className='badge on'; b.textContent='● Firebase conectado'; }
  else  { b.className='badge off'; b.textContent='● Local (sem nuvem)'; }
}

// ---------- CONTADORES (render) — grupos derivados do cadastro (nº motores/hélices) ----------
// ---------- migração: motor TSN/TSO/CSN/CSO, hélice TSN/TSO ----------
function remapEngineBase(base,t){
  if(!base) return base;
  const txt=(((t&&t.nome)||'')+' '+((t&&t.grupo)||'')).toUpperCase();
  const ov=/OVERHAUL|\bHSI\b|HOT\s*SECTION|\bMINOR\b|\bMAJOR\b|\bTBO\b|REV\.?\s*GERAL|REVIS[ÃA]O\s*GERAL/.test(txt);
  let m;
  if((m=/^motor(\d+)_horas$/.exec(base))) return 'motor'+m[1]+'_'+(ov?'tso':'tsn');
  if((m=/^motor(\d+)_ciclos$/.exec(base))) return 'motor'+m[1]+'_'+(ov?'cso':'csn');
  if((m=/^motor(\d+)_pousos$/.exec(base))) return 'motor'+m[1]+'_tsn';
  if((m=/^helice(\d+)_horas$/.exec(base))) return 'helice'+m[1]+'_'+(ov?'tso':'tsn');
  if((m=/^helice(\d+)_ciclos$/.exec(base))) return 'helice'+m[1]+'_'+(ov?'tso':'tsn');
  return base;
}
function migrateEngineCounters(m){
  if(!m) return;
  const c = m.contadores = m.contadores || {};
  for(let i=1;i<=4;i++){
    const mh=c['motor'+i+'_horas'], mc=c['motor'+i+'_ciclos'], hh=c['helice'+i+'_horas'];
    if(mh!=null){ if(c['motor'+i+'_tsn']==null) c['motor'+i+'_tsn']=mh; if(c['motor'+i+'_tso']==null) c['motor'+i+'_tso']=mh; }
    if(mc!=null){ if(c['motor'+i+'_csn']==null) c['motor'+i+'_csn']=mc; if(c['motor'+i+'_cso']==null) c['motor'+i+'_cso']=mc; }
    if(hh!=null){ if(c['helice'+i+'_tsn']==null) c['helice'+i+'_tsn']=hh; if(c['helice'+i+'_tso']==null) c['helice'+i+'_tso']=hh; }
  }
  (m.tarefas||[]).forEach(t=>{ if(t && t.base) t.base=remapEngineBase(t.base,t); });
}
function migrateAllEngineCounters(){ Object.keys(STATE.acmaps||{}).forEach(k=>migrateEngineCounters(STATE.acmaps[k])); }
function normName(s){ s=(s==null?'':String(s)).toUpperCase(); try{ s=s.normalize('NFD').replace(/[̀-ͯ]/g,''); }catch(e){} return s.replace(/\s+/g,' ').trim(); }
// ICA vira grupo no mapa (categoria normal, preserva grupo com o nome da ICA)
function reclassIca(m){
  (m.tarefas||[]).forEach(t=>{ if(t && t.categoria==='ica'){
    t.categoria = (t.base&&t.base.indexOf('motor')===0)?'motor':((t.base&&t.base.indexOf('helice')===0)?'helice':'celula');
  }});
}
// adiciona itens faltantes do patch SEM tocar nos existentes (preserva baixas)
function applyTaskPatch(m, ac){
  if(!window.JETFOR_PATCH || !window.JETFOR_PATCH[ac]) return;
  m.tarefas = m.tarefas || [];
  const have = new Set(m.tarefas.map(t=>normName(t.nome)));
  window.JETFOR_PATCH[ac].forEach(pt=>{ const kn=normName(pt.nome); if(!have.has(kn)){ m.tarefas.push(JSON.parse(JSON.stringify(pt))); have.add(kn); } });
}
// corrige APENAS a organização (grupo + lado LH/RH + categoria + base do contador)
// sem tocar em execução/cal/histórico/obs → preserva 100% das baixas. Idempotente.
function reclassGroups(m, ac){
  if(!window.JETFOR_RECLASS || !window.JETFOR_RECLASS[ac]) return;
  const map = window.JETFOR_RECLASS[ac];
  const c = m.contadores = m.contadores || {};
  let usesH2=false;
  (m.tarefas||[]).forEach(t=>{
    if(!t) return;
    const fix = map[normName(t.nome)];
    if(!fix) return;
    if(fix.grupo!=null)     t.grupo = fix.grupo;
    if(fix.categoria!=null) t.categoria = fix.categoria;
    if(fix.unidade!==undefined) t.unidade = fix.unidade;
    if(fix.base!=null)      t.base = fix.base;   // ex.: helice2_tsn
    if(fix.base && /^helice2_/.test(fix.base)) usesH2=true;
  });
  // garante contador da Hélice 2 (mesma referência da Hélice 1 / célula)
  if(usesH2){
    const ref = c.helice1_tsn!=null?c.helice1_tsn:(c.celula_horas!=null?c.celula_horas:null);
    if(ref!=null){ if(c.helice2_tsn==null) c.helice2_tsn=ref; if(c.helice2_tso==null) c.helice2_tso=ref; if(c.helice2_horas==null) c.helice2_horas=ref; }
  }
}
// reconstrói o mapa IDÊNTICO ao Excel (window.JETFOR_FULL[ac]) preservando as baixas do usuário.
// Substitui m.tarefas pela lista fiel; transfere exec/cal/obs/hist de quem já tem baixa (por nome + ordem de ocorrência).
function applyFullRebuild(m, ac){
  if(!window.JETFOR_FULL || !window.JETFOR_FULL[ac]) return;
  const target = window.JETFOR_FULL[ac];
  const cur = m.tarefas || [];
  const byName = {};
  cur.forEach(t=>{ const k=normName(t.nome); (byName[k]=byName[k]||[]).push(t); });
  m.tarefas = target.map((it,idx)=>{
    const nt = JSON.parse(JSON.stringify(it));
    if(nt.id==null) nt.id = ac+'-F'+idx;
    const k = normName(it.nome);
    const q = byName[k];
    const match = q && q.length ? q.shift() : null;
    if(match){
      // ESTRUTURA vem da full (Excel); ESTADO DE CUMPRIMENTO (baixas do usuário) vem do banco,
      // com ou sem histórico — assim nenhuma baixa se perde.
      if(match.exec!=null && match.exec!=='' && nt.base && nt.base!=='calendario') nt.exec = num(match.exec);
      if(match.vencFixo!=null && match.vencFixo!=='' && nt.vencFixo!=null) nt.vencFixo = num(match.vencFixo);
      if(match.cal && match.cal.exec){ nt.cal = { meses:(nt.cal&&nt.cal.meses!=null)?nt.cal.meses:(match.cal.meses!=null?match.cal.meses:null), exec:match.cal.exec }; }
      if(match.obs) nt.obs = match.obs;
      if(Array.isArray(match.hist) && match.hist.length) nt.hist = match.hist;
    }
    return nt;
  });
  // preserva itens que existiam no banco e NÃO estão na planilha (criados/editados pelo usuário) — nada some
  Object.keys(byName).forEach(k=>{ (byName[k]||[]).forEach(extra=>{ if(extra) m.tarefas.push(extra); }); });
}
function migrateMapsFull(){ Object.keys(STATE.acmaps||{}).forEach(ac=>{ const m=STATE.acmaps[ac]; migrateEngineCounters(m); applyFullRebuild(m,ac); reclassIca(m); applyTaskPatch(m,ac); reclassGroups(m,ac); }); }
function buildCounterGroups(){
  const ac = (cur()&&cur().aeronave)||{};
  const nM = ac.nMotores!=null? ac.nMotores : 2;
  const nH = ac.nHelices!=null? ac.nHelices : 0;
  const groups=[{key:'celula',dot:'#14284B',title:'Célula (Aeronave)',fields:[['celula_horas','Horas'],['celula_pousos','Pousos'],['celula_ciclos','Ciclos']]}];
  const mcols=['#1c5bb8','#b8631c','#2E7D32','#8a3ffa'];
  for(let i=1;i<=nM;i++) groups.push({key:'motor'+i,dot:mcols[(i-1)%4],title:'Motor '+i,fields:[['motor'+i+'_tsn','TSN (h)'],['motor'+i+'_tso','TSO (h)'],['motor'+i+'_csn','CSN'],['motor'+i+'_cso','CSO']]});
  for(let i=1;i<=nH;i++) groups.push({key:'helice'+i,dot:'#6b3fa0',title:'Hélice '+i,fields:[['helice'+i+'_tsn','TSN (h)'],['helice'+i+'_tso','TSO (h)']]});
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
  // resumo compacto (mostrado quando os contadores estão recolhidos)
  const rz=$('#ctResumo'); if(rz){ const C=STATE.contadores||{}; const p=[];
    if(C.celula_horas!=null) p.push(fmtN(C.celula_horas,1)+' h');
    if(C.celula_pousos!=null) p.push(fmtN(C.celula_pousos,0)+' pousos');
    if(C.celula_ciclos!=null) p.push(fmtN(C.celula_ciclos,0)+' ciclos');
    rz.textContent = p.length? ('✈ '+p.join(' · ')) : '';
  }
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
    gr.innerHTML=`<td colspan="14"><span class="grpname">${esc(gname)}</span> <button class="btn o sm no-print grpedit" data-g="${esc(gname)}" title="renomear grupo">✎</button> <button class="btn o sm no-print grpdel" data-g="${esc(gname)}" title="remover grupo">🗑</button></td>`; tb.appendChild(gr);
    visible.forEach(([t,c])=>{ nr++; tb.appendChild(rowEl(t,c,nr)); });
  });
  // seleção / O.S.
  const chkAll=$('#chkAll'); if(chkAll) chkAll.checked=false;
  tb.querySelectorAll('.rowchk').forEach(cb=>cb.addEventListener('change',updateOSsel));
  tb.querySelectorAll('.grpedit').forEach(b=>b.addEventListener('click',e=>{ e.stopPropagation(); renomearGrupo(b.dataset.g); }));
  tb.querySelectorAll('.grpdel').forEach(b=>b.addEventListener('click',e=>{ e.stopPropagation(); removerGrupo(b.dataset.g); }));
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
  const b=$('#btnOS');
  if(b){ $('#osCount').textContent=n; b.style.display = n>0 ? '' : 'none'; }
  const bx=$('#btnBaixa');
  if(bx){ $('#baixaCount').textContent=n; bx.style.display = n>0 ? '' : 'none'; }
}
// ---------- DAR BAIXA EM MASSA ----------
function openBaixa(){
  const ids=selectedIds(); if(!ids.length){ toast('Selecione tarefas'); return; }
  const groups=buildCounterGroups();
  const hoje=STATE.hoje||todayISO();
  let rd='';
  groups.forEach(g=>{
    rd+=`<div class="bxgroup"><div class="ctitle"><span class="dot" style="background:${g.dot}"></span>${g.title}</div><div class="bxfields">`;
    g.fields.forEach(([k,lab])=>{ const v=STATE.contadores[k]!=null?STATE.contadores[k]:''; rd+=`<label class="bxfield">${lab}<input type="number" step="any" data-bx="${k}" value="${v}"></label>`; });
    rd+='</div></div>';
  });
  $('#baixaBody').innerHTML=`
    <p class="lead"><b>${ids.length}</b> tarefa(s) selecionada(s). Informe a data e as leituras dos contadores no momento da execução — cada tarefa recebe a leitura correspondente à sua base e o VENC/DISP é recalculado.</p>
    <table class="ff"><tr><th>Data da execução</th><td><input type="date" id="bxData" value="${hoje}" style="width:150px"></td>
      <th>Oficina executante</th><td><input id="bxRef" placeholder="Ex.: USA - Uirapuru (vai p/ Observações)"></td></tr></table>
    <div class="fsec">Leituras dos contadores na execução</div>
    <div class="bxgrid">${rd}</div>`;
  $('#baixaOverlay').classList.add('show');
}
function closeBaixa(){ $('#baixaOverlay').classList.remove('show'); }
function aplicarBaixa(){
  const ids=selectedIds(); if(!ids.length){ closeBaixa(); return; }
  const root=$('#baixaBody');
  const dEl=root.querySelector('#bxData'); const data=(dEl?dEl.value.trim():'')||todayISO();
  const ref=(root.querySelector('#bxRef')||{}).value||'';
  const readings={}; root.querySelectorAll('[data-bx]').forEach(i=>{ readings[i.dataset.bx]=num(i.value); });
  const m=cur(); let n=0, skip=0;
  ids.forEach(id=>{
    const t=m.tarefas.find(x=>x.id===id); if(!t) return;
    let upd=false, leitura=null;
    if(t.base && t.base!=='calendario' && t.intervalo!=null && readings[t.base]!=null){ t.exec=readings[t.base]; leitura=readings[t.base]; upd=true; }
    if(t.cal){ t.cal.exec=data; upd=true; }
    if(ref){ t.obs=ref; }   // oficina executante vai para o campo Observações
    if(upd){ t.hist=t.hist||[]; t.hist.push({data:data, oficina:ref||'', leitura:leitura, base:t.base, cal:!!t.cal}); n++; } else skip++;
  });
  saveAll(); renderTable();
  toast('✔ Baixa aplicada em '+n+' tarefa(s)'+(skip?' ('+skip+' sem intervalo/calendário — não alteradas)':''));
  closeBaixa();
  document.querySelectorAll('#tbl .rowchk:checked').forEach(c=>c.checked=false);
  const ca=$('#chkAll'); if(ca) ca.checked=false; updateOSsel();
}
function osNextLabel(){
  const y=(STATE.hoje||todayISO()).slice(0,4);
  const map=STATE.osProx||{}; const n=map[y]!=null?map[y]:(y==='2026'?10:1);
  return {y,n,label:String(n).padStart(3,'0')+'/'+y};
}
// ---------- O.S.: modelo de dados + formulário padrão (novo/editar) ----------
let OSCUR=null, OSCTX={mode:'novo',idx:-1};
function osBuildFromSelection(){
  const m=cur(); const a=m.aeronave||{}; const C=m.contadores||{};
  const ids=selectedIds(); const items=ids.map(id=>m.tarefas.find(t=>t.id===id)).filter(Boolean);
  const g=v=>v!=null?fmtN(v,1):'';
  const nM=2, nH=2; // modelo padrão sempre traz Motor 1/2 e Hélice 1/2 (hélice em branco no jato)
  const iso=STATE.hoje||todayISO();
  const d={
    numero:osNextLabel().label,
    dataISO:iso,
    dataAberturaBR:new Date(iso+'T00:00:00').toLocaleDateString('pt-BR'),
    oficina:'', matricula:(a.matricula||STATE.currentAC), sn:(a.sn||''), nM:nM, nH:nH,
    aer:{tsn:g(C.celula_horas),tso:'',pousos:g(C.celula_pousos),csn:g(C.celula_ciclos),cso:''},
    mot:[], hel:[],
    servicos:items.map(t=>esc0(t.nome)+(t.pn?' — P/N '+t.pn:'')+(t.sn?' · S/N '+t.sn:'')),
    execNum:'', execData:''
  };
  const cv=k=>C[k]!=null?C[k]:null;
  for(let i=1;i<=nM;i++) d.mot.push({pn:'',sn:'',tsn:g(cv('motor'+i+'_tsn')!=null?cv('motor'+i+'_tsn'):cv('motor'+i+'_horas')),tso:g(cv('motor'+i+'_tso')),csn:g(cv('motor'+i+'_csn')!=null?cv('motor'+i+'_csn'):cv('motor'+i+'_ciclos')),cso:g(cv('motor'+i+'_cso'))});
  for(let i=1;i<=nH;i++) d.hel.push({pn:'',sn:'',tsn:g(cv('helice'+i+'_tsn')!=null?cv('helice'+i+'_tsn'):cv('helice'+i+'_horas')),tso:g(cv('helice'+i+'_tso'))});
  return d;
}
function esc0(s){ return s==null?'':String(s); }
function osLegacyData(e){
  const m=cur(); const a=m.aeronave||{};
  return {numero:e.numero||osNextLabel().label, dataISO:e.data||todayISO(),
    dataAberturaBR:e.data?new Date(e.data+'T00:00:00').toLocaleDateString('pt-BR'):'',
    oficina:'', matricula:(a.matricula||STATE.currentAC), sn:(a.sn||''), nM:2, nH:2,
    aer:{tsn:'',tso:'',pousos:'',csn:'',cso:''},
    mot:[{pn:'',sn:'',tsn:'',tso:'',csn:'',cso:''},{pn:'',sn:'',tsn:'',tso:'',csn:'',cso:''}],
    hel:[{pn:'',sn:'',tsn:'',tso:''},{pn:'',sn:'',tsn:'',tso:''}],
    servicos:(e.itens||[]).slice(), execNum:'', execData:''};
}
function osInp(f,v,extra){ return `<input data-field="${f}" value="${esc(v||'')}" ${extra||''}>`; }
function osSvcLine(s,i){ return `<div class="ossvc"><b>${i+1})</b> <input class="svcinp" value="${esc(s||'')}"><button type="button" class="btn o sm no-print svcdel" data-i="${i}" title="remover">×</button></div>`; }
function osSvcValues(){ return Array.from($('#osBody').querySelectorAll('.svcinp')).map(e=>e.value); }
function osRenderSvcList(arr){
  const box=$('#osSvcList'); if(!box) return;
  box.innerHTML=arr.map((s,i)=>osSvcLine(s,i)).join('');
  box.querySelectorAll('.svcdel').forEach(b=>b.addEventListener('click',()=>{ const a=osSvcValues(); a.splice(+b.dataset.i,1); osRenderSvcList(a); }));
}
function osDocHTML(d){
  const logo=(window.JETFOR_SEED&&window.JETFOR_SEED.logo)||'';
  const logoHtml=logo?`<span class="fh-logobox"><img class="fh-logo" src="${logo}" alt="JetFor"></span>`:`<span class="fh-jf">✈ JETFOR</span>`;
  let util=`<tr><th>AERONAVE (Célula)</th><td colspan="2">Horas: ${osInp('aer.tsn',d.aer.tsn)}</td><td colspan="2">Pousos: ${osInp('aer.pousos',d.aer.pousos)}</td><td colspan="2">Ciclos: ${osInp('aer.csn',d.aer.csn)}</td></tr>`;
  d.mot.forEach((mo,i)=>{ util+=`<tr><th>Motor ${i+1}</th><td>P/N: ${osInp('mot.'+i+'.pn',mo.pn)}</td><td>S/N: ${osInp('mot.'+i+'.sn',mo.sn)}</td><td>TSN: ${osInp('mot.'+i+'.tsn',mo.tsn)}</td><td>TSO: ${osInp('mot.'+i+'.tso',mo.tso)}</td><td>CSN: ${osInp('mot.'+i+'.csn',mo.csn)}</td><td>CSO: ${osInp('mot.'+i+'.cso',mo.cso)}</td></tr>`; });
  d.hel.forEach((he,i)=>{ util+=`<tr><th>Hélice ${i+1}</th><td>P/N: ${osInp('hel.'+i+'.pn',he.pn)}</td><td>S/N: ${osInp('hel.'+i+'.sn',he.sn)}</td><td colspan="2">TSN: ${osInp('hel.'+i+'.tsn',he.tsn)}</td><td colspan="2">TSO: ${osInp('hel.'+i+'.tso',he.tso)}</td></tr>`; });
  return `
    <div class="osdoc">
      <table class="ff oshead">
        <tr><td class="oslogo" rowspan="3">${logoHtml}</td><td class="ostitle" colspan="4">ORDEM DE SERVIÇO</td></tr>
        <tr><th>Matrícula</th><th>Número de Série</th><th>O.S. Nº</th><td>${osInp('numero',d.numero)}</td></tr>
        <tr><td>${esc(d.matricula)}</td><td>${esc(d.sn)}</td><th>Data de Abertura</th><td>${osInp('dataAbertura',d.dataAberturaBR)}</td></tr>
      </table>
      <div class="fsec">OFICINA EXECUTORA</div>
      <table class="ff"><tr><td>${osInp('oficina',d.oficina,'placeholder="Ex.: USA - Uirapuru Serviços Aeronáuticos Ltda"')}</td></tr></table>
      <div class="fsec">REGISTRO DE UTILIZAÇÃO</div>
      <table class="ff util">${util}</table>
      <div class="fsec">SOLICITAÇÃO</div>
      <div class="fsec sub">SERVIÇOS A EXECUTAR</div>
      <div class="ossvcs" id="osSvcList"></div>
      <button type="button" class="btn o sm no-print" id="osSvcAdd" style="margin:6px 0 2px">+ adicionar item</button>
      <table class="ff"><tr><th>Nome Diretor de Manutenção</th><td>Leonardo Filipe de Araujo</td><th>CANAC/CREA/CFT</th><td>CREA 1713750589</td><th>Assinatura</th><td class="ossig"></td></tr></table>
      <div class="fsec">EXECUÇÃO</div>
      <table class="ff"><tr><th>Número da O.S.</th><td>${osInp('execNum',d.execNum)}</td><th>Data de Encerramento</th><td>${osInp('execData',d.execData,'placeholder="__/__/____"')}</td></tr></table>
      <div class="fsec">DECLARAÇÃO DE LIBERAÇÃO PARA RETORNO AO SERVIÇO</div>
      <div class="osdecl">Declaro que os serviços acima foram executados de acordo com as instruções técnicas e a legislação vigente. Os itens em ACR (se houver), foram transferidos para nova Ordem de Serviço, como descrita na ação executada do item específico. O(s) Produto(s) aeronáutico(s) afetado(s) por esta Ordem de Serviço está(ão) aeronavegáveis e autorizado(s) para retorno ao Serviço.</div>
      <table class="ff"><tr><th>Responsável</th><td>Leonardo Filipe de Araujo · CREA 1713750589</td><th>Assinatura</th><td class="ossig"></td></tr></table>
    </div>`;
}
function osSetPageOrient(on){
  let ps=document.getElementById('osPageStyle');
  if(!ps){ ps=document.createElement('style'); ps.id='osPageStyle'; document.head.appendChild(ps); }
  ps.textContent = on ? '@media print{@page{size:A4 portrait;margin:9mm}}' : '';
}
function osRender(d,mode,idx){
  OSCUR=d; OSCTX={mode:mode,idx:(idx==null?-1:idx)};
  osSetPageOrient(true);
  $('#osBody').innerHTML=osDocHTML(d);
  osRenderSvcList(d.servicos||[]);
  const add=$('#osSvcAdd'); if(add) add.addEventListener('click',()=>{ const a=osSvcValues(); a.push(''); osRenderSvcList(a); });
  const reg=$('#osReg'); if(reg) reg.textContent = mode==='edit' ? '✔ Salvar alterações' : '✔ Registrar no histórico';
  const del=$('#osDel'); if(del) del.style.display = mode==='edit' ? '' : 'none';
  const ttl=$('#osTitle'); if(ttl) ttl.textContent = mode==='edit' ? ('Ordem de Serviço '+d.numero+' — editar') : 'Ordem de Serviço (nova)';
  $('#osOverlay').classList.add('show'); document.body.classList.add('osopen');
}
function osCollect(){
  const root=$('#osBody'); const gv=f=>{const el=root.querySelector('[data-field="'+f+'"]');return el?el.value.trim():'';};
  const b=OSCUR||{};
  const d={ numero:gv('numero')||b.numero, dataAberturaBR:gv('dataAbertura'), dataISO:b.dataISO,
    oficina:gv('oficina'), matricula:b.matricula, sn:b.sn, nM:b.nM||0, nH:b.nH||0,
    aer:{tsn:gv('aer.tsn'),tso:gv('aer.tso'),pousos:gv('aer.pousos'),csn:gv('aer.csn'),cso:gv('aer.cso')},
    mot:[], hel:[], servicos:osSvcValues().map(s=>s.trim()).filter(Boolean),
    execNum:gv('execNum'), execData:gv('execData') };
  for(let i=0;i<d.nM;i++) d.mot.push({pn:gv('mot.'+i+'.pn'),sn:gv('mot.'+i+'.sn'),tsn:gv('mot.'+i+'.tsn'),tso:gv('mot.'+i+'.tso'),csn:gv('mot.'+i+'.csn'),cso:gv('mot.'+i+'.cso')});
  for(let i=0;i<d.nH;i++) d.hel.push({pn:gv('hel.'+i+'.pn'),sn:gv('hel.'+i+'.sn'),tsn:gv('hel.'+i+'.tsn'),tso:gv('hel.'+i+'.tso')});
  return d;
}
function osClose(){ $('#osOverlay').classList.remove('show'); document.body.classList.remove('osopen'); osSetPageOrient(false); OSCTX={mode:'novo',idx:-1}; }
function gerarOS(){
  const ids=selectedIds(); if(!ids.length){ toast('Selecione itens'); return; }
  osRender(osBuildFromSelection(),'novo');
}
function abrirOS(idx){
  const m=cur(); const e=(m.osHistorico||[])[idx]; if(!e) return;
  osRender(e.doc?clone(e.doc):osLegacyData(e),'edit',idx);
}
function osRegDispatch(){ if(OSCTX.mode==='edit') salvarOSedit(OSCTX.idx); else registrarOS(); }
function registrarOS(){
  const d=osCollect(); const m=cur(); if(!m.osHistorico) m.osHistorico=[];
  m.osHistorico.push({numero:d.numero, data:d.dataISO||STATE.hoje||todayISO(), itens:d.servicos.slice(), qtd:d.servicos.length, doc:d});
  const y=(d.dataISO||STATE.hoje||todayISO()).slice(0,4);
  STATE.osProx=STATE.osProx||{}; STATE.osProx[y]=(STATE.osProx[y]!=null?STATE.osProx[y]:(y==='2026'?10:1))+1;
  saveAll(); toast('✔ O.S. '+d.numero+' registrada no histórico'); osClose();
  if($('#mapa-sheet').style.display!=='none') renderHistoricoOS();
}
function salvarOSedit(idx){
  const d=osCollect(); const m=cur(); const e=(m.osHistorico||[])[idx]; if(!e){ osClose(); return; }
  e.numero=d.numero; e.itens=d.servicos.slice(); e.qtd=d.servicos.length; e.doc=d;
  saveAll(); toast('✔ O.S. '+d.numero+' atualizada'); osClose();
  if($('#mapa-sheet').style.display!=='none') renderHistoricoOS();
}
function excluirOS(idx){
  const m=cur(); const e=(m.osHistorico||[])[idx]; if(!e) return;
  if(!confirm('Excluir a O.S. '+e.numero+'? Esta ação não pode ser desfeita.\n(A numeração NÃO volta atrás — o número não será reutilizado.)')) return;
  m.osHistorico.splice(idx,1);
  saveAll(); toast('🗑 O.S. '+e.numero+' excluída');
  if($('#osOverlay').classList.contains('show')) osClose();
  if($('#mapa-sheet').style.display!=='none') renderHistoricoOS();
}
function renderHistoricoOS(){
  const h0=(cur().osHistorico)||[];
  let h=`<div class="panel"><h2><span class="tag">O.S.</span> Histórico de Ordens de Serviço — ${esc(STATE.currentAC)}</h2><div class="pbody">`;
  const prox=osNextLabel().label;
  h+=`<p class="lead">Próxima O.S. a emitir: <b>${prox}</b>. Clique em uma O.S. para abrir, editar e reimprimir. A numeração avança ao registrar uma nova.</p>`;
  if(!h0.length){ h+='<p class="lead">Nenhuma O.S. registrada ainda para esta aeronave.</p>'; }
  else{
    h+=`<div class="tblwrap"><table class="da"><thead><tr><th>O.S. Nº</th><th>Data</th><th class="num">Itens</th><th>Serviços</th><th class="num">Ações</th></tr></thead><tbody>`;
    h0.map((o,i)=>({o,i})).reverse().forEach(({o,i})=>{ h+=`<tr class="osrow" data-i="${i}" style="cursor:pointer"><td><b>${esc(o.numero)}</b></td><td>${fmtDate(new Date((o.data||'')+'T00:00:00'))}</td><td class="num">${o.qtd||(o.itens?o.itens.length:0)}</td><td class="obscell">${esc((o.itens||[]).join(' · '))}</td><td class="num" style="white-space:nowrap"><button class="btn o sm" data-open="${i}">Abrir</button> <button class="btn o sm" data-del="${i}" title="excluir">🗑</button></td></tr>`; });
    h+=`</tbody></table></div>`;
  }
  h+=`</div></div>`;
  $('#mapa-sheet').innerHTML=h;
  $('#mapa-sheet').querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',e=>{ e.stopPropagation(); abrirOS(+b.dataset.open); }));
  $('#mapa-sheet').querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',e=>{ e.stopPropagation(); excluirOS(+b.dataset.del); }));
  $('#mapa-sheet').querySelectorAll('.osrow').forEach(r=>r.addEventListener('click',()=>abrirOS(+r.dataset.i)));
}
function baseTagClass(base){
  if(base&&base.startsWith('motor1')) return 'm1';
  if(base&&base.startsWith('motor2')) return 'm2';
  if(base==='calendario') return 'cal';
  return '';
}
// rótulo do tipo/base — nunca mostra "null": item sem base vira N/A (ou OC)
function tipoTag(t){
  if(t.base && BASE_LABEL[t.base]) return {cls:baseTagClass(t.base), txt:BASE_LABEL[t.base]};
  if(t.base) return {cls:baseTagClass(t.base), txt:t.base};
  if(t.tipoVenc==='oc') return {cls:'na', txt:'OC'};
  return {cls:'na', txt:'N/A'};
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
    `<td><span class="basetag ${tipoTag(t).cls}">${tipoTag(t).txt}</span></td>`+
    `<td class="num">${inter}</td>`+
    `<td class="num">${exec}</td>`+
    `<td class="num">${venc}</td>`+
    `<td class="num">${disp}</td>`+
    `<td>${calHtml}</td>`+
    `<td class="obscell">${obs}</td>`+
    `<td>${pill}</td>`+
    `<td class="act no-print"><button class="btn o sm" data-hist="${t.id}" title="histórico de cumprimentos">🕘</button> <button class="btn o sm" data-edit="${t.id}">✎</button></td>`;
  tr.style.cursor='pointer'; tr.title='Clique para ver o histórico de cumprimentos';
  tr.addEventListener('click',e=>{ if(e.target.closest('input,button,a,select')) return; openTaskHist(t.id); });
  tr.querySelector('[data-hist]').addEventListener('click',e=>{ e.stopPropagation(); openTaskHist(t.id); });
  tr.querySelector('[data-edit]').addEventListener('click',e=>{ e.stopPropagation(); openModal(t.id); });
  return tr;
}
function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
function unitForBase(base){ base=base||''; if(base.includes('horas')) return 'h'; if(base.includes('ciclos')) return 'ciclos'; if(base.includes('pousos')) return 'pousos'; return ''; }
// ---------- histórico de cumprimentos por tarefa ----------
function openTaskHist(id){
  const t=cur().tarefas.find(x=>x.id===id); if(!t) return;
  const h=(t.hist||[]).slice().reverse();
  const ultExec = t.exec!=null ? (fmtN(t.exec,1)+' '+unitForBase(t.base)) : (t.cal&&t.cal.exec ? fmtDate(new Date(t.cal.exec+'T00:00:00')) : '—');
  let body=`<div class="fsec">${esc(t.nome)}</div>`;
  body+=`<p class="lead"><b>Grupo:</b> ${esc(t.grupo||'—')} · <b>Base:</b> ${esc(BASE_LABEL[t.base]||t.base||'N/A')} · <b>Intervalo:</b> ${t.intervalo!=null?fmtN(t.intervalo,0)+' '+unitForBase(t.base):(t.vencFixo!=null?'fixo':'—')}<br>
    <b>Última execução:</b> ${ultExec} · <b>Observação atual (oficina):</b> ${esc(t.obs||'—')}</p>`;
  if(!h.length){ body+=`<p class="lead muted">Nenhum cumprimento registrado ainda. Selecione a tarefa e use <b>Dar baixa</b> para registrar a execução, oficina e leitura.</p>`; }
  else{
    body+=`<div class="tblwrap"><table class="da"><thead><tr><th>Data</th><th>Oficina executante</th><th>Leitura na execução</th></tr></thead><tbody>`;
    h.forEach(e=>{ const leit = e.leitura!=null ? (fmtN(e.leitura,1)+' '+unitForBase(e.base)) : (e.cal?'(calendário)':'—');
      body+=`<tr><td>${e.data?fmtDate(new Date(e.data+'T00:00:00')):'—'}</td><td>${esc(e.oficina||'—')}</td><td class="num">${leit}</td></tr>`; });
    body+=`</tbody></table></div>`;
  }
  $('#histTitle').textContent='Histórico de cumprimentos — '+STATE.currentAC;
  $('#histBody').innerHTML=body;
  $('#histOverlay').classList.add('show');
}
function closeHist(){ $('#histOverlay').classList.remove('show'); }

// ---------- grupos (seletor + gestão) ----------
function customGrupos(){ const m=cur(); m.grupos=m.grupos||[]; return m.grupos; }
function allGrupos(){ return [...new Set([...new Set(STATE.tarefas.map(t=>t.grupo).filter(Boolean))].concat(customGrupos()))]; }
function fillGroupFilters(){
  const all=allGrupos();
  const fsel=$('#fgrupo'); if(fsel){ const cv=fsel.value; fsel.innerHTML='<option value="">Todos os grupos</option>'+all.map(g=>`<option>${esc(g)}</option>`).join(''); fsel.value=cv; }
  const gsel=$('#f_grupo'); if(gsel){ const cv=gsel.value; gsel.innerHTML=all.map(g=>`<option>${esc(g)}</option>`).join(''); if(all.indexOf(cv)>=0) gsel.value=cv; }
}
function novoGrupo(){
  let g=prompt('Nome do novo grupo (ex.: 53 - FUSELAGE, GRANDES MODIFICAÇÕES):'); if(g==null) return; g=g.trim(); if(!g) return;
  if(allGrupos().indexOf(g)<0) customGrupos().push(g);
  fillGroupFilters(); $('#f_grupo').value=g; saveAll();
}
function renomearGrupo(old){
  let g=prompt('Renomear grupo:', old); if(g==null) return; g=g.trim(); if(!g||g===old) return;
  STATE.tarefas.forEach(t=>{ if(t.grupo===old) t.grupo=g; });
  const cg=customGrupos(); const i=cg.indexOf(old); if(i>=0) cg[i]=g; else if(cg.indexOf(g)<0 && !STATE.tarefas.some(t=>t.grupo===g)){}
  fillGroupFilters(); renderTable(); saveAll(); toast('✔ Grupo renomeado');
}
function removerGrupo(g){
  const temTarefas=STATE.tarefas.some(t=>t.grupo===g);
  if(temTarefas){ if(!confirm('O grupo "'+g+'" tem tarefas. Remover o grupo e mover essas tarefas para "Diversos"?')) return;
    STATE.tarefas.forEach(t=>{ if(t.grupo===g) t.grupo='Diversos'; }); }
  const cg=customGrupos(); const i=cg.indexOf(g); if(i>=0) cg.splice(i,1);
  fillGroupFilters(); renderTable(); saveAll(); toast('🗑 Grupo removido');
}

// ---------- MODAL (edição/criação) ----------
let editingId=null;
function catUnitOptions(cat){
  if(cat==='motor') return [['tsn','FH · TSN (horas)'],['tso','FH · TSO (horas)'],['csn','FC · CSN (ciclos)'],['cso','FC · CSO (ciclos)'],['','— só calendário']];
  if(cat==='helice') return [['tsn','FH · TSN (horas)'],['tso','FH · TSO (horas)'],['','— só calendário']];
  return [['horas','FH · Horas'],['ciclos','FC · Ciclos'],['pousos','Pousos'],['','— só calendário']];
}
function deriveBase(cat,unit,idx){ if(!unit) return 'calendario'; if(cat==='celula') return 'celula_'+unit; return cat+idx+'_'+unit; }
// tipoVenc a partir da base (para o modo Vencimento)
function deriveTipoVenc(base){
  if(!base) return null;
  if(base==='calendario') return 'calendario';
  const suf=base.split('_').pop();
  if(suf==='pousos') return 'pousos';
  if(suf==='ciclos'||suf==='csn'||suf==='cso') return 'ciclos';
  return 'horas';
}
// mostra/oculta a calculadora conforme N/A / OC
function onTipoControleChange(){
  const modo=$('#f_tipoControle')?$('#f_tipoControle').value:'venc';
  const off = (modo==='na'||modo==='oc');
  document.querySelectorAll('#mbody .calcfld').forEach(el=>{ el.style.display = off?'none':''; });
}
function parseBaseToCatUnit(base){
  let m;
  if(!base||base==='calendario') return {cat:'celula',unit:'',idx:1};
  if((m=/^celula_(horas|ciclos|pousos)$/.exec(base))) return {cat:'celula',unit:m[1],idx:1};
  if((m=/^motor(\d+)_(tsn|tso|csn|cso)$/.exec(base))) return {cat:'motor',unit:m[2],idx:+m[1]};
  if((m=/^helice(\d+)_(tsn|tso)$/.exec(base))) return {cat:'helice',unit:m[2],idx:+m[1]};
  if((m=/^motor(\d+)_horas$/.exec(base))) return {cat:'motor',unit:'tsn',idx:+m[1]};
  if((m=/^motor(\d+)_ciclos$/.exec(base))) return {cat:'motor',unit:'csn',idx:+m[1]};
  if((m=/^helice(\d+)_horas$/.exec(base))) return {cat:'helice',unit:'tsn',idx:+m[1]};
  return {cat:'celula',unit:'horas',idx:1};
}
function fillUnitSelect(cat,unit){ $('#f_unit').innerHTML=catUnitOptions(cat).map(([v,l])=>`<option value="${v}" ${v===unit?'selected':''}>${l}</option>`).join(''); }
function nUnits(cat){ const a=cur().aeronave||{}; return cat==='motor'?(a.nMotores!=null?a.nMotores:2):(cat==='helice'?(a.nHelices!=null?a.nHelices:0):0); }
function renderModalUnits(cat,checked){
  const box=$('#f_units'), hint=$('#f_unitsHint'); const n=nUnits(cat);
  if(cat==='celula'||n<=0){ box.innerHTML=''; box.style.display='none'; if(hint) hint.style.display='none'; return; }
  box.style.display=''; if(hint) hint.style.display='';
  const lbl=cat==='motor'?'Motor':'Hélice'; let h='';
  for(let i=1;i<=n;i++) h+=`<label class="chk"><input type="checkbox" class="unitchk" value="${i}" ${checked.indexOf(i)>=0?'checked':''}> ${lbl} ${i}</label>`;
  box.innerHTML=h;
}
function onCatChange(){
  const cat=$('#f_cat').value; const n=nUnits(cat);
  renderModalUnits(cat, n>0?Array.from({length:n},(_,i)=>i+1):[]);
  const opts=catUnitOptions(cat).map(o=>o[0]); const cu=$('#f_unit').value;
  fillUnitSelect(cat, opts.indexOf(cu)>=0?cu:opts[0]);
}
function openModal(id){
  editingId=id;
  const t = id? STATE.tarefas.find(x=>x.id===id) : {base:'celula_horas',categoria:'celula'};
  $('#modalTitle').textContent = id? 'Editar tarefa' : 'Nova tarefa';
  fillGroupFilters();
  const a=cur().aeronave||{}; const hasH=(a.nHelices!=null?a.nHelices:0)>0;
  const catSel=$('#f_cat'); const hOpt=catSel.querySelector('option[value="helice"]'); if(hOpt) hOpt.style.display=hasH?'':'none';
  if(t.grupo){ if(allGrupos().indexOf(t.grupo)<0) customGrupos().push(t.grupo); fillGroupFilters(); $('#f_grupo').value=t.grupo; }
  $('#f_nome').value=t.nome||'';
  const pu=parseBaseToCatUnit(t.base||'celula_horas');
  catSel.value=(pu.cat==='helice'&&!hasH)?'celula':pu.cat;
  if(id) renderModalUnits(catSel.value,[pu.idx]); else onCatChange();
  fillUnitSelect(catSel.value,pu.unit);
  $('#f_peca').value=t.peca||''; $('#f_fab').value=t.fabricante||'';
  $('#f_pn').value=t.pn||''; $('#f_sn').value=t.sn||'';
  $('#f_intervalo').value=t.intervalo!=null?t.intervalo:''; $('#f_exec').value=t.exec!=null?t.exec:'';
  $('#f_vencfixo').value=t.vencFixo!=null?t.vencFixo:'';
  $('#f_calmeses').value=t.cal&&t.cal.meses!=null?t.cal.meses:''; $('#f_calexec').value=t.cal&&t.cal.exec?t.cal.exec:'';
  $('#f_obs').value=t.obs||'';
  if($('#f_tipoControle')){ $('#f_tipoControle').value = (t.tipoVenc==='na')?'na':(t.tipoVenc==='oc'?'oc':'venc'); onTipoControleChange(); }
  $('#btnDelete').style.display=id?'inline-block':'none';
  $('#f_troca').style.display=id?'':'none';
  $('#overlay').classList.add('show');
}
function closeModal(){ $('#overlay').classList.remove('show'); editingId=null; }
function saveModal(){
  const nome=$('#f_nome').value.trim(); if(!nome){ toast('Informe a nomenclatura'); return; }
  const cat=$('#f_cat').value, unit=$('#f_unit').value;
  const cm=num($('#f_calmeses').value), ce=$('#f_calexec').value;
  const modo=$('#f_tipoControle')?$('#f_tipoControle').value:'venc';
  const naoc=(modo==='na'||modo==='oc');
  const common={ nome, grupo:($('#f_grupo').value.trim()||'Diversos'), categoria:cat, unidade:null,
    peca:$('#f_peca').value.trim(), fabricante:$('#f_fab').value.trim(),
    pn:$('#f_pn').value.trim(), sn:$('#f_sn').value.trim(),
    intervalo: naoc?null:num($('#f_intervalo').value), exec: naoc?null:num($('#f_exec').value), vencFixo: naoc?null:num($('#f_vencfixo').value),
    obs:$('#f_obs').value.trim() };
  if(!naoc && cm!=null&&ce) common.cal={meses:cm,exec:ce};
  let idxs=[1];
  if(cat==='motor'||cat==='helice'){ idxs=[...document.querySelectorAll('#f_units .unitchk:checked')].map(c=>+c.value); if(!idxs.length){ toast('Selecione ao menos uma unidade (Motor/Hélice)'); return; } }
  function baseFor(idx){ return naoc? null : deriveBase(cat,unit,idx); }
  function tvFor(b){ return naoc? modo : deriveTipoVenc(b); }
  if(editingId){
    const i=STATE.tarefas.findIndex(x=>x.id===editingId); const old=STATE.tarefas[i]||{};
    const b=baseFor(cat==='celula'?1:idxs[0]);
    const rec=Object.assign({},old,common,{base:b,tipoVenc:tvFor(b)});
    if(naoc||!common.cal) delete rec.cal;
    STATE.tarefas[i]=rec;
  } else {
    idxs.forEach((idx,k)=>{ const b=baseFor(idx); STATE.tarefas.push(Object.assign({},common,{id:'t'+Date.now().toString(36)+k+Math.floor(Math.random()*1e3).toString(36),base:b,tipoVenc:tvFor(b)})); });
  }
  closeModal(); fillGroupFilters(); renderTable(); saveAll();
}
function registrarTroca(){
  if(!editingId){ toast('Salve a tarefa antes de registrar a troca'); return; }
  const t=STATE.tarefas.find(x=>x.id===editingId); if(!t) return;
  const leituraStr=prompt('Leitura do contador na troca (horas/ciclos). Deixe vazio se não se aplica:',''); if(leituraStr===null) return;
  const leitura=num(leituraStr);
  t.peca=$('#f_peca').value.trim(); t.fabricante=$('#f_fab').value.trim(); t.pn=$('#f_pn').value.trim(); t.sn=$('#f_sn').value.trim();
  const data=STATE.hoje||todayISO();
  if(leitura!=null && t.base && t.base!=='calendario' && t.intervalo!=null){ t.exec=leitura; $('#f_exec').value=leitura; }
  if(t.cal) t.cal.exec=data;
  t.hist=t.hist||[]; t.hist.push({data, oficina:'🔧 Troca de peça'+(t.peca?' — '+t.peca:'')+(t.fabricante?' ('+t.fabricante+')':''), leitura:leitura, base:t.base, cal:!!t.cal});
  saveAll(); renderTable(); toast('🔧 Troca registrada no histórico');
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
function atvToolBtn(a){
  if(!a.tool) return '';
  const map={confiab:{label:'▶ Abrir módulo de Confiabilidade',fn:'openConfiab(\'freq\')'}};
  const t=map[a.tool]; if(!t) return '';
  return `<div class="atvtool"><button class="btn p atvtoolbtn" onclick="event.stopPropagation();${t.fn}">${t.label}</button></div>`;
}
function detalheAtiv(a){
  let h;
  if(/\bIIO\b/.test(a.atv) && window.JETFOR_IIO) h=iioHtml();
  else if(a.comoHtml) h=a.comoHtml;
  else h=`<div class="comobox"><b>Como fazer:</b> ${esc(a.como||'—')}</div>`;
  return h + atvToolBtn(a);
}

// ---------- INÍCIO (Dashboard da frota) ----------
function matchAcmapKey(f){
  const am=STATE.acmaps||{};
  for(const k in am){ if(am[k].aeronave && am[k].aeronave.matricula && am[k].aeronave.matricula===f.mat) return k; }
  for(const k in am){ if(am[k].aeronave && f.modelo && am[k].aeronave.modelo===f.modelo) return k; }
  return null;
}
// status agregado das tarefas de uma aeronave (para o card da página inicial)
function fleetStatus(ac){
  const m=STATE.acmaps[ac]; if(!m) return null;
  const C=m.contadores||{}; const hoje=STATE.hoje||todayISO();
  const tarefas=(m.tarefas||[]).filter(t=>t.categoria!=='ica');
  if(!tarefas.length) return null;
  let od=0,wn=0,ok=0, proxH=null,proxHu='', proxD=null;
  tarefas.forEach(t=>{
    const c=computeWith(t,C,hoje);
    if(c.status==='od') od++; else if(c.status==='wn') wn++; else ok++;
    if(c.num && c.num.disp!=null && c.num.disp>=0){ if(proxH==null||c.num.disp<proxH){ proxH=c.num.disp; proxHu=c.num.unit; } }
    if(c.cal && c.cal.disp!=null && c.cal.disp>=0){ if(proxD==null||c.cal.disp<proxD) proxD=c.cal.disp; }
  });
  return {od,wn,ok,total:tarefas.length,proxH,proxHu,proxD};
}
function fleetStatusHTML(mapa){
  if(!mapa || !STATE.acmaps[mapa]) return '';
  const s=fleetStatus(mapa); if(!s) return '';
  let badges;
  if(s.od===0 && s.wn===0){ badges='<span class="stok">✓ Tudo em dia</span>'; }
  else{
    badges = (s.od?`<span class="stod">🔴 ${s.od} vencida${s.od>1?'s':''}</span>`:'')
           + (s.wn?`<span class="stwn">🟠 ${s.wn} próxima${s.wn>1?'s':''}</span>`:'');
  }
  const prox=[];
  if(s.proxH!=null) prox.push(fmtN(s.proxH,0)+' '+(s.proxHu||'h'));
  if(s.proxD!=null) prox.push(s.proxD+' dias');
  const proxTxt = prox.length? `<div class="stprox">⏱ Próxima a vencer em <b>${prox.join(' · ')}</b></div>` : '';
  return `<div class="acstatus">${badges}${proxTxt}</div>`;
}
function drawFleet(){
  const fleet=STATE.frota||[], ats=window.JETFOR_DASH.atividades;
  // auto-vincula cada card ao mapa correspondente (por matrícula ou modelo)
  fleet.forEach(f=>{ if(!f.mapa){ const k=matchAcmapKey(f); if(k) f.mapa=k; } });
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
      ${fleetStatusHTML(f.mapa)}
      ${f.mapa?`<div class="verMapa" data-map="${i}">Ver mapa de manutenção →</div>`:`<div class="row" style="color:#b0b6c0">Mapa em breve</div>`}
    </div>`;}).join('')+`<button class="ac addac no-print" id="btnAddAc">＋<br>Adicionar aeronave</button>`;
  const openFromCard=i=>{ const f=fleet[i]; if(f&&f.mapa&&STATE.acmaps[f.mapa]) openMap(f.mapa); else toast('Mapa ainda não disponível para esta aeronave'); };
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
  el.innerHTML=`
    <div class="kpis2" id="dashKpis"></div>
    <h2>Frota &amp; Enquadramento SASC</h2>
    <div class="fleet" id="dashFleet"></div>`;
  drawFleet();
  el.dataset.done='1';
}

function renderFreq(){
  const D=window.JETFOR_DASH; if(!D) return;
  const el=$('#view-freq'); if(el.dataset.done) return;
  const ats=D.atividades;
  el.innerHTML=`
    <h2>Atividades &amp; Frequências</h2>
    ${D.modeloOperacional?`<div class="modelobox"><b>Modelo operacional:</b> ${esc(D.modeloOperacional)}</div>`:''}
    <div class="mantabs" id="dManTabs"></div>
    <div class="filters">
      <select id="dEsc"><option value="">Escopo: todos</option><option value="Geral">Geral (toda a frota)</option><option value="SASC">Somente SASC</option></select>
      <select id="dResp"><option value="">Responsável: todos</option><option value="JetFor">JetFor (controle)</option><option value="Oficina 145">Oficina 145</option><option value="ambos">JetFor + Oficina</option></select>
      <select id="dFreq"></select>
      <input id="dBusca" placeholder="Buscar atividade ou norma..."/>
    </div>
    <div class="tblwrap"><table class="dash"><thead><tr><th style="width:38%">Atividade</th><th>Frequência</th><th>Base</th><th>Escopo</th><th>Responsável</th></tr></thead><tbody id="dTb"></tbody></table></div>
    <div class="note" id="dCount"></div>
    <div class="note"><b>Como ler:</b> atividades <span class="tag g">Geral</span> valem para toda a frota; <span class="tag s">SASC</span> só para aeronaves 10+ assentos. <b>Responsável:</b> <span class="rtag jf">JetFor</span> = controle/administração feito internamente; <span class="rtag of">Oficina 145</span> = execução física por oficina contratada; <span class="rtag amb">JetFor + Oficina</span> = JetFor controla e a oficina executa. Clique numa linha para ver o "como fazer".</div>`;
  // filtros atividades
  const freqs=[...new Set(ats.map(a=>a.freq))];
  $('#dFreq').innerHTML='<option value="">Frequência: todas</option>'+freqs.map(x=>`<option>${esc(x)}</option>`).join('');
  const MAN_LBL={MGSO:'MGSO — Seg. Operacional',PTM:'PTM — Trein. Manutenção',PTO:'PTO — Trein. Operacional',MGO:'MGO — Ger. Operações'};
  const mans=[...new Set(ats.map(a=>a.manual).filter(Boolean))];
  // abas por manual (Todas · Base · MGSO · PTM · PTO · MGO)
  let manFilter='';
  const tabsDef=[['','Todas',ats.length],['__base','Base (MGM/RBAC)',ats.filter(a=>!a.manual).length]]
    .concat(mans.map(m=>[m,m,ats.filter(a=>a.manual===m).length]));
  $('#dManTabs').innerHTML=tabsDef.map(t=>`<button class="mantab${t[0]===''?' on':''}" data-man="${esc(t[0])}" title="${esc(MAN_LBL[t[0]]||'')}">${esc(t[1])} <span class="mtcount">${t[2]}</span></button>`).join('');
  $('#dManTabs').querySelectorAll('.mantab').forEach(b=>b.addEventListener('click',()=>{
    manFilter=b.dataset.man;
    $('#dManTabs').querySelectorAll('.mantab').forEach(x=>x.classList.toggle('on',x===b));
    draw();
  }));
  function respTag(resp){
    if(!resp) return '';
    const jf=resp.includes('JetFor'), of=resp.includes('Oficina');
    const cls = jf&&of?'amb':jf?'jf':'of';
    return `<span class="rtag ${cls}">${esc(resp)}</span>`;
  }
  function draw(){
    const esc_=$('#dEsc').value, fq=$('#dFreq').value, rf=$('#dResp').value, mn=manFilter, q=($('#dBusca').value||'').toLowerCase();
    const rows=ats.filter(a=>{
      if(esc_&&a.escopo!==esc_) return false;
      if(mn){ if(mn==='__base'){ if(a.manual) return false; } else if(a.manual!==mn) return false; }
      if(fq&&a.freq!==fq) return false;
      if(rf){
        if(rf==='ambos'){ if(!(a.resp&&a.resp.includes('JetFor')&&a.resp.includes('Oficina'))) return false; }
        else if(rf==='JetFor'){ if(a.resp!=='JetFor') return false; }
        else if(rf==='Oficina 145'){ if(a.resp!=='Oficina 145') return false; }
      }
      if(q&&!(a.atv.toLowerCase().includes(q)||a.base.toLowerCase().includes(q)||(a.resp||'').toLowerCase().includes(q)||(a.manual||'').toLowerCase().includes(q))) return false;
      return true;
    });
    $('#dTb').innerHTML=rows.map((a,i)=>{
      const temComo=!!a.como;
      const manChip=a.manual?` <span class="manchip m${esc(a.manual)}">${esc(a.manual)}</span>`:'';
      return `<tr class="atvrow ${temComo?'expandable':''}" data-i="${i}">
        <td><span class="caret">${temComo?'▸':''}</span>${esc(a.atv)}${manChip}</td>
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

// ================= MÓDULO CONFIABILIDADE (SASC · MGM 5.6 / IS 120-016) =================
const CONFIAB_ATA=[['21','Ar condicionado'],['22','Piloto automático'],['23','Comunicações'],['24','Elétrico'],['25','Equip./Interiores'],['26','Proteção contra fogo'],['27','Comandos de voo'],['28','Combustível'],['29','Hidráulico'],['30','Proteção gelo/chuva'],['31','Instrumentos'],['32','Trem de pouso'],['33','Luzes'],['34','Navegação'],['35','Oxigênio'],['36','Pneumático'],['49','APU'],['52','Portas'],['56','Janelas'],['71','Grupo motopropulsor'],['72','Motor'],['73','Combustível do motor'],['74','Ignição'],['77','Indicação do motor'],['79','Óleo'],['80','Partida']];
const CONFIAB_TIPOS=['Reporte de piloto (PIREP)','Remoção não programada','Atraso / Cancelamento (mecânico)','Desligamento de motor em voo (IFSD)','Consumo de óleo','Pane / discrepância em manutenção','Outro'];

let CONFIAB_FROM='freq';
function openConfiab(from){
  if(from) CONFIAB_FROM=from;
  ['inicio','freq','mapa','obrig','sasc','forms','geral','oficinas'].forEach(v=>{ const el=$('#view-'+v); if(el) el.style.display='none'; });
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.remove('active'));
  const cv=$('#view-confiab'); if(cv) cv.style.display='';
  renderConfiab();
  window.scrollTo(0,0);
}
function saveConfiab(){
  saveLocal();
  if(ONLINE && DB){
    try{ SUPPRESS=true; acDoc('_geral').set({confiab:(STATE.confiab||[]),updatedAt:new Date().toISOString()},{merge:true}).then(()=>{SUPPRESS=false;}).catch(()=>{SUPPRESS=false;}); toast('✔ Confiabilidade salva na nuvem'); }
    catch(e){ SUPPRESS=false; toast('⚠ Erro na nuvem — salvo local'); console.error(e); }
  } else { toast('✔ Salvo neste navegador'); }
}
function renderConfiab(){
  const el=$('#view-confiab'); if(!el) return;
  const frota=(STATE.frota||[]);
  const acOpts=frota.map(f=>`<option value="${esc(f.mat)}">${esc(f.mat)} — ${esc(f.modelo||'')}</option>`).join('');
  const ataList=CONFIAB_ATA.map(x=>`<option value="${x[0]}">${x[0]} — ${esc(x[1])}</option>`).join('');
  const tipoOpts=CONFIAB_TIPOS.map(t=>`<option>${esc(t)}</option>`).join('');
  el.innerHTML=`
   <div class="cfbwrap">
     <div class="cfbhead">
       <button class="btn o" onclick="switchView(CONFIAB_FROM||'freq')">← Voltar</button>
       <div><div class="cfbtitle">📊 Módulo de Confiabilidade <span class="sasctag">SASC</span></div>
       <div class="cfbsub">MGM 5.6 · IS 120-016 — coleta e análise de dados de confiabilidade</div></div>
     </div>
     <div class="cfbnote">Registre cada ocorrência (reporte de piloto, remoção não programada, atraso mecânico, IFSD, consumo de óleo…). Na próxima etapa o módulo vai calcular as taxas por ATA em janela de 12 meses e acender o painel de alerta automaticamente.</div>

     <div class="cfbcard">
       <div class="cfbcardt">Novo lançamento</div>
       <div class="cfbform">
         <label>Data<input type="date" id="cf_data" value="${todayISO()}"></label>
         <label>Aeronave<select id="cf_ac">${acOpts}</select></label>
         <label>Sistema (ATA)<select id="cf_ata"><option value="">—</option>${ataList}</select></label>
         <label>Tipo de ocorrência<select id="cf_tipo">${tipoOpts}</select></label>
         <label class="wide">Descrição<textarea id="cf_desc" rows="2" placeholder="O que aconteceu"></textarea></label>
         <label>Horas (TSN) no momento<input type="number" id="cf_horas" step="0.1"></label>
         <label>Ciclos<input type="number" id="cf_ciclos"></label>
         <label>Pousos<input type="number" id="cf_pousos"></label>
         <label>P/N<input type="text" id="cf_pn"></label>
         <label>S/N<input type="text" id="cf_sn"></label>
         <label class="wide">Ação tomada / status<textarea id="cf_acao" rows="2" placeholder="Investigação, ação corretiva, oficina responsável…"></textarea></label>
       </div>
       <div style="text-align:right;margin-top:8px"><button class="btn p" onclick="confiabAdd()">＋ Registrar ocorrência</button></div>
     </div>

     <div class="cfbcard">
       <div class="cfbcardt">Ocorrências registradas <span id="cfbCount" class="cfbcount"></span></div>
       <div class="tblwrap"><table class="cfbtable"><thead><tr><th>Data</th><th>Aeronave</th><th>ATA</th><th>Tipo</th><th>Descrição</th><th>Ação</th><th></th></tr></thead><tbody id="cfbList"></tbody></table></div>
     </div>
   </div>`;
  renderConfiabList();
}
function renderConfiabList(){
  const tb=$('#cfbList'); if(!tb) return;
  const regs=(STATE.confiab||[]).slice().sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  const cc=$('#cfbCount'); if(cc) cc.textContent=regs.length?`(${regs.length})`:'';
  tb.innerHTML = regs.length? regs.map(r=>`<tr>
     <td class="num">${esc(r.data||'')}</td><td>${esc(r.ac||'')}</td><td>${esc(r.ata||'')}</td>
     <td>${esc(r.tipo||'')}</td><td class="cfbdesc">${esc(r.desc||'')}</td><td class="cfbdesc">${esc(r.acao||'')}</td>
     <td><button class="btn o sm" onclick="confiabDel('${r.id}')">🗑</button></td></tr>`).join('')
    : '<tr><td colspan="7" style="color:#999;text-align:center;padding:14px">Nenhuma ocorrência registrada ainda.</td></tr>';
}
function confiabAdd(){
  const g=id=>{const e=$('#'+id);return e?String(e.value).trim():'';};
  const desc=g('cf_desc');
  if(!desc){ toast('Descreva a ocorrência'); return; }
  const reg={ id:'cf'+Date.now()+Math.floor(Math.random()*1000), data:g('cf_data'), ac:g('cf_ac'), ata:g('cf_ata'), tipo:g('cf_tipo'), desc:desc, horas:g('cf_horas'), ciclos:g('cf_ciclos'), pousos:g('cf_pousos'), pn:g('cf_pn'), sn:g('cf_sn'), acao:g('cf_acao'), criadoEm:new Date().toISOString() };
  STATE.confiab=STATE.confiab||[]; STATE.confiab.push(reg);
  saveConfiab();
  ['cf_desc','cf_pn','cf_sn','cf_acao','cf_horas','cf_ciclos','cf_pousos'].forEach(id=>{const e=$('#'+id);if(e)e.value='';});
  renderConfiabList();
  toast('✔ Ocorrência registrada');
}
function confiabDel(id){
  if(!window.confirm('Remover esta ocorrência?')) return;
  STATE.confiab=(STATE.confiab||[]).filter(r=>r.id!==id);
  saveConfiab(); renderConfiabList();
}

// ================= MENU SASC (workspace do programa) =================
function openFormItem(k){
  switchView('forms');
  setTimeout(()=>{ const b=document.querySelector('#view-forms .fsbtn[data-form="'+k+'"]'); if(b) b.click(); },40);
}
const SASC_ITEMS=[
  {key:'geral', label:'📌 Visão geral', html:()=>`
    <div class="cfbnote">O <b>SASC</b> (Sistema de Análise e Supervisão da Continuidade — IS 120-016) é o programa de aeronavegabilidade continuada da frota <b>10+ assentos</b>. Aqui ficam as ferramentas para operá-lo: coleta de confiabilidade, comitê, relatórios, alertas e auditorias.</div>
    <div class="sascgrid">
      <div class="sasccard" onclick="openConfiab('sasc')"><div class="si">📊</div><div><b>Confiabilidade</b><div class="sd">Registrar ocorrências e (em breve) taxas e alertas por ATA.</div></div></div>
      <div class="sasccard" onclick="sascShow('comite')"><div class="si">🗓</div><div><b>Comitê SASC & Atas</b><div class="sd">Reunião trimestral · F-SASC-01.</div></div></div>
      <div class="sasccard" onclick="sascShow('alerta')"><div class="si">🚦</div><div><b>Níveis de Alerta</b><div class="sd">Relatório mensal de confiabilidade.</div></div></div>
      <div class="sasccard" onclick="openFormItem('rsi')"><div class="si">📄</div><div><b>RSI (135.417)</b><div class="sd">Interrupção mecânica mensal.</div></div></div>
      <div class="sasccard" onclick="switchView('oficinas')"><div class="si">🔍</div><div><b>Auditorias SASC</b><div class="sd">F-SASC-02 · oficinas e fornecedores.</div></div></div>
      <div class="sasccard" onclick="sascShow('iio')"><div class="si">✅</div><div><b>IIO</b><div class="sd">Itens de Inspeção Obrigatória.</div></div></div>
    </div>
    <div class="cfbnote" style="background:#f7f9fc;border-left-color:var(--gold)">A frota SASC hoje: <b>PR-ARN</b> (B200GT) e os <b>Citation</b> (PR-FHN / PT-LJQ) em inclusão. Veja a matriz completa na aba <a href="#" onclick="switchView('obrig');return false">Obrigações MGM (SASC / PMAC)</a>.</div>`},
  {key:'confiab', label:'📊 Confiabilidade', launch:()=>openConfiab('sasc')},
  {key:'comite', label:'🗓 Comitê SASC & Atas', html:()=>`
    <div class="cfbcardt">Comitê SASC & Atas (F-SASC-01)</div>
    <div class="cfbnote">Reunião <b>trimestral</b> do Comitê SASC para analisar indicadores de confiabilidade, itens acima do nível de alerta e a eficácia das ações corretivas. Registro em ata (formulário F-SASC-01), com decisões e responsáveis. Base: MGM 5.6 · IS 120-016.</div>
    <div class="sascph">🚧 Módulo em construção — aqui vai entrar o registro das reuniões (data, participantes, pauta, decisões) e o histórico de atas. Quer que eu monte na próxima etapa?</div>`},
  {key:'alerta', label:'🚦 Níveis de Alerta / Relatório', html:()=>`
    <div class="cfbcardt">Níveis de Alerta / Relatório de Confiabilidade</div>
    <div class="cfbnote">Saída <b>mensal</b> do programa: taxas por ATA (por 1000h/ciclos) em janela de 12 meses, comparadas aos níveis de alerta, com tendência e reincidentes. Alimentado pelas ocorrências do módulo de Confiabilidade.</div>
    <div class="sascph">🚦 Este painel é a <b>etapa 2</b> do módulo de Confiabilidade (o cálculo automático). Assim que você validar a coleta, eu ligo os cálculos e o painel verde/amarelo/vermelho aparece aqui.
    <div style="margin-top:10px"><button class="btn p" onclick="openConfiab('sasc')">Ir para a coleta de Confiabilidade →</button></div></div>`},
  {key:'iio', label:'✅ Itens de Inspeção Obrigatória', html:()=> (window.JETFOR_IIO? iioHtml() : '<div class="cfbnote">Conteúdo de IIO não carregado.</div>')}
];
function sascShow(k){
  const it=SASC_ITEMS.find(x=>x.key===k)||SASC_ITEMS[0];
  document.querySelectorAll('#view-sasc .fsbtn[data-sasc]').forEach(b=>b.classList.toggle('active',b.dataset.sasc===it.key));
  const body=$('#sascBody'); if(!body) return;
  if(it.launch){ it.launch(); return; }
  body.innerHTML=`<div class="dashview">${it.html?it.html():''}</div>`;
}
function renderSasc(){
  const el=$('#view-sasc'); if(!el) return;
  if(!el.dataset.done){
    const side=SASC_ITEMS.map((it,i)=>`<button class="fsbtn ${i===0?'active':''}" data-sasc="${it.key}">${esc(it.label)}</button>`).join('');
    el.innerHTML=`<div class="formlayout">
      <aside class="formside no-print">
        <div class="fsgroup"><div class="fsgt">🛡 Programa SASC</div>${side}</div>
        <div class="fsgroup"><div class="fsgt">Relacionado</div>
          <button class="fsbtn link" onclick="switchView('obrig')">📋 Obrigações MGM (SASC/PMAC) ↗</button>
          <button class="fsbtn link" onclick="switchView('oficinas')">🏭 Oficinas & Auditorias ↗</button>
        </div>
      </aside>
      <div class="formmain"><div id="sascBody"></div></div>
    </div>`;
    el.querySelectorAll('.fsbtn[data-sasc]').forEach(b=>b.addEventListener('click',()=>sascShow(b.dataset.sasc)));
    el.dataset.done='1';
  }
  sascShow('geral');
}

// ---------- Sub-abas do MAPA: DA & Boletins (por aeronave) ----------
// ---------- DAs editáveis + calculadora (repetitivas) ----------
const DA_KEYS=['numero','sinopse','bs','cat','freq','data','tsn','tso','rprimario','disp','exec','venc','obs','cadpag','cumprido'];
let DACTX={sheet:null,idx:-1}; let DAFADT={removed:new Set()};
function fadtsOf(r){ return (r&&r.fadts&&r.fadts.length)?r.fadts:((r&&r.fadt)?[r.fadt]:[]); }
async function uploadFADT(file, ac, sheet){
  if(typeof STORAGE==='undefined' || !STORAGE){ toast('⚠ Ative o Firebase Storage p/ anexar FADT'); return null; }
  const safe=file.name.replace(/[^\w.\- ]+/g,'_');
  const path='das/'+ac+'/'+sheet+'/'+Date.now()+'_'+safe;
  try{ toast('Anexando '+file.name+'…'); const ref=STORAGE.ref().child(path); const snap=await ref.put(file); const url=await snap.ref.getDownloadURL(); return {url,path,nome:file.name}; }
  catch(e){ console.error(e); toast('⚠ Falha ao anexar: '+(e.code||e.message)); return null; }
}
function daRowNormalize(r){
  if(!r || r.sec!==undefined) return r;
  if(r.c){ const o={}; DA_KEYS.forEach((k,i)=>o[k]=r.c[i]!=null?r.c[i]:''); return o; }
  return r;
}
function daSheetCat(k){ return {celula:'celula',m1:'motor1',m2:'motor2',h1:'helice1',h2:'helice2'}[k]||'celula'; }
function daBaseOptions(k){
  const cat=daSheetCat(k);
  if(cat==='celula') return [['celula_horas','FH · Horas'],['celula_ciclos','FC · Ciclos'],['celula_pousos','Pousos'],['calendario','Somente calendário']];
  if(cat.indexOf('motor')===0) return [[cat+'_tsn','FH · TSN'],[cat+'_tso','FH · TSO'],[cat+'_csn','FC · CSN'],[cat+'_cso','FC · CSO'],['calendario','Somente calendário']];
  return [[cat+'_tsn','FH · TSN'],[cat+'_tso','FH · TSO'],['calendario','Somente calendário']];
}
function renderMapaSheet(k){
  const DA=cur().da; if(!DA||!DA.sheets[k]) return;
  const sh=DA.sheets[k];
  sh.rows=(sh.rows||[]).map(daRowNormalize);
  let h=`<div class="panel"><h2><span class="tag">${esc((sh.title||'DA').split('—')[0].trim())}</span> ${esc(sh.title||'DA')} — ${esc(STATE.currentAC)}</h2><div class="pbody">`;
  if(sh.stale) h+=`<div class="stale">⚠ Esta aba veio do Excel como template (dados de outra aeronave). Edite/limpe conforme as DAs reais.</div>`;
  h+=`<button class="btn g sm no-print" id="daNew" style="margin-bottom:10px">➕ Nova DA</button> <button class="btn o sm no-print" id="daLimpar" style="margin-bottom:10px">🧹 Limpar rodapés do template</button>`;
  const NC=DA.cols.length;
  h+=`<div class="tblwrap"><table class="da datab"><thead><tr><th>#</th>${DA.cols.map(c=>`<th>${esc(c)}</th>`).join('')}<th class="no-print">Ações</th></tr></thead><tbody>`;
  let nr=0;
  sh.rows.forEach((r,idx)=>{
    if(r.sec!==undefined){ h+=`<tr class="dasec"><td colspan="${NC+2}">${esc(r.sec)} <button class="btn o sm no-print dasecdel" data-i="${idx}" title="remover seção">🗑</button></td></tr>`; return; }
    nr++;
    const tipo=r.tipo||(r.base?'repetitiva':'unica');
    let cells=DA_KEYS.map(key=>esc(r[key]!=null?r[key]:''));   // 15 colunas fiéis ao Excel
    if(tipo==='repetitiva'){
      const c=compute(r);
      if(c.num){ const u=c.num.unit;
        if(r.intervalo!=null) cells[4]=fmtN(r.intervalo,0)+' '+u;      // Freq.
        if(c.num.venc!=null) cells[11]=fmtN(c.num.venc,1)+' '+u;       // Venc.
        if(c.num.disp!=null) cells[9]=`<span class="${c.num.disp<0?'disp-neg':''}">${fmtN(c.num.disp,1)} ${u}</span>`; } // Disp.
      if(c.cal){ const dd=c.cal.disp; cells[11]=(cells[11]&&cells[11]!=='')?cells[11]+' · ':''; cells[11]+=`${fmtDate(c.cal.venc)} <span class="${dd!=null&&dd<0?'disp-neg':''}">(${dd!=null?dd+'d':'—'})</span>`; }
    }
    const fadt=fadtsOf(r).map(fd=>`<a href="${esc(fd.url)}" target="_blank" rel="noopener" title="${esc(fd.nome)}" onclick="event.stopPropagation()">📎</a>`).join(' ');
    h+=`<tr class="darow" data-i="${idx}" style="cursor:pointer"><td class="nrcol">${tipo==='repetitiva'?'🔁':''}${nr}</td>${cells.map(c=>`<td>${c}</td>`).join('')}<td class="no-print">${fadt} <button class="btn o sm" data-daedit="${idx}">✎</button> <button class="btn o sm" data-dadel="${idx}">🗑</button></td></tr>`;
  });
  h+=`</tbody></table></div></div></div>`;
  $('#mapa-sheet').innerHTML=h;
  $('#daNew').addEventListener('click',()=>openDA(k,null));
  const dl=$('#daLimpar'); if(dl) dl.addEventListener('click',()=>limparRodapes(k));
  $('#mapa-sheet').querySelectorAll('[data-daedit]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openDA(k,+b.dataset.daedit);}));
  $('#mapa-sheet').querySelectorAll('[data-dadel]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();deleteDA(k,+b.dataset.dadel);}));
  $('#mapa-sheet').querySelectorAll('.darow').forEach(r=>r.addEventListener('click',()=>openDA(k,+r.dataset.i)));
  $('#mapa-sheet').querySelectorAll('.dasecdel').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation(); if(confirm('Remover esta seção?')){ sh.rows.splice(+b.dataset.i,1); saveAll(); renderMapaSheet(k);} }));
}
function openDA(k,idx){
  DACTX={sheet:k,idx:(idx==null?-1:idx)};
  const sh=cur().da.sheets[k]; sh.rows=(sh.rows||[]).map(daRowNormalize);
  const r = idx!=null ? sh.rows[idx] : {tipo:'unica'};
  const tipo=r.tipo||(r.base?'repetitiva':'unica');
  const baseOpts=daBaseOptions(k);
  const v=x=>esc(r[x]||'');
  const isoOr=(x)=> (r[x]&&/^\d{4}-\d{2}-\d{2}/.test(r[x]))?r[x]:'';
  $('#daBody').innerHTML=`
    <div class="fld"><label>Nº da DA/AD</label><input id="da_num" value="${v('numero')}"></div>
    <div class="fld"><label>Categoria</label><input id="da_cat" value="${v('cat')}" placeholder="Ex.: T / Célula"></div>
    <div class="fld full"><label>Sinopse / assunto</label><input id="da_sin" value="${v('sinopse')}"></div>
    <div class="fld full"><label>BS / método de cumprimento</label><input id="da_bs" value="${v('bs')}"></div>
    <div class="fld full"><label>Tipo</label>
      <select id="da_tipo"><option value="unica" ${tipo==='unica'?'selected':''}>Única (uma vez)</option><option value="repetitiva" ${tipo==='repetitiva'?'selected':''}>🔁 Repetitiva (recorrente)</option></select></div>
    <div class="fld"><label>Base (contador)</label><select id="da_base">${baseOpts.map(([b,l])=>`<option value="${b}" ${r.base===b?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="fld"><label>Intervalo (freq.)</label><input id="da_int" type="number" step="any" value="${r.intervalo!=null?r.intervalo:''}"></div>
    <div class="fld"><label>Última execução (leitura)</label><input id="da_exec" type="number" step="any" value="${r.exec!=null?r.exec:''}"></div>
    <div class="fld"><label>Co-limite — Meses</label><input id="da_calm" type="number" step="1" value="${r.cal&&r.cal.meses!=null?r.cal.meses:''}"></div>
    <div class="fld"><label>Data últ. exec (calendário)</label><input id="da_cale" type="date" value="${r.cal&&r.cal.exec?r.cal.exec:''}"></div>
    <div class="fld"><label>Data de cumprimento</label><input id="da_data" type="date" value="${isoOr('data')}"></div>
    <div class="fld"><label>Cumprido</label><input id="da_cumpr" value="${v('cumprido')}" placeholder="Sim / Não / N/A"></div>
    <div class="fld"><label>R. Primário / ref.</label><input id="da_rprim" value="${v('rprimario')}"></div>
    <div class="fld"><label>Cad/Pág (FCDA)</label><input id="da_cad" value="${v('cadpag')}"></div>
    <div class="fld"><label>TSN</label><input id="da_tsn" value="${v('tsn')}"></div>
    <div class="fld"><label>TSO</label><input id="da_tso" value="${v('tso')}"></div>
    <div class="fld full" id="da_impGroup" style="display:${tipo==='repetitiva'?'none':''}"><label style="font-size:11px;color:#8a94a6">Campos importados do Excel (texto) — usados quando a DA é Única</label>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:4px">
        <input id="da_freqt" placeholder="Freq." value="${v('freq')}">
        <input id="da_venct" placeholder="Vence" value="${v('venc')}">
        <input id="da_dispt" placeholder="Restante/Situação" value="${v('disp')}">
      </div></div>
    <div class="fld full"><label>FADT / anexos (comprovantes)</label>
      <div id="da_fadtCur">${fadtsOf(r).length?fadtsOf(r).map((fd,i)=>`<div>📎 <a href="${esc(fd.url)}" target="_blank" rel="noopener">${esc(fd.nome)}</a> <button type="button" class="btn o sm fadtRm" data-i="${i}">remover</button></div>`).join(''):'<span class="muted">nenhum anexo</span>'}</div>
      <input type="file" id="da_fadt" class="no-print" multiple style="margin-top:5px">
      <span class="hint">Pode selecionar vários arquivos de uma vez.</span></div>
    <div class="fld full"><label>Observações</label><textarea id="da_obs">${esc(r.obs||'')}</textarea></div>`;
  DAFADT={removed:new Set()};
  $('#daTitle').textContent = idx!=null ? ('DA '+(r.numero||'')) : 'Nova DA';
  $('#daBody').querySelectorAll('.fadtRm').forEach(btn=>btn.addEventListener('click',()=>{ DAFADT.removed.add(+btn.dataset.i); btn.parentElement.style.opacity='.4'; btn.parentElement.querySelector('a').style.textDecoration='line-through'; btn.disabled=true; }));
  const toggleRep=()=>{ const rep=$('#da_tipo').value==='repetitiva';
    ['da_base','da_int','da_exec','da_calm','da_cale'].forEach(id=>{ const fld=$('#'+id).closest('.fld'); if(fld) fld.style.display=rep?'':'none'; });
    const ig=$('#da_impGroup'); if(ig) ig.style.display=rep?'none':''; };
  $('#da_tipo').addEventListener('change',toggleRep); toggleRep();
  $('#daOverlay').classList.add('show');
}
async function saveDA(){
  const k=DACTX.sheet; const sh=cur().da.sheets[k]; if(!sh){ closeDA(); return; }
  const g=id=>{const e=$('#'+id);return e?e.value.trim():'';};
  const tipo=$('#da_tipo').value;
  const row={ numero:g('da_num'), cat:g('da_cat'), sinopse:g('da_sin'), bs:g('da_bs'), tipo,
    data:g('da_data'), cumprido:g('da_cumpr'), rprimario:g('da_rprim'), cadpag:g('da_cad'),
    tsn:g('da_tsn'), tso:g('da_tso'), obs:g('da_obs') };
  if(tipo==='repetitiva'){
    row.base=$('#da_base').value; row.intervalo=num(g('da_int')); row.exec=num(g('da_exec'));
    const cm=num(g('da_calm')), ce=g('da_cale'); if(cm!=null&&ce) row.cal={meses:cm,exec:ce};
  } else {
    row.freq=g('da_freqt'); row.venc=g('da_venct'); row.disp=g('da_dispt');
  }
  if(!row.numero && !row.sinopse){ toast('Informe o nº ou a sinopse da DA'); return; }
  // anexos: mantém os existentes não-removidos + novos (em massa)
  let fadts = (DACTX.idx>=0) ? fadtsOf(sh.rows[DACTX.idx]).filter((_,i)=>!DAFADT.removed.has(i)) : [];
  const files=($('#da_fadt')||{}).files||[];
  for(const f of files){ const up=await uploadFADT(f, STATE.currentAC, k); if(up) fadts.push(up); }
  row.fadts=fadts; row.fadt=null;
  if(DACTX.idx>=0) sh.rows[DACTX.idx]=Object.assign({},sh.rows[DACTX.idx],row);
  else sh.rows.push(row);
  saveAll(); closeDA(); renderMapaSheet(k); toast('✔ DA salva');
}
function closeDA(){ $('#daOverlay').classList.remove('show'); DACTX.idx=-1; }
function deleteDA(k,idx){ const sh=cur().da.sheets[k]; if(!sh) return; if(!confirm('Excluir esta DA?')) return; sh.rows.splice(idx,1); saveAll(); renderMapaSheet(k); toast('🗑 DA excluída'); }
const DA_RODAPE_RX=/TERRAL\s*T[ÁA]XI|FORTALEZA\s*-?\s*CE|LEONARDO\s+FILIPE|N[ÃA]O\s+EXISTEM\s+CF|^\s*CF\s*N|CANAC\b|ASS\.?\s*:/i;
function daIsRodape(r){
  if(r.sec!==undefined) return DA_RODAPE_RX.test(r.sec||'');
  const t=((r.numero||'')+' '+(r.sinopse||'')+' '+(r.rprimario||'')+' '+(r.cumprido||'')+' '+(r.cadpag||''));
  if(DA_RODAPE_RX.test(t)) return true;
  // sem nº E sem sinopse E não é repetitiva = não é uma DA de verdade (rodapé/assinatura)
  if(!(r.numero||'').trim() && !(r.sinopse||'').trim() && !r.base && r.tipo!=='repetitiva') return true;
  return false;
}
function limparRodapes(k){
  const sh=cur().da.sheets[k]; if(!sh) return; sh.rows=(sh.rows||[]).map(daRowNormalize);
  const n=sh.rows.filter(daIsRodape).length;
  if(!n){ toast('Nenhum rodapé/linha-template pra limpar nesta aba'); return; }
  if(!confirm('Remover '+n+' linha(s) de rodapé/template (assinaturas, empresa, "não existem CF" etc.)? As DAs de verdade permanecem.')) return;
  sh.rows=sh.rows.filter(r=>!daIsRodape(r));
  saveAll(); renderMapaSheet(k); toast('🧹 '+n+' linha(s) removida(s)');
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
       `<td><span class="basetag ${t.tipoVenc==='calendario'?'cal':(t.tipoVenc==='na'||!t.tipoVenc?'na':'')}">${TIPO_LABEL[t.tipoVenc]||'N/A'}</span></td>`+
       `<td class="num">${inter}</td><td class="num">${venc}</td><td class="num">${disp}</td><td>${cal}</td>`+
       `<td class="obscell">${t.obs?esc(t.obs):'<span class=muted>—</span>'}</td><td>${pill}</td>`+
       `<td class="act no-print"><button class="btn o sm" data-edit="${esc(t.id)}">✎</button></td></tr>`;
  });
  h+=`</tbody></table></div></div></div>`;
  $('#mapa-sheet').innerHTML=h;
  $('#mapa-sheet').querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openModal(b.dataset.edit)));
}
function selectMapaSubtab(k){
  const inMenu=(k!=='hist'&&k!=='docs');
  document.querySelectorAll('#mapaSubtabs .subtab').forEach(b=>b.classList.toggle('active',b.dataset.sheet===k));
  const grp=document.querySelector('#mapaSubtabs .subgrp'); if(grp) grp.classList.toggle('active',inMenu);
  const sel=$('#mapaTabSel'); if(sel && inMenu && sel.value!==k) sel.value=k;
  if(k==='mapa'){ $('#mapa-main').style.display=''; $('#mapa-sheet').style.display='none'; }
  else if(k==='ica'){ $('#mapa-main').style.display='none'; renderICA(); $('#mapa-sheet').style.display=''; }
  else if(k==='hist'){ $('#mapa-main').style.display='none'; renderHistoricoOS(); $('#mapa-sheet').style.display=''; }
  else if(k==='docs'){ $('#mapa-main').style.display='none'; renderDocs(STATE.currentAC); $('#mapa-sheet').style.display=''; }
  else { $('#mapa-main').style.display='none'; renderMapaSheet(k); $('#mapa-sheet').style.display=''; }
  window.scrollTo(0,0);
}
function buildMapaSubtabs(){
  const da=cur().da||{sheets:{}}; const bar=$('#mapaSubtabs');
  const temICA=(cur().tarefas||[]).some(t=>t.categoria==='ica');
  // menu "Mapa de Manutenção" agrupa: mapa + ICA + todas as DAs/boletins
  let opts='<option value="mapa">Mapa de Manutenção</option>';
  if(temICA) opts+='<option value="ica">ICA / Grandes Modificações</option>';
  Object.keys(da.sheets||{}).forEach(k=>{ const sh=da.sheets[k]; const n=(sh.rows&&sh.rows.length)||0; opts+=`<option value="${esc(k)}">${esc(sh.title||k)}${n?'':' (vazio)'}</option>`; });
  bar.innerHTML =
    '<span class="subgrp active"><span class="subgrp-lbl">🔧 Mapa de Manutenção</span>'+
    '<select id="mapaTabSel" class="subsel" title="escolha o mapa ou a aba de DA/boletim">'+opts+'</select></span>'+
    '<button class="subtab" data-sheet="hist">🗂 Histórico de O.S.</button>'+
    '<button class="subtab" data-sheet="docs">📁 Documentos</button>';
  const sel=$('#mapaTabSel'); if(sel) sel.addEventListener('change',()=>selectMapaSubtab(sel.value));
  bar.querySelectorAll('.subtab').forEach(b=>b.addEventListener('click',()=>selectMapaSubtab(b.dataset.sheet)));
}
// ---------- trocar de aeronave ----------
function fillAcSwitch(){
  const sel=$('#acSwitch'); if(!sel) return;
  const acs=Object.keys(STATE.acmaps||{}).filter(k=>STATE.acmaps[k]&&STATE.acmaps[k].aeronave);
  sel.innerHTML=acs.map(k=>{ const a=STATE.acmaps[k].aeronave||{}; return `<option value="${esc(k)}" ${k===STATE.currentAC?'selected':''}>✈ ${esc(a.matricula||k)} — ${esc(a.modelo||'')}</option>`; }).join('');
}
function openMap(ac){
  if(!ac || !STATE.acmaps[ac]){ toast('Mapa ainda não disponível para esta aeronave'); return; }
  STATE.currentAC=ac;
  const m=cur(); STATE.contadores=m.contadores; STATE.tarefas=m.tarefas;
  const a=m.aeronave||{};
  const label=`${a.matricula||ac} · ${a.modelo||''}${a.sn?' · S/N '+a.sn:''}`;
  $('#acbadge').textContent='✈ '+label;
  fillAcSwitch();
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
  const sideForms=F.ordem.map((k,i)=>`<button class="fsbtn ${i===0?'active':''}" data-form="${k}">${esc(F.itens[k].label)}</button>`).join('');
  const outros=(F.outros||[]).map(o=>`<a class="fsbtn link" href="${o.url}" target="_blank" rel="noopener">${esc(o.nome)} ↗</a>`).join('');
  el.innerHTML=`<div class="formlayout">
    <aside class="formside no-print">
      <div class="fsgroup"><div class="fsgt">Formulários</div>${sideForms}</div>
      ${outros?`<div class="fsgroup"><div class="fsgt">Abrir no Drive</div>${outros}</div>`:''}
    </aside>
    <div class="formmain">
      <div class="formactions no-print">
        <button class="btn p sm" onclick="window.print()">🖨 Imprimir / Salvar PDF</button>
        <a class="btn g sm" id="dlDocx" href="#" download>⬇ Baixar modelo .docx</a>
        <span class="muted" style="font-size:11px">Preencha na tela e imprima/salve em PDF, ou baixe o modelo Word.</span>
      </div>
      <div id="formBody"></div>
    </div>
  </div>`;
  function show(k){
    const it=F.itens[k]; if(!it) return;
    el.querySelectorAll('.fsbtn').forEach(b=>b.classList.toggle('active',b.dataset.form===k));
    $('#formBody').innerHTML=it.build();
    const dl=$('#dlDocx');
    if(it.docx){
      dl.style.display=''; dl.href=it.docx;
      if(/^https?:/.test(it.docx)){ dl.target='_blank'; dl.removeAttribute('download'); dl.textContent='↗ Abrir modelo original (Drive)'; }
      else { dl.target=''; dl.setAttribute('download',''); dl.textContent='⬇ Baixar modelo .docx'; }
    } else dl.style.display='none';
  }
  el.querySelectorAll('.fsbtn[data-form]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.form)));
  show(F.ordem[0]);
  el.dataset.done='1';
}

function switchView(v){
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  { const cv=$('#view-confiab'); if(cv) cv.style.display='none'; }
  $('#view-inicio').style.display = v==='inicio'?'':'none';
  $('#view-freq').style.display = v==='freq'?'':'none';
  $('#view-mapa').style.display = v==='mapa'?'':'none';
  $('#view-obrig').style.display = v==='obrig'?'':'none';
  $('#view-sasc').style.display = v==='sasc'?'':'none';
  $('#view-forms').style.display = v==='forms'?'':'none';
  $('#view-geral').style.display = v==='geral'?'':'none';
  $('#view-oficinas').style.display = v==='oficinas'?'':'none';
  if(v==='inicio') renderInicio();
  if(v==='freq') renderFreq();
  if(v==='sasc') renderSasc();
  if(v==='obrig') renderObrig();
  if(v==='forms') renderForms();
  if(v==='geral') renderDocsGeral();
  if(v==='oficinas') renderOficinas();
  window.scrollTo(0,0);
}

// ---------- boot ----------
function clone(x){ return JSON.parse(JSON.stringify(x)); }
function boot(){
  const seed = window.JETFOR_SEED;
  $('#logo').src = seed.logo;
  const local = loadLocal();
  const acmaps = (local&&local.acmaps) || clone(window.JETFOR_ACMAPS||{});
  // merge: aeronaves novas do seed que ainda não estão salvas localmente entram sem apagar as existentes
  if(local && local.acmaps && window.JETFOR_ACMAPS){
    for(const k in window.JETFOR_ACMAPS){ if(!acmaps[k]) acmaps[k]=clone(window.JETFOR_ACMAPS[k]); }
  }
  const currentAC = (local&&local.currentAC && acmaps[local.currentAC]) ? local.currentAC : 'PT-LJQ';
  STATE = {
    acmaps: acmaps,
    currentAC: currentAC,
    contadores: acmaps[currentAC].contadores,
    tarefas: acmaps[currentAC].tarefas,
    hoje: (local&&local.hoje) || todayISO(),
    frota: (local&&local.frota) || (window.JETFOR_DASH? window.JETFOR_DASH.fleet.map(x=>Object.assign({},x)) : []),
    osProx: (local&&local.osProx) || {},
    docsGeral: (local&&local.docsGeral) || [],
    docCatsGeral: (local&&local.docCatsGeral) || [],
    oficinas: (local&&local.oficinas) || [],
    confiab: (local&&local.confiab) || []
  };
  migrateMapsFull();
  STATE.contadores=STATE.acmaps[currentAC].contadores; STATE.tarefas=STATE.acmaps[currentAC].tarefas;
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
  $('#btnBaixa').addEventListener('click',openBaixa);
  $('#baixaOk').addEventListener('click',aplicarBaixa);
  $('#baixaCancel').addEventListener('click',closeBaixa);
  $('#baixaOverlay').addEventListener('click',e=>{ if(e.target.id==='baixaOverlay') closeBaixa(); });
  $('#histClose').addEventListener('click',closeHist);
  $('#histOverlay').addEventListener('click',e=>{ if(e.target.id==='histOverlay') closeHist(); });
  $('#f_cat').addEventListener('change',onCatChange);
  if($('#f_tipoControle')) $('#f_tipoControle').addEventListener('change',onTipoControleChange);
  if($('#acSwitch')) $('#acSwitch').addEventListener('change',e=>{ if(e.target.value && e.target.value!==STATE.currentAC) openMap(e.target.value); });
  const ctT=$('#ctToggle');
  if(ctT){
    let col=false; try{ col=localStorage.getItem('jf_counters_collapsed')==='1'; }catch(e){}
    if(col){ $('#counters').classList.add('collapsed'); ctT.textContent='▸ contadores'; }
    ctT.addEventListener('click',()=>{ const c=$('#counters').classList.toggle('collapsed'); ctT.textContent=c?'▸ contadores':'▾ recolher'; try{ localStorage.setItem('jf_counters_collapsed',c?'1':'0'); }catch(e){} });
  }
  $('#f_grupoNew').addEventListener('click',e=>{ e.preventDefault(); novoGrupo(); });
  $('#f_troca').addEventListener('click',registrarTroca);
  $('#daOk').addEventListener('click',saveDA);
  $('#daCancel').addEventListener('click',closeDA);
  $('#daOverlay').addEventListener('click',e=>{ if(e.target.id==='daOverlay') closeDA(); });
  $('#osClose').addEventListener('click',osClose);
  $('#osReg').addEventListener('click',osRegDispatch);
  $('#osDel').addEventListener('click',()=>{ if(OSCTX.mode==='edit') excluirOS(OSCTX.idx); });
  $('#osOverlay').addEventListener('click',e=>{ if(e.target.id==='osOverlay') osClose(); });
  $('#ofOk').addEventListener('click',saveOficina);
  $('#ofCancel').addEventListener('click',closeOfModal);
  $('#ofOverlay').addEventListener('click',e=>{ if(e.target.id==='ofOverlay') closeOfModal(); });
  $('#audSave').addEventListener('click',salvarAuditoria);
  $('#audClose').addEventListener('click',closeAud);
  $('#audOverlay').addEventListener('click',e=>{ if(e.target.id==='audOverlay') closeAud(); });
  $('#btnImport').addEventListener('click',()=>$('#fileImport').click());
  $('#fileImport').addEventListener('change',e=>{ if(e.target.files[0]) importJSON(e.target.files[0]); e.target.value=''; });
  $('#overlay').addEventListener('click',e=>{ if(e.target.id==='overlay') closeModal(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal(); });
  document.querySelectorAll('.navbtn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
  /* menu lateral: rail que expande no hover; 📌 fixa aberto (com memória) */
  try{ if(localStorage.getItem('jetfor_navpinned')==='1') document.body.classList.add('navpinned'); }catch(e){}
  const navTgl=$('#navToggle');
  if(navTgl) navTgl.addEventListener('click',()=>{ const c=document.body.classList.toggle('navpinned'); try{ localStorage.setItem('jetfor_navpinned', c?'1':'0'); }catch(e){} });
  /* sub-abas do mapa são ligadas dinamicamente em buildMapaSubtabs() */
  $('#acOk').addEventListener('click',saveAcModal);
  $('#acCancel').addEventListener('click',closeAcModal);
  $('#acDelete').addEventListener('click',()=>{ if(acEditIdx!=null){ const i=acEditIdx; closeAcModal(); delAc(i); } });
  $('#acOverlay').addEventListener('click',e=>{ if(e.target.id==='acOverlay') closeAcModal(); });
}
document.addEventListener('DOMContentLoaded',boot);
