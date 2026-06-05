const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { db } = require('./firebase.js');
const QR_FISCAL = require('./core/qr-fiscal.js');
const GESTAO = require('./core/gestao.js');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const AUTH_DISABLED = process.env.CRM_AUTH_DISABLED === 'true';
const CRM_USERNAME = process.env.CRM_USERNAME || '';
const CRM_PASSWORD = process.env.CRM_PASSWORD || '';
const CRM_COMPANY_NIF = String(process.env.CRM_COMPANY_NIF || '').replace(/\D/g, '');
const CRM_MOBILE_ACCESS_KEY = process.env.CRM_MOBILE_ACCESS_KEY || (!IS_PRODUCTION ? 'dev-mobile-key' : '');
const MAX_QUERY_LIMIT = 500;
const MAX_UPLOAD_BYTES = 500 * 1024;
const UPLOAD_TTL_MS = 15 * 60 * 1000;
const MOBILE_DEVICE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const PRODUCTION_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const PRODUCTION_STEPS = [
  'Arte / projeto',
  'Modelagem',
  'Usinagem CNC',
  'Impressao 3D',
  'Montagem da estrutura',
  'Pintura interna',
  'LED / solda',
  'Cola quente',
  'Corte laser opalino',
  'Pintura externa',
  'Acabamento',
  'Molde de instalacao',
  'Embalagem',
  'Instalacao'
];

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
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; img-src 'self' data:; font-src 'self' data: https://cdnjs.cloudflare.com; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
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

function mobileSessionExpired(session) {
  return !session || Date.now() > new Date(session.expiresAt || 0).getTime();
}

function text(value, maxLength = 200) {
  return String(value || '').trim().slice(0, maxLength);
}

function digits(value) {
  return text(value).replace(/\D/g, '');
}

