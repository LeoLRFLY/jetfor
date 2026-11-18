/* JetFor · acesso de administrador ao Firebase (só no servidor da Vercel).
   Variável: FIREBASE_SERVICE_ACCOUNT = conteúdo do JSON da conta de serviço
   (Firebase Console → Configurações do projeto → Contas de serviço → Gerar nova chave privada). */
const admin = require('firebase-admin');
function initAdmin(){
  if(!admin.apps.length){
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  return admin;
}
module.exports = { initAdmin };
