/* ==========================================================================
   JetFor · Permissões por tela e por aeronave (v71)
   Cada usuário tem, para cada tela: v (ver), c (criar), e (editar), x (excluir)
   e uma lista de aeronaves ('todas' ou ['PT-LJQ', ...]).
   - Admin (e o UID-mestre) tem tudo.
   - Quem ainda não tem permissões salvas segue o papel antigo:
     editor = tudo nas telas comuns; leitor = só ver.
   O que o banco garante de verdade está em firestore.rules (aeronave e
   "pode alterar a tela"). Criar / editar / excluir separados valem na tela.
   ========================================================================== */
'use strict';

// Telas que aparecem na tabela de permissões. so:'v' = tela só de leitura.
// ac:true = obedece também à escolha de aeronaves.
window.PERM_TELAS = [
  {k:'inicio',   n:'Início',                       d:'Painel da frota', ac:true, so:'v'},
  {k:'mapa',     n:'Mapa de Manutenção',           d:'Tarefas, contadores, baixas, O.S., DA e cadastro de aeronaves', ac:true},
  {k:'freq',     n:'Atividades & Frequências',     d:'Resumo das tarefas', ac:true, so:'v'},
  {k:'docsac',   n:'Documentos da aeronave',       d:'Anexos de cada aeronave', ac:true},
  {k:'geral',    n:'Pasta Geral',                  d:'Documentos da empresa'},
  {k:'listafrota',n:'Gestão da Frota (MGM 2.9)',   d:'Lista da frota (modelo 8.4.23): criar = incluir aeronave / emitir revisão; excluir = retirar da frota'},
  {k:'obrig',    n:'Obrigações MGM (SASC / PMAC)', d:'', so:'v'},
  {k:'sasc',     n:'SASC',                         d:'Confiabilidade, níveis de alerta e RSI'},
  {k:'oficinas', n:'Oficinas & Auditorias',        d:'Oficinas, inspetores, MGM e auditorias'},
  {k:'forms',    n:'Formulários',                  d:'', so:'v'},
  {k:'usuarios', n:'Usuários e permissões',        d:'Só o modelo Admin', adm:true},
  {k:'logs',     n:'Registro de atividades',       d:'Só o modelo Admin', adm:true, so:'v'}
];
window.PERM_OPS = ['v','c','e','x'];
const _OPNOME = {v:'ver', c:'criar', e:'editar', x:'excluir'};

function _permFull(){ const p={}; PERM_TELAS.forEach(t=>{ p[t.k]={v:true,c:!t.so,e:!t.so,x:!t.so}; }); return p; }
function _permOnly(keys, ops){
  const p={};
  PERM_TELAS.forEach(t=>{
    p[t.k]={v:false,c:false,e:false,x:false};
    if(t.adm) return;
    if(keys==='*' || keys.indexOf(t.k)>=0) ops.forEach(o=>{ if(!(t.so && o!=='v')) p[t.k][o]=true; });
  });
  return p;
}
// Modelos prontos (o admin escolhe um e pode ajustar; ao ajustar vira "Personalizado")
window.PERM_MODELOS = {
  admin:    {n:'Admin',           p:()=>_permFull()},
  editor:   {n:'Editor',          p:()=>_permOnly('*',['v','c','e','x'])},
  leitor:   {n:'Leitor',          p:()=>_permOnly('*',['v'])},
  mecanico: {n:'Mecânico',        p:()=>{ const p=_permOnly(['inicio','freq','mapa','docsac','forms','geral'],['v']); p.mapa={v:true,c:false,e:true,x:false}; return p; }},
  auditor:  {n:'Auditor externo', p:()=>_permOnly(['inicio','mapa','docsac','listafrota','obrig','sasc','oficinas'],['v'])}
};
function permModeloNome(k){ return (PERM_MODELOS[k]&&PERM_MODELOS[k].n) || (k==='personalizado'?'Personalizado':(k||'—')); }

