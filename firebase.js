const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

let serviceAccount;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    // 🔥 CORREÇÃO CRÍTICA
    serviceAccount.private_key =
      serviceAccount.private_key.replace(/\\n/g, "\n");

    console.log("✅ Firebase configurado via variável de ambiente");
  } else {
    console.log("⚠️  Modo desenvolvimento: usando configuração local");
    
    // 🔥 COLE SUAS CREDENCIAIS AQUI (APENAS PARA TESTE LOCAL)
    serviceAccount = {
      "type": "service_account",
      "project_id": "crm-print-pixel",
      "private_key_id": "SUA_PRIVATE_KEY_ID_AQUI",
      "private_key": "-----BEGIN PRIVATE KEY-----\nSUA_CHAVE_PRIVADA_COMPLETA_AQUI\n-----END PRIVATE KEY-----\n",
      "client_email": "firebase-adminsdk-fbsvc@crm-print-pixel.iam.gserviceaccount.com",
      "client_id": "123456789012345678901",
      "auth_uri": "https://accounts.google.com/o/oauth2/auth",
      "token_uri": "https://oauth2.googleapis.com/token",
      "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
      "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40crm-print-pixel.iam.gserviceaccount.com",
      "universe_domain": "googleapis.com"
    };
    
    // 🔥 CORREÇÃO CRÍTICA
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    
    console.log("⚠️  ATENÇÃO: Configure o Firebase Admin SDK para produção!");
  }
} catch (error) {
  console.error("❌ ERRO ao configurar Firebase:", error.message);
  throw new Error("Falha na configuração do Firebase");
}

try {
  console.log("🚀 Inicializando Firebase...");
  
  const app = initializeApp({
    credential: cert(serviceAccount),
  });

  const db = getFirestore(app);
  console.log("✅ Firebase Admin SDK inicializado com sucesso!");
  console.log("📊 Projeto: " + serviceAccount.project_id);

  module.exports = { db };
} catch (error) {
  console.error("❌ ERRO ao inicializar Firebase:", error.message);
  
  // Para desenvolvimento, podemos mostrar o erro mas continuar
  if (process.env.NODE_ENV !== 'production') {
    console.log("⚠️  Continuando em modo de desenvolvimento (sem Firebase)...");
    
    // Mock do db para o sistema não quebrar
    const dbMock = {
      collection: (name) => {
        const mockCollection = {
          add: async () => ({ id: 'mock-' + Date.now() }),
          doc: (id) => ({
            set: async () => console.log("📝 Mock: Documento salvo"),
            get: async () => ({ exists: false, data: () => ({}) }),
            update: async () => console.log("📝 Mock: Documento atualizado")
          }),
          where: (field, op, value) => ({
            where: (field2, op2, value2) => ({
              orderBy: (field3, dir) => ({
                limit: (count) => ({
                  get: async () => ({
                    forEach: () => {},
                    size: 0,
                    docs: []
                  })
                })
              })
            })
          })
        };
        return mockCollection;
      }
    };
    
    module.exports = { db: dbMock };
  } else {
    throw error;
  }
}