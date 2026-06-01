const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { db } = require('./firebase.js');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const AUTH_DISABLED = process.env.CRM_AUTH_DISABLED === 'true';
const CRM_USERNAME = process.env.CRM_USERNAME || '';
const CRM_PASSWORD = process.env.CRM_PASSWORD || '';
const MAX_QUERY_LIMIT = 500;
const MAX_UPLOAD_BYTES = 500 * 1024;
const UPLOAD_TTL_MS = 15 * 60 * 1000;

if (IS_PRODUCTION && !AUTH_DISABLED && (!CRM_USERNAME || !CRM_PASSWORD)) {
  throw new Error('Configure CRM_USERNAME e CRM_PASSWORD antes de iniciar o CRM em produção.');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAuth(req, res, next) {
  if (AUTH_DISABLED || (!IS_PRODUCTION && !CRM_USERNAME && !CRM_PASSWORD)) return next();

  const [scheme, credentials] = String(req.headers.authorization || '').split(' ');
  if (scheme === 'Basic' && credentials) {
    const [username, password] = Buffer.from(credentials, 'base64').toString('utf8').split(':');
    if (safeEqual(username, CRM_USERNAME) && safeEqual(password, CRM_PASSWORD)) return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="CRM PrintPixel", charset="UTF-8"');
  return res.status(401).send('Autenticação necessária.');
}

function requestRateLimit({ windowMs, max }) {
  const attempts = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const recent = (attempts.get(key) || []).filter(timestamp => now - timestamp < windowMs);
    recent.push(now);
    attempts.set(key, recent);
    if (recent.length > max) return res.status(429).json({ error: 'Muitas requisições. Tente novamente em instantes.' });
    next();
  };
}

function isSafeIdentifier(value, maxLength = 200) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && /^[A-Za-z0-9_-]+$/.test(value);
}

function containsUnsafeMarkup(value) {
  if (typeof value === 'string') {
    return /<\s*\/?\s*(script|iframe|object|embed|svg|math|style|link|meta)\b/i.test(value)
      || /\bon\w+\s*=/i.test(value)
      || /\b(?:javascript|vbscript)\s*:/i.test(value)
      || /\bsrcdoc\s*=/i.test(value);
  }
  if (Array.isArray(value)) return value.some(containsUnsafeMarkup);
  if (value && typeof value === 'object') return Object.values(value).some(containsUnsafeMarkup);
  return false;
}

function sanitizeForResponse(value) {
  if (typeof value === 'string') {
    if (!/[<>]/.test(value)) return value;
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  if (Array.isArray(value)) return value.map(sanitizeForResponse);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, sanitizeForResponse(nestedValue)]));
  }
  return value;
}

function matchesFilters(id, data, filters) {
  return Object.entries(filters || {}).every(([key, expected]) => {
    if (key === 'id') return id === expected;
    const actual = key.split('.').reduce((current, part) => current && current[part], data);
    return actual === expected;
  });
}

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(parsed, MAX_QUERY_LIMIT);
}