// Permissões efetivas de um perfil (usado no login e na tela de Usuários)
function permDoPerfil(perfil, isMaster){
  perfil = perfil||{};
  if(isMaster || perfil.papel==='admin') return {admin:true, p:_permFull(), acs:'todas'};
  let p;
  if(perfil.perm && typeof perfil.perm==='object'){
    p=_permOnly([],[]);
    PERM_TELAS.forEach(t=>{ if(t.adm) return; const s=perfil.perm[t.k]||{}; PERM_OPS.forEach(o=>{ p[t.k][o] = !(t.so&&o!=='v') && s[o]===true; }); });
  } else if(perfil.papel==='editor') p=PERM_MODELOS.editor.p();
  else p=PERM_MODELOS.leitor.p();
  const acs = Array.isArray(perfil.acs) ? perfil.acs.map(permMat) : 'todas';
  return {admin:false, p:p, acs:acs};
}

// ---------- consultas ----------
function _permAtual(){
  if(!window.AUTH_ENABLED) return {admin:true, p:_permFull(), acs:'todas'};
  const u=window.CURRENT_USER; if(!u) return {admin:false, p:_permOnly([],[]), acs:[]};
  return u.permEf || permDoPerfil(u, isMasterUid(u.uid));
}
function souAdmin(){ return !!_permAtual().admin; }
// normaliza a matrícula ("ptljq", "PT-LJQ Citation" → "PT-LJQ")
function permMat(x){ const s=String(x||'').toUpperCase(); const m=s.match(/[A-Z]{2}-?[A-Z]{3}/); if(!m) return s; let v=m[0]; if(v.indexOf('-')<0) v=v.slice(0,2)+'-'+v.slice(2); return v; }
function acVisivel(ac){
  const P=_permAtual(); if(P.admin || P.acs==='todas') return true;
  return P.acs.indexOf(permMat(ac))>=0;
}
function todasAeronaves(){ const P=_permAtual(); return P.admin || P.acs==='todas'; }
function pode(tela, op, ac){
  const P=_permAtual(); if(P.admin) return true;
  if(tela==='frota'){ // cadastro de aeronaves: segue o Mapa e exige todas as aeronaves
    return todasAeronaves() && pode('mapa',op);
  }
  const t=P.p[tela]; if(!t || !t[op]) return false;
  if(ac && !acVisivel(ac)) return false;
  return true;
}
function podeAlterar(tela, ac){ return pode(tela,'c',ac)||pode(tela,'e',ac)||pode(tela,'x',ac); }
function podeAlgumaAlteracao(){ return ['mapa','docsac','geral','sasc','oficinas','listafrota'].some(t=>podeAlterar(t)); }
function podeOuAvisa(tela, op, ac){
  if(pode(tela,op,ac)) return true;
  const nome=(PERM_TELAS.find(t=>t.k===(tela==='frota'?'mapa':tela))||{}).n||tela;
  toast('🔒 Você não tem permissão para '+(_OPNOME[op]||op)+' em '+nome+(ac&&!acVisivel(ac)?' ('+ac+')':'')+'.');
  return false;
}
// mantém a função antiga (botão do RSI na Início) apontando para a nova regra
window._podeEditar = function(){ return pode('sasc','e'); };

