/* ==========================================================================
   JetFor · Autenticação (Firebase Auth) — login, cadastro, recuperação,
   e gestão de usuários (papéis: admin / editor / leitor).
   ========================================================================== */
'use strict';

// E-mail do administrador "semente": esta conta entra já aprovada como admin.
// Novos cadastros entram como 'leitor' e ficam PENDENTES até um admin liberar.
window.JETFOR_ADMIN_EMAIL = (window.JETFOR_ADMIN_EMAIL || 'leo85filipe@gmail.com').toLowerCase();
// UID do administrador-mestre: sempre admin e ativo, à prova de bloqueio.
window.JETFOR_ADMIN_UID = (window.JETFOR_ADMIN_UID || 'l3Cnzaf42DRBK6MIHiXfnHxg2Rk2');

window.CURRENT_USER = null;
function isMasterUid(uid){ return uid && uid===window.JETFOR_ADMIN_UID; }

function _authGateEl(){ return document.getElementById('authGate'); }
function authShowGate(html){ const g=_authGateEl(); if(!g) return; g.innerHTML=html; g.style.display='flex'; }
function authHideGate(){ const g=_authGateEl(); if(g) g.style.display='none'; }

function authErrMsg(code){
  const m={
    'auth/invalid-email':'E-mail inválido.',
    'auth/user-disabled':'Esta conta foi desativada.',
    'auth/user-not-found':'E-mail não cadastrado.',
    'auth/wrong-password':'Senha incorreta.',
    'auth/invalid-credential':'E-mail ou senha incorretos.',
    'auth/email-already-in-use':'Este e-mail já está cadastrado.',
    'auth/weak-password':'A senha precisa ter ao menos 6 caracteres.',
    'auth/too-many-requests':'Muitas tentativas. Tente novamente em instantes.',
    'auth/network-request-failed':'Falha de conexão. Verifique a internet.',
    'auth/operation-not-allowed':'Login por e-mail/senha não está habilitado no Firebase (Console → Authentication → Sign-in method).'
  };
  return m[code] || ('Erro: '+code);
}
function _msg(id,txt,ok){ const e=document.getElementById(id); if(e){ e.textContent=txt||''; e.className='authmsg'+(ok?' ok':(txt?' err':'')); } }

// ---------- telas ----------
function _brand(){ return `<div class="authbrand"><img src="${(window.JETFOR_SEED&&window.JETFOR_SEED.logo)||'icons/icon-192.png'}" alt="JetFor"><div><div class="ab1">JetFor</div><div class="ab2">Controle de Manutenção</div></div></div>`; }

function authLoginForm(){
  authShowGate(`<div class="authcard">
    ${_brand()}
    <h2>Entrar</h2>
    <div class="authmsg" id="authMsg"></div>
    <label>E-mail<input type="email" id="au_email" autocomplete="username" placeholder="voce@empresa.com"></label>
    <label>Senha<input type="password" id="au_pass" autocomplete="current-password" placeholder="••••••••" onkeydown="if(event.key==='Enter')doLogin()"></label>
    <button class="btn p authbtn" onclick="doLogin()">Entrar</button>
    <div class="authlinks">
      <a href="#" onclick="authResetForm();return false">Esqueci minha senha</a>
      <a href="#" onclick="authSignupForm();return false">Criar conta</a>
    </div>
  </div>`);
  setTimeout(()=>{ const e=document.getElementById('au_email'); if(e) e.focus(); },50);
}
function authSignupForm(){
  authShowGate(`<div class="authcard">
    ${_brand()}
    <h2>Criar conta</h2>
    <div class="authmsg" id="authMsg"></div>
    <label>Nome<input type="text" id="au_nome" placeholder="Seu nome completo"></label>
    <label>E-mail<input type="email" id="au_email" autocomplete="username" placeholder="voce@empresa.com"></label>
    <label>Senha<input type="password" id="au_pass" autocomplete="new-password" placeholder="mínimo 6 caracteres"></label>
    <label>Confirmar senha<input type="password" id="au_pass2" autocomplete="new-password" placeholder="repita a senha" onkeydown="if(event.key==='Enter')doSignup()"></label>
    <button class="btn p authbtn" onclick="doSignup()">Cadastrar</button>
    <div class="authlinks"><a href="#" onclick="authLoginForm();return false">← Voltar ao login</a></div>
    <div class="authnote">Novos cadastros ficam pendentes até um administrador liberar o acesso.</div>
  </div>`);
}
function authResetForm(){
  authShowGate(`<div class="authcard">
    ${_brand()}
    <h2>Recuperar senha</h2>
    <div class="authmsg" id="authMsg"></div>
    <label>E-mail<input type="email" id="au_email" autocomplete="username" placeholder="voce@empresa.com" onkeydown="if(event.key==='Enter')doReset()"></label>
    <button class="btn p authbtn" onclick="doReset()">Enviar link de recuperação</button>
    <div class="authlinks"><a href="#" onclick="authLoginForm();return false">← Voltar ao login</a></div>
  </div>`);
}
function authPendingScreen(email){
  authShowGate(`<div class="authcard">
    ${_brand()}
    <h2>Conta aguardando liberação</h2>
    <div class="authnote" style="margin-top:6px">A conta <b>${(email||'')}</b> foi criada e está <b>pendente de aprovação</b> por um administrador. Você receberá acesso assim que for liberada.</div>
    <button class="btn o authbtn" style="margin-top:14px" onclick="authLogout()">Sair</button>
  </div>`);
}