function money(value) {
  const parsed = Number.parseFloat(String(value || '0').replace(',', '.'));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function mobileDocumentFingerprint(documento) {
  return hash([
    documento.entryType,
    documento.nifEmitente,
    documento.numeroFatura.toUpperCase(),
    documento.dataCompra,
    documento.valorTotal.toFixed(2)
  ].join('|'));
}

function normalizeMobileDocument(body = {}) {
  const parsedQr = body.rawQr ? QR_FISCAL.interpretar(body.rawQr) : {};
  const documento = {
    rawQr: text(parsedQr.rawQr || body.rawQr, 4000),
    entryType: body.entryType === 'income' ? 'income' : 'expense',
    nifEmitente: digits(parsedQr.nifEmitente || body.nifEmitente),
    nomeEmitente: text(body.nomeEmitente, 160),
    nifAdquirente: digits(parsedQr.nifAdquirente || body.nifAdquirente),
    tipoDocumento: text(parsedQr.tipoDocumento || body.tipoDocumento || 'FT', 30).toUpperCase(),
    numeroFatura: text(parsedQr.numeroFatura || body.numeroFatura, 120),
    dataCompra: text(parsedQr.dataCompra || body.dataCompra, 10),
    valorTotal: money(parsedQr.valorTotal || body.valorTotal),
    valorIVA: money(parsedQr.valorIVA || body.valorIVA),
    valorBruto: money(parsedQr.valorBruto || body.valorBruto),
    categoria: text(body.categoria || 'OUTROS', 80),
    formaPagamento: text(body.formaPagamento || 'outro', 80),
    observacoes: text(body.observacoes, 500)
  };
  if (!documento.valorBruto && documento.valorTotal) {
    documento.valorBruto = Math.max(0, Math.round((documento.valorTotal - documento.valorIVA) * 100) / 100);
  }
  if (CRM_COMPANY_NIF) {
    if (documento.nifEmitente === CRM_COMPANY_NIF) documento.entryType = 'income';
    else if (documento.nifAdquirente === CRM_COMPANY_NIF) documento.entryType = 'expense';
  }
  return documento;
}

function validateMobileDocument(documento) {
  const errors = [];
  if (!/^\d{9}$/.test(documento.nifEmitente)) errors.push('NIF do emitente invalido.');
  if (!documento.numeroFatura) errors.push('Numero da fatura ausente.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(documento.dataCompra)) errors.push('Data da fatura invalida.');
  if (!(documento.valorTotal > 0)) errors.push('Total da fatura invalido.');
  if (documento.valorIVA > documento.valorTotal) errors.push('IVA superior ao total da fatura.');
  if (CRM_COMPANY_NIF) {
    const belongsToCompany = documento.entryType === 'income'
      ? documento.nifEmitente === CRM_COMPANY_NIF
      : documento.nifAdquirente === CRM_COMPANY_NIF;
    if (!belongsToCompany) errors.push('A fatura nao pertence ao NIF configurado para a empresa.');
  }
  return errors;
}

async function findDuplicateExpense(documento) {
  const snapshot = await db.collection('events').get();
  return snapshot.docs.some(doc => {
    const data = doc.data();
    const payload = data.payload || {};
    return !data.deleted
      && data.schema === 'despesa'
      && String(payload.nifFornecedor || '').replace(/\D/g, '') === documento.nifEmitente
      && String(payload.numeroFatura || '').trim() === documento.numeroFatura
      && String(payload.dataCompra || payload.data || '').slice(0, 10) === documento.dataCompra
      && Math.abs(Number(payload.valorTotal || 0) - documento.valorTotal) < 0.01;
  });
}

async function requireMobileDevice(req, res, next) {
  try {
    const [scheme, token] = String(req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token || token.length < 32 || token.length > 200) {
      return res.status(401).json({ success: false, message: 'Ative este dispositivo para continuar.' });
    }
    const deviceDoc = await db.collection('mobile_devices').doc(hash(token)).get();
    const device = deviceDoc.exists ? deviceDoc.data() : null;
    if (!device || device.revoked || mobileSessionExpired(device)) {
      return res.status(401).json({ success: false, message: 'Acesso expirado ou revogado. Ative novamente o dispositivo.' });
    }
    req.mobileDevice = device;
    next();
  } catch (error) {
    console.error('Erro ao validar dispositivo movel:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel validar o dispositivo.' });
  }
}

async function findDuplicateMobileDocument(documento, fingerprint) {
  const inboxDoc = await db.collection('mobile_invoice_inbox').doc(fingerprint).get();
  if (inboxDoc.exists) return true;
  if (documento.entryType === 'expense') return findDuplicateExpense(documento);
  const snapshot = await db.collection('events').get();
  return snapshot.docs.some(doc => {
    const data = doc.data();
    const payload = data.payload || {};
    return !data.deleted
      && data.schema === 'fatura_venda'
      && digits(payload.nifEmitente) === documento.nifEmitente
      && text(payload.numeroFatura) === documento.numeroFatura
      && text(payload.dataCompra || payload.dataFatura, 10) === documento.dataCompra
      && Math.abs(money(payload.valorTotal) - documento.valorTotal) < 0.01;
  });
}

async function launchMobileDocument(item, fingerprint, now = new Date().toISOString()) {
  const eventId = `mobile-${fingerprint.slice(0, 40)}`;
  const payload = item.entryType === 'income'
    ? {
        nifEmitente: item.nifEmitente,
        nifAdquirente: item.nifAdquirente,
        numeroFatura: item.numeroFatura,
        tipoDocumento: item.tipoDocumento,
        dataFatura: item.dataCompra,
        subtotal: item.valorBruto,
        iva: item.valorIVA,
        total: item.valorTotal,
        origemLancamento: item.source,
        observacoes: item.observacoes
      }
    : {
        fornecedor: item.nomeEmitente || `Fornecedor NIF ${item.nifEmitente}`,
        nifFornecedor: item.nifEmitente,
        nifAdquirente: item.nifAdquirente,
        numeroFatura: item.numeroFatura,
        tipoDocumento: item.tipoDocumento,
        dataCompra: item.dataCompra,
        dataVencimento: item.dataCompra,
        descricao: `${item.tipoDocumento} ${item.numeroFatura}`,
        categoria: item.categoria,
        formaPagamento: item.formaPagamento,
        valorBruto: item.valorBruto,
        valorIVA: item.valorIVA,
        valorTotal: item.valorTotal,
        comIVA: item.valorIVA > 0 ? 'sim' : 'nao',
        ivaDedutivel: true,
        statusPagamento: 'pago',
        origemLancamento: item.source,
        observacoes: item.observacoes
      };
  await db.collection('events').doc(eventId).set({
    schema: item.entryType === 'income' ? 'fatura_venda' : 'despesa',
    payload,
    pageId: 'importacoes-fiscais',
    timestamp: now,
    created_at: now,
    updated_at: now,
    deleted: false
  }, { merge: true });
  return eventId;
}

async function launchLegacyPendingMobileDocuments(documents) {
  return Promise.all(documents.map(async item => {
    if (item.status !== 'pending_review') return item;
    const now = new Date().toISOString();
    const eventId = await launchMobileDocument(item, item.fingerprint || item.id, now);
    const launched = { ...item, status: 'approved', eventId, reviewedAt: now, updatedAt: now };
    await db.collection('mobile_invoice_inbox').doc(item.id).set(launched);
    return launched;
  }));
}

function productionStepId(label) {
  return text(label, 80)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

function normalizeProductionSteps(selected = [], previous = []) {
  const selectedIds = new Set((Array.isArray(selected) ? selected : []).map(value => productionStepId(value.id || value)));
  return PRODUCTION_STEPS
    .filter(label => selectedIds.has(productionStepId(label)))
    .map(label => {
      const id = productionStepId(label);
      const old = (Array.isArray(previous) ? previous : []).find(step => step.id === id);
      return old ? { ...old, id, label, tempoPrevistoMin: old.tempoPrevistoMin || 30 } : { id, label, done: false, completedAt: null, tempoPrevistoMin: 30, actualMinutes: 0 };
    });
}

function productionProductId(value) {
  const normalized = text(value, 40);
  return normalized && /^[A-Za-z0-9_-]+$/.test(normalized) ? normalized : '';
}

function productionAssignmentId(orderId, productId = '') {
  return productId ? `${orderId}__${productId}` : orderId;
}

function productForAssignment(order, productId) {
  if (!productId) return null;
  if (!/^item_(0|[1-9]\d*)$/.test(productId)) return null;
  const index = Number.parseInt(productId.replace(/^item_/, ''), 10);
  const products = Array.isArray(order?.payload?.produtos) ? order.payload.produtos : [];
  if (!Number.isInteger(index) || index < 0 || index >= products.length) return null;
  const product = products[index];
  return sanitizeForResponse({
    id: productId,
    index,
    nome: text(product.nome || 'Produto', 160),
    tamanho: text(product.tamanho, 120),
    quantidade: money(product.quantidade || 1),
    observacoes: text(product.observacoes, 400)
  });
}

function rawProductForAssignment(order, productId) {
  if (!productId) return null;
  if (!/^item_(0|[1-9]\d*)$/.test(productId)) return null;
  const index = Number.parseInt(productId.replace(/^item_/, ''), 10);
  const products = Array.isArray(order?.payload?.produtos) ? order.payload.produtos : [];
  return Number.isInteger(index) && index >= 0 && index < products.length ? products[index] : null;
}

function assignmentHistoryEntry(type, data = {}) {
  return { type, ...data, createdAt: new Date().toISOString() };
}

async function getActiveWorkerByToken(token) {
  if (!token || token.length < 40 || token.length > 200) return null;
  const sessionDoc = await db.collection('production_sessions').doc(hash(token)).get();
  if (!sessionDoc.exists) return null;
  const session = sessionDoc.data();
  if (session.revoked || Date.now() > new Date(session.expiresAt || 0).getTime()) return null;
  const worker = (await productionWorkers()).find(item => item.id === session.workerId);
  return !worker || worker.active === false ? null : worker;
}

async function requireWorker(req, res, next) {
  try {
    const [scheme, bearer] = String(req.headers.authorization || '').split(' ');
    const token = scheme === 'Bearer' ? bearer : '';
    const worker = await getActiveWorkerByToken(token);
    if (!worker) return res.status(401).json({ success: false, message: 'Sessao invalida ou expirada. Entre novamente.' });
    req.productionWorker = worker;
    next();
  } catch (error) {
    console.error('Erro ao validar colaborador:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel validar o acesso.' });
  }
}

async function getOrderEvent(orderId) {
  if (!isSafeIdentifier(orderId)) return null;
  const orderDoc = await db.collection('events').doc(orderId).get();
  if (!orderDoc.exists) return null;
  const order = orderDoc.data();
  return !order.deleted && order.schema === 'pedido' ? { id: orderId, ...order } : null;
}

function safeOrderForWorker(order, productId = '', includeAllProducts = false) {
  const payload = order?.payload || {};
  const products = Array.isArray(payload.produtos) ? payload.produtos : [];
  const assignedProduct = productForAssignment(order, productId);
  const visibleProducts = productId && !includeAllProducts && assignedProduct ? [products[assignedProduct.index]] : products;
  return sanitizeForResponse({
    id: order?.id,
    numero: text(payload.numero || `PED-${String(order?.id || '').slice(0, 8)}`, 80),
    cliente: text(payload.cliente || 'Cliente nao informado', 160),
    empresa: text(payload.empresa, 160),
    telemovel: text(payload.telemovel, 40),
    morada: text(payload.morada, 250),
    dataEntrega: text(payload.dataEntrega, 30),
    observacoes: text(payload.observacoes, 800),
    produtos: visibleProducts.map(product => ({
      nome: text(product.nome || 'Produto', 160),
      tamanho: text(product.tamanho, 120),
      quantidade: money(product.quantidade || 1),
      observacoes: text(product.observacoes, 400)
    }))
  });
}

async function assignmentForWorker(orderId, workerId, productId = '') {
  const assignmentId = productionAssignmentId(orderId, productId);
  const assignmentDoc = await db.collection('production_assignments').doc(assignmentId).get();
  if (!assignmentDoc.exists) return null;
  const assignment = assignmentDoc.data();
  if (assignment.active === false) return null;
  const worker = (await productionWorkers()).find(item => item.id === workerId && item.active !== false);
  if (!worker || assignment.workerId !== workerId) return null;
  return { id: assignmentId, ...assignment };
}

async function workerHasOrderAssignment(orderId, workerId) {
  const worker = (await productionWorkers()).find(item => item.id === workerId && item.active !== false);
  if (!worker) return false;
  const snapshot = await db.collection('production_assignments').get();
  return snapshot.docs.some(doc => {
    const assignment = doc.data();
    return assignment.orderId === orderId
      && assignment.active !== false
      && assignment.workerId === workerId;
  });
}

async function messagesForOrder(orderId) {
  const snapshot = await db.collection('production_messages').get();
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(message => message.orderId === orderId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(-100)
    .map(sanitizeForResponse);
}

async function materialsCatalog() {
  const snapshot = await db.collection('events').get();
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(event => event.schema === 'material' && !event.deleted && event.payload?.ativo !== false)
    .map(event => ({ id: event.id, ...event.payload }));
}

async function issueStockForAssignment(orderId, productId, assignment, now) {
  const order = await getOrderEvent(orderId);
  if (!order) return [];
  const products = productId
    ? [rawProductForAssignment(order, productId)].filter(Boolean)
    : (Array.isArray(order.payload?.produtos) ? order.payload.produtos : []);
  const materiais = await materialsCatalog();
  const created = [];

  for (const [productIndex, product] of products.entries()) {
    const ficha = GESTAO.calcularFichaProduto(product, materiais);
    for (const [itemIndex, detalhe] of ficha.detalhes.entries()) {
      if (!detalhe.materialId || String(detalhe.materialId).startsWith('preset:')) continue;
      const movementId = `stock-${productionAssignmentId(orderId, productId)}-${productIndex}-${itemIndex}`;
      const movementRef = db.collection('events').doc(movementId);
      const existing = await movementRef.get();
      if (existing.exists) continue;
      const quantidadeProduto = Math.max(1, money(product.quantidade) || 1);
      const quantidade = -Math.abs(money(detalhe.calculo.consumo) * quantidadeProduto);
      if (!quantidade) continue;
      await movementRef.set({
        schema: 'estoque_movimento',
        pageId: 'ordemproducao',
        timestamp: now,
        created_at: now,
        updated_at: now,
        deleted: false,
        payload: {
          materialId: detalhe.materialId,
          materialNome: detalhe.material?.nome || detalhe.materialId,
          orderId,
          productId,
          productName: product.nome || assignment.productName || '',
          quantidade,
          unidade: detalhe.calculo.unidade,
          origem: 'baixa_automatica_producao',
          assignmentId: productionAssignmentId(orderId, productId),
          workerId: assignment.workerId,
          workerName: assignment.workerName
        }
      });
      created.push(movementId);
    }
  }

  return created;
}

app.get('/scan-fatura.html', (req, res) => res.sendFile(path.join(__dirname, 'scan-fatura.html')));
app.use('/mobile', express.static(path.join(__dirname, 'mobile'), { index: 'index.html', fallthrough: false }));
app.use('/colaborador', express.static(path.join(__dirname, 'colaborador'), { index: 'index.html', fallthrough: false }));

app.post('/api/colaborador/login', requestRateLimit({ windowMs: 15 * 60 * 1000, max: 30 }), async (req, res) => {
  try {
    const username = normalizeProductionUsername(req.body?.username);
    const password = String(req.body?.password || '');
    const worker = (await productionWorkers()).find(item => item.username === username && item.active !== false);
    if (password.length < 8 || password.length > 120 || !worker || !verifyProductionPassword(password, worker)) {
      return res.status(401).json({ success: false, message: 'Usuario ou senha incorretos.' });
    }
    const token = crypto.randomBytes(48).toString('hex');
    const now = Date.now();
    await db.collection('production_sessions').doc(hash(token)).set({
      workerId: worker.id,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + PRODUCTION_SESSION_TTL_MS).toISOString(),
      revoked: false
    });
    res.json({ success: true, token });
  } catch (error) {
    console.error('Erro ao entrar no app de producao:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel entrar no app.' });
  }
});

