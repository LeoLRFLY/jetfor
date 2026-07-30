/* JetFor · Controle de Manutenção — Oficinas & Auditorias (F-SASC-02 / MGM 5.6) */

const AUDIT_CHECKLIST = [
  'Certificação/habilitação vigente e compatível com o serviço contratado',
  'Contrato / acordo de manutenção formalizado e vigente',
  'Instalações adequadas ao serviço (área, condições ambientais, segurança)',
  'Pessoal habilitado, com qualificação e treinamento comprovados',
  'Publicações técnicas atualizadas e controladas (AMM/IPC/SB/AD)',
  'Controle de documentos e registros de manutenção',
  'Rastreabilidade de peças, materiais e componentes',
  'Controle de itens com prazo de validade (shelf life)',
  'Sistema da qualidade / inspeção implementado e atuante',
  'Emissão correta de liberação e etiquetas (FADT / FTDA)',
  'Tratamento de discrepâncias e não conformidades',
  'Segregação e controle de itens não conformes / rejeitados'
];
const AUDIT_RESULTADOS = ['Aprovado','Aprovado com ressalvas','Reprovado'];

let AUDCTX = { of:-1, aud:-1 };

function oficinas(){ STATE.oficinas = STATE.oficinas || []; return STATE.oficinas; }
function ofNovaId(){ return 'of'+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36); }
function addMonthsISO(iso, months){
  if(!iso) return '';
  const d = new Date(iso+'T00:00:00'); if(isNaN(d)) return '';
  d.setMonth(d.getMonth()+months); return d.toISOString().slice(0,10);
}

/* ---------------- Cadastro de oficinas ---------------- */
function renderOficinas(){
  const list = oficinas();
  let h = `<div class="panel"><h2><span class="tag">🏭</span> Oficinas &amp; Auditorias — RBAC 145 (MGM 5.6)</h2><div class="pbody">`;
  h += `<p class="lead">Cadastro de oficinas contratadas e registro de auditorias (formulário F-SASC-02). A JetFor programa, audita e exige os comprovantes; a execução física é das oficinas 145.</p>`;
  h += `<button class="btn g sm no-print" id="ofAdd" style="margin-bottom:12px">➕ Nova oficina</button>`;
  if(!list.length){ h += `<p class="lead muted">Nenhuma oficina cadastrada ainda.</p>`; }
  else{
    h += `<div class="ofgrid">`;
    list.forEach((o,i)=>{
      const nAud = (o.auditorias||[]).length;
      const prox = o.ultimaAuditoria ? addMonthsISO(o.ultimaAuditoria,12) : '';
      const vencida = prox && prox < (STATE.hoje||todayISO());
      const stCls = o.status==='Aprovado'?'s':(o.status==='Reprovado'?'r':(o.status?'w':'n'));
      h += `<div class="ofcard">
        <div class="ofcard-top"><div class="ofrz">${esc(o.razao||'(sem nome)')}</div>
          <div class="no-print"><button class="acbtn" data-ofedit="${i}" title="Editar">✎</button><button class="acbtn del" data-ofdel="${i}" title="Remover">🗑</button></div></div>
        <div class="row"><b>CNPJ:</b> ${esc(o.cnpj||'—')} · <b>CHE:</b> ${esc(o.che||'—')}</div>
        <div class="row"><b>Modelos:</b> ${esc(o.modelos||'—')}</div>
        <div class="row"><b>Contato:</b> ${esc(o.contato||'—')}</div>
        <div class="row"><b>Última auditoria:</b> ${o.ultimaAuditoria?fmtDate(new Date(o.ultimaAuditoria+'T00:00:00')):'—'} ${prox?`· <b>próxima:</b> <span class="${vencida?'disp-neg':''}">${fmtDate(new Date(prox+'T00:00:00'))}</span>`:''}</div>
        <div class="row"><b>Envio do MGM:</b> ${o.dataEnvioMGM?fmtDate(new Date(o.dataEnvioMGM+'T00:00:00')):'—'}</div>
        ${o.status?`<span class="badge ${stCls}">${esc(o.status)}</span>`:'<span class="badge n">Sem auditoria</span>'}
        <div class="verMapa no-print" data-ofaud="${i}">Auditorias (${nAud}) →</div>
      </div>`;
    });
    h += `</div>`;
  }
  h += `</div></div><div id="ofAudPanel"></div>`;
  $('#view-oficinas').innerHTML = h;
  const add = $('#ofAdd'); if(add) add.addEventListener('click',()=>openOficinaModal(null));
  $('#view-oficinas').querySelectorAll('[data-ofedit]').forEach(b=>b.addEventListener('click',()=>openOficinaModal(+b.dataset.ofedit)));
  $('#view-oficinas').querySelectorAll('[data-ofdel]').forEach(b=>b.addEventListener('click',()=>excluirOficina(+b.dataset.ofdel)));
  $('#view-oficinas').querySelectorAll('[data-ofaud]').forEach(b=>b.addEventListener('click',()=>renderAuditoriasList(+b.dataset.ofaud)));
}

