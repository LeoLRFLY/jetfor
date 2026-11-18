/* ==========================================================================
   JetFor · Gestão da Frota (MGM rev 09.01, item 2.9 · modelo do item 8.4.23)  — v72
   Lista das aeronaves (tipo, matrícula, S/N e capacidades no formato das EO)
   com controle formal de revisões.
   - As matrículas vêm do cadastro da frota (STATE.frota).
   - Fabricante, modelo, S/N e capacidades ficam em mapas/_geral.listaFrota.ac[mat].
   - Cada revisão guarda a "foto" da lista do dia (snap), para comparar e reimprimir.
   Permissões (tela 'listafrota'): ver; criar = emitir revisão; editar = alterar a
   lista; excluir = desfazer a última revisão.
   ========================================================================== */
'use strict';

const LF_EMPRESA = 'Terral Táxi Aéreo Ltda. (Jet For Aviation) · CNPJ 01.274.847/0001-27';
const LF_ASSINA  = 'Leonardo Filipe de Araujo – Diretor de Manutenção';

// Colunas de capacidade, na ordem do modelo 8.4.23
const LF_CAPS = [
  {k:'tpax',   n:'Transp. de Pax'},
  {k:'pmac',   n:'PMAC'},
  {k:'cca',    n:'Carga em CCA'},
  {k:'op243d', n:'Op. conforme 135.243(d)'},
  {k:'aem',    n:'AEM'},
  {k:'ofs',    n:'OFS'},
  {k:'mel',    n:'MEL'},
  {k:'ifr',    n:'IFR'},
  {k:'ifrsp',  n:'IFR Single Pilot com PAX'},
  {k:'efb',    n:'EFB'},
  {k:'pbn',    n:'PBN'},
  {k:'agua',   n:'Grde. Ext. de Água'},
  {k:'terreno',n:'Terreno Desabitado'},
  {k:'ilscat2',n:'ILS CAT II'},
  {k:'hgs',    n:'HGS'},
  {k:'interc', n:'Intercâmbio'},
  {k:'ped',    n:'PED'}
];
const LF_VAL = {S:'Sim', N:'Não', '?':'?'};

// Valores de partida (lista .docx de 18/11/2026). O que estiver salvo na nuvem vale mais.
const LF_DEF = {
  'PR-ARN':{fab:'Textron Aviation (Beechcraft)', modelo:'King Air B200GT',           sn:'BY-021',    c:{tpax:'S',pmac:'S',cca:'N'}},
  'PR-FHN':{fab:'Cessna Aircraft',               modelo:'Citation II (550)',         sn:'550-0222',  c:{tpax:'S',pmac:'S',cca:'N'}},
  'PT-LJQ':{fab:'Cessna Aircraft',               modelo:'Citation S550 (SII)',       sn:'S550-0113', c:{tpax:'S',pmac:'S',cca:'N'}},
  'PR-LJA':{fab:'EMBRAER',                       modelo:'Phenom 300 (EMB-505)',      sn:'',          c:{tpax:'S',pmac:'S',cca:'N'}},
  'PP-SCF':{fab:'Textron Aviation (Beechcraft)', modelo:'King Air C90',              sn:'',          c:{tpax:'S',pmac:'N',cca:'N'}},
  'PS-ALT':{fab:'Textron Aviation (Beechcraft)', modelo:'King Air C90A',             sn:'LJ-1296',   c:{tpax:'S',pmac:'N',cca:'N'}},
  'PT-WHB':{fab:'Textron Aviation (Beechcraft)', modelo:'Hawker 400A (Beechjet 400)',sn:'RK-73',     c:{tpax:'S',pmac:'N',cca:'N'}}
};

const LF = { dados:null, carregado:false, editando:false, rascunho:null, emitindo:false, incluindo:false };

function _lfMat(x){ return (typeof permMat==='function') ? permMat(x) : String(x||'').toUpperCase(); }
function _lfE(s){ return (typeof esc==='function') ? esc(s) : String(s==null?'':s); }
function _lfData(iso){ if(!iso) return '__/__/____'; const p=String(iso).slice(0,10).split('-'); return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : iso; }
function _lfHoje(){ return (typeof STATE!=='undefined' && STATE && STATE.hoje) || new Date().toISOString().slice(0,10); }
function _lfPode(op){ return (typeof pode==='function') ? pode('listafrota',op) : true; }
function _lfDados(){
  if(!LF.dados){ try{ const s=localStorage.getItem('jetfor_listafrota'); if(s) LF.dados=JSON.parse(s); }catch(e){} }
  if(!LF.dados || typeof LF.dados!=='object') LF.dados={};
  if(!LF.dados.ac || typeof LF.dados.ac!=='object') LF.dados.ac={};
  if(!Array.isArray(LF.dados.revs)) LF.dados.revs=[];
  return LF.dados;
}

// S/N do cadastro: mapa da aeronave ou "S/N xxx" nas observações
function _lfSnCadastro(f, mat){
  try{ const m=STATE.acmaps && STATE.acmaps[mat]; if(m && m.aeronave && m.aeronave.sn) return m.aeronave.sn; }catch(e){}
  const o=String((f&&f.obs)||'').match(/S\/N\s*([A-Z0-9\-]+)/i);
  return o ? o[1] : '';
}