app.get('/api/colaborador/session', requireWorker, async (req, res) => {
  try {
    const snapshot = await db.collection('production_assignments').get();
    const assignments = await Promise.all(snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(item => item.active !== false && item.workerId === req.productionWorker.id)
      .map(async assignment => {
        const order = await getOrderEvent(assignment.orderId);
        return order ? {
          ...assignment,
          product: productForAssignment(order, assignment.productId),
          order: safeOrderForWorker(order, assignment.productId)
        } : null;
      }));
    res.json({
      success: true,
      worker: sanitizeForResponse({ id: req.productionWorker.id, name: req.productionWorker.name, role: req.productionWorker.role }),
      assignments: assignments.filter(Boolean).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    });
  } catch (error) {
    console.error('Erro ao carregar painel do colaborador:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel carregar suas ordens.' });
  }
});

app.post('/api/colaborador/ordens/:id/etapas', requireWorker, async (req, res) => {
  try {
    const orderId = String(req.params.id || '');
    const productId = productionProductId(req.body?.productId);
    const assignment = await assignmentForWorker(orderId, req.productionWorker.id, productId);
    if (!assignment) return res.status(404).json({ success: false, message: 'Ordem nao encontrada para este colaborador.' });
    if (assignment.paymentStatus === 'paid') return res.status(400).json({ success: false, message: 'Servico ja pago e arquivado.' });
    const stepId = productionStepId(req.body?.stepId);
    if (!stepId || !assignment.steps.some(step => step.id === stepId)) {
      return res.status(400).json({ success: false, message: 'Etapa invalida.' });
    }
    const now = new Date().toISOString();
    const steps = assignment.steps.map(step => step.id === stepId
      ? { ...step, done: Boolean(req.body?.done), completedAt: req.body?.done ? now : null }
      : step);
    const history = [
      ...(Array.isArray(assignment.history) ? assignment.history : []),
      assignmentHistoryEntry(req.body?.done ? 'step_completed' : 'step_reopened', {
        stepId,
        stepLabel: steps.find(step => step.id === stepId)?.label,
        workerId: req.productionWorker.id,
        workerName: req.productionWorker.name
      })
    ].slice(-100);
    await db.collection('production_assignments').doc(productionAssignmentId(orderId, productId)).set({ ...assignment, steps, history, updatedAt: now });
    res.json({ success: true, steps });
  } catch (error) {
    console.error('Erro ao atualizar etapa:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel atualizar a etapa.' });
  }
});