// ---------- ações ----------
function doLogin(){
  const email=(document.getElementById('au_email').value||'').trim();
  const pass=(document.getElementById('au_pass').value||'');
  if(!email||!pass){ _msg('authMsg','Preencha e-mail e senha.'); return; }
  _msg('authMsg','Entrando…');
  AUTH.signInWithEmailAndPassword(email,pass).catch(e=>_msg('authMsg',authErrMsg(e.code)));
}
function doSignup(){
  const nome=(document.getElementById('au_nome').value||'').trim();
  const email=(document.getElementById('au_email').value||'').trim();
  const pass=(document.getElementById('au_pass').value||'');
  const pass2=(document.getElementById('au_pass2').value||'');
  if(!nome){ _msg('authMsg','Informe seu nome.'); return; }
  if(!email){ _msg('authMsg','Informe o e-mail.'); return; }
  if(pass.length<6){ _msg('authMsg','A senha precisa ter ao menos 6 caracteres.'); return; }
  if(pass!==pass2){ _msg('authMsg','As senhas não conferem.'); return; }
  _msg('authMsg','Criando conta…');
  AUTH.createUserWithEmailAndPassword(email,pass).then(cred=>{
    const u=cred.user; const isAdmin=(email.toLowerCase()===window.JETFOR_ADMIN_EMAIL) || isMasterUid(u.uid);
    return DB.collection('usuarios').doc(u.uid).set({
      nome:nome, email:email.toLowerCase(), papel:isAdmin?'admin':'leitor',
      ativo:isAdmin?true:false, criadoEm:new Date().toISOString()
    });
  }).catch(e=>_msg('authMsg',authErrMsg(e.code)));
}
function doReset(){
  const email=(document.getElementById('au_email').value||'').trim();
  if(!email){ _msg('authMsg','Informe o e-mail.'); return; }
  _msg('authMsg','Enviando…');
  AUTH.sendPasswordResetEmail(email).then(()=>{
    _msg('authMsg','Enviamos um link de recuperação para o seu e-mail.',true);
  }).catch(e=>_msg('authMsg',authErrMsg(e.code)));
}
function authLogout(){
  if(typeof logAction==='function') logAction('Saiu do sistema','');
  if(AUTH) AUTH.signOut();
}