// Linhas atuais: frota cadastrada + dados salvos da lista
function lfLinhas(fonte){
  const D=fonte||_lfDados();
  const frota=(typeof STATE!=='undefined' && STATE && STATE.frota) || [];
  const vistos={};
  return frota.map(f=>{
    if(f.fora) return null; // retirada da frota: não entra na lista (o card continua na Início)
    const mat=_lfMat(f.mat); if(!mat || vistos[mat]) return null; vistos[mat]=1;
    const def=LF_DEF[mat] || {fab:f.fab||'', modelo:f.modelo||'', sn:'', c:{tpax:'S', pmac:f.sasc?'S':'N', cca:'N'}};
    const sv=D.ac[mat] || {};
    const c={}; LF_CAPS.forEach(k=>{ c[k.k] = (sv.c && sv.c[k.k]) || (def.c && def.c[k.k]) || '?'; });
    return {
      mat:mat,
      fab:   sv.fab!=null    ? sv.fab    : def.fab,
      modelo:sv.modelo!=null ? sv.modelo : def.modelo,
      sn:    sv.sn!=null     ? sv.sn     : (def.sn || _lfSnCadastro(f,mat)),
      c:c
    };
  }).filter(Boolean);
}

// O que mudou entre a última revisão e a lista de hoje
function lfDiferencas(){
  const D=_lfDados(); const ult=D.revs[D.revs.length-1];
  const agora=lfLinhas();
  if(!ult) return {inicial:true, itens:[], agora:agora};
  const antes={}; (ult.snap||[]).forEach(r=>antes[r.mat]=r);
  const novo={}; agora.forEach(r=>novo[r.mat]=r);
  const itens=[];
  (ult.snap||[]).forEach(r=>{ if(!novo[r.mat]) itens.push({t:'rem', txt:'Saiu '+r.mat+(r.modelo?' ('+r.modelo+')':'')}); });
  agora.forEach(r=>{
    const a=antes[r.mat];
    if(!a){ itens.push({t:'add', txt:'Entrou '+r.mat+(r.modelo?' ('+r.modelo+(r.sn?', S/N '+r.sn:'')+')':'')}); return; }
    const m=[];
    if((a.fab||'')!==(r.fab||'')) m.push('fabricante "'+(r.fab||'—')+'"');
    if((a.modelo||'')!==(r.modelo||'')) m.push('modelo "'+(r.modelo||'—')+'"');
    if((a.sn||'')!==(r.sn||'')) m.push('S/N '+(r.sn||'—'));
    LF_CAPS.forEach(k=>{ const va=(a.c||{})[k.k]||'?', vn=r.c[k.k]||'?'; if(va!==vn) m.push(k.n+' '+LF_VAL[vn]+' (antes '+LF_VAL[va]+')'); });
    if(m.length) itens.push({t:'chg', txt:r.mat+': '+m.join('; ')});
  });
  return {inicial:false, itens:itens, agora:agora};
}
function _lfProxNumero(){
  const D=_lfDados(); if(!D.revs.length) return 'Original';
  let n=0; D.revs.forEach(r=>{ const v=parseInt(r.n,10); if(!isNaN(v) && v>n) n=v; });
  return String(n+1).padStart(2,'0');
}

// ---------- nuvem ----------
function lfCarregar(){
  if(LF.carregado) return;
  if(typeof ONLINE==='undefined' || !ONLINE || typeof DB==='undefined' || !DB) return;
  LF.carregado=true;
  acDoc('_geral').get().then(snap=>{
    const d=(snap.exists && snap.data()) || {};
    if(d.listaFrota){ LF.dados=d.listaFrota; _lfDados(); try{ localStorage.setItem('jetfor_listafrota', JSON.stringify(LF.dados)); }catch(e){} }
    const v=document.getElementById('view-listafrota'); if(v && v.style.display!=='none' && !LF.editando && !LF.emitindo) renderListaFrota();
  }).catch(e=>{ LF.carregado=false; console.error('listaFrota',e); });
}
async function _lfGravar(msg, comFrota){
  const D=_lfDados();
  try{ localStorage.setItem('jetfor_listafrota', JSON.stringify(D)); }catch(e){}
  if(comFrota){ try{ if(typeof saveLocal==='function') saveLocal(); }catch(e){} try{ if(typeof drawFleet==='function') drawFleet(); }catch(e){} }
  if(typeof ONLINE!=='undefined' && ONLINE && typeof DB!=='undefined' && DB){
    try{
      const upd={listaFrota:JSON.parse(JSON.stringify(D)), updatedAt:new Date().toISOString()};
      if(comFrota) upd.frota=STATE.frota;
      await acDoc('_geral').update(upd);
      toast('✔ '+msg+' (salvo na nuvem)'); return true;
    }catch(e){
      console.error(e);
      toast('⚠ Não salvou na nuvem: '+((e&&e.code)==='permission-denied' ? 'sem permissão (veja as regras do Firebase)' : (e.message||e)));
      return false;
    }
  }
  toast('✔ '+msg+' (salvo neste navegador)'); return true;
}

