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