app.post('/api/colaborador/ordens/:id/etapas/tempo', requireWorker, async (req, res) => {
  try {
    const orderId = String(req.params.id || '');
    const productId = productionProductId(req.body?.productId);
    const assignment = await assignmentForWorker(orderId, req.productionWorker.id, productId);
    if (!assignment) return res.status(404).json({ success: false, message: 'Ordem nao encontrada para este colaborador.' });
    if (assignment.paymentStatus === 'paid') return res.status(400).json({ success: false, message: 'Servico ja pago e arquivado.' });
    const stepId = productionStepId(req.body?.stepId);
    if (!stepId || !assignment.steps.some(step => step.id === stepId)) {
      return res.status(400).json({ success: false, message: 'Etapa invalida.' });
    }

    const action = req.body?.action === 'stop' ? 'stop' : 'start';
    const now = new Date();
    const activeTimer = assignment.activeTimer || null;
    let steps = Array.isArray(assignment.steps) ? assignment.steps : [];
    let timeLogs = Array.isArray(assignment.timeLogs) ? assignment.timeLogs : [];
    let nextTimer = activeTimer;
    let historyType = 'timer_started';
    let elapsedMinutes = 0;

    if (action === 'start') {
      if (activeTimer && activeTimer.stepId !== stepId) {
        return res.status(409).json({ success: false, message: 'Finalize o apontamento em andamento antes de iniciar outra etapa.' });
      }
      nextTimer = {
        stepId,
        startedAt: now.toISOString(),
        workerId: req.productionWorker.id,
        workerName: req.productionWorker.name
      };
    } else {
      if (!activeTimer || activeTimer.stepId !== stepId) {
        return res.status(400).json({ success: false, message: 'Nenhum apontamento ativo para esta etapa.' });
      }
      elapsedMinutes = Math.max(1, Math.round((now - new Date(activeTimer.startedAt)) / 60000));
      timeLogs = [
        ...timeLogs,
        {
          stepId,
          productId,
          startedAt: activeTimer.startedAt,
          stoppedAt: now.toISOString(),
          minutes: elapsedMinutes,
          workerId: req.productionWorker.id,
          workerName: req.productionWorker.name
        }
      ].slice(-200);
      steps = steps.map(step => step.id === stepId
        ? { ...step, actualMinutes: money(step.actualMinutes) + elapsedMinutes }
        : step);
      nextTimer = null;
      historyType = 'timer_stopped';
    }

    const updated = {
      ...assignment,
      steps,
      timeLogs,
      activeTimer: nextTimer,
      history: [
        ...(Array.isArray(assignment.history) ? assignment.history : []),
        assignmentHistoryEntry(historyType, {
          stepId,
          productId,
          minutes: elapsedMinutes,
          workerId: req.productionWorker.id,
          workerName: req.productionWorker.name
        })
      ].slice(-100),
      updatedAt: now.toISOString()
    };

    await db.collection('production_assignments').doc(productionAssignmentId(orderId, productId)).set(updated);
    res.json({ success: true, assignment: sanitizeForResponse({ id: productionAssignmentId(orderId, productId), ...updated }) });
  } catch (error) {
    console.error('Erro ao apontar tempo:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel apontar o tempo da etapa.' });
  }
});

app.get('/api/colaborador/ordens/:id/chat', requireWorker, async (req, res) => {
  const orderId = String(req.params.id || '');
  if (!await workerHasOrderAssignment(orderId, req.productionWorker.id)) return res.status(404).json({ success: false, message: 'Conversa nao encontrada.' });
  res.json({ success: true, messages: await messagesForOrder(orderId) });
});

app.post('/api/colaborador/ordens/:id/chat', requireWorker, async (req, res) => {
  try {
    const orderId = String(req.params.id || '');
    if (!await workerHasOrderAssignment(orderId, req.productionWorker.id)) return res.status(404).json({ success: false, message: 'Conversa nao encontrada.' });
    const message = text(req.body?.message, 1000);
    if (!message || containsUnsafeMarkup(message)) return res.status(400).json({ success: false, message: 'Mensagem invalida.' });
    const now = new Date().toISOString();
    await db.collection('production_messages').add({ orderId, workerId: req.productionWorker.id, author: req.productionWorker.name, authorType: 'worker', message, createdAt: now });
    res.json({ success: true, messages: await messagesForOrder(orderId) });
  } catch (error) {
    console.error('Erro ao enviar mensagem do colaborador:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel enviar a mensagem.' });
  }
});