// ---------- ações ----------
function lfEditar(){ LF.editando=true; LF.emitindo=false; LF.rascunho=JSON.parse(JSON.stringify(lfLinhas())); renderListaFrota(); }
function lfCancelar(){ LF.editando=false; LF.emitindo=false; LF.incluindo=false; LF.rascunho=null; renderListaFrota(); }
function lfSet(i, campo, v){
  const r=LF.rascunho && LF.rascunho[i]; if(!r) return;
  if(campo.indexOf('c.')===0) r.c[campo.slice(2)]=v; else r[campo]=String(v).trim();
  if(campo.indexOf('c.')===0){ const el=document.getElementById('lfc_'+i+'_'+campo.slice(2)); if(el) el.className='lfsel lf'+(v==='?'?'q':v); }
}
async function lfSalvar(){
  const D=_lfDados(); if(!LF.rascunho) return;
  LF.rascunho.forEach(r=>{ D.ac[r.mat]={fab:r.fab, modelo:r.modelo, sn:r.sn, c:Object.assign({},r.c)}; });
  const ok=await _lfGravar('Lista da frota atualizada');
  if(typeof logAction==='function') logAction('Alterou a lista de gestão da frota (MGM 2.9)','');
  if(ok){ LF.editando=false; LF.rascunho=null; }
  renderListaFrota();
}
function lfAbrirEmissao(){ LF.emitindo=true; LF.editando=false; renderListaFrota(); const t=document.getElementById('lfTxt'); if(t) t.focus(); }
async function lfEmitir(){
  const D=_lfDados();
  const n=(document.getElementById('lfNum').value||'').trim() || _lfProxNumero();
  const data=document.getElementById('lfDataRev').value || _lfHoje();
  const txt=(document.getElementById('lfTxt').value||'').trim();
  if(!txt){ toast('Escreva o que mudou nesta revisão.'); return; }
  const u=window.CURRENT_USER||{};
  D.revs.push({n:n, data:data, txt:txt, por:u.nome||u.email||'', uid:u.uid||'', ts:new Date().toISOString(), snap:JSON.parse(JSON.stringify(lfLinhas()))});
  let comFrota=false;
  if(_lfPodeFrota('e')) (STATE.frota||[]).forEach(f=>{ if(f.fora && !f.fora.rev){ f.fora.rev=n; comFrota=true; } });
  const ok=await _lfGravar('Revisão '+n+' emitida', comFrota);
  if(!ok){ D.revs.pop(); renderListaFrota(); return; }
  if(typeof logAction==='function') logAction('Emitiu revisão da lista de gestão da frota', 'Rev. '+n+' · '+txt);
  LF.emitindo=false; renderListaFrota();
}
async function lfExcluirRev(){
  const D=_lfDados(); const r=D.revs[D.revs.length-1]; if(!r) return;
  if(!confirm('Desfazer a revisão '+r.n+' de '+_lfData(r.data)+'?\nA lista volta a comparar com a revisão anterior.')) return;
  D.revs.pop();
  const ok=await _lfGravar('Revisão '+r.n+' desfeita');
  if(!ok){ D.revs.push(r); }
  else if(typeof logAction==='function') logAction('Desfez revisão da lista de gestão da frota', 'Rev. '+r.n);
  renderListaFrota();
}