// ---------- trava das ações (vale mesmo se o botão aparecer) ----------
const _docTela = s => s==='geral' ? ['geral',null] : ['docsac', s];
const _cur = ()=> (typeof STATE!=='undefined' && STATE) ? STATE.currentAC : null;
const PERM_GUARDS = {
  // Mapa de Manutenção
  saveModal:          ()=>['mapa', (typeof editingId!=='undefined' && editingId!=null)?'e':'c', _cur()],
  deleteTask:         ()=>['mapa','x',_cur()],
  registrarTroca:     ()=>['mapa','e',_cur()],
  novoGrupo:          ()=>['mapa','c',_cur()],
  renomearGrupo:      ()=>['mapa','e',_cur()],
  removerGrupo:       ()=>['mapa','x',_cur()],
  openBaixa:          ()=>['mapa','e',_cur()],
  aplicarBaixa:       ()=>['mapa','e',_cur()],
  baixaDel:           ()=>['mapa','x',_cur()],
  baixaAplicarExtras: ()=>['mapa','e',_cur()],
  histLancarEmOutras: ()=>['mapa','e',_cur()],
  gerarOS:            ()=>['mapa','c',_cur()],
  registrarOS:        ()=>['mapa','c',_cur()],
  salvarOSedit:       ()=>['mapa','e',_cur()],
  excluirOS:          ()=>['mapa','x',_cur()],
  saveDA:             ()=>['mapa', (typeof DACTX!=='undefined' && DACTX.idx>=0)?'e':'c', _cur()],
  deleteDA:           ()=>['mapa','x',_cur()],
  limparRodapes:      ()=>['mapa','x',_cur()],
  propagarCelula:     ()=>['mapa','e',_cur()],
  saveCountersCloud:  a=>['mapa','e',a[0]||_cur()],
  // cadastro de aeronaves (cards da Início)
  openAcModal:        a=>['frota', a[0]==null?'c':'e'],
  saveAcModal:        ()=>['frota', (typeof acEditIdx!=='undefined' && acEditIdx!=null)?'e':'c'],
  delAc:              ()=>['frota','x'],
  // SASC
  confiabAdd:         ()=>['sasc','c'],
  cfLoteRegistrar:    ()=>['sasc','c'],
  cfLoteAddLinha:     ()=>['sasc','c'],
  confiabDel:         ()=>['sasc','x'],
  niveisSet:          ()=>['sasc','e'],
  rsiToggle:          ()=>['sasc','e'],
  // Documentos (Pasta Geral e da aeronave)
  addDocCat:          a=>{ const [t,ac]=_docTela(a[0]); return [t,'c',ac]; },
  uploadDoc:          a=>{ const [t,ac]=_docTela(a[0]); return [t,'c',ac]; },
  removeDocCat:       a=>{ const [t,ac]=_docTela(a[0]); return [t,'x',ac]; },
  excluirDoc:         a=>{ const [t,ac]=_docTela(a[0]); return [t,'x',ac]; },
  moveDoc:            a=>{ const [t,ac]=_docTela(a[0]); return [t,'e',ac]; },
  toggleDocAc:        ()=>['geral','e'],
  autoVincularGeral:  ()=>['geral','e'],
  syncStorageDocs:    ()=>['geral','c'],
  // Oficinas & Auditorias
  openOficinaModal:   a=>['oficinas', a[0]==null?'c':'e'],
  saveOficina:        ()=>['oficinas', (typeof AUDCTX!=='undefined' && AUDCTX.of!=null && AUDCTX.of>=0)?'e':'c'],
  excluirOficina:     ()=>['oficinas','x'],
  ofField:            ()=>['oficinas','e'],
  ofToggleAeronave:   ()=>['oficinas','e'],
  ofComprovSet:       ()=>['oficinas','e'],
  ofInspAdd:          ()=>['oficinas','e'],
  ofInspSet:          ()=>['oficinas','e'],
  ofInspDel:          ()=>['oficinas','e'],
  ofInspDesignacao:   ()=>['oficinas','e'],
  ofMgmAdd:           ()=>['oficinas','e'],
  ofMgmSet:           ()=>['oficinas','e'],
  ofMgmDel:           ()=>['oficinas','e'],
  salvarAuditoria:    ()=>['oficinas', (typeof AUDCTX!=='undefined' && AUDCTX.aud>=0)?'e':'c'],
  excluirAuditoria:   ()=>['oficinas','x'],
  // Gestão da Frota (MGM 2.9)
  lfEditar:           ()=>['listafrota','e'],
  lfSalvar:           ()=>['listafrota','e'],
  lfAbrirEmissao:     ()=>['listafrota','c'],
  lfEmitir:           ()=>['listafrota','c'],
  lfExcluirRev:       ()=>['listafrota','x'],
  lfAbrirInclusao:    ()=>['listafrota','c'],
  lfIncluir:          ()=>['listafrota','c'],
  lfRetirar:          ()=>['listafrota','x'],
  lfReincluir:        ()=>['listafrota','c'],
  abrirImportarMapa:  ()=>['mapa','e',_cur()],
  // Importar substitui tudo: só admin
  importJSON:         ()=>['_admin','x']
};
function permInstallGuards(){
  Object.keys(PERM_GUARDS).forEach(name=>{
    const orig=window[name]; if(typeof orig!=='function' || orig._permGuard) return;
    const g=function(){
      const r=PERM_GUARDS[name](arguments);
      if(r[0]==='_admin'){ if(!souAdmin()){ toast('🔒 Só administradores podem fazer isso.'); return; } }
      else if(!podeOuAvisa(r[0],r[1],r[2])) return;
      return orig.apply(this,arguments);
    };
    g._permGuard=true; window[name]=g;
  });
}