app.post('/api/mobile/login', requestRateLimit({ windowMs: 15 * 60 * 1000, max: 12 }), async (req, res) => {
  try {
    if (!CRM_MOBILE_ACCESS_KEY) {
      return res.status(503).json({ success: false, message: 'Configure CRM_MOBILE_ACCESS_KEY no Render para ativar o app movel.' });
    }
    if (!safeEqual(req.body?.accessKey || '', CRM_MOBILE_ACCESS_KEY)) {
      return res.status(401).json({ success: false, message: 'Chave de acesso incorreta.' });
    }
    const token = crypto.randomBytes(48).toString('hex');
    const deviceId = hash(token);
    const now = Date.now();
    const device = {
      id: deviceId,
      name: text(req.body?.deviceName || 'Celular', 80),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + MOBILE_DEVICE_TTL_MS).toISOString(),
      revoked: false
    };
    await db.collection('mobile_devices').doc(deviceId).set(device);
    res.json({ success: true, token, expiresAt: device.expiresAt });
  } catch (error) {
    console.error('Erro ao ativar app movel:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel ativar este dispositivo.' });
  }
});

app.get('/api/mobile/config', requireMobileDevice, (req, res) => {
  res.json({ success: true, companyNif: CRM_COMPANY_NIF, device: req.mobileDevice.name });
});

app.get('/api/mobile/documents', requireMobileDevice, async (req, res) => {
  try {
    const snapshot = await db.collection('mobile_invoice_inbox').get();
    const documents = (await launchLegacyPendingMobileDocuments(snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(item => item.deviceId === req.mobileDevice.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))))
      .slice(0, 40);
    res.json({ success: true, documents: documents.map(sanitizeForResponse) });
  } catch (error) {
    console.error('Erro ao listar documentos moveis:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel carregar os lancamentos.' });
  }
});

app.post('/api/mobile/documents', requireMobileDevice, async (req, res) => {
  try {
    const documento = normalizeMobileDocument(req.body);
    const errors = validateMobileDocument(documento);
    if (containsUnsafeMarkup(documento)) errors.push('Conteudo potencialmente inseguro.');
    if (errors.length) return res.status(400).json({ success: false, message: errors.join(' ') });
    const fingerprint = mobileDocumentFingerprint(documento);
    if (await findDuplicateMobileDocument(documento, fingerprint)) {
      return res.status(409).json({ success: false, message: 'Esta fatura ja foi enviada ou cadastrada no CRM.' });
    }
    const now = new Date().toISOString();
    const item = {
      ...documento,
      fingerprint,
      source: documento.rawQr ? 'mobile_qr' : 'mobile_manual',
      deviceId: req.mobileDevice.id,
      deviceName: req.mobileDevice.name,
      createdAt: now,
      updatedAt: now
    };
    const eventId = await launchMobileDocument(item, fingerprint, now);
    await db.collection('mobile_invoice_inbox').doc(fingerprint).set({
      ...item,
      status: 'approved',
      eventId,
      reviewedAt: now
    });
    res.json({ success: true, id: fingerprint, eventId, entryType: documento.entryType, message: 'Fatura cadastrada com sucesso.' });
  } catch (error) {
    console.error('Erro ao receber documento movel:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel enviar a fatura.' });
  }
});

app.post('/api/importacao-fiscal/receber', async (req, res) => {
  try {
    const token = String(req.body?.token || '');
    const rawQr = String(req.body?.rawQr || '');
    if (!isSafeIdentifier(token, 100) || rawQr.length < 10 || rawQr.length > 4000) {
      return res.status(400).json({ success: false, message: 'Sessão ou QR fiscal inválido.' });
    }

    const sessionRef = db.collection('qr_import_sessions').doc(token);
    const sessionDoc = await sessionRef.get();
    const session = sessionDoc.exists ? sessionDoc.data() : null;
    if (mobileSessionExpired(session)) {
      if (sessionDoc.exists) await sessionRef.delete();
      return res.status(410).json({ success: false, message: 'Sessão expirada. Gere um novo QR Code no CRM.' });
    }
    if (session.status !== 'waiting') return res.status(409).json({ success: false, message: 'Esta sessão já foi utilizada.' });

    const documento = QR_FISCAL.interpretar(rawQr);
    const erros = QR_FISCAL.validar(documento, CRM_COMPANY_NIF);
    if (erros.length) return res.status(400).json({ success: false, message: erros.join(' ') });
    if (await findDuplicateExpense(documento)) {
      return res.status(409).json({ success: false, message: 'Esta fatura já está cadastrada no CRM.' });
    }

    await sessionRef.set({
      ...session,
      status: 'uploaded',
      documento,
      receivedAt: new Date().toISOString()
    });
    res.json({ success: true, message: 'Fatura recebida. Confirme os dados no CRM.' });
  } catch (error) {
    console.error('Erro ao receber QR fiscal:', error);
    res.status(500).json({ success: false, message: 'Não foi possível receber o QR fiscal.' });
  }
});

app.use(requireAuth);

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

async function productionWorkers() {
  const snapshot = await db.collection('production_workers').get();
  const workers = new Map();
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const worker = { ...data, id: data.id || doc.id, storageId: doc.id };
    const current = workers.get(worker.id);
    if (!current || new Date(worker.updatedAt || worker.createdAt) > new Date(current.updatedAt || current.createdAt)) {
      workers.set(worker.id, worker);
    }
  });
  return Array.from(workers.values());
}

function collaboratorUrl(req) {
  return `${req.protocol}://${req.get('host')}/colaborador/`;
}