function openOficinaModal(idx){
  AUDCTX.of = idx;
  const o = (idx!=null && oficinas()[idx]) ? oficinas()[idx] : {};
  const f = (k)=>esc(o[k]||'');
  $('#ofBody').innerHTML = `
    <table class="ff"><tr><th>Razão social</th><td colspan="3"><input data-of="razao" value="${f('razao')}"></td></tr>
      <tr><th>CNPJ</th><td><input data-of="cnpj" value="${f('cnpj')}"></td><th>Certificação / CHE nº</th><td><input data-of="che" value="${f('che')}"></td></tr>
      <tr><th>Modelos atendidos</th><td><input data-of="modelos" value="${f('modelos')}"></td><th>Contato</th><td><input data-of="contato" value="${f('contato')}"></td></tr>
      <tr><th>Data de envio do MGM</th><td colspan="3"><input data-of="dataEnvioMGM" value="${f('dataEnvioMGM')}" placeholder="aaaa-mm-dd"></td></tr>
    </table>`;
  $('#ofTitle').textContent = idx!=null ? 'Editar oficina' : 'Nova oficina';
  $('#ofOverlay').classList.add('show');
}
function saveOficina(){
  const root = $('#ofBody'); const g = k=>{ const e=root.querySelector('[data-of="'+k+'"]'); return e?e.value.trim():''; };
  const rec = { razao:g('razao'),cnpj:g('cnpj'),che:g('che'),modelos:g('modelos'),
    contato:g('contato'),dataEnvioMGM:g('dataEnvioMGM') };
  if(!rec.razao){ toast('Informe a razão social'); return; }
  if(AUDCTX.of!=null && oficinas()[AUDCTX.of]){ oficinas()[AUDCTX.of]=Object.assign({},oficinas()[AUDCTX.of],rec); }
  else { rec.id=ofNovaId(); rec.auditorias=[]; oficinas().push(rec); }
  saveAll(); closeOfModal(); renderOficinas(); toast('✔ Oficina salva');
}
function closeOfModal(){ $('#ofOverlay').classList.remove('show'); }
function excluirOficina(idx){
  const o = oficinas()[idx]; if(!o) return;
  if(!confirm('Excluir a oficina "'+o.razao+'" e todas as suas auditorias?')) return;
  oficinas().splice(idx,1); saveAll(); renderOficinas(); toast('🗑 Oficina removida');
}