// ---------- esconder o que a pessoa não pode usar ----------
// Para cada tela/ação: elementos escondidos quando NÃO há a permissão.
const PERM_HIDE = {
  'mapa-c': ['#btnAdd','#f_grupoNew','#btnOS','#osReg','#daNew'],
  'mapa-e': ['#btnXlsImport','#tbody [data-edit]','.grpedit','#f_troca','#btnBaixa','#baixaOk','#mapa-sheet [data-daedit]','.newbtn'],
  'mapa-x': ['#btnDelete','.grpdel','#osDel','#mapa-sheet [data-dadel]','#daLimpar','#mapa-sheet [data-bxdel]','#mapa-sheet [data-del]'],
  'frota-c':['#btnAddAc'],
  'frota-e':['.hm-menu [data-edit]','#acOk'],
  'frota-x':['.hm-menu [data-del]','#acDelete'],
  'sasc-c': ['[onclick^="confiabAdd"]','[onclick^="cfLoteRegistrar"]','[onclick^="cfLoteAddLinha"]','[onclick^="cfLoteDelLinha"]'],
  'sasc-e': ['[data-rsi]'],
  'sasc-x': ['[onclick^="confiabDel"]'],
  'geral-c':['#view-geral #docUp','#view-geral #docNewCat','#view-geral #docSync','#view-geral #docFile'],
  'geral-e':['#view-geral .docmove','#view-geral #docAutoAc','#view-geral .docacsedit'],
  'geral-x':['#view-geral .docdel','#view-geral .catdel'],
  'docsac-c':['#view-mapa #docUp','#view-mapa #docNewCat','#view-mapa #docSync','#view-mapa #docFile'],
  'docsac-e':['#view-mapa .docmove'],
  'docsac-x':['#view-mapa .docdel','#view-mapa .catdel'],
  'listafrota-c':['#view-listafrota .lfnew','#view-listafrota .lfinc','#view-listafrota .lfre'],
  'listafrota-e':['#view-listafrota .lfedit'],
  'listafrota-x':['#view-listafrota .lfdel','#view-listafrota .lfret'],
  'oficinas-c':['#ofAdd','#audNew','[onclick^="openOficinaModal(null"]'],
  'oficinas-e':['[data-ofedit]','[onclick^="ofInspAdd"]','[onclick^="ofInspDel"]','[onclick^="ofInspDesignacao"]','[onclick^="ofMgmAdd"]','[onclick^="ofMgmDel"]','#audAddNc','#audAddAc'],
  'oficinas-x':['[data-ofdel]','[data-auddel]','[onclick^="excluirAuditoria"]']
};
// Campos que viram só leitura quando não há "editar"
const PERM_LOCK = {
  'mapa-e':['#cgrid input','#hoje'],
  'sasc-e':['#view-confiab [onchange^="niveisSet"]'],
  'oficinas-e':['[onchange^="ofField"]','[onchange^="ofToggleAeronave"]','[onchange^="ofComprovSet"]','[onchange^="ofInspSet"]','[onchange^="ofMgmSet"]']
};
function permAplicarTela(){
  const b=document.body; if(!b) return;
  // remove marcas antigas
  [...b.classList].filter(c=>/^(nop|nov)-/.test(c)).forEach(c=>b.classList.remove(c));
  b.classList.remove('nop-salvar','nop-importar');
  PERM_TELAS.forEach(t=>{
    if(!t.adm && !pode(t.k,'v')) b.classList.add('nov-'+t.k);
    ['c','e','x'].forEach(o=>{ if(!pode(t.k,o)) b.classList.add('nop-'+t.k+'-'+o); });
  });
  ['c','e','x'].forEach(o=>{ if(!pode('frota',o)) b.classList.add('nop-frota-'+o); });
  // os dois botões do Salvar do OS/Auditoria/DA/Tarefa somem se não há criar nem editar
  if(!pode('mapa','c') && !pode('mapa','e')) b.classList.add('nop-mapa-ce');
  if(!pode('oficinas','c') && !pode('oficinas','e')) b.classList.add('nop-oficinas-ce');
  if(!podeAlgumaAlteracao()) b.classList.add('nop-salvar');
  if(!souAdmin()) b.classList.add('nop-importar');
}
function permInstallCSS(){
  if(document.getElementById('permCSS')) return;
  let css='';
  Object.keys(PERM_HIDE).forEach(k=>{ css+=PERM_HIDE[k].map(s=>'body.nop-'+k+' '+s).join(',')+'{display:none!important}\n'; });
  Object.keys(PERM_LOCK).forEach(k=>{ css+=PERM_LOCK[k].map(s=>'body.nop-'+k+' '+s).join(',')+'{pointer-events:none!important;opacity:.6}\n'; });
  css+='body.nop-mapa-ce #btnOk,body.nop-mapa-ce #daOk,body.nop-mapa-ce #view-mapa .rowchk,body.nop-mapa-ce #chkAll{display:none!important}\n';
  css+='body.nop-frota-e.nop-frota-x .hm-kebab{display:none!important}\n';
  css+='body.nop-oficinas-ce #ofOk,body.nop-oficinas-ce #audSave{display:none!important}\n';
  css+='body.nop-salvar #btnSave{display:none!important}\nbody.nop-importar #btnImport{display:none!important}\n';
  PERM_TELAS.forEach(t=>{ css+='body.nov-'+t.k+' .navbtn[data-view="'+t.k+'"]{display:none!important}\n'; });
  const st=document.createElement('style'); st.id='permCSS'; st.textContent=css; document.head.appendChild(st);
}
// campos só leitura também não recebem foco pelo teclado
function permTravarCampos(){
  Object.keys(PERM_LOCK).forEach(k=>{
    const off=document.body.classList.contains('nop-'+k);
    PERM_LOCK[k].forEach(s=>document.querySelectorAll(s).forEach(el=>{ if(off){ el.setAttribute('tabindex','-1'); el.setAttribute('aria-disabled','true'); } else if(el.getAttribute('aria-disabled')==='true'){ el.removeAttribute('tabindex'); el.removeAttribute('aria-disabled'); } }));
  });
}