function normalizeProductionUsername(value) {
  return text(value, 60).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function productionPasswordFields(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { passwordSalt: salt, passwordHash: crypto.scryptSync(String(password), salt, 64).toString('hex') };
}

function verifyProductionPassword(password, worker) {
  if (!worker.passwordSalt || !worker.passwordHash) return false;
  return safeEqual(crypto.scryptSync(String(password), worker.passwordSalt, 64).toString('hex'), worker.passwordHash);
}

function safeProductionWorker(worker) {
  const { passwordHash, passwordSalt, storageId, ...safeWorker } = worker;
  return sanitizeForResponse(safeWorker);
}

async function revokeWorkerSessions(workerId) {
  const sessions = await db.collection('production_sessions').get();
  const now = new Date().toISOString();
  await Promise.all(sessions.docs
    .filter(doc => doc.data().workerId === workerId && !doc.data().revoked)
    .map(doc => db.collection('production_sessions').doc(doc.id).set({ ...doc.data(), revoked: true, revokedAt: now })));
}

app.get('/api/production/workers', async (req, res) => {
  const allWorkers = (await productionWorkers()).map(safeProductionWorker);
  res.json({ success: true, workers: allWorkers.filter(worker => worker.active !== false), allWorkers, steps: PRODUCTION_STEPS, appUrl: collaboratorUrl(req) });
});

app.post('/api/production/workers', async (req, res) => {
  try {
    const name = text(req.body?.name, 100);
    const username = normalizeProductionUsername(req.body?.username);
    const password = String(req.body?.password || '');
    const role = ['comercial', 'projetista', 'montagem', 'producao'].includes(req.body?.role) ? req.body.role : 'montagem';
    if (!name || containsUnsafeMarkup(name)) return res.status(400).json({ success: false, message: 'Nome invalido.' });
    if (!/^[a-z0-9._-]{3,60}$/.test(username)) return res.status(400).json({ success: false, message: 'Usuario deve ter ao menos 3 caracteres e usar apenas letras, numeros, ponto, hifen ou sublinhado.' });
    if (password.length < 8 || password.length > 120) return res.status(400).json({ success: false, message: 'Senha deve possuir entre 8 e 120 caracteres.' });
    const existingWorkers = await productionWorkers();
    if (existingWorkers.some(worker => worker.username === username && worker.active !== false)) {
      return res.status(409).json({ success: false, message: 'Este usuario ja esta cadastrado. Consulte a lista de usuarios autorizados.' });
    }
    const staleWorkers = existingWorkers.filter(worker => worker.username === username && worker.active === false);
    await Promise.all(staleWorkers.map(worker => db.collection('production_workers').doc(worker.storageId || worker.id).delete()));
    const now = new Date().toISOString();
    const worker = { name, username, role, active: true, createdAt: now, updatedAt: now, ...productionPasswordFields(password) };
    const id = crypto.randomBytes(12).toString('hex');
    await db.collection('production_workers').doc(id).set(worker);
    res.json({ success: true, worker: safeProductionWorker({ id, ...worker }), appUrl: collaboratorUrl(req) });
  } catch (error) {
    console.error('Erro ao cadastrar colaborador:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel cadastrar o colaborador.' });
  }
});

app.post('/api/production/workers/:id/credentials', async (req, res) => {
  try {
    const worker = (await productionWorkers()).find(item => item.id === req.params.id);
    if (!worker) return res.status(404).json({ success: false, message: 'Colaborador nao encontrado.' });
    const username = normalizeProductionUsername(req.body?.username || worker.username);
    const password = String(req.body?.password || '');
    if (!/^[a-z0-9._-]{3,60}$/.test(username)) return res.status(400).json({ success: false, message: 'Informe um usuario valido.' });
    if (password.length < 8 || password.length > 120) return res.status(400).json({ success: false, message: 'Senha deve possuir entre 8 e 120 caracteres.' });
    if ((await productionWorkers()).some(item => item.id !== worker.id && item.username === username)) return res.status(409).json({ success: false, message: 'Este usuario ja esta cadastrado.' });
    const updated = { ...worker, username, ...productionPasswordFields(password), active: true, updatedAt: new Date().toISOString() };
    delete updated.storageId;
    await revokeWorkerSessions(worker.id);
    await db.collection('production_workers').doc(worker.id).set(updated);
    res.json({ success: true, worker: safeProductionWorker(updated), appUrl: collaboratorUrl(req) });
  } catch (error) {
    console.error('Erro ao redefinir senha do colaborador:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel redefinir a senha.' });
  }
});

app.post('/api/production/workers/:id/revoke', async (req, res) => {
  try {
    const now = new Date().toISOString();
    const workers = await db.collection('production_workers').get();
    const matches = workers.docs.filter(doc => (doc.data().id || doc.id) === req.params.id);
    if (!matches.length) return res.status(404).json({ success: false, message: 'Colaborador nao encontrado.' });
    await revokeWorkerSessions(req.params.id);
    await Promise.all(matches.map(doc => db.collection('production_workers').doc(doc.id).set({ ...doc.data(), active: false, updatedAt: now })));
    res.json({ success: true, message: 'Acesso revogado.' });
  } catch (error) {
    console.error('Erro ao revogar colaborador:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel revogar o acesso.' });
  }
});

app.post('/api/production/workers/:id/delete', async (req, res) => {
  try {
    const workers = await db.collection('production_workers').get();
    const matches = workers.docs.filter(doc => (doc.data().id || doc.id) === req.params.id);
    if (!matches.length) return res.status(404).json({ success: false, message: 'Colaborador nao encontrado.' });
    await revokeWorkerSessions(req.params.id);
    await Promise.all(matches.map(doc => db.collection('production_workers').doc(doc.id).delete()));
    res.json({ success: true, message: 'Usuario excluido.' });
  } catch (error) {
    console.error('Erro ao excluir colaborador:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel excluir o usuario.' });
  }
});

app.get('/api/production/assignments', async (req, res) => {
  const snapshot = await db.collection('production_assignments').get();
  res.json({ success: true, assignments: snapshot.docs.map(doc => sanitizeForResponse({ id: doc.id, ...doc.data() })) });
});

app.get('/api/production/assignments/:id', async (req, res) => {
  const assignmentDoc = await db.collection('production_assignments').doc(String(req.params.id || '')).get();
  res.json({ success: true, assignment: assignmentDoc.exists ? sanitizeForResponse({ id: req.params.id, ...assignmentDoc.data() }) : null });
});