/* ---------------- Lista de auditorias de uma oficina ---------------- */
function renderAuditoriasList(ofIdx){
  const o = oficinas()[ofIdx]; if(!o) return;
  o.auditorias = o.auditorias || [];
  let h = `<div class="panel"><h2><span class="tag">📋</span> Auditorias — ${esc(o.razao)}</h2><div class="pbody">`;
  h += `<button class="btn g sm no-print" id="audNew" style="margin-bottom:10px">➕ Nova auditoria (F-SASC-02)</button>`;
  if(!o.auditorias.length){ h += `<p class="lead muted">Nenhuma auditoria registrada.</p>`; }
  else{
    h += `<div class="tblwrap"><table class="da"><thead><tr><th>Nº</th><th>Data</th><th>Tipo</th><th>Resultado</th><th>NCs</th><th class="num no-print">Ações</th></tr></thead><tbody>`;
    o.auditorias.map((a,i)=>({a,i})).reverse().forEach(({a,i})=>{
      h += `<tr><td><b>${esc(a.numero||'—')}</b></td><td>${a.data?fmtDate(new Date(a.data+'T00:00:00')):'—'}</td><td>${esc(a.tipo||'—')}</td><td>${esc(a.resultado||'—')}</td><td>${(a.ncs||[]).filter(n=>n.desc).length}</td>
        <td class="num no-print"><button class="btn o sm" data-audopen="${i}">Abrir</button> <button class="btn o sm" data-auddel="${i}">🗑</button></td></tr>`;
    });
    h += `</tbody></table></div>`;
  }
  h += `</div></div>`;
  $('#ofAudPanel').innerHTML = h;
  $('#ofAudPanel').scrollIntoView({behavior:'smooth',block:'start'});
  $('#audNew').addEventListener('click',()=>abrirAuditoria(ofIdx,null));
  $('#ofAudPanel').querySelectorAll('[data-audopen]').forEach(b=>b.addEventListener('click',()=>abrirAuditoria(ofIdx,+b.dataset.audopen)));
  $('#ofAudPanel').querySelectorAll('[data-auddel]').forEach(b=>b.addEventListener('click',()=>excluirAuditoria(ofIdx,+b.dataset.auddel)));
}
function excluirAuditoria(ofIdx,audIdx){
  const o=oficinas()[ofIdx]; if(!o) return;
  const a=o.auditorias[audIdx]; if(!a) return;
  if(!confirm('Excluir a auditoria '+(a.numero||'')+'?')) return;
  o.auditorias.splice(audIdx,1);
  // recomputa status/última pela mais recente
  const ult=o.auditorias.slice().sort((x,y)=>(x.data||'').localeCompare(y.data||'')).pop();
  o.ultimaAuditoria=ult?ult.data:''; o.status=ult?ult.resultado:'';
  saveAll(); renderOficinas(); renderAuditoriasList(ofIdx); toast('🗑 Auditoria removida');
}