// ---------- init / gate ----------
function authInit(){
  if(!AUTH) return;
  authLoginForm(); // mostra o login enquanto verifica o estado
  AUTH.onAuthStateChanged(function(user){
    if(!user){ window.CURRENT_USER=null; document.body.classList.remove('isadmin','authed','ismaster'); authLoginForm(); return; }
    // busca/gera o perfil do usuário
    const master=isMasterUid(user.uid);
    const ref=DB.collection('usuarios').doc(user.uid);
    ref.get().then(snap=>{
      if(!snap.exists){
        const email=(user.email||'').toLowerCase();
        const isAdmin=(email===window.JETFOR_ADMIN_EMAIL) || master;
        const perfil={ nome:(user.displayName||email), email:email, papel:isAdmin?'admin':'leitor', ativo:isAdmin?true:false, criadoEm:new Date().toISOString() };
        return ref.set(perfil).then(()=>perfil);
      }
      const p=snap.data();
      // administrador-mestre: garante admin+ativo mesmo que o doc diga o contrário
      if(master && (p.papel!=='admin' || p.ativo!==true)){
        const fix={papel:'admin',ativo:true}; ref.set(fix,{merge:true}).catch(()=>{});
        p.papel='admin'; p.ativo=true;
      }
      return p;
    }).then(perfil=>{
      if(!perfil){ return; }
      if(perfil.ativo===false && !master){ window.CURRENT_USER=null; document.body.classList.remove('isadmin','authed','ismaster'); authPendingScreen(user.email); return; }
      // liberado
      window.CURRENT_USER={ uid:user.uid, email:(user.email||'').toLowerCase(), nome:perfil.nome||user.email, papel:perfil.papel||'leitor' };
      document.body.classList.add('authed');
      document.body.classList.toggle('isadmin', perfil.papel==='admin');
      document.body.classList.toggle('ismaster', master);
      authUpdateHeader();
      authHideGate();
      // registra o último acesso (atualiza SÓ este campo; papel/ativo ficam iguais → seguro nas regras)
      try{ ref.set({ultimoAcesso:new Date().toISOString()},{merge:true}).catch(()=>{}); }catch(e){}
      loadCloudData();
      if(typeof logAction==='function') logAction('Entrou no sistema','');
    }).catch(e=>{
      console.error(e);
      _msg('authMsg','Não foi possível carregar seu perfil. '+(e&&e.message?e.message:''));
    });
  });
}
function authUpdateHeader(){
  const el=document.getElementById('userChip');
  if(el && window.CURRENT_USER){
    const papel={admin:'Admin',editor:'Editor',leitor:'Leitor'}[window.CURRENT_USER.papel]||window.CURRENT_USER.papel;
    el.innerHTML=`<span class="uname">${(window.CURRENT_USER.nome||'')}</span><span class="urole">${papel}</span>`;
    el.style.display='';
  }
}