app.post('/api/production/assignments', async (req, res) => {
  try {
    const orderId = String(req.body?.orderId || '');
    const productId = productionProductId(req.body?.productId);
    const workerId = String(req.body?.workerId || '');
    const order = await getOrderEvent(orderId);
    const worker = (await productionWorkers()).find(item => item.id === workerId && item.active !== false);
    if (!order) return res.status(404).json({ success: false, message: 'Ordem de producao nao encontrada.' });
    const product = productForAssignment(order, productId);
    if (req.body?.productId && !product) return res.status(400).json({ success: false, message: 'Produto da O.S. invalido.' });
    if (!worker) return res.status(400).json({ success: false, message: 'Selecione um colaborador ativo.' });
    const assignmentId = productionAssignmentId(orderId, productId);
    const oldDoc = await db.collection('production_assignments').doc(assignmentId).get();
    const old = oldDoc.exists ? oldDoc.data() : {};
    const now = new Date().toISOString();
    const commission = money(req.body?.commission);
    const keepPayment = old.paymentStatus === 'paid' && old.workerId === workerId && money(old.commission) === commission;
    const assignment = {
      orderId,
      productId,
      productName: product?.nome || '',
      workerId,
      workerName: worker.name,
      workerRole: worker.role,
      commission,
      paymentStatus: keepPayment ? 'paid' : 'pending',
      paidAt: keepPayment ? old.paidAt || null : null,
      paidBy: keepPayment ? old.paidBy || '' : '',
      paymentNote: keepPayment ? old.paymentNote || '' : '',
      steps: normalizeProductionSteps(req.body?.steps, old.steps),
      transitions: [
        ...(Array.isArray(old.transitions) ? old.transitions : []),
        ...(old.workerId && old.workerId !== workerId ? [{
          type: 'transfer',
          fromWorkerId: old.workerId,
          fromWorkerName: old.workerName,
          toWorkerId: workerId,
          toWorkerName: worker.name,
          createdAt: now
        }] : [])
      ].slice(-50),
      history: [
        ...(Array.isArray(old.history) ? old.history : []),
        assignmentHistoryEntry(old.workerId && old.workerId !== workerId ? 'transferred' : 'assigned', {
          productId,
          productName: product?.nome || '',
          fromWorkerId: old.workerId || '',
          fromWorkerName: old.workerName || '',
          workerId,
          workerName: worker.name
        })
      ].slice(-100),
      active: true,
      createdAt: old.createdAt || now,
      updatedAt: now
    };
    if (!assignment.steps.length) return res.status(400).json({ success: false, message: 'Selecione ao menos uma etapa.' });
    await db.collection('production_assignments').doc(assignmentId).set(assignment);
    res.json({ success: true, assignment: sanitizeForResponse(assignment) });
  } catch (error) {
    console.error('Erro ao classificar OS:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel classificar a OS.' });
  }
});

app.post('/api/production/assignments/:id/payment', async (req, res) => {
  try {
    const orderId = String(req.params.id || '');
    const productId = productionProductId(req.body?.productId);
    const assignmentId = productionAssignmentId(orderId, productId);
    const assignmentDoc = await db.collection('production_assignments').doc(assignmentId).get();
    if (!assignmentDoc.exists || assignmentDoc.data().active === false) {
      return res.status(404).json({ success: false, message: 'Servico nao encontrado para pagamento.' });
    }
    const assignment = assignmentDoc.data();
    const steps = Array.isArray(assignment.steps) ? assignment.steps : [];
    if (!steps.length || steps.some(step => !step.done)) {
      return res.status(400).json({ success: false, message: 'Conclua todas as etapas antes de marcar a comissao como paga.' });
    }
    if (money(assignment.commission) <= 0) {
      return res.status(400).json({ success: false, message: 'Este servico nao possui comissao para pagar.' });
    }
    const now = new Date().toISOString();
    const paidBy = text(req.body?.paidBy || 'Equipe interna', 120);
    const paymentNote = text(req.body?.note, 300);
    const updated = {
      ...assignment,
      paymentStatus: 'paid',
      paidAt: now,
      paidBy,
      paymentNote,
      history: [
        ...(Array.isArray(assignment.history) ? assignment.history : []),
        assignmentHistoryEntry('payment_paid', {
          productId,
          productName: assignment.productName || '',
          workerId: assignment.workerId,
          workerName: assignment.workerName,
          paidBy,
          commission: money(assignment.commission),
          note: paymentNote
        })
      ].slice(-100),
      updatedAt: now
    };
    await db.collection('production_assignments').doc(assignmentId).set(updated);
    const stockMovements = await issueStockForAssignment(orderId, productId, updated, now);
    res.json({ success: true, assignment: sanitizeForResponse({ id: assignmentId, ...updated }), stockMovements });
  } catch (error) {
    console.error('Erro ao marcar comissao como paga:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel marcar a comissao como paga.' });
  }
});

app.post('/api/production/assignments/:id/unassign', async (req, res) => {
  try {
    const orderId = String(req.params.id || '');
    const productId = productionProductId(req.body?.productId);
    const assignmentId = productionAssignmentId(orderId, productId);
    const assignmentDoc = await db.collection('production_assignments').doc(assignmentId).get();
    if (!assignmentDoc.exists || assignmentDoc.data().active === false) {
      return res.status(404).json({ success: false, message: 'A O.S. ja esta na fila sem responsavel.' });
    }
    const old = assignmentDoc.data();
    const now = new Date().toISOString();
    const assignment = {
      ...old,
      active: false,
      transitions: [
        ...(Array.isArray(old.transitions) ? old.transitions : []),
        { type: 'unassign', fromWorkerId: old.workerId, fromWorkerName: old.workerName, createdAt: now }
      ].slice(-50),
      history: [
        ...(Array.isArray(old.history) ? old.history : []),
        assignmentHistoryEntry('unassigned', {
          productId,
          productName: old.productName || '',
          fromWorkerId: old.workerId,
          fromWorkerName: old.workerName
        })
      ].slice(-100),
      updatedAt: now
    };
    await db.collection('production_assignments').doc(assignmentId).set(assignment);
    res.json({ success: true, assignment: sanitizeForResponse(assignment), message: 'O.S. devolvida para a fila de producao.' });
  } catch (error) {
    console.error('Erro ao desclassificar OS:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel devolver a O.S. para a fila.' });
  }
});

app.get('/api/production/assignments/:id/chat', async (req, res) => {
  res.json({ success: true, messages: await messagesForOrder(String(req.params.id || '')) });
});

app.post('/api/production/assignments/:id/chat', async (req, res) => {
  try {
    const orderId = String(req.params.id || '');
    const assignmentDoc = await db.collection('production_assignments').doc(orderId).get();
    if (!assignmentDoc.exists) return res.status(404).json({ success: false, message: 'Classifique a OS antes de iniciar a conversa.' });
    const message = text(req.body?.message, 1000);
    if (!message || containsUnsafeMarkup(message)) return res.status(400).json({ success: false, message: 'Mensagem invalida.' });
    await db.collection('production_messages').add({ orderId, workerId: assignmentDoc.data().workerId, author: 'Equipe interna', authorType: 'admin', message, createdAt: new Date().toISOString() });
    res.json({ success: true, messages: await messagesForOrder(orderId) });
  } catch (error) {
    console.error('Erro ao enviar mensagem interna:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel enviar a mensagem.' });
  }
});