const allowedOrigins = String(process.env.CRM_ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; img-src 'self' data: https://api.qrserver.com; font-src 'self' data: https://cdnjs.cloudflare.com; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN'
  });
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origem não autorizada pelo CORS.'));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Authorization', 'Content-Type']
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api', requestRateLimit({ windowMs: 60 * 1000, max: 180 }));
app.use(requireAuth);

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.get('/api/database/init', async (req, res) => {
  try {
    const testRef = db.collection('_system_test');
    await testRef.doc('test').set({ test: true, timestamp: new Date().toISOString() });
    res.json({ status: 'ok', message: 'Firebase pronto e conectado', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Erro Firebase:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao conectar ao Firebase.' });
  }
});

app.post('/api/database/commit', async (req, res) => {
  try {
    const { schema, payload, pageId, id } = req.body || {};
    if (!isSafeIdentifier(schema, 80) || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ error: 'schema e payload válidos são obrigatórios.' });
    }
    if (id && !isSafeIdentifier(id)) return res.status(400).json({ error: 'ID inválido.' });
    if (containsUnsafeMarkup(payload)) return res.status(400).json({ error: 'Conteúdo HTML potencialmente inseguro não é permitido.' });

    const event = {
      schema,
      payload,
      pageId: typeof pageId === 'string' ? pageId.slice(0, 100) : 'unknown',
      timestamp: new Date().toISOString(),
      deleted: false,
      updated_at: new Date().toISOString()
    };

    let result;
    if (id) {
      const docRef = db.collection('events').doc(id);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        await docRef.set({ ...docSnap.data(), ...event, updated: true }, { merge: true });
        result = { id, action: 'updated', exists: true };
      } else {
        await docRef.set({ ...event, created_at: new Date().toISOString() });
        result = { id, action: 'created_new', exists: false };
      }
    } else {
      const docRef = await db.collection('events').add({ ...event, created_at: new Date().toISOString() });
      result = { id: docRef.id, action: 'created', exists: false };
    }

    res.json({ status: 'success', success: true, message: 'Evento salvo no Firebase', ...result, event });
  } catch (error) {
    console.error('Erro ao salvar:', error);
    res.status(500).json({ error: 'Não foi possível salvar o registro.' });
  }
});

app.post('/api/database/query', async (req, res) => {
  try {
    const { schema = 'all', filters = {} } = req.body || {};
    if (schema !== 'all' && !isSafeIdentifier(schema, 80)) return res.status(400).json({ error: 'Schema inválido.' });
    if (!filters || typeof filters !== 'object' || Array.isArray(filters) || Object.keys(filters).length > 12) {
      return res.status(400).json({ error: 'Filtros inválidos.' });
    }

    const limit = normalizeLimit(req.body && req.body.limit);
    const snapshot = await db.collection('events').get();
    const events = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (!data.deleted && (schema === 'all' || data.schema === schema) && matchesFilters(doc.id, data, filters)) {
        events.push({ id: doc.id, ...data, payload: sanitizeForResponse(data.payload) });
      }
    });
    events.sort((a, b) => new Date(b.timestamp || b.created_at || 0) - new Date(a.timestamp || a.created_at || 0));
    res.json({ status: 'success', success: true, count: Math.min(events.length, limit), events: events.slice(0, limit) });
  } catch (error) {
    console.error('Erro na consulta:', error);
    res.status(500).json({ status: 'error', success: false, error: 'Não foi possível consultar os registros.' });
  }
});

app.post('/api/database/delete', async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!isSafeIdentifier(id)) return res.status(400).json({ error: 'ID inválido.' });
    await db.collection('events').doc(id).update({ deleted: true, deleted_at: new Date().toISOString() });
    res.json({ status: 'success', success: true, message: 'Evento marcado como deletado', id });
  } catch (error) {
    console.error('Erro ao deletar:', error);
    res.status(500).json({ error: 'Não foi possível deletar o registro.' });
  }
});

app.get('/api/database/stats', async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const snapshot = await db.collection('events').get();
    const active = snapshot.docs.map(doc => doc.data()).filter(data => !data.deleted);
    const toDate = value => new Date(value || 0);
    res.json({
      status: 'success',
      stats: {
        total: active.length,
        today: active.filter(data => toDate(data.timestamp) >= startOfDay).length,
        thisMonth: active.filter(data => toDate(data.timestamp) >= startOfMonth).length,
        schemas: {
          pedidos: active.filter(data => data.schema === 'pedido').length,
          despesas: active.filter(data => data.schema === 'despesa').length,
          vendas: active.filter(data => data.schema === 'venda').length
        }
      }
    });
  } catch (error) {
    console.error('Erro nas estatísticas:', error);
    res.status(500).json({ error: 'Não foi possível calcular as estatísticas.' });
  }
});

