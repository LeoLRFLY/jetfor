/* JetFor · envio de e-mail pelo Google Workspace (contato@lrfly.com.br).
   Variáveis (Vercel → Settings → Environment Variables):
     SMTP_USER   conta que envia, ex.: contato@lrfly.com.br
     SMTP_PASS   SENHA DE APP do Google (16 letras), NÃO a senha normal da conta
                 (Conta Google → Segurança → Verificação em duas etapas → Senhas de app)
     EMAIL_FROM  (opcional) nome + endereço que aparece, ex.: "JetFor Manutenção <contato@lrfly.com.br>"
   Usado pelo convite de usuários e, depois, pelas notificações. */
const nodemailer = require('nodemailer');
let _t = null;
function transporte(){
  if(!_t) _t = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: process.env.SMTP_USER, pass: String(process.env.SMTP_PASS||'').replace(/\s+/g,'') }
  });
  return _t;
}
function remetente(){ return process.env.EMAIL_FROM || `JetFor Manutenção <${process.env.SMTP_USER}>`; }
async function enviar({ para, assunto, html, texto }){
  return transporte().sendMail({ from: remetente(), to: para, subject: assunto, html, text: texto });
}
module.exports = { enviar, remetente };
