/* JetFor · convite de usuário por e-mail.
   O admin preenche e-mail, nome e permissões na tela Usuários. Esta função:
     1. confere que quem chamou é admin ativo (só o mestre convida outro Admin);
     2. cria a conta no Firebase (sem senha) e o perfil já LIBERADO com as permissões;
     3. gera o link "criar senha" e envia pelo Google Workspace (contato@lrfly.com.br).
   Se a pessoa já foi convidada e ainda não entrou, reenvia o convite.

   Variáveis (Vercel → Settings → Environment Variables):
     FIREBASE_SERVICE_ACCOUNT, SMTP_USER, SMTP_PASS, EMAIL_FROM (opcional), APP_URL (opcional) */
const { initAdmin } = require('./_lib/firebase');
const { enviar } = require('./_lib/mailer');

const MASTER_UID = 'l3Cnzaf42DRBK6MIHiXfnHxg2Rk2';
const TELAS = { inicio:'v', mapa:'', freq:'v', docsac:'', geral:'', listafrota:'', obrig:'v', sasc:'', oficinas:'', forms:'v' };
const MODELOS = ['admin','editor','leitor','mecanico','auditor','personalizado'];
const NOME_MODELO = { admin:'Admin', editor:'Editor', leitor:'Leitor', mecanico:'Mecânico', auditor:'Auditor externo', personalizado:'Personalizado' };