// ---------- incluir / retirar aeronave (mexe no cadastro da frota = cards da Início) ----------
function _lfPodeFrota(op){ return (typeof pode==='function') ? pode('frota',op) : true; }
function _lfAvisoFrota(){ toast('🔒 Para incluir ou retirar aeronave você também precisa poder alterar o Mapa com todas as aeronaves.'); }
function _lfIdxFrota(mat){ return (STATE.frota||[]).findIndex(f=>_lfMat(f.mat)===mat); }
function lfAbrirInclusao(){ LF.incluindo=true; LF.editando=false; LF.emitindo=false; renderListaFrota(); const t=document.getElementById('lfiMat'); if(t) t.focus(); }
async function lfIncluir(){
  if(!_lfPodeFrota('c')){ _lfAvisoFrota(); return; }
  const v=id=>(document.getElementById(id).value||'').trim();
  const mat=_lfMat(v('lfiMat'));
  if(!/^[A-Z]{2}-[A-Z]{3}$/.test(mat)){ toast('Digite a matrícula no formato PT-ABC.'); return; }
  const fab=v('lfiFab'), modelo=v('lfiMod'), sn=v('lfiSn'), enq=v('lfiEnq')||'135.411(a)(1)';
  if(!modelo){ toast('Digite o modelo da aeronave.'); return; }
  STATE.frota=STATE.frota||[];
  const i=_lfIdxFrota(mat);
  if(i>=0 && !STATE.frota[i].fora){ toast(mat+' já está na frota.'); return; }
  if(i>=0){ delete STATE.frota[i].fora; Object.assign(STATE.frota[i],{fab:fab||STATE.frota[i].fab, modelo:modelo, enq:enq, sasc:enq==='135.411(a)(2)'}); }
  else STATE.frota.push({mat:mat, modelo:modelo, fab:fab, tcds:'a levantar', assentos:'', enq:enq, sasc:enq==='135.411(a)(2)', obs:sn?'S/N '+sn:'', mapa:null});
  const D=_lfDados(); const ant=D.ac[mat]||{};
  D.ac[mat]={fab:fab, modelo:modelo, sn:sn, c:Object.assign({tpax:'S', pmac:enq==='135.411(a)(2)'?'S':'N', cca:'N'}, ant.c||{})};
  const ok=await _lfGravar(mat+' incluída na frota', true);
  if(typeof logAction==='function') logAction('Incluiu aeronave na Gestão da Frota', mat+' · '+modelo);
  if(ok){ LF.incluindo=false; LF.emitindo=_lfPode('c'); }
  renderListaFrota();
}
async function lfRetirar(mat){
  if(!_lfPodeFrota('e')){ _lfAvisoFrota(); return; }
  const i=_lfIdxFrota(mat); if(i<0) return;
  if(!confirm('Retirar '+mat+' da frota?\n\nO card continua na Início com o aviso "Fora da frota", e o mapa e o histórico ficam guardados. Depois, emita a nova revisão da lista.')) return;
  const u=window.CURRENT_USER||{};
  STATE.frota[i].fora={data:_lfHoje(), por:u.nome||u.email||''};
  const ok=await _lfGravar(mat+' retirada da frota', true);
  if(!ok){ delete STATE.frota[i].fora; renderListaFrota(); return; }
  if(typeof logAction==='function') logAction('Retirou aeronave da Gestão da Frota', mat);
  LF.emitindo=_lfPode('c'); LF.editando=false; LF.incluindo=false;
  renderListaFrota();
}
async function lfReincluir(mat){
  if(!_lfPodeFrota('e')){ _lfAvisoFrota(); return; }
  const i=_lfIdxFrota(mat); if(i<0) return;
  if(!confirm('Voltar '+mat+' para a frota?')) return;
  const ant=STATE.frota[i].fora; delete STATE.frota[i].fora;
  const ok=await _lfGravar(mat+' de volta à frota', true);
  if(!ok){ STATE.frota[i].fora=ant; renderListaFrota(); return; }
  if(typeof logAction==='function') logAction('Reincluiu aeronave na Gestão da Frota', mat);
  LF.emitindo=_lfPode('c'); renderListaFrota();
}

// ---------- tela ----------
function _lfCelula(v){ return v==='S' ? '<td class="lfS">Sim</td>' : v==='N' ? '<td class="lfN">Não</td>' : '<td class="lfq">?</td>'; }
function _lfTabela(linhas, editar){
  const ret = !editar && _lfPode('x') && _lfPodeFrota('e');
  const cab='<tr><th>Item</th><th class="l">Fabricante</th><th class="l">Modelo</th><th class="l">Marcas e Matrícula</th>'+
    LF_CAPS.map(k=>'<th class="cap"><span>'+_lfE(k.n)+'</span></th>').join('')+(ret?'<th></th>':'')+'</tr>';
  const corpo=linhas.map((r,i)=>{
    if(editar){
      const inp=(campo,ph)=>'<input class="lfinp" value="'+_lfE(r[campo]||'')+'" placeholder="'+ph+'" onchange="lfSet('+i+',\''+campo+'\',this.value)">';
      return '<tr><td>'+(i+1)+'</td><td class="l">'+inp('fab','Fabricante')+'</td><td class="l">'+inp('modelo','Modelo')+'</td>'+
        '<td class="l"><b>'+_lfE(r.mat)+'</b><br>'+inp('sn','S/N')+'</td>'+
        LF_CAPS.map(k=>{ const v=r.c[k.k]||'?'; return '<td><select id="lfc_'+i+'_'+k.k+'" class="lfsel lf'+(v==='?'?'q':v)+'" title="'+_lfE(k.n)+'" onchange="lfSet('+i+',\'c.'+k.k+'\',this.value)">'+
          ['S','N','?'].map(o=>'<option value="'+o+'"'+(o===v?' selected':'')+'>'+LF_VAL[o]+'</option>').join('')+'</select></td>'; }).join('')+'</tr>';
    }
    return '<tr><td>'+(i+1)+'</td><td class="l">'+_lfE(r.fab||'')+'</td><td class="l">'+_lfE(r.modelo||'')+'</td>'+
      '<td class="l lfmat"><b>'+_lfE(r.mat)+'</b>'+(r.sn?'<span>S/N '+_lfE(r.sn)+'</span>':'<span class="lfmiss">S/N ?</span>')+'</td>'+
      LF_CAPS.map(k=>_lfCelula(r.c[k.k])).join('')+(ret?'<td><button class="btn o sm lfret" onclick="lfRetirar(\''+r.mat+'\')" title="Retirar da frota">Retirar</button></td>':'')+'</tr>';
  }).join('');
  return '<div class="lfscroll"><table class="lftab"><thead>'+cab+'</thead><tbody>'+(corpo||'<tr><td colspan="'+(4+LF_CAPS.length)+'">Nenhuma aeronave no cadastro da frota.</td></tr>')+'</tbody></table></div>';
}
function _lfTabelaRevs(revs, comBotoes){
  const D=_lfDados();
  const lin=revs.slice().reverse().map((r,ri)=>{
    const idx=revs.length-1-ri;
    const btn = comBotoes ? '<td class="no-print" style="white-space:nowrap"><button class="btn o sm" onclick="lfImprimir('+idx+')" title="Imprimir esta revisão">🖨</button>'+
      (idx===D.revs.length-1 && _lfPode('x') ? ' <button class="btn o sm lfdel" onclick="lfExcluirRev()" title="Desfazer esta revisão">↶</button>' : '')+'</td>' : '';
    return '<tr><td>'+_lfE(r.n)+'</td><td>'+_lfData(r.data)+'</td><td class="l">'+_lfE(r.txt||'')+'</td><td class="l">'+_lfE(r.por||'')+'</td>'+btn+'</tr>';
  }).join('');
  return '<div class="lfscroll"><table class="lftab lfrevs"><thead><tr><th>Nº da revisão</th><th>Data</th><th class="l">Alterações</th><th class="l">Por</th>'+(comBotoes?'<th class="no-print"></th>':'')+'</tr></thead><tbody>'+
    (lin||'<tr><td colspan="'+(comBotoes?5:4)+'" style="color:#8a94a6">Nenhuma revisão emitida ainda.</td></tr>')+'</tbody></table></div>';
}

