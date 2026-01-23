const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// IMPORTANTE: Use variáveis de ambiente
let serviceAccount;

try {
  // Em produção (Render): usa variável de ambiente
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log("✅ Firebase configurado via variável de ambiente");
  } 
  // Em desenvolvimento local: usa arquivo ou fallback
  else {
    console.log("⚠️  Modo desenvolvimento: usando configuração local");
    
    // APENAS PARA TESTES LOCAIS - configure seu próprio JSON aqui
    serviceAccount = {
      "type": "service_account",
      "project_id": "crm-prnti-pixel",
      "private_key_id": "SEU_PRIVATE_KEY_ID_AQUI",
      "private_key": "-----BEGIN PRIVATE KEY-----\nSUA_CHAVE_PRIVADA_AQUI\n-----END PRIVATE KEY-----\n",
      "client_email": "firebase-adminsdk-xxxxx@crm-prnti-pixel.iam.gserviceaccount.com",
      "client_id": "SEU_CLIENT_ID",
      "auth_uri": "https://accounts.google.com/o/oauth2/auth",
      "token_uri": "https://oauth2.googleapis.com/token",
      "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
      "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40crm-prnti-pixel.iam.gserviceaccount.com"
    };
    
    console.log("⚠️  ATENÇÃO: Configure o Firebase Admin SDK para produção!");
  }
} catch (error) {
  console.error("❌ ERRO ao configurar Firebase:", error.message);
  throw new Error("Falha na configuração do Firebase");
}

try {
  const app = initializeApp({
    credential: cert(serviceAccount)
  });
  
  const db = getFirestore(app);
  console.log("✅ Firebase Admin SDK inicializado com sucesso!");
  
  module.exports = { db };
} catch (error) {
  console.error("❌ ERRO ao inicializar Firebase:", error.message);
  throw error;
}