const esc = s => String(s==null?'':s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
function limparPerm(p){
  const out = {};
  Object.keys(TELAS).forEach(k=>{
    const s = (p && p[k]) || {}; const so = TELAS[k]==='v';
    out[k] = { v: s.v===true, c: !so && s.c===true, e: !so && s.e===true, x: !so && s.x===true };
    if(out[k].c||out[k].e||out[k].x) out[k].v = true;
  });
  return out;
}
function limparAcs(a){
  if(a==='todas') return 'todas';
  if(!Array.isArray(a)) return [];
  return [...new Set(a.map(x=>String(x||'').toUpperCase().trim()).filter(x=>/^[A-Z]{2}-[A-Z]{3}$/.test(x)))];
}
function htmlConvite({ nome, quem, link, app, modelo }){
  return `<!doctype html><html><body style="margin:0;background:#F2F4F8;font-family:Arial,Helvetica,sans-serif;color:#14233A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F8;padding:24px 0"><tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #DCE2EA;border-radius:10px">
    <tr><td style="background:#14284B;color:#ffffff;padding:16px 22px;border-radius:10px 10px 0 0;font-size:18px;font-weight:bold">JetFor · Controle de Manutenção</td></tr>
    <tr><td style="padding:22px;font-size:15px;line-height:1.55">
      <p style="margin:0 0 12px">Olá${nome?', '+esc(nome):''}!</p>
      <p style="margin:0 0 12px"><b>${esc(quem)}</b> convidou você para usar o <b>JetFor</b>, o sistema de controle de manutenção da frota, com o acesso <b>${esc(modelo)}</b>.</p>
      <p style="margin:0 0 18px">Para começar, crie a sua senha:</p>
      <p style="margin:0 0 18px"><a href="${esc(link)}" style="background:#C79A3B;color:#14233A;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:6px;display:inline-block">Criar minha senha</a></p>
      <p style="margin:0 0 12px;font-size:13px;color:#5D6A7D">Depois, entre em <a href="${esc(app)}" style="color:#1B3456">${esc(app.replace(/^https?:\/\//,''))}</a> com este e-mail e a senha que você criou.</p>
      <p style="margin:0;font-size:13px;color:#5D6A7D">O link vale por pouco tempo. Se expirar, abra o JetFor, clique em <b>Esqueci minha senha</b> e use este mesmo e-mail.</p>
    </td></tr>
    <tr><td style="padding:12px 22px;border-top:1px solid #DCE2EA;font-size:12px;color:#5D6A7D">Jet For Aviation · Direção de Manutenção. Se você não esperava este convite, ignore este e-mail.</td></tr>
  </table></td></tr></table></body></html>`;
}

module.exports = async (req, res) => {
  if(req.method !== 'POST') return res.status(405).json({ erro:'Use POST.' });
  const faltando = ['FIREBASE_SERVICE_ACCOUNT','SMTP_USER','SMTP_PASS'].filter(k=>!process.env[k]);
  if(faltando.length) return res.status(503).json({ erro:'O envio de convites ainda não foi configurado no Vercel (faltam: '+faltando.join(', ')+').' });

  let admin;
  try{ admin = initAdmin(); }catch(e){ return res.status(500).json({ erro:'Chave do Firebase inválida em FIREBASE_SERVICE_ACCOUNT.' }); }
  const db = admin.firestore();

  // 1) quem está convidando?
  const tok = String(req.headers['authorization']||'').replace(/^Bearer\s+/i,'');
  let caller;
  try{ caller = await admin.auth().verifyIdToken(tok); }catch(e){ return res.status(401).json({ erro:'Sessão expirada. Saia e entre de novo no JetFor.' }); }
  const isMaster = caller.uid === MASTER_UID;
  const meSnap = await db.collection('usuarios').doc(caller.uid).get();
  const me = meSnap.exists ? meSnap.data() : {};
  if(!isMaster && !(me.papel==='admin' && me.ativo===true)) return res.status(403).json({ erro:'Só administradores podem convidar.' });

  // 2) dados do convite
  const b = (typeof req.body==='string') ? JSON.parse(req.body||'{}') : (req.body||{});
  const email = String(b.email||'').trim().toLowerCase();
  const nome = String(b.nome||'').trim().slice(0,120);
  const papel = MODELOS.includes(b.papel) ? b.papel : 'leitor';
  if(!emailOk(email)) return res.status(400).json({ erro:'E-mail inválido.' });
  if(!nome) return res.status(400).json({ erro:'Informe o nome da pessoa.' });
  if(papel==='admin' && !isMaster) return res.status(403).json({ erro:'Só o administrador-mestre convida outro Admin.' });
  const perfil = {
    nome, email, papel,
    perm: limparPerm(b.perm), acs: papel==='admin' ? 'todas' : limparAcs(b.acs),
    notifEmail: b.notifEmail !== false, ativo: true, bloqueadoEm: null,
    convidadoEm: new Date().toISOString(), convidadoPor: me.nome || caller.email || '',
  };

  // 3) cria a conta (ou reenvia, se já foi convidada e nunca entrou)
  let uid, reenvio = false;
  try{
    const u = await admin.auth().getUserByEmail(email);
    const p = await db.collection('usuarios').doc(u.uid).get();
    const d = p.exists ? p.data() : null;
    if(d && d.convidadoEm && !d.ultimoAcesso){
      if(d.papel==='admin' && !isMaster) return res.status(403).json({ erro:'Só o administrador-mestre reenvia convite a um Admin.' });
      uid = u.uid; reenvio = true;
    } else {
      return res.status(409).json({ erro:'Este e-mail já tem conta no JetFor. Ajuste as permissões dele na lista de usuários.' });
    }
  }catch(e){
    if(e && e.code !== 'auth/user-not-found') return res.status(500).json({ erro:'Erro ao consultar a conta: '+(e.message||e) });
    const novo = await admin.auth().createUser({ email, displayName: nome, emailVerified: false, disabled: false });
    uid = novo.uid;
  }
  await db.collection('usuarios').doc(uid).set(Object.assign({ criadoEm: new Date().toISOString() }, perfil), { merge: true });

  // 4) link para criar a senha + e-mail
  const app = (process.env.APP_URL || 'https://jetfor.vercel.app').replace(/\/$/,'');
  let link;
  try{ link = await admin.auth().generatePasswordResetLink(email, { url: app }); }
  catch(e){ link = await admin.auth().generatePasswordResetLink(email); }
  try{
    await enviar({
      para: email,
      assunto: 'Convite para o JetFor · Controle de Manutenção',
      html: htmlConvite({ nome, quem: me.nome || caller.email || 'A Direção de Manutenção', link, app, modelo: NOME_MODELO[papel] }),
      texto: `Olá ${nome}! Você foi convidado(a) para o JetFor. Crie sua senha neste link: ${link}\nDepois entre em ${app} com este e-mail. Se o link expirar, use "Esqueci minha senha" no JetFor.`
    });
  }catch(e){
    return res.status(502).json({ erro:'A conta foi criada, mas o e-mail não saiu: '+(e.message||e)+'. Confira SMTP_USER e SMTP_PASS (senha de app) no Vercel e use "Reenviar convite".', uid });
  }
  await db.collection('logs').add({ ts:new Date().toISOString(), uid:caller.uid, nome:me.nome||'', email:caller.email||'', papel:me.papel||'', acao: reenvio?'Reenviou convite':'Convidou usuário', detalhe: nome+' <'+email+'> · '+NOME_MODELO[papel], ac:'' }).catch(()=>{});
  return res.status(200).json({ ok:true, uid, reenvio });
};
