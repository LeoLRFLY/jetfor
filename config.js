// ============================================================
//  CONFIGURAÇÃO DO FIREBASE  —  JetFor Mapa de Manutenção
// ============================================================
//  Cole aqui o objeto firebaseConfig do SEU projeto Firebase.
//  (Firebase Console > Configurações do projeto > Seus apps > SDK)
//
//  Enquanto os campos estiverem em branco, o app funciona 100%
//  em modo LOCAL (salva no navegador + exportar/importar JSON).
//  Assim que você colar a config real, ele passa a salvar no
//  Firestore automaticamente (nuvem, tempo real).
// ============================================================

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAOpuGrHLx3FEiJl2TdMYqi8TXX12qGyG4",
  authDomain: "jetfor-23189.firebaseapp.com",
  projectId: "jetfor-23189",
  storageBucket: "jetfor-23189.firebasestorage.app",
  messagingSenderId: "1075684658017",
  appId: "1:1075684658017:web:c2feb4c16eaf486fd29320",
  measurementId: "G-LZEQZ4RDV8"
};

// Nome da coleção e do documento no Firestore (pode manter assim)
window.FIRESTORE_COLECAO = "mapas";
window.FIRESTORE_DOC = "PT-LJQ";

// ============================================================
//  AUTENTICAÇÃO
//  true  = exige login (tela de entrada, cadastro e recuperação).
//  false = desliga o login e volta ao acesso direto (útil p/ testar).
//  IMPORTANTE: para funcionar, habilite no Firebase Console →
//  Authentication → Sign-in method → E-mail/senha.
// ============================================================
window.AUTH_ENABLED = true;
// E-mail que entra já como administrador (aprovado automaticamente):
window.JETFOR_ADMIN_EMAIL = "leo85filipe@gmail.com";
// UID do administrador-mestre: sempre admin e ativo (à prova de bloqueio):
window.JETFOR_ADMIN_UID = "l3Cnzaf42DRBK6MIHiXfnHxg2Rk2";