function renderListaFrota(){
  const el=document.getElementById('view-listafrota'); if(!el) return;
  lfCarregar();
  const D=_lfDados(); const dif=lfDiferencas(); const ult=D.revs[D.revs.length-1];
  const linhas = LF.editando && LF.rascunho ? LF.rascunho : dif.agora;
  const faltaSn=dif.agora.filter(r=>!r.sn).map(r=>r.mat);
  const nQ=dif.agora.reduce((s,r)=>s+LF_CAPS.filter(k=>(r.c[k.k]||'?')==='?').length,0);

  let pills='<span class="lfpill">'+(ult?'Revisão em vigor: '+_lfE(ult.n)+' · '+_lfData(ult.data):'Nenhuma revisão emitida')+'</span>';
  if(!dif.inicial && dif.itens.length) pills+='<span class="lfpill lfwarn">'+dif.itens.length+' mudança'+(dif.itens.length>1?'s':'')+' ainda não registrada'+(dif.itens.length>1?'s':'')+' em revisão</span>';
  if(faltaSn.length) pills+='<span class="lfpill lfwarn">Falta S/N: '+_lfE(faltaSn.join(', '))+'</span>';
  if(nQ) pills+='<span class="lfpill lfwarn">'+nQ+' campo'+(nQ>1?'s':'')+' "?" a conferir nas EO</span>';

  let botoes='';
  if(LF.editando || LF.incluindo) botoes=LF.incluindo ? '' : '<button class="btn g" onclick="lfSalvar()">✔ Salvar lista</button><button class="btn o" onclick="lfCancelar()">Cancelar</button>';
  else {
    if(_lfPode('c') && _lfPodeFrota('c')) botoes+='<button class="btn o lfinc" onclick="lfAbrirInclusao()">➕ Incluir aeronave</button>';
    if(_lfPode('e')) botoes+='<button class="btn o lfedit" onclick="lfEditar()">✏️ Editar lista</button>';
    if(_lfPode('c')) botoes+='<button class="btn p lfnew" onclick="lfAbrirEmissao()">📌 Emitir '+(D.revs.length?'nova revisão':'revisão Original')+'</button>';
    botoes+='<button class="btn o" onclick="lfImprimir()">🖨 Imprimir (A4 deitado)</button>';
  }

  let aviso='';
  if(!D.revs.length && !LF.editando && !LF.emitindo) aviso='<div class="lfann">Ainda não há revisão emitida. Confira a tabela (use "Editar lista" para preencher o que falta) e depois clique em <b>Emitir revisão Original</b>.</div>';

  let emissao='';
  if(LF.emitindo){
    const sug = dif.inicial
      ? 'Emissão inicial com '+dif.agora.length+' aeronaves ('+dif.agora.map(r=>r.mat).join(', ')+').'
      : dif.itens.map(x=>x.txt).join('. ')+(dif.itens.length?'.':'');
    emissao='<div class="panel lfemit"><h2>📌 Emitir revisão</h2><div class="pbody">'+
      (dif.inicial ? '<p class="lead">Primeira emissão: a lista de hoje vira a revisão Original.</p>'
        : (dif.itens.length ? '<p class="lead">Mudanças desde a revisão '+_lfE(ult.n)+':</p><div class="lfdiff">'+dif.itens.map(x=>'<div class="lf'+x.t+'">'+(x.t==='add'?'+ ':x.t==='rem'?'− ':'✎ ')+_lfE(x.txt)+'</div>').join('')+'</div>'
          : '<p class="lead">Nada mudou desde a revisão '+_lfE(ult.n)+'. Você pode emitir mesmo assim, se quiser registrar outra coisa.</p>'))+
      '<div class="lfform"><label>Nº da revisão<input id="lfNum" value="'+_lfE(_lfProxNumero())+'"></label>'+
      '<label>Data<input id="lfDataRev" type="date" value="'+_lfE(_lfHoje())+'"></label></div>'+
      '<label class="lfwide">Alterações (pode editar)<textarea id="lfTxt" rows="3">'+_lfE(sug)+'</textarea></label>'+
      '<div class="lfbtns"><button class="btn g" onclick="lfEmitir()">✔ Registrar revisão</button><button class="btn o" onclick="lfCancelar()">Cancelar</button></div>'+
      '</div></div>';
  }

  let inclusao='';
  if(LF.incluindo){
    inclusao='<div class="panel lfemit"><h2>➕ Incluir aeronave na frota</h2><div class="pbody">'+
      '<p class="lead">A aeronave entra nesta lista e ganha um card na Início. Depois, emita a nova revisão.</p>'+
      '<div class="lfform"><label>Matrícula<input id="lfiMat" placeholder="PT-ABC" maxlength="8"></label>'+
      '<label>Fabricante<input id="lfiFab" placeholder="Textron Aviation (Beechcraft)"></label>'+
      '<label>Modelo<input id="lfiMod" placeholder="King Air C90GTi"></label>'+
      '<label>S/N<input id="lfiSn" placeholder="LJ-0000"></label>'+
      '<label>Enquadramento<select id="lfiEnq"><option value="135.411(a)(1)">135.411(a)(1) · até 9 assentos (não-SASC)</option><option value="135.411(a)(2)">135.411(a)(2) · 10+ assentos (SASC)</option></select></label></div>'+
      '<div class="lfbtns"><button class="btn g" onclick="lfIncluir()">✔ Incluir na frota</button><button class="btn o" onclick="lfCancelar()">Cancelar</button></div>'+
      '</div></div>';
  }
  const fora=(STATE.frota||[]).filter(f=>f.fora);
  const podeRe=_lfPode('c') && _lfPodeFrota('e');
  const secFora = fora.length ? '<div class="panel"><h2>Aeronaves fora da frota</h2><div class="pbody">'+
    '<p class="lead">Continuam com card na Início (aviso "Fora da frota"), com mapa e histórico guardados.</p>'+
    '<div class="lfscroll"><table class="lftab"><thead><tr><th class="l">Matrícula</th><th class="l">Modelo</th><th>Saiu em</th><th>Na revisão</th><th class="l">Por</th>'+(podeRe?'<th></th>':'')+'</tr></thead><tbody>'+
    fora.map(f=>{ const m=_lfMat(f.mat); return '<tr><td class="l"><b>'+_lfE(m)+'</b></td><td class="l">'+_lfE(f.modelo||'')+'</td><td>'+_lfData(f.fora.data)+'</td><td>'+_lfE(f.fora.rev||'ainda não emitida')+'</td><td class="l">'+_lfE(f.fora.por||'')+'</td>'+
      (podeRe?'<td><button class="btn o sm lfre" onclick="lfReincluir(\''+m+'\')">Voltar para a frota</button></td>':'')+'</tr>'; }).join('')+
    '</tbody></table></div></div></div>' : '';

  el.innerHTML=
    '<div class="panel"><div class="pbody lftop">'+
      '<div><div class="lftitle">Gestão da Frota de Táxi Aéreo · RBAC 135</div>'+
      '<div class="lfsub">'+_lfE(LF_EMPRESA)+' · Modelo: MGM rev 09.01, item 8.4.23 · Responsável: Diretor de Manutenção</div>'+
      '<div class="lfpills">'+pills+'</div></div>'+
      '<div class="lfbtns">'+botoes+'</div>'+
    '</div></div>'+
    aviso+inclusao+emissao+
    '<div class="panel"><h2><span class="tag">1</span> Tabela de aeronaves</h2><div class="pbody">'+
      (LF.editando?'<p class="lead">Preencha fabricante, modelo, S/N e marque cada capacidade conforme as Especificações Operativas (EO). As matrículas vêm do cadastro da frota (cards da Início).</p>':'')+
      _lfTabela(linhas, LF.editando)+
      '<div class="lflegend"><span><b class="lfS">Sim</b> autorizado / aplicável</span><span><b class="lfN">Não</b> não autorizado / não aplicável</span><span><b class="lfq" style="padding:0 5px">?</b> confirmar nas EO antes de emitir</span></div>'+
    '</div></div>'+
    '<div class="panel"><h2><span class="tag">2</span> Controle de revisões</h2><div class="pbody">'+
      _lfTabelaRevs(D.revs, true)+
      '<p class="lfsub" style="margin-top:8px">Emissão: Controle Técnico de Manutenção (eletrônica). Encaminhamento: uma via na sede administrativa e outra a bordo de cada aeronave (MGM 2.9.1 e 8.4.23). Responsável pela confecção e atualização: Gerente/Diretor de Manutenção.</p>'+
    '</div></div>'+
    secFora+
    '<div class="panel"><h2>📖 O que o MGM pede (2.9 · Gerenciamento da Frota)</h2><div class="pbody lfmgm">'+
      '<p>Manter a lista das aeronaves operadas, com tipo, matrícula e número de série, e as capacidades e autorizações no mesmo formato e detalhamento das Especificações Operativas (EO).</p>'+
      '<p>A lista tem controle formal de revisão e distribuição. É confeccionada e atualizada pelo Diretor de Manutenção, no modelo do item 8.4.23.</p>'+
      '<p>Quando uma aeronave sai e outra entra (por exemplo, saiu o PR-AEX e entrou o PT-WHB), emite-se uma nova revisão desta lista. O pedido de alteração da EO é feito à ANAC à parte.</p>'+
    '</div></div>';
}

