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
    console.log("⚠️  ATENÇÃO: Configure o Firebase Admin SDK para produção!");
  }
} catch (error) {
  console.error("❌ ERRO ao configurar Firebase:", error.message);
  throw new Error("Falha na configuração do Firebase");
}

try {
  const app = initializeApp({
    credential: cert(serviceAccount),
  });

  const db = getFirestore(app);
  console.log("✅ Firebase Admin SDK inicializado com sucesso!");

  module.exports = { db };
} catch (error) {
  console.error("❌ ERRO ao inicializar Firebase:", error.message);
  throw error;
}