// ---------- gestão de usuários (admin) ----------
function renderUsuarios(){
  const el=document.getElementById('view-usuarios'); if(!el) return;
  if(!window.CURRENT_USER || window.CURRENT_USER.papel!=='admin'){
    el.innerHTML='<div class="wrap"><div class="cfbnote">Acesso restrito a administradores.</div></div>'; return;
  }
  el.innerHTML=`<h2 style="color:var(--navy);border-bottom:2px solid var(--gold);padding-bottom:6px">👥 Usuários</h2>
    <div class="cfbnote">Libere ou bloqueie o acesso e defina o papel de cada pessoa. <b>Admin</b> = tudo + gestão de usuários; <b>Editor</b> = edita os dados; <b>Leitor</b> = só visualiza.</div>
    <div class="tblwrap"><table class="cfbtable"><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Status</th><th>Último acesso</th><th>Ações</th></tr></thead><tbody id="usuList"><tr><td colspan="6" style="padding:14px;color:#999">Carregando…</td></tr></tbody></table></div>`;
  DB.collection('usuarios').get().then(qs=>{
    const rows=[]; qs.forEach(d=>rows.push(Object.assign({uid:d.id},d.data())));
    rows.sort((a,b)=>(a.nome||'').localeCompare(b.nome||''));
    window._USU_CACHE={}; rows.forEach(u=>window._USU_CACHE[u.uid]=u);
    const tb=document.getElementById('usuList'); if(!tb) return;
    tb.innerHTML = rows.length? rows.map(u=>{
      const me=(u.uid===window.CURRENT_USER.uid);
      const sel=['admin','editor','leitor'].map(p=>`<option value="${p}"${u.papel===p?' selected':''}>${p==='admin'?'Admin':p==='editor'?'Editor':'Leitor'}</option>`).join('');
      return `<tr>
        <td>${(u.nome||'')}${me?' <span class="basetag">você</span>':''}</td>
        <td>${(u.email||'')}</td>
        <td><select class="usel" onchange="usuSetPapel('${u.uid}',this.value)"${me?' disabled':''}>${sel}</select></td>
        <td>${u.ativo? '<span class="pill ok">Ativo</span>':'<span class="pill wn">Pendente</span>'}</td>
        <td class="num" style="white-space:nowrap">${usuFmtData(u.ultimoAcesso)}</td>
        <td class="usuacts">
          ${me?'':(u.ativo
            ? `<button class="btn o sm" onclick="usuSetAtivo('${u.uid}',false)">Bloquear</button>`
            : `<button class="btn g sm" onclick="usuSetAtivo('${u.uid}',true)">Liberar</button>`)}
          <button class="btn o sm" title="Editar nome" onclick="usuEditarNome('${u.uid}')">✎</button>
          <button class="btn o sm" title="Enviar redefinição de senha" onclick="usuResetSenha('${u.uid}')">🔑</button>
          ${me?'':`<button class="btn o sm" title="Remover" onclick="usuRemover('${u.uid}')">🗑</button>`}
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" style="padding:14px;color:#999">Nenhum usuário ainda.</td></tr>';
  }).catch(e=>{ const tb=document.getElementById('usuList'); if(tb) tb.innerHTML='<tr><td colspan="6" style="padding:14px;color:#c0392b">Erro ao listar: '+(e&&e.message||e)+'</td></tr>'; });
}
function usuFmtData(iso){
  if(!iso) return '<span style="color:#aab">—</span>';
  try{ const d=new Date(iso); if(isNaN(d)) return '—';
    const p=n=>String(n).padStart(2,'0');
    return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear()+' '+p(d.getHours())+':'+p(d.getMinutes());
  }catch(e){ return '—'; }
}
function _usuNome(uid){ const u=(window._USU_CACHE||{})[uid]||{}; return u.nome||u.email||uid; }
function usuSetPapel(uid,papel){
  DB.collection('usuarios').doc(uid).set({papel:papel},{merge:true}).then(()=>{ toast('✔ Papel atualizado'); if(typeof logAction==='function') logAction('Alterou papel de usuário', _usuNome(uid)+' → '+papel); }).catch(e=>toast('⚠ '+(e.message||e)));
}
function usuSetAtivo(uid,ativo){
  DB.collection('usuarios').doc(uid).set({ativo:ativo},{merge:true}).then(()=>{ toast(ativo?'✔ Acesso liberado':'✔ Acesso bloqueado'); if(typeof logAction==='function') logAction(ativo?'Liberou usuário':'Bloqueou usuário', _usuNome(uid)); renderUsuarios(); }).catch(e=>toast('⚠ '+(e.message||e)));
}
function usuEditarNome(uid){
  const u=(window._USU_CACHE||{})[uid]||{};
  const novo=window.prompt('Nome do usuário:', u.nome||'');
  if(novo==null) return;
  const nome=novo.trim(); if(!nome){ toast('Nome não pode ficar vazio'); return; }
  DB.collection('usuarios').doc(uid).set({nome:nome},{merge:true}).then(()=>{ toast('✔ Nome atualizado'); if(typeof logAction==='function') logAction('Editou nome de usuário', nome); renderUsuarios(); if(window.CURRENT_USER&&window.CURRENT_USER.uid===uid){ window.CURRENT_USER.nome=nome; authUpdateHeader(); } }).catch(e=>toast('⚠ '+(e.message||e)));
}
function usuResetSenha(uid){
  const u=(window._USU_CACHE||{})[uid]||{};
  const email=u.email; if(!email){ toast('Usuário sem e-mail'); return; }
  if(!window.confirm('Enviar e-mail de redefinição de senha para '+email+'?')) return;
  AUTH.sendPasswordResetEmail(email).then(()=>{ toast('✔ E-mail de redefinição enviado'); if(typeof logAction==='function') logAction('Enviou redefinição de senha', email); }).catch(e=>toast('⚠ '+authErrMsg(e.code)));
}
// ================= DETETIVE JETFOR (monitoramento — só o UID-mestre) =================
function _detSensivel(acao){ return /Excluiu|Removeu|Bloqueou|Alterou papel|Importou/i.test(acao||''); }
function renderDetetive(){
  const el=document.getElementById('view-detetive'); if(!el) return;
  if(!window.CURRENT_USER || !isMasterUid(window.CURRENT_USER.uid)){
    el.innerHTML='<div class="cfbnote">Acesso restrito ao administrador-mestre.</div>'; return;
  }
  if(!el.dataset.done){
    el.innerHTML=`<div class="dethead">
        <div><div class="dettitle">🕵️ Detetive JetFor</div>
        <div class="detsub">Monitoramento das atividades dos usuários — visão exclusiva do mestre.</div></div>
        <div class="detctrl">
          <select id="detPer"><option value="1">Hoje</option><option value="7" selected>Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="0">Tudo</option></select>
          <select id="detUser"><option value="">Todos os usuários</option></select>
          <button class="btn o sm" onclick="detReload()">↻ Atualizar</button>
        </div>
      </div>
      <div id="detBody"><div class="cfbnote">Carregando atividades…</div></div>`;
    el.dataset.done='1';
    el.querySelectorAll('#detPer,#detUser').forEach(x=>x.addEventListener('change',detDraw));
    // re-liga listeners após recriar selects em detReload via detDraw
  }
  detReload();
}
function detReload(){
  const body=document.getElementById('detBody'); if(body) body.innerHTML='<div class="cfbnote">Carregando atividades…</div>';
  Promise.all([
    DB.collection('logs').orderBy('ts','desc').limit(3000).get(),
    DB.collection('usuarios').get()
  ]).then(([lg,us])=>{
    const logs=[]; lg.forEach(d=>logs.push(d.data()));
    const users=[]; us.forEach(d=>users.push(Object.assign({uid:d.id},d.data())));
    window._DET_LOGS=logs; window._DET_USERS=users;
    const sel=document.getElementById('detUser');
    if(sel){ const cur=sel.value; const nomes=[...new Set(logs.map(l=>l.nome).filter(Boolean))].sort();
      sel.innerHTML='<option value="">Todos os usuários</option>'+nomes.map(n=>`<option${n===cur?' selected':''}>${n}</option>`).join(''); }
    detDraw();
  }).catch(e=>{ const body=document.getElementById('detBody'); if(body) body.innerHTML='<div class="cfbnote" style="color:#c0392b">Não foi possível carregar: '+((e&&e.message)||e)+'</div>'; });
}
function detDraw(){
  const body=document.getElementById('detBody'); if(!body) return;
  const logs=window._DET_LOGS||[], users=window._DET_USERS||[];
  const per=+((document.getElementById('detPer')||{}).value||7);
  const uf=(document.getElementById('detUser')||{}).value||'';
  // corte de período
  let cut=null;
  if(per>0){ const d=new Date(); d.setDate(d.getDate()-(per-1)); d.setHours(0,0,0,0); cut=d.toISOString(); }
  let L=logs.filter(l=>{ if(cut && (l.ts||'')<cut) return false; if(uf && l.nome!==uf) return false; return true; });
  // KPIs
  const total=L.length;
  const ativos=[...new Set(L.map(l=>l.uid).filter(Boolean))].length;
  const cont={}; L.forEach(l=>{ cont[l.acao]=(cont[l.acao]||0)+1; });
  const topAc=Object.keys(cont).sort((a,b)=>cont[b]-cont[a])[0]||'—';
  const sens=L.filter(l=>_detSensivel(l.acao));
  const kpis=[['Ações no período',total,''],['Usuários ativos',ativos,'sasc'],['Ação mais comum',topAc,''],['Ações sensíveis',sens.length,sens.length?'od':'ok']];
  // por usuário
  const byU={};
  L.forEach(l=>{ const k=l.uid||l.nome; if(!byU[k]) byU[k]={nome:l.nome||l.email||'?',papel:l.papel||'',n:0,ult:'',cont:{}}; const u=byU[k]; u.n++; if((l.ts||'')>u.ult)u.ult=l.ts; u.cont[l.acao]=(u.cont[l.acao]||0)+1; if(l.papel)u.papel=l.papel; });
  // inclui usuários sem atividade no período (do cadastro)
  users.forEach(us=>{ const has=Object.values(byU).some(x=>x.nome===(us.nome||us.email)); if(!has && !uf){ byU['_'+us.uid]={nome:us.nome||us.email||'?',papel:us.papel||'',n:0,ult:us.ultimoAcesso||'',cont:{}}; } });
  const rowsU=Object.values(byU).sort((a,b)=>b.n-a.n);
  const maxN=Math.max(1,...rowsU.map(u=>u.n));
  // ações por tipo
  const tipos=Object.keys(cont).sort((a,b)=>cont[b]-cont[a]);
  const maxT=Math.max(1,...tipos.map(t=>cont[t]));
  const papelLbl=p=>({admin:'Admin',editor:'Editor',leitor:'Leitor'})[p]||p||'';

  body.innerHTML=`
    <div class="detkpis">${kpis.map(k=>`<div class="detkpi ${k[2]}"><div class="dn">${typeof k[1]==='number'?k[1]:esc(String(k[1]))}</div><div class="dl">${k[0]}</div></div>`).join('')}</div>

    ${sens.length?`<div class="detcard det-alert"><div class="detct">⚠ Ações sensíveis no período (${sens.length})</div>
      <div class="detfeed">${sens.slice(0,20).map(l=>`<div class="detrow"><span class="dt">${usuFmtData(l.ts)}</span><b>${esc(l.nome||'')}</b><span class="da">${esc(l.acao||'')}</span><span class="dd">${esc(l.detalhe||'')}</span></div>`).join('')}</div></div>`:''}

    <div class="detgrid">
      <div class="detcard"><div class="detct">Atividade por usuário</div>
        <table class="cfbtable"><thead><tr><th>Usuário</th><th>Papel</th><th>Ações</th><th>Última atividade</th></tr></thead><tbody>
        ${rowsU.map(u=>`<tr>
          <td>${esc(u.nome)}</td><td>${papelLbl(u.papel)}</td>
          <td style="min-width:120px"><div class="detbar"><span style="width:${Math.round(u.n/maxN*100)}%"></span></div><span class="detn">${u.n}</span></td>
          <td class="num" style="white-space:nowrap">${u.ult?usuFmtData(u.ult):'<span style=\"color:#aab\">—</span>'}</td>
        </tr>`).join('')||'<tr><td colspan="4" style="color:#999;padding:12px">Sem atividade no período.</td></tr>'}
        </tbody></table>
      </div>
      <div class="detcard"><div class="detct">Ações por tipo</div>
        ${tipos.length?tipos.map(t=>`<div class="dettipo"><span class="tl">${esc(t)}</span><div class="detbar"><span style="width:${Math.round(cont[t]/maxT*100)}%"></span></div><span class="detn">${cont[t]}</span></div>`).join(''):'<div style="color:#999;padding:8px">Sem ações no período.</div>'}
      </div>
    </div>

    <div class="detcard"><div class="detct">Últimas atividades</div>
      <div class="detfeed">${L.slice(0,60).map(l=>`<div class="detrow ${_detSensivel(l.acao)?'sens':''}"><span class="dt">${usuFmtData(l.ts)}</span><b>${esc(l.nome||'')}</b><span class="da">${esc(l.acao||'')}</span><span class="dd">${esc(l.detalhe||'')}${l.ac?' · '+esc(l.ac):''}</span></div>`).join('')||'<div style="color:#999;padding:8px">Nenhuma atividade.</div>'}</div>
    </div>`;
}

// ---------- Registro de atividades (auditoria — só admin) ----------
function renderLogs(){
  const el=document.getElementById('view-logs'); if(!el) return;
  if(!window.CURRENT_USER || window.CURRENT_USER.papel!=='admin'){
    el.innerHTML='<div class="cfbnote">Acesso restrito a administradores.</div>'; return;
  }
  el.innerHTML=`<h2 style="color:var(--navy);border-bottom:2px solid var(--gold);padding-bottom:6px">📋 Registro de atividades</h2>
    <div class="cfbnote">Tudo o que os usuários fazem no sistema, do mais recente para o mais antigo. Somente administradores veem esta página.</div>
    <div class="filters">
      <select id="lgUser"><option value="">Usuário: todos</option></select>
      <select id="lgAcao"><option value="">Ação: todas</option></select>
      <input type="date" id="lgFrom" title="De"><input type="date" id="lgTo" title="Até">
      <input id="lgBusca" placeholder="Buscar…">
      <button class="btn o sm" onclick="renderLogs()">↻ Atualizar</button>
    </div>
    <div class="tblwrap"><table class="cfbtable"><thead><tr><th>Data/hora</th><th>Usuário</th><th>Papel</th><th>Ação</th><th>Detalhe</th><th>Aeronave</th></tr></thead><tbody id="lgList"><tr><td colspan="6" style="padding:14px;color:#999">Carregando…</td></tr></tbody></table></div>
    <div class="note" id="lgCount"></div>`;
  DB.collection('logs').orderBy('ts','desc').limit(1000).get().then(qs=>{
    const rows=[]; qs.forEach(d=>rows.push(d.data()));
    window._LOG_CACHE=rows;
    const users=[...new Set(rows.map(r=>r.nome).filter(Boolean))].sort();
    const acoes=[...new Set(rows.map(r=>r.acao).filter(Boolean))].sort();
    const uu=document.getElementById('lgUser'); if(uu) uu.innerHTML='<option value="">Usuário: todos</option>'+users.map(u=>`<option>${u}</option>`).join('');
    const aa=document.getElementById('lgAcao'); if(aa) aa.innerHTML='<option value="">Ação: todas</option>'+acoes.map(a=>`<option>${a}</option>`).join('');
    ['lgUser','lgAcao','lgFrom','lgTo'].forEach(id=>{const e=document.getElementById(id); if(e) e.addEventListener('change',logsDraw);});
    const bq=document.getElementById('lgBusca'); if(bq) bq.addEventListener('input',logsDraw);
    logsDraw();
  }).catch(e=>{
    const tb=document.getElementById('lgList');
    if(tb) tb.innerHTML='<tr><td colspan="6" style="padding:14px;color:#c0392b">Não foi possível carregar o registro: '+((e&&e.message)||e)+'</td></tr>';
  });
}
function logsDraw(){
  const rows=window._LOG_CACHE||[];
  const gv=id=>{const e=document.getElementById(id);return e?e.value:'';};
  const u=gv('lgUser'), a=gv('lgAcao'), f=gv('lgFrom'), t=gv('lgTo'), q=(gv('lgBusca')||'').toLowerCase();
  const filt=rows.filter(r=>{
    if(u&&r.nome!==u) return false;
    if(a&&r.acao!==a) return false;
    const day=(r.ts||'').slice(0,10);
    if(f&&day<f) return false;
    if(t&&day>t) return false;
    if(q&&!(((r.nome||'')+' '+(r.email||'')+' '+(r.acao||'')+' '+(r.detalhe||'')+' '+(r.ac||'')).toLowerCase().includes(q))) return false;
    return true;
  });
  const tb=document.getElementById('lgList'); if(!tb) return;
  tb.innerHTML = filt.length? filt.map(r=>`<tr>
    <td class="num" style="white-space:nowrap">${usuFmtData(r.ts)}</td>
    <td>${(r.nome||r.email||'')}</td>
    <td>${({admin:'Admin',editor:'Editor',leitor:'Leitor'})[r.papel]||(r.papel||'')}</td>
    <td>${(r.acao||'')}</td>
    <td class="cfbdesc">${(r.detalhe||'')}</td>
    <td>${(r.ac||'')}</td></tr>`).join('') : '<tr><td colspan="6" style="padding:14px;color:#999">Nenhum registro para estes filtros.</td></tr>';
  const c=document.getElementById('lgCount'); if(c) c.textContent=filt.length+' de '+rows.length+' registros.';
}

function usuRemover(uid){
  const u=(window._USU_CACHE||{})[uid]||{};
  if(uid===window.CURRENT_USER.uid){ toast('Você não pode remover a si mesmo'); return; }
  if(!window.confirm('Remover '+(u.nome||u.email||'este usuário')+' da lista?\n\nIsso revoga o acesso aos dados. Para apagar de vez a credencial de login, remova também em Firebase Console → Authentication → Users.')) return;
  const _nome=u.nome||u.email||uid;
  DB.collection('usuarios').doc(uid).delete().then(()=>{ toast('✔ Usuário removido'); if(typeof logAction==='function') logAction('Removeu usuário', _nome); renderUsuarios(); }).catch(e=>toast('⚠ '+(e.message||e)));
}
