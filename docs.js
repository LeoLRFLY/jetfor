/* JetFor · Controle de Manutenção — Módulo de Documentos (Pasta por aeronave + Pasta Geral)
   Upload via Firebase Storage, metadados no Firestore/local. */

const DOC_CATS_AC = ['PMA','Manuais Técnicos','ICA / Grandes Modificações','Certificados & Seguro','Cadernetas','Fichas (FCDA/IIO)','Outros'];
const DOC_CATS_GERAL = ['MGM','MGO','MGSO','PMA (modelos)','IS / Regulamentos ANAC','Formulários','Auditoria de Oficinas','Outros'];

let STORAGE = null;
function initStorage(){
  try{ if(window.firebase && firebase.storage){ STORAGE = firebase.storage(); } }
  catch(e){ STORAGE = null; }
}

function docList(scope){
  if(scope==='geral'){ STATE.docsGeral = STATE.docsGeral || []; return STATE.docsGeral; }
  const m = STATE.acmaps[scope]; if(!m) return []; m.docs = m.docs || []; return m.docs;
}
function docCats(scope){ return scope==='geral' ? DOC_CATS_GERAL : DOC_CATS_AC; }
function docNewId(){ return 'doc'+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36); }
function fmtMB(b){ return b==null?'':(b/1048576).toFixed(b<1048576?2:1)+' MB'; }

async function uploadDoc(scope, file, categoria, meta){
  if(!STORAGE){ toast('⚠ Ative o Firebase Storage no console pra enviar arquivos'); return null; }
  if(!file){ toast('Selecione um arquivo'); return null; }
  const safe = file.name.replace(/[^\w.\- ]+/g,'_');
  const path = 'docs/'+(scope==='geral'?'_geral':scope)+'/'+Date.now()+'_'+safe;
  try{
    toast('Enviando '+file.name+'…');
    const ref = STORAGE.ref().child(path);
    const snap = await ref.put(file);
    const url = await snap.ref.getDownloadURL();
    const rec = { id:docNewId(), nome:file.name, categoria:categoria||'Outros',
      tamanho:file.size, tipo:file.type||'', url:url, path:path,
      rev:(meta&&meta.rev)||'', validade:(meta&&meta.validade)||'',
      enviadoEm:(STATE.hoje||todayISO()) };
    docList(scope).push(rec);
    saveAll();
    toast('✔ '+file.name+' enviado');
    return rec;
  }catch(e){
    console.error('uploadDoc',e);
    toast('⚠ Falha no envio: '+(e.code||e.message||'erro'));
    return null;
  }
}

async function excluirDoc(scope, id){
  const list = docList(scope);
  const i = list.findIndex(d=>d.id===id); if(i<0) return;
  const d = list[i];
  if(!confirm('Excluir o documento "'+d.nome+'"? Esta ação não pode ser desfeita.')) return;
  // remove do Storage (best-effort)
  if(STORAGE && d.path){ try{ await STORAGE.ref().child(d.path).delete(); }catch(e){ console.warn('storage delete',e); } }
  list.splice(i,1); saveAll(); toast('🗑 Documento excluído');
  renderDocs(scope);
}

function docIcon(tipo,nome){
  const n=(nome||'').toLowerCase();
  if((tipo||'').includes('pdf')||n.endsWith('.pdf')) return '📕';
  if(n.endsWith('.doc')||n.endsWith('.docx')) return '📘';
  if(n.endsWith('.xls')||n.endsWith('.xlsx')||n.endsWith('.xlsm')) return '📗';
  if((tipo||'').startsWith('image/')) return '🖼';
  return '📄';
}

function renderDocs(scope){
  const cats = docCats(scope);
  const list = docList(scope);
  const isGeral = scope==='geral';
  const title = isGeral ? 'Pasta Geral — JETFOR Táxi Aéreo' : ('Documentos — '+scope);
  const sub = isGeral ? 'Manuais e documentos da empresa (MGM, MGO, MGSO, PMAs, IS, auditorias).'
                      : 'Pasta desta aeronave: PMA, manuais, ICA, certificados, cadernetas e fichas.';
  let h = `<div class="panel"><h2><span class="tag">📁</span> ${esc(title)}</h2><div class="pbody">`;
  h += `<p class="lead">${esc(sub)}</p>`;
  if(!STORAGE){
    h += `<div class="fdecl" style="background:#fff7ed;border-left-color:#b45309">⚠ <b>Firebase Storage não ativado.</b> Ative em Build → Storage no console do Firebase pra habilitar o envio de arquivos. As pastas já funcionam; o upload libera assim que o Storage estiver ligado.</div>`;
  }
  h += `<div class="docup no-print">
      <input type="file" id="docFile">
      <select id="docCat">${cats.map(c=>`<option>${esc(c)}</option>`).join('')}</select>
      <input id="docRev" placeholder="Rev (opc.)" style="width:80px">
      <input id="docVal" placeholder="Validade (opc.)" style="width:120px">
      <button class="btn g sm" id="docUp">⬆ Enviar documento</button>
    </div>`;
  cats.forEach(cat=>{
    const items = list.filter(d=>d.categoria===cat);
    h += `<div class="doccat"><h3>${esc(cat)} <span class="muted">(${items.length})</span></h3>`;
    if(!items.length){ h += `<div class="docrow muted">— vazio —</div>`; }
    else items.forEach(d=>{
      h += `<div class="docrow">
        <a href="${esc(d.url)}" target="_blank" rel="noopener">${docIcon(d.tipo,d.nome)} ${esc(d.nome)}</a>
        ${d.rev?`<span class="badge n">rev ${esc(d.rev)}</span>`:''}
        ${d.validade?`<span class="badge n" style="background:#b45309">val ${esc(d.validade)}</span>`:''}
        <span class="muted">${fmtMB(d.tamanho)}</span>
        <button class="btn o sm docdel no-print" data-id="${esc(d.id)}" title="excluir">🗑</button>
      </div>`;
    });
    h += `</div>`;
  });
  h += `</div></div>`;
  const target = isGeral ? $('#view-geral') : $('#mapa-sheet');
  target.innerHTML = h;
  // wire
  const up = target.querySelector('#docUp');
  if(up) up.addEventListener('click', async ()=>{
    const f = target.querySelector('#docFile').files[0];
    const cat = target.querySelector('#docCat').value;
    const rev = target.querySelector('#docRev').value.trim();
    const val = target.querySelector('#docVal').value.trim();
    const r = await uploadDoc(scope, f, cat, {rev,validade:val});
    if(r) renderDocs(scope);
  });
  target.querySelectorAll('.docdel').forEach(b=>b.addEventListener('click',()=>excluirDoc(scope, b.dataset.id)));
}

function renderDocsGeral(){ renderDocs('geral'); }