// Primeira tela que a pessoa pode ver (se a Início estiver fechada para ela)
function permPrimeiraTela(){
  const t=PERM_TELAS.find(t=>!t.adm && pode(t.k,'v'));
  return t?t.k:null;
}
// Primeira aeronave liberada (para abrir o mapa)
function permPrimeiraAeronave(){
  const ks=Object.keys((typeof STATE!=='undefined'&&STATE&&STATE.acmaps)||{});
  return ks.find(k=>acVisivel(k)) || null;
}

// Chamado pelo auth.js depois do login
function permAoEntrar(){
  permAplicarTela();
  if(typeof STATE!=='undefined' && STATE && !acVisivel(STATE.currentAC)){
    const a=permPrimeiraAeronave();
    if(a){ STATE.currentAC=a; STATE.contadores=STATE.acmaps[a].contadores; STATE.tarefas=STATE.acmaps[a].tarefas; }
  }
  if(!pode('inicio','v')){ const t=permPrimeiraTela(); if(t && typeof switchView==='function') switchView(t); }
}

permInstallCSS();
permInstallGuards();
// quando a tela muda, os campos novos também ficam travados
document.addEventListener('DOMContentLoaded',()=>{
  try{ new MutationObserver(()=>{ clearTimeout(window._permT); window._permT=setTimeout(permTravarCampos,60); }).observe(document.getElementById('content')||document.body,{childList:true,subtree:true}); }catch(e){}
});
