const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function createMemoryDb() {
  const collections = new Map();
  const getCollection = name => {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  };
  const snapshotFor = records => {
    const docs = Array.from(records.entries()).map(([id, value]) => ({ id, data: () => value }));
    return { docs, size: docs.length, forEach: callback => docs.forEach(callback) };
  };
  const setNestedValue = (target, dottedKey, value) => {
    const parts = dottedKey.split('.');
    const last = parts.pop();
    const parent = parts.reduce((current, part) => current[part] ||= {}, target);
    parent[last] = value;
  };

  return {
    collection: name => {
      const records = getCollection(name);
      return {
        add: async data => {
          const id = 'mock-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
          records.set(id, data);
          return { id };
        },
        get: async () => snapshotFor(records),
        doc: id => ({
          set: async (data, options = {}) => records.set(id, options.merge ? { ...(records.get(id) || {}), ...data } : data),
          get: async () => ({ exists: records.has(id), data: () => records.get(id) }),
          update: async updates => {
            if (!records.has(id)) throw new Error('Documento nao encontrado');
            const data = { ...records.get(id) };
            Object.entries(updates).forEach(([key, value]) => setNestedValue(data, key, value));
            records.set(id, data);
          },
          delete: async () => records.delete(id)
        })
      };
    }
  };
}

function readServiceAccount() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    if (IS_PRODUCTION) throw new Error('Configure FIREBASE_SERVICE_ACCOUNT antes de iniciar o CRM em producao.');
    console.warn('Firebase nao configurado. Usando banco em memoria para desenvolvimento.');
    return null;
  }

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!serviceAccount.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT nao possui private_key.');
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  return serviceAccount;
}

const serviceAccount = readServiceAccount();

if (!serviceAccount) {
  module.exports = { db: createMemoryDb() };
} else {
  try {
    const app = initializeApp({ credential: cert(serviceAccount) });
    module.exports = { db: getFirestore(app) };
    console.log(`Firebase conectado ao projeto ${serviceAccount.project_id}.`);
  } catch (error) {
    console.error('Erro ao inicializar Firebase:', error.message);
    if (IS_PRODUCTION) throw error;
    console.warn('Usando banco em memoria para desenvolvimento.');
    module.exports = { db: createMemoryDb() };
  }
}