// ---------- impressão (A4 deitado) ----------
function lfImprimir(idxRev){
  const D=_lfDados();
  const rev = (idxRev!=null) ? D.revs[idxRev] : D.revs[D.revs.length-1];
  const linhas = (idxRev!=null && rev) ? (rev.snap||[]) : lfLinhas();
  const revs = (idxRev!=null) ? D.revs.slice(0, idxRev+1) : D.revs;
  const pend = (idxRev==null) && !lfDiferencas().inicial && lfDiferencas().itens.length;
  const cel=v=> v==='S'?'<td>Sim</td>':v==='N'?'<td>Não</td>':'<td class="q">?</td>';
  const tab='<table><thead><tr><th>Item</th><th>Fabricante</th><th>Modelo</th><th>Marcas e Matrícula</th>'+LF_CAPS.map(k=>'<th class="cap"><div>'+_lfE(k.n)+'</div></th>').join('')+'</tr></thead><tbody>'+
    linhas.map((r,i)=>'<tr><td>'+(i+1)+'</td><td class="l">'+_lfE(r.fab||'')+'</td><td class="l">'+_lfE(r.modelo||'')+'</td><td class="l"><b>'+_lfE(r.mat)+'</b><br>S/N '+_lfE(r.sn||'?')+'</td>'+LF_CAPS.map(k=>cel((r.c||{})[k.k]||'?')).join('')+'</tr>').join('')+'</tbody></table>';
  const trev='<table class="revs"><thead><tr><th>Nº da revisão</th><th>Data</th><th>Alterações</th></tr></thead><tbody>'+
    (revs.length ? revs.map(r=>'<tr><td>'+_lfE(r.n)+'</td><td>'+_lfData(r.data)+'</td><td class="l">'+_lfE(r.txt||'')+'</td></tr>').join('') : '<tr><td>Original</td><td>__/__/____</td><td class="l"></td></tr>')+'</tbody></table>';
  const html='<!doctype html><html><head><meta charset="utf-8"><title>Gestão da Frota'+(rev?' · Rev. '+_lfE(rev.n):'')+'</title><style>'+
    '@page{size:A4 landscape;margin:9mm}body{font-family:Arial,sans-serif;color:#111;font-size:10px;margin:0}'+
    'h1{font-size:15px;margin:0;text-align:center}h2{font-size:11.5px;margin:12px 0 4px}.sub{text-align:center;color:#444;font-size:10px;margin:2px 0 8px}'+
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid #777;padding:3px 4px;text-align:center;vertical-align:middle}'+
    'th{background:#e4e9f2;font-size:9px}th.cap{height:96px;padding:2px}th.cap div{writing-mode:vertical-rl;transform:rotate(180deg);margin:auto;white-space:nowrap}'+
    'td.l,th.l{text-align:left}td.q{background:#fff3c4}.revs td.l{text-align:left}.revs th:nth-child(3){width:70%}'+
    '.leg{font-size:9px;color:#444;margin-top:4px}.note{font-size:9.5px;margin-top:8px;line-height:1.45}'+
    '.sig{margin-top:30px;width:320px;border-top:1px solid #111;padding-top:3px;font-size:10px}.warn{color:#a00;font-weight:bold;text-align:center;margin:4px 0}'+
    'tr{break-inside:avoid}</style></head><body>'+
    '<h1>Gestão da Frota de Táxi Aéreo · RBAC 135</h1>'+
    '<div class="sub">'+_lfE(LF_EMPRESA)+' · Modelo: MGM rev 09.01, item 8.4.23'+(rev?' · <b>Revisão '+_lfE(rev.n)+' de '+_lfData(rev.data)+'</b>':'')+'</div>'+
    (pend?'<div class="warn">Atenção: esta impressão tem mudanças que ainda não foram registradas em revisão.</div>':'')+
    '<h2>1. Tabela de aeronaves</h2>'+tab+
    '<div class="leg">Sim = autorizado/aplicável · Não = não autorizado/não aplicável · ? = confirmar nas Especificações Operativas (EO).</div>'+
    '<h2>2. Controle de revisões</h2>'+trev+
    '<div class="note">Emissão: Controle Técnico de Manutenção (eletrônica). Encaminhamento: uma via na sede administrativa e outra a bordo de cada aeronave (MGM 2.9.1 e 8.4.23).<br>Responsável pela confecção e atualização: Gerente/Diretor de Manutenção.</div>'+
    '<div class="sig">'+_lfE(LF_ASSINA)+'</div></body></html>';
  const ifr=document.createElement('iframe'); ifr.style.position='fixed'; ifr.style.right='0'; ifr.style.bottom='0'; ifr.style.width='0'; ifr.style.height='0'; ifr.style.border='0';
  document.body.appendChild(ifr);
  const d=ifr.contentWindow.document; d.open(); d.write(html); d.close();
  setTimeout(function(){ try{ ifr.contentWindow.focus(); ifr.contentWindow.print(); }catch(e){} setTimeout(function(){ try{ifr.remove();}catch(e){} }, 1500); }, 350);
  if(typeof logAction==='function') logAction('Imprimiu a lista de gestão da frota', rev?'Rev. '+rev.n:'');
}