app.get('/api/mobile/inbox', async (req, res) => {
  try {
    const snapshot = await db.collection('mobile_invoice_inbox').get();
    const documents = (await launchLegacyPendingMobileDocuments(snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))))
      .filter(item => item.status === 'approved')
      .slice(0, 10);
    res.json({ success: true, documents: documents.map(sanitizeForResponse) });
  } catch (error) {
    console.error('Erro ao listar caixa fiscal:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel carregar a caixa fiscal.' });
  }
});

app.post('/api/mobile/inbox/:id/approve', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!/^[a-f0-9]{64}$/.test(id)) return res.status(400).json({ success: false, message: 'Documento invalido.' });
    const inboxRef = db.collection('mobile_invoice_inbox').doc(id);
    const inboxDoc = await inboxRef.get();
    if (!inboxDoc.exists) return res.status(404).json({ success: false, message: 'Documento nao encontrado.' });
    const item = inboxDoc.data();
    if (item.status === 'rejected') return res.status(409).json({ success: false, message: 'Documento rejeitado. Envie novamente para revisar.' });
    const now = new Date().toISOString();
    const eventId = await launchMobileDocument(item, id, now);
    await inboxRef.set({ ...item, status: 'approved', eventId, reviewedAt: now, updatedAt: now });
    res.json({ success: true, eventId, message: 'Documento aprovado e lancado no CRM.' });
  } catch (error) {
    console.error('Erro ao aprovar documento fiscal:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel aprovar o documento.' });
  }
});

app.post('/api/mobile/inbox/:id/reject', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!/^[a-f0-9]{64}$/.test(id)) return res.status(400).json({ success: false, message: 'Documento invalido.' });
    const inboxRef = db.collection('mobile_invoice_inbox').doc(id);
    const inboxDoc = await inboxRef.get();
    if (!inboxDoc.exists) return res.status(404).json({ success: false, message: 'Documento nao encontrado.' });
    const now = new Date().toISOString();
    await inboxRef.set({ ...inboxDoc.data(), status: 'rejected', reviewedAt: now, updatedAt: now });
    res.json({ success: true, message: 'Documento rejeitado.' });
  } catch (error) {
    console.error('Erro ao rejeitar documento fiscal:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel rejeitar o documento.' });
  }
});

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

app.post('/api/importacao-fiscal/session', async (req, res) => {
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    await db.collection('qr_import_sessions').doc(token).set({
      token,
      status: 'waiting',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + UPLOAD_TTL_MS).toISOString()
    });
    res.json({
      success: true,
      token,
      expiresAt: new Date(now + UPLOAD_TTL_MS).toISOString(),
      mobileUrl: `${req.protocol}://${req.get('host')}/scan-fatura.html?token=${encodeURIComponent(token)}`
    });
  } catch (error) {
    console.error('Erro ao criar sessão fiscal:', error);
    res.status(500).json({ success: false, message: 'Não foi possível criar a sessão fiscal.' });
  }
});

app.get('/api/importacao-fiscal/check', async (req, res) => {
  try {
    const token = String(req.query.token || '');
    if (!isSafeIdentifier(token, 100)) return res.status(400).json({ status: 'error', message: 'Sessão inválida.' });
    const sessionRef = db.collection('qr_import_sessions').doc(token);
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) return res.json({ status: 'waiting' });
    const session = sessionDoc.data();
    if (mobileSessionExpired(session)) {
      await sessionRef.delete();
      return res.status(410).json({ status: 'expired', message: 'Sessão expirada.' });
    }
    if (session.status !== 'uploaded') return res.json({ status: 'waiting' });
    await sessionRef.delete();
    res.json({ status: 'uploaded', documento: session.documento });
  } catch (error) {
    console.error('Erro ao verificar QR fiscal:', error);
    res.status(500).json({ status: 'error', message: 'Não foi possível verificar a importação fiscal.' });
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

async function allEvents() {
  const snapshot = await db.collection('events').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function allProductionAssignments() {
  const snapshot = await db.collection('production_assignments').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function latestManagementConfig(events) {
  const configs = events
    .filter(event => event.schema === 'config_equilibrio' && !event.deleted)
    .sort((a, b) => new Date(b.updated_at || b.timestamp || 0) - new Date(a.updated_at || a.timestamp || 0));
  return configs[0]?.payload || {};
}

app.get('/api/management/overview', async (req, res) => {
  try {
    const events = await allEvents();
    const assignments = await allProductionAssignments();
    const materiais = events
      .filter(event => event.schema === 'material' && !event.deleted && event.payload?.ativo !== false)
      .map(event => ({ id: event.id, ...event.payload }));
    const config = await latestManagementConfig(events);
    const overview = GESTAO.painelGestao({ eventos: events, assignments, materiais, config });
    res.json({ success: true, overview: sanitizeForResponse(overview) });
  } catch (error) {
    console.error('Erro ao gerar visao gerencial:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel gerar a visao gerencial.' });
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
app.get('/core/custeio.js', (req, res) => res.sendFile(path.join(__dirname, 'core', 'custeio.js')));
app.get('/core/materiais-padrao.js', (req, res) => res.sendFile(path.join(__dirname, 'core', 'materiais-padrao.js')));
app.get('/core/financeiro.js', (req, res) => res.sendFile(path.join(__dirname, 'core', 'financeiro.js')));
app.get('/core/qr-fiscal.js', (req, res) => res.sendFile(path.join(__dirname, 'core', 'qr-fiscal.js')));
app.get('/core/gestao.js', (req, res) => res.sendFile(path.join(__dirname, 'core', 'gestao.js')));
app.get('/menu/menu.config.js', (req, res) => res.sendFile(path.join(__dirname, 'menu', 'menu.config.js')));

if (require.main === module) {
  app.listen(PORT, () => console.log(`CRM PRINT PIXEL ONLINE - PORTA ${PORT}`));
}

module.exports = { app, containsUnsafeMarkup, sanitizeForResponse, matchesFilters, normalizeLimit };