app.post('/api/upload/nota-fiscal', requestRateLimit({ windowMs: 15 * 60 * 1000, max: 30 }), async (req, res) => {
  try {
    const { sessionId, despesaId, fileData } = req.body || {};
    const decodedBytes = fileData && typeof fileData.base64 === 'string' ? Buffer.byteLength(fileData.base64, 'base64') : 0;
    if (!isSafeIdentifier(sessionId) || !isSafeIdentifier(despesaId) || !fileData || typeof fileData !== 'object') {
      return res.status(400).json({ success: false, message: 'Dados incompletos ou inválidos.' });
    }
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(fileData.tipo) || decodedBytes <= 0 || decodedBytes > MAX_UPLOAD_BYTES) {
      return res.status(400).json({ success: false, message: 'Arquivo inválido ou maior que 500 KB.' });
    }

    const safeFileData = { base64: fileData.base64, tipo: fileData.tipo, tamanhoOriginal: decodedBytes, tamanhoOtimizado: decodedBytes };
    if (despesaId.startsWith('pending-')) {
      await db.collection('temp_uploads').doc(sessionId).set({
        sessionId, despesaId, fileData: safeFileData, timestamp: new Date().toISOString(), status: 'pending'
      });
    } else {
      const despesaRef = db.collection('events').doc(despesaId);
      const despesaDoc = await despesaRef.get();
      if (!despesaDoc.exists || despesaDoc.data().schema !== 'despesa') {
        return res.status(404).json({ success: false, message: 'Despesa não encontrada.' });
      }
      await despesaRef.update({
        'payload.notaFiscal': safeFileData.base64,
        'payload.tipoArquivo': safeFileData.tipo,
        'payload.tamanhoOriginal': safeFileData.tamanhoOriginal,
        'payload.tamanhoOtimizado': safeFileData.tamanhoOtimizado,
        'payload.updated_at': new Date().toISOString()
      });
    }

    await db.collection('mobile_uploads').doc(sessionId).set({
      sessionId, despesaId, fileData: safeFileData, timestamp: new Date().toISOString(), status: 'uploaded'
    });
    res.json({ success: true, message: 'Nota fiscal recebida com sucesso', sessionId, despesaId, fileSize: decodedBytes });
  } catch (error) {
    console.error('Erro no upload:', error);
    res.status(500).json({ success: false, message: 'Erro ao processar o upload.' });
  }
});

app.get('/api/upload/check', async (req, res) => {
  try {
    const { session } = req.query;
    if (!isSafeIdentifier(session)) return res.status(400).json({ status: 'error', message: 'Sessão inválida.' });
    const uploadRef = db.collection('mobile_uploads').doc(session);
    const uploadDoc = await uploadRef.get();
    if (!uploadDoc.exists) return res.json({ status: 'waiting', message: 'Aguardando upload' });
    const uploadData = uploadDoc.data();
    if (Date.now() - new Date(uploadData.timestamp).getTime() > UPLOAD_TTL_MS) {
      await uploadRef.delete();
      return res.status(410).json({ status: 'expired', message: 'Sessão expirada.' });
    }
    await uploadRef.delete();
    res.json({ status: 'uploaded', fileData: uploadData.fileData, timestamp: uploadData.timestamp });
  } catch (error) {
    console.error('Erro ao verificar upload:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao verificar upload.' });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/upload-mobile.html', (req, res) => res.sendFile(path.join(__dirname, 'upload-mobile.html')));
app.use('/pages', express.static(path.join(__dirname, 'pages'), { index: false, fallthrough: false }));
app.get('/core/engine.js', (req, res) => res.sendFile(path.join(__dirname, 'core', 'engine.js')));
app.get('/core/config.js', (req, res) => res.sendFile(path.join(__dirname, 'core', 'config.js')));
app.get('/core/security.js', (req, res) => res.sendFile(path.join(__dirname, 'core', 'security.js')));
app.get('/menu/menu.config.js', (req, res) => res.sendFile(path.join(__dirname, 'menu', 'menu.config.js')));

if (require.main === module) {
  app.listen(PORT, () => console.log(`CRM PRINT PIXEL ONLINE - PORTA ${PORT}`));
}

module.exports = { app, containsUnsafeMarkup, sanitizeForResponse, matchesFilters, normalizeLimit };