/* ---------------- Formulário de auditoria (F-SASC-02) ---------------- */
function auditNovaNumero(){
  const y=(STATE.hoje||todayISO()).slice(0,4);
  let n=1; oficinas().forEach(o=>(o.auditorias||[]).forEach(a=>{ const m=/^(\d+)\//.exec(a.numero||''); if(m && (a.numero||'').endsWith('/'+y)) n=Math.max(n,+m[1]+1); }));
  return String(n).padStart(2,'0')+'/'+y;
}
function auditData(o, a){
  const iso=STATE.hoje||todayISO();
  if(a) return JSON.parse(JSON.stringify(a));
  return { numero:auditNovaNumero(), data:iso, tipo:'Programada (anual)', auditores:'',
    razao:o.razao||'', cnpj:o.cnpj||'', che:o.che||'', endereco:o.endereco||'', escopo:o.escopo||'',
    checklist:AUDIT_CHECKLIST.map(()=>({status:'',obs:''})),
    ncs:[{desc:'',ref:'',classif:''}], acoes:[{nc:'',acao:'',resp:'',prazo:'',verif:''}],
    parecer:'', resultado:'' };
}
function abrirAuditoria(ofIdx, audIdx){
  const o=oficinas()[ofIdx]; if(!o) return;
  AUDCTX={of:ofIdx, aud:(audIdx==null?-1:audIdx)};
  const d=auditData(o, audIdx!=null?o.auditorias[audIdx]:null);
  audSetPageOrient(true);
  $('#audBody').innerHTML=auditDocHTML(d,o);
  wireAuditForm(d);
  $('#audTitle').textContent = audIdx!=null ? ('Auditoria '+d.numero) : 'Nova auditoria';
  $('#audOverlay').classList.add('show'); document.body.classList.add('audopen');
}
function ai(f,v,extra){ return `<input data-af="${f}" value="${esc(v||'')}" ${extra||''}>`; }
function auditDocHTML(d,o){
  const logo=(window.JETFOR_SEED&&window.JETFOR_SEED.logo)||'';
  const logoHtml=logo?`<span class="fh-logobox"><img class="fh-logo" src="${logo}" alt="JetFor"></span>`:`<b>JETFOR</b>`;
  const chk=d.checklist.map((c,i)=>`<tr><td>${i+1}</td><td class="reqcell">${esc(AUDIT_CHECKLIST[i])}</td>
    <td><select data-af="chk.${i}.status"><option value="">—</option><option ${c.status==='C'?'selected':''}>C</option><option ${c.status==='NC'?'selected':''}>NC</option><option ${c.status==='NA'?'selected':''}>NA</option></select></td>
    <td>${ai('chk.'+i+'.obs',c.obs)}</td></tr>`).join('');
  const ncs=d.ncs.map((n,i)=>`<tr><td>${i+1}</td><td>${ai('nc.'+i+'.desc',n.desc)}</td><td>${ai('nc.'+i+'.ref',n.ref)}</td>
    <td><select data-af="nc.${i}.classif"><option value="">—</option><option ${n.classif==='Maior'?'selected':''}>Maior</option><option ${n.classif==='Menor'?'selected':''}>Menor</option><option ${n.classif==='Observação'?'selected':''}>Observação</option></select></td></tr>`).join('');
  const acoes=d.acoes.map((a,i)=>`<tr><td>${ai('ac.'+i+'.nc',a.nc,'style="width:40px"')}</td><td>${ai('ac.'+i+'.acao',a.acao)}</td><td>${ai('ac.'+i+'.resp',a.resp)}</td><td>${ai('ac.'+i+'.prazo',a.prazo,'style="width:90px"')}</td><td>${ai('ac.'+i+'.verif',a.verif)}</td></tr>`).join('');
  return `<div class="osdoc auddoc">
    <div class="fh"><div class="fh-l">${logoHtml}<span class="fh-emp">JETFOR TÁXI AÉREO · COA 2007-07-2CHQ-02-02 · CNPJ 01.274.847/0001-27 · Base Fortaleza/CE (TAG)</span></div>
      <div class="fh-r"><b>AUDITORIA INTERNA DE OFICINAS</b><div class="fh-min">Formulário F-SASC-02 · Rev. 00</div></div></div>
    <div class="fsec">1. Identificação da auditoria</div>
    <table class="ff"><tr><th>Auditoria nº</th><td>${ai('numero',d.numero)}</td><th>Data</th><td>${ai('data',d.data,'placeholder="aaaa-mm-dd"')}</td></tr>
      <tr><th>Tipo</th><td><select data-af="tipo"><option ${d.tipo==='Programada (anual)'?'selected':''}>Programada (anual)</option><option ${d.tipo==='Eventual / por evento'?'selected':''}>Eventual / por evento</option></select></td>
      <th>Auditor(es)</th><td>${ai('auditores',d.auditores)}</td></tr></table>
    <div class="fsec">2. Oficina / fornecedor auditado</div>
    <table class="ff"><tr><th>Razão social</th><td colspan="3">${ai('razao',d.razao)}</td></tr>
      <tr><th>CNPJ</th><td>${ai('cnpj',d.cnpj)}</td><th>Certificação / CHE nº</th><td>${ai('che',d.che)}</td></tr>
      <tr><th>Endereço</th><td colspan="3">${ai('endereco',d.endereco)}</td></tr>
      <tr><th>Escopo / habilitações auditadas</th><td colspan="3">${ai('escopo',d.escopo)}</td></tr></table>
    <div class="fsec">3. Lista de verificação (C = Conforme · NC = Não conforme · NA = Não aplicável)</div>
    <table class="ff grid auditchk"><tr><th>Nº</th><th>Requisito verificado</th><th>C/NC/NA</th><th>Observações</th></tr>${chk}</table>
    <div class="fsec">4. Não conformidades identificadas <button type="button" class="btn o sm no-print" id="audAddNc">+ linha</button></div>
    <table class="ff grid" id="audNcTbl"><tr><th>NC nº</th><th>Descrição</th><th>Requisito / referência</th><th>Classificação</th></tr>${ncs}</table>
    <div class="fsec">5. Plano de ação corretiva <button type="button" class="btn o sm no-print" id="audAddAc">+ linha</button></div>
    <table class="ff grid" id="audAcTbl"><tr><th>NC</th><th>Ação corretiva</th><th>Responsável</th><th>Prazo</th><th>Verificação da eficácia</th></tr>${acoes}</table>
    <div class="fsec">6. Parecer / conclusão do auditor</div>
    <table class="ff"><tr><td><textarea class="fta" data-af="parecer" rows="4">${esc(d.parecer||'')}</textarea></td></tr>
      <tr><th>Resultado</th><td><select data-af="resultado"><option value="">—</option>${AUDIT_RESULTADOS.map(r=>`<option ${d.resultado===r?'selected':''}>${r}</option>`).join('')}</select></td></tr></table>
    <div class="fsec">7. Assinaturas</div>
    <table class="ff"><tr><th>Auditor (nome / cód. ANAC)</th><td class="ossig"></td><th>Responsável pela oficina</th><td class="ossig"></td></tr>
      <tr><th>Ciência do Diretor de Manutenção</th><td colspan="3">Leonardo Filipe de Araujo — ANAC 133125 &nbsp; <span style="color:#8a94a6">________________________</span></td></tr></table>
  </div>`;
}
function wireAuditForm(d){
  const add = $('#audAddNc'); if(add) add.addEventListener('click',()=>{ const x=audCollect(); x.ncs.push({desc:'',ref:'',classif:''}); reRenderAudit(x); });
  const add2 = $('#audAddAc'); if(add2) add2.addEventListener('click',()=>{ const x=audCollect(); x.acoes.push({nc:'',acao:'',resp:'',prazo:'',verif:''}); reRenderAudit(x); });
}
function reRenderAudit(d){ const o=oficinas()[AUDCTX.of]; $('#audBody').innerHTML=auditDocHTML(d,o); wireAuditForm(d); }
function audCollect(){
  const root=$('#audBody'); const g=f=>{const e=root.querySelector('[data-af="'+f+'"]');return e?e.value.trim():'';};
  const d={ numero:g('numero'),data:g('data'),tipo:g('tipo'),auditores:g('auditores'),
    razao:g('razao'),cnpj:g('cnpj'),che:g('che'),endereco:g('endereco'),escopo:g('escopo'),
    parecer:g('parecer'),resultado:g('resultado'),checklist:[],ncs:[],acoes:[] };
  AUDIT_CHECKLIST.forEach((_,i)=>d.checklist.push({status:g('chk.'+i+'.status'),obs:g('chk.'+i+'.obs')}));
  let i=0; while(root.querySelector('[data-af="nc.'+i+'.desc"]')){ d.ncs.push({desc:g('nc.'+i+'.desc'),ref:g('nc.'+i+'.ref'),classif:g('nc.'+i+'.classif')}); i++; }
  i=0; while(root.querySelector('[data-af="ac.'+i+'.acao"]')){ d.acoes.push({nc:g('ac.'+i+'.nc'),acao:g('ac.'+i+'.acao'),resp:g('ac.'+i+'.resp'),prazo:g('ac.'+i+'.prazo'),verif:g('ac.'+i+'.verif')}); i++; }
  return d;
}
function salvarAuditoria(){
  const o=oficinas()[AUDCTX.of]; if(!o){ closeAud(); return; }
  o.auditorias=o.auditorias||[];
  const d=audCollect();
  if(AUDCTX.aud>=0 && o.auditorias[AUDCTX.aud]) o.auditorias[AUDCTX.aud]=d;
  else o.auditorias.push(d);
  // atualiza última auditoria + status
  const ult=o.auditorias.slice().sort((x,y)=>(x.data||'').localeCompare(y.data||'')).pop();
  o.ultimaAuditoria=ult?ult.data:''; o.status=ult?ult.resultado:'';
  saveAll(); toast('✔ Auditoria '+(d.numero||'')+' salva'); closeAud();
  renderOficinas(); renderAuditoriasList(AUDCTX.of);
}
function closeAud(){ $('#audOverlay').classList.remove('show'); document.body.classList.remove('audopen'); audSetPageOrient(false); AUDCTX.aud=-1; }
function audSetPageOrient(on){
  let ps=document.getElementById('audPageStyle');
  if(!ps){ ps=document.createElement('style'); ps.id='audPageStyle'; document.head.appendChild(ps); }
  ps.textContent = on ? '@media print{@page{size:A4 portrait;margin:9mm}}' : '';
}