// ---------- estilo da tela ----------
(function(){
  if(document.getElementById('lfCSS')) return;
  const st=document.createElement('style'); st.id='lfCSS';
  st.textContent=
    '#view-listafrota .lftop{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:flex-start}'+
    '#view-listafrota .lftitle{font-size:17px;font-weight:700;color:var(--navy)}'+
    '#view-listafrota .lfsub{color:#5d6677;font-size:12px;margin-top:3px;line-height:1.5}'+
    '#view-listafrota .lfpills{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}'+
    '#view-listafrota .lfpill{background:#e6ebf4;color:var(--navy);border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:600}'+
    '#view-listafrota .lfpill.lfwarn{background:var(--warnbg);color:#8a6508}'+
    '#view-listafrota .lfbtns{display:flex;flex-wrap:wrap;gap:8px;align-items:center}'+
    '#view-listafrota .lfann{background:#fff6d6;border:1px solid #e0c060;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12.5px}'+
    '#view-listafrota .lfscroll{overflow-x:auto;border:1px solid var(--line);border-radius:6px}'+
    '#view-listafrota .lftab{border-collapse:collapse;width:100%;font-size:12px}'+
    '#view-listafrota .lftab th,#view-listafrota .lftab td{border-bottom:1px solid var(--line);padding:6px 7px;text-align:center;vertical-align:middle}'+
    '#view-listafrota .lftab th{background:var(--navy);color:#fff;font-weight:600;font-size:11px;line-height:1.25}'+
    '#view-listafrota .lftab th.cap{height:128px;padding:6px 3px}'+
    '#view-listafrota .lftab th.cap span{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;display:inline-block}'+
    '#view-listafrota .lftab .l{text-align:left}'+
    '#view-listafrota .lftab tbody tr:nth-child(even) td{background:var(--zebra)}'+
    '#view-listafrota .lfmat b{display:block}#view-listafrota .lfmat span{color:#5d6677;font-size:11px}'+
    '#view-listafrota .lfmiss{color:var(--od)!important;font-weight:700}'+
    '#view-listafrota .lfS{color:var(--ok);font-weight:700}#view-listafrota .lfN{color:#8a94a6}'+
    '#view-listafrota td.lfq,#view-listafrota b.lfq{background:var(--warnbg)!important;color:#8a6508;font-weight:700}'+
    '#view-listafrota .lflegend{display:flex;flex-wrap:wrap;gap:14px;font-size:11.5px;color:#5d6677;margin-top:8px}'+
    '#view-listafrota .lfinp{width:100%;min-width:110px;border:1px solid var(--line);border-radius:5px;padding:4px 6px;font-size:12px}'+
    '#view-listafrota .lfsel{border:1px solid var(--line);border-radius:5px;padding:3px 2px;font-size:11.5px;font-weight:700}'+
    '#view-listafrota .lfsel.lfS{background:var(--okbg)}#view-listafrota .lfsel.lfN{background:#eef2f8;color:#5d6677}#view-listafrota .lfsel.lfq{background:var(--warnbg);color:#8a6508}'+
    '#view-listafrota .lfdiff{display:flex;flex-direction:column;gap:6px;margin:6px 0 10px}'+
    '#view-listafrota .lfdiff div{padding:6px 10px;border-radius:6px;font-weight:600}'+
    '#view-listafrota .lfadd{background:var(--okbg);color:var(--ok)}#view-listafrota .lfrem{background:var(--odbg);color:var(--od)}#view-listafrota .lfchg{background:var(--warnbg);color:#8a6508}'+
    '#view-listafrota .lfform{display:flex;flex-wrap:wrap;gap:12px}'+
    '#view-listafrota label{display:flex;flex-direction:column;gap:3px;font-size:11.5px;color:#5d6677;margin-bottom:8px}'+
    '#view-listafrota label input,#view-listafrota label textarea,#view-listafrota label select{border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-size:12.5px;font-family:inherit}'+
    '#view-listafrota .lfwide textarea{width:100%}'+
    '#view-listafrota .lfemit{border:2px solid var(--gold)}'+
    '#view-listafrota .lfmgm p{margin:0 0 8px;max-width:80ch;line-height:1.6;font-size:12.5px}';
  document.head.appendChild(st);
})();
