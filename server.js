const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { db } = require('./firebase.js');
const QR_FISCAL = require('./core/qr-fiscal.js');
const GESTAO = require('./core/gestao.js');
const ROTULOS = require('./core/rotulos.js');
const {
  MoloniClient,
  buildDocumentPreview,
  cleanText: moloniText,
  moloniDocumentResult,
  oauthAuthorizationUrl,
  recommendDocumentAction,
  roundMoney: moloniMoney
} = require('./core/moloni.js');

function loadLocalEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!require('fs').existsSync(envPath)) return;
  const content = require('fs').readFileSync(envPath, 'utf8');
  content.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) return;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) process.env[key] = value;
  });
}

loadLocalEnvFile();

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const AUTH_DISABLED = process.env.CRM_AUTH_DISABLED === 'true';
const CRM_USERNAME = process.env.CRM_USERNAME || '';
const CRM_PASSWORD = process.env.CRM_PASSWORD || '';
const CRM_COMPANY_NIF = String(process.env.CRM_COMPANY_NIF || '').replace(/\D/g, '');
const CRM_MOBILE_ACCESS_KEY = process.env.CRM_MOBILE_ACCESS_KEY || (!IS_PRODUCTION ? 'dev-mobile-key' : '');
const MOLONI_MODE = process.env.MOLONI_MODE === 'live' ? 'live' : 'mock';
const MOLONI_CLIENT_ID = process.env.MOLONI_CLIENT_ID || '';
const MOLONI_CLIENT_SECRET = process.env.MOLONI_CLIENT_SECRET || '';
const MOLONI_REDIRECT_URI = process.env.MOLONI_REDIRECT_URI || '';
const MOLONI_ENCRYPTION_KEY = process.env.MOLONI_ENCRYPTION_KEY || CRM_PASSWORD || 'development-only-moloni-key';
const MAX_QUERY_LIMIT = 500;
const MAX_UPLOAD_BYTES = 500 * 1024;
const UPLOAD_TTL_MS = 15 * 60 * 1000;
const MOBILE_DEVICE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const PRODUCTION_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const LABEL_PLATFORM_MONTHLY_FEE = 15;
const PRODUCTION_PROCESS_CATALOG = [
  { label: 'Pintura interna', difficulty: 4 },
  { label: 'Montagem da estrutura', difficulty: 1 },
  { label: 'Montagem do painel ACM', difficulty: 2 },
  { label: 'Gabarito de instalacao', difficulty: 4 },
  { label: 'Aplicar e soldar LED', difficulty: 1 },
  { label: 'Cola quente', difficulty: 2 },
  { label: 'Silicone', difficulty: 2 },
  { label: 'Corte laser', difficulty: 3 },
  { label: 'Montagem face', difficulty: 2 },
  { label: 'Pintura prata / ouro', difficulty: 3 },
  { label: 'Borracha neon', difficulty: 1 },
  { label: 'Limpeza / embalagem', difficulty: 4 }
];
const PRODUCTION_STEPS = PRODUCTION_PROCESS_CATALOG.map(step => step.label);
const DEFAULT_PRODUCTS = [
  'Logo em Acrilico',
  'Logo Flutuante para Montra',
  'Neon LED',
  'Alto Colante',
  'Logo 3D com LED',
  'Logo 3D sem LED',
  'Letra Caixa PETG 3D',
  'Adesivo vinil impresso',
  'Adesivo vinil impresso com recorte',
  'LED neon com base acrilico 6 mm',
  'Lona impressa sem ilhos',
  'Lona impressa com ilhos',
  'Corte laser acrilico 3 mm',
  'Painel ACM com letras em relevo',
  'Caixa de luz face opalino',
  'Brindes',
  'Painel de ACM',
  'Caixa de Luz',
  'Outro'
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
    const localDevelopmentOrigin = !IS_PRODUCTION && /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(origin || '');
    if (!origin || localDevelopmentOrigin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origem não autorizada pelo CORS.'));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Authorization', 'Content-Type']
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api', requestRateLimit({ windowMs: 60 * 1000, max: 240 }));

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

function signedMoney(value) {
  const parsed = Number.parseFloat(String(value || '0').replace(',', '.'));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function hashLabelToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function labelCustomerPublic(customer) {
  return sanitizeForResponse({
    id: customer.id,
    name: customer.name,
    email: customer.email || '',
    phone: customer.phone || '',
    active: customer.active !== false,
    defaultTaxMode: customer.defaultTaxMode === 'isento' ? 'isento' : 'iva',
    prices: customer.prices || {}
  });
}

async function allLabelCustomers() {
  const snapshot = await db.collection('label_customers').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function labelCustomerByToken(token) {
  if (!isSafeIdentifier(token, 160)) return null;
  const tokenHash = hashLabelToken(token);
  return (await allLabelCustomers()).find(customer => customer.tokenHash === tokenHash && customer.active !== false) || null;
}

function labelPaymentTotal(payload) {
  const payments = Array.isArray(payload.pagamentos) ? payload.pagamentos : [];
  return money(payments
    .filter(payment => payment.status === 'pago')
    .reduce((sum, payment) => sum + money(payment.valor), 0));
}

function labelOrderPublic(id, payload) {
  const total = money(payload.total);
  const totalPago = labelPaymentTotal(payload);
  const paid = total > 0 && totalPago >= total - 0.009;
  return sanitizeForResponse({
    id,
    numero: payload.numero,
    data: payload.data,
    recordType: payload.recordType || 'label_order',
    billingMonth: payload.billingMonth || '',
    title: payload.recordType === 'platform_fee' ? 'Plano mensal da plataforma' : 'Pedido de rótulos',
    status: payload.status || 'pendente',
    produtos: Array.isArray(payload.produtos) ? payload.produtos.map(product => ({
      nome: product.nome,
      modeloRotulo: product.modeloRotulo,
      tamanho: product.tamanho,
      quantidade: product.quantidade,
      hasNutrition: product.hasNutrition === true,
      nutritionText: product.nutritionText || '',
      comIVA: product.comIVA,
      valor: product.valor,
      total: product.total
    })) : [],
    subtotal: money(payload.subtotal),
    iva: money(payload.iva),
    total,
    totalPago,
    saldoPendente: money(Math.max(0, total - totalPago)),
    paid,
    canHide: paid
  });
}

async function labelOrdersForCustomer(customerId) {
  const snapshot = await db.collection('events').get();
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(event => !event.deleted
      && event.schema === 'pedido'
      && event.payload?.source === 'rotulos'
      && event.payload?.labelCustomerId === customerId
      && event.payload?.hiddenFromCustomer !== true)
    .sort((a, b) => new Date(b.timestamp || b.created_at || 0) - new Date(a.timestamp || a.created_at || 0));
}

function labelBillingMonth(reference = new Date()) {
  const date = reference instanceof Date ? reference : new Date(reference);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function labelBillingMonthName(month) {
  const [year, monthNumber] = String(month).split('-').map(Number);
  return new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' })
    .format(new Date(year, monthNumber - 1, 1));
}

function labelPlatformFeeId(customerId, month) {
  return `label-fee-${hash(`${customerId}|${month}`).slice(0, 32)}`;
}

async function ensureLabelPlatformFee(customer, reference = new Date()) {
  if (!customer || customer.active === false) return null;
  const month = labelBillingMonth(reference);
  const id = labelPlatformFeeId(customer.id, month);
  const suppression = await db.collection('label_fee_suppressions').doc(id).get();
  if (suppression.exists) return null;

  const ref = db.collection('events').doc(id);
  const existing = await ref.get();
  if (existing.exists) return { id, ...existing.data() };

  const withVat = customer.defaultTaxMode !== 'isento';
  const total = LABEL_PLATFORM_MONTHLY_FEE;
  const subtotal = withVat ? money(total / 1.23) : total;
  const iva = money(total - subtotal);
  const now = new Date();
  const monthName = labelBillingMonthName(month);
  const payload = {
    numero: `PLAT-${month.replace('-', '')}-${String(customer.id).slice(-6).toUpperCase()}`,
    source: 'rotulos',
    recordType: 'platform_fee',
    billingMonth: month,
    labelCustomerId: customer.id,
    cliente: customer.name,
    email: customer.email || '',
    telemovel: customer.phone || '',
    data: now.toISOString().slice(0, 10),
    dataPedido: now.toISOString().slice(0, 10),
    status: 'pendente',
    produtos: [{
      id: `platform_${month}`,
      nome: `Plano mensal da plataforma — ${monthName}`,
      produto: 'Plano mensal da plataforma',
      modeloRotulo: '',
      categoriaRotulo: 'Plataforma',
      tamanho: 'Mensal',
      quantidade: 1,
      valor: subtotal,
      comIVA: withVat ? 'sim' : 'nao',
      valorIVA: iva,
      subtotal,
      total,
      entregue: true
    }],
    pagamentos: [],
    subtotal,
    iva,
    valorIVA: iva,
    total,
    totalPago: 0,
    saldoPendente: total,
    comIVA: withVat ? 'sim' : 'nao',
    observacoes: `Mensalidade da plataforma referente a ${monthName}.`,
    createdBy: 'monthly-platform-fee'
  };
  const event = {
    schema: 'pedido',
    payload,
    pageId: 'portal-rotulos',
    timestamp: now.toISOString(),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    deleted: false
  };
  await ref.set(event);
  return { id, ...event };
}

async function ensureAllLabelPlatformFees(customers) {
  await Promise.all((customers || []).filter(customer => customer.active !== false).map(customer => ensureLabelPlatformFee(customer)));
}

const MOLONI_CONFIG_DOC = db.collection('integrations').doc('moloni');
const MOLONI_PRODUCTS_COLLECTION = db.collection('moloni_products');

function moloniCryptoKey() {
  return crypto.createHash('sha256').update(MOLONI_ENCRYPTION_KEY).digest();
}

function encryptMoloniTokens(tokens) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', moloniCryptoKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64')
  };
}

function decryptMoloniTokens(encrypted) {
  if (!encrypted?.iv || !encrypted?.tag || !encrypted?.data) return null;
  const decipher = crypto.createDecipheriv('aes-256-gcm', moloniCryptoKey(), Buffer.from(encrypted.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(encrypted.data, 'base64')),
    decipher.final()
  ]).toString('utf8'));
}

function signMoloniState(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', moloniCryptoKey()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyMoloniState(state) {
  const [encoded, signature] = String(state || '').split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', moloniCryptoKey()).update(encoded).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  return Date.now() - Number(payload.createdAt || 0) < 10 * 60 * 1000 ? payload : null;
}

async function moloniConfig() {
  const snapshot = await MOLONI_CONFIG_DOC.get();
  return snapshot.exists ? snapshot.data() : {};
}

async function saveMoloniConfig(updates) {
  const saved = { ...updates, updatedAt: new Date().toISOString() };
  await MOLONI_CONFIG_DOC.set(saved, { merge: true });
  return { ...(await moloniConfig()) };
}

async function exchangeMoloniGrant(params) {
  const url = new URL('https://api.moloni.pt/v1/grant/');
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw new Error(body.error_description || 'Falha na autenticacao Moloni.');
  return body;
}

async function moloniAccessToken() {
  const config = await moloniConfig();
  const tokens = decryptMoloniTokens(config.tokens);
  if (!tokens?.access_token) throw new Error('A conta Moloni ainda nao esta ligada.');
  const expiresAt = Number(tokens.expires_at || 0);
  if (expiresAt > Date.now() + 60 * 1000) return tokens.access_token;
  if (!tokens.refresh_token) throw new Error('A autorizacao Moloni expirou. Volte a ligar a conta.');

  const refreshed = await exchangeMoloniGrant({
    grant_type: 'refresh_token',
    client_id: MOLONI_CLIENT_ID,
    client_secret: MOLONI_CLIENT_SECRET,
    refresh_token: tokens.refresh_token
  });
  const nextTokens = {
    ...refreshed,
    expires_at: Date.now() + Number(refreshed.expires_in || 3600) * 1000
  };
  await saveMoloniConfig({ tokens: encryptMoloniTokens(nextTokens), connectedAt: new Date().toISOString() });
  return nextTokens.access_token;
}

async function moloniOrder(orderId) {
  const snapshot = await db.collection('events').doc(String(orderId || '')).get();
  if (!snapshot.exists || snapshot.data()?.schema !== 'pedido' || snapshot.data()?.deleted) return null;
  return { ...(snapshot.data().payload || {}), id: String(orderId) };
}

async function moloniDocuments() {
  const snapshot = await db.collection('moloni_documents').get();
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function moloniPublicStatus(config = {}) {
  const connected = Boolean(config.tokens);
  const checklist = moloniRequiredSettings(config);
  return {
    mode: MOLONI_MODE,
    connected,
    readyForLive: MOLONI_MODE === 'live' && checklist.every(item => item.ok),
    credentialsConfigured: Boolean(MOLONI_CLIENT_ID && MOLONI_CLIENT_SECRET && MOLONI_REDIRECT_URI),
    redirectUri: MOLONI_REDIRECT_URI,
    checklist,
    companyId: config.companyId || '',
    settings: config.settings || {},
    updatedAt: config.updatedAt || ''
  };
}

function moloniEndpointFor(type) {
  return {
    invoice: 'invoices/insert',
    invoice_receipt: 'invoiceReceipts/insert',
    receipt: 'receipts/insert'
  }[type];
}

function moloniPaymentMethodId(settings, method) {
  const normalized = String(method || '').trim().toLowerCase();
  const mappings = settings.paymentMethods || {};
  return Number(mappings[normalized] || mappings.outro || settings.defaultPaymentMethodId || 0);
}

function moloniRequiredSettings(config = {}) {
  const settings = config.settings || {};
  return [
    { key: 'modeLive', label: 'Modo live ativo', ok: MOLONI_MODE === 'live' },
    { key: 'credentials', label: 'Developer ID, Client Secret e Redirect URI configurados', ok: Boolean(MOLONI_CLIENT_ID && MOLONI_CLIENT_SECRET && MOLONI_REDIRECT_URI) },
    { key: 'connected', label: 'Conta Moloni ligada por OAuth', ok: Boolean(config.tokens) },
    { key: 'company', label: 'Empresa Moloni selecionada', ok: Number(config.companyId || 0) > 0 },
    { key: 'invoiceSet', label: 'Serie de Faturas selecionada', ok: Number(settings.invoiceDocumentSetId || 0) > 0 },
    { key: 'invoiceReceiptSet', label: 'Serie de Faturas-Recibo selecionada', ok: Number(settings.invoiceReceiptDocumentSetId || 0) > 0 },
    { key: 'receiptSet', label: 'Serie de Recibos selecionada', ok: Number(settings.receiptDocumentSetId || 0) > 0 },
    { key: 'product', label: 'Artigo generico selecionado', ok: Number(settings.defaultProductId || 0) > 0 },
    { key: 'productCategory', label: 'Categoria padrao de artigos selecionada', ok: Number(settings.defaultProductCategoryId || 0) > 0 },
    { key: 'unit', label: 'Unidade padrao de artigos selecionada', ok: Number(settings.defaultUnitId || 0) > 0 },
    { key: 'payment', label: 'Metodo de pagamento predefinido selecionado', ok: Number(settings.defaultPaymentMethodId || 0) > 0 }
  ];
}

function moloniAssertReadyForIssue(config = {}) {
  if (MOLONI_MODE !== 'live') return;
  const missing = moloniRequiredSettings(config).filter(item => !item.ok);
  if (missing.length) {
    throw new Error(`Integracao Moloni incompleta: ${missing.map(item => item.label).join(', ')}.`);
  }
}

function moloniProductReference(product = {}) {
  return moloniText(product.reference || product.name || 'artigo-crm', 80);
}

function moloniCustomerId(value = {}) {
  if (!value || typeof value !== 'object') return 0;
  const candidates = [
    value.customer_id,
    value.customerId,
    value.client_id,
    value.clientId,
    value.id,
    value.customer?.customer_id,
    value.customer?.id,
    value.data?.customer_id,
    value.data?.customer?.customer_id,
    value.data?.customer?.id
  ];
  return Number(candidates.find(candidate => Number(candidate) > 0) || 0);
}

async function ensureMoloniProduct(client, product, config) {
  const settings = config.settings || {};
  if (settings.autoCreateProducts === false || !settings.defaultProductCategoryId || !settings.defaultUnitId) {
    return Number(settings.defaultProductId || 0);
  }
  const reference = moloniProductReference(product);
  const mappingId = crypto.createHash('sha256').update(`${config.companyId}|${reference}`).digest('hex').slice(0, 32);
  const mappingRef = MOLONI_PRODUCTS_COLLECTION.doc(mappingId);
  const mapped = await mappingRef.get();
  if (mapped.exists && Number(mapped.data()?.productId || 0) > 0) return Number(mapped.data().productId);

  const common = { company_id: Number(config.companyId), qty: 50, offset: 0 };
  const existingProducts = await client.call('products/getAll', common).catch(() => []);
  const existing = (Array.isArray(existingProducts) ? existingProducts : []).find(item =>
    String(item.reference || '').toLowerCase() === reference.toLowerCase()
    || String(item.name || '').trim().toLowerCase() === String(product.name || '').trim().toLowerCase()
  );
  if (existing?.product_id) {
    await mappingRef.set({
      companyId: Number(config.companyId),
      reference,
      name: product.name,
      nature: product.nature || 'product',
      productId: Number(existing.product_id),
      source: 'existing',
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return Number(existing.product_id);
  }

  const taxes = product.vatIncluded && Number(settings.standardTaxId)
    ? [{ tax_id: Number(settings.standardTaxId), value: 0, order: 1, cumulative: 0 }]
    : [];
  const payload = {
    company_id: Number(config.companyId),
    category_id: Number(settings.defaultProductCategoryId),
    type: product.nature === 'service' ? 2 : 1,
    name: moloniText(product.name || 'Artigo CRM', 160),
    summary: moloniText(product.summary || '', 250),
    reference,
    ean: '',
    price: moloniMoney(product.price),
    unit_id: Number(settings.defaultUnitId),
    has_stock: 0,
    stock: 0,
    minimum_stock: 0,
    pos_favorite: 0,
    taxes,
    ...(!taxes.length ? { exemption_reason: settings.exemptionReason || 'M99' } : {})
  };
  let created;
  try {
    created = await client.call('products/insert', payload);
  } catch (error) {
    const fallbackProductId = Number(settings.defaultProductId || 0);
    if (fallbackProductId > 0 && /\breference\b/i.test(String(error.message || ''))) {
      console.warn('Falha ao criar artigo Moloni; usando artigo generico configurado.', {
        reference,
        name: product.name,
        error: error.message
      });
      await mappingRef.set({
        companyId: Number(config.companyId),
        reference,
        name: product.name,
        nature: product.nature || 'product',
        productId: fallbackProductId,
        source: 'fallback-default',
        lastError: error.message,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return fallbackProductId;
    }
    throw error;
  }
  if (!created?.product_id) throw new Error(`Nao foi possivel criar o artigo Moloni "${product.name}".`);
  await mappingRef.set({
    companyId: Number(config.companyId),
    reference,
    name: product.name,
    nature: product.nature || 'product',
    productId: Number(created.product_id),
    source: 'created',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, { merge: true });
  return Number(created.product_id);
}

async function attachMoloniProducts(client, preview, config) {
  if (!['invoice', 'invoice_receipt'].includes(preview.type)) return preview;
  preview.products = await Promise.all(preview.products.map(async product => ({
    ...product,
    moloniProductId: await ensureMoloniProduct(client, product, config)
  })));
  return preview;
}

function moloniSalesPayload(preview, config, status) {
  const settings = config.settings || {};
  const documentSetId = preview.type === 'invoice'
    ? settings.invoiceDocumentSetId
    : settings.invoiceReceiptDocumentSetId;
  const products = preview.products.map(product => ({
    product_id: Number(product.moloniProductId || settings.defaultProductId),
    name: product.name,
    summary: product.summary,
    qty: product.qty,
    price: product.price,
    order: product.order,
    taxes: product.vatIncluded && Number(settings.standardTaxId)
      ? [{ tax_id: Number(settings.standardTaxId), order: 1, cumulative: 0 }]
      : [],
    ...(!product.vatIncluded ? { exemption_reason: settings.exemptionReason || 'M99' } : {})
  }));
  const payload = {
    company_id: Number(config.companyId),
    date: preview.issueDate,
    expiration_date: preview.issueDate,
    document_set_id: Number(documentSetId),
    customer_id: Number(preview.moloniCustomerId),
    our_reference: preview.reference,
    your_reference: preview.order.number,
    products,
    notes: `Pedido CRM ${preview.order.number}`,
    status: status === 'closed' ? 1 : 0
  };
  if (preview.type === 'invoice_receipt') {
    payload.payments = preview.payments.map(payment => ({
      payment_method_id: moloniPaymentMethodId(settings, payment.method),
      date: payment.date || preview.issueDate,
      value: payment.value,
      notes: payment.notes || ''
    }));
  }
  return payload;
}

function moloniReceiptPayload(preview, config, invoiceDocumentId, status) {
  const settings = config.settings || {};
  return {
    company_id: Number(config.companyId),
    date: preview.issueDate,
    document_set_id: Number(settings.receiptDocumentSetId),
    customer_id: Number(preview.moloniCustomerId),
    net_value: preview.receiptValue,
    associated_documents: [{ associated_id: Number(invoiceDocumentId), value: preview.receiptValue }],
    payments: [{
      payment_method_id: moloniPaymentMethodId(settings, preview.payment?.method),
      date: preview.payment?.date || preview.issueDate,
      value: preview.receiptValue,
      notes: preview.payment?.notes || ''
    }],
    notes: `Pagamento do pedido CRM ${preview.order.number}`,
    status: status === 'closed' ? 1 : 0
  };
}

async function ensureMoloniCustomer(client, preview, config) {
  const vat = preview.order.vat || '999999990';
  const matches = await client.call('customers/getByVat', {
    company_id: Number(config.companyId),
    vat
  }).catch(() => []);
  const existingCustomers = Array.isArray(matches) ? matches : [matches];
  const existingId = moloniCustomerId(existingCustomers.find(customer => moloniCustomerId(customer)) || {});
  if (existingId) return existingId;

  const created = await client.call('customers/insert', {
    company_id: Number(config.companyId),
    number: `CRM-${vat}`.slice(0, 30),
    name: preview.order.vat ? (preview.order.company || preview.order.customer) : 'Consumidor final',
    vat,
    address: preview.order.address,
    city: '',
    zip_code: '',
    country_id: 1,
    phone: preview.order.phone,
    language_id: 1,
    salesman_id: 0,
    maturity_date_id: 0,
    payment_method_id: Number(config.settings?.defaultPaymentMethodId || 0),
    payment_day: 0,
    discount: 0,
    credit_limit: 0,
    delivery_method_id: 0
  });
  const createdId = moloniCustomerId(created);
  if (!createdId) throw new Error(`Nao foi possivel obter o ID do cliente Moloni para ${preview.order.customer || preview.order.company || vat}.`);
  return createdId;
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
  const salaryOnly = text(body.expenseMode || body.categoria, 80).toUpperCase().replace('SALARIO', 'SALÁRIO') === 'SALÁRIO';
  const today = new Date().toISOString().slice(0, 10);
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
    categoria: salaryOnly ? 'SALÁRIO' : text(body.categoria || 'OUTROS', 80),
    formaPagamento: text(body.formaPagamento || 'outro', 80),
    observacoes: text(body.observacoes, 500),
    salaryOnly
  };
  if (salaryOnly) {
    documento.entryType = 'expense';
    documento.nifEmitente = '';
    documento.nifAdquirente = '';
    documento.nomeEmitente = '';
    documento.tipoDocumento = 'SALÁRIO';
    documento.dataCompra = documento.dataCompra || today;
    documento.numeroFatura = documento.numeroFatura || `SALARIO-${documento.dataCompra}-${hash(documento.rawQr || `${documento.valorTotal}-${Date.now()}`).slice(0, 8)}`;
    documento.valorIVA = 0;
    documento.valorBruto = documento.valorTotal;
  }
  if (!documento.valorBruto && documento.valorTotal) {
    documento.valorBruto = Math.max(0, Math.round((documento.valorTotal - documento.valorIVA) * 100) / 100);
  }
  if (CRM_COMPANY_NIF && !salaryOnly) {
    if (documento.nifEmitente === CRM_COMPANY_NIF) documento.entryType = 'income';
    else if (documento.nifAdquirente === CRM_COMPANY_NIF) documento.entryType = 'expense';
  }
  return documento;
}

function validateMobileDocument(documento) {
  const errors = [];
  if (documento.salaryOnly) {
    if (!(documento.valorTotal > 0)) errors.push('Total da despesa de salario invalido.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(documento.dataCompra)) errors.push('Data da despesa invalida.');
    return errors;
  }
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
  const supplier = item.entryType === 'expense' ? await supplierByNif(item.nifEmitente) : null;
  let payload = item.entryType === 'income'
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
    : item.salaryOnly ? {
        fornecedor: 'Salário',
        nifFornecedor: '',
        numeroFatura: item.numeroFatura,
        tipoDocumento: 'SALÁRIO',
        dataCompra: item.dataCompra,
        dataVencimento: item.dataCompra,
        descricao: item.observacoes || 'Despesa de salário',
        categoria: 'SALÁRIO',
        tipoDespesa: 'salario',
        formaPagamento: item.formaPagamento,
        valorBruto: item.valorTotal,
        valorIVA: 0,
        valorTotal: item.valorTotal,
        comIVA: 'nao',
        ivaDedutivel: false,
        statusPagamento: 'pago',
        origemLancamento: item.source,
        classificationStatus: 'classified',
        classificationSource: 'salary_override',
        salaryOnly: true,
        observacoes: item.observacoes
      } : {
        fornecedor: supplier?.name || item.nomeEmitente || `Fornecedor NIF ${item.nifEmitente}`,
        nifFornecedor: item.nifEmitente,
        nifAdquirente: item.nifAdquirente,
        numeroFatura: item.numeroFatura,
        tipoDocumento: item.tipoDocumento,
        dataCompra: item.dataCompra,
        dataVencimento: item.dataCompra,
        descricao: `${item.tipoDocumento} ${item.numeroFatura}`,
        categoria: supplier?.category || item.categoria || 'A CLASSIFICAR',
        tipoDespesa: supplier?.expenseType || '',
        formaPagamento: item.formaPagamento,
        valorBruto: item.valorBruto,
        valorIVA: item.valorIVA,
        valorTotal: item.valorTotal,
        comIVA: item.valorIVA > 0 ? 'sim' : 'nao',
        ivaDedutivel: supplier ? supplier.ivaDedutivel !== false : true,
        statusPagamento: 'pago',
        origemLancamento: item.source,
        classificationStatus: supplier ? 'classified' : 'pending',
        supplierId: supplier?.id || '',
        observacoes: item.observacoes
      };
  if (item.entryType === 'expense' && supplier) {
    payload = applySupplierToExpensePayload(payload, supplier, now);
  }
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

function productionStepMeta(value) {
  const id = productionStepId(value?.id || value?.label || value);
  const found = PRODUCTION_PROCESS_CATALOG.find(step => productionStepId(step.label) === id);
  if (!found) return null;
  const difficulty = Math.min(4, Math.max(1, Number(found.difficulty) || 4));
  return { id, label: found.label, difficulty, weight: 5 - difficulty };
}

function splitProductionCommission(steps, commission) {
  const totalWeight = steps.reduce((sum, step) => sum + Math.max(1, Number(step.weight) || 1), 0);
  let allocated = 0;
  return steps.map((step, index) => {
    const raw = totalWeight > 0 ? money(commission) * Math.max(1, Number(step.weight) || 1) / totalWeight : 0;
    const value = index === steps.length - 1 ? money(money(commission) - allocated) : money(raw);
    allocated = money(allocated + value);
    return { ...step, commissionValue: value };
  });
}

function normalizeProductionWorkers(value, fallbackWorker = null) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  const ids = source
    .map(item => String(item?.id || item || '').trim())
    .filter(Boolean);
  if (!ids.length && fallbackWorker?.id) ids.push(fallbackWorker.id);
  return Array.from(new Set(ids));
}

function productionAssignmentWorkers(workerIds = [], allWorkers = [], fallback = null) {
  const ids = normalizeProductionWorkers(workerIds, fallback);
  return ids
    .map(id => allWorkers.find(worker => worker.id === id && worker.active !== false))
    .filter(Boolean)
    .map(worker => ({ id: worker.id, name: worker.name, role: worker.role }));
}

function normalizeProductionSteps(selected = [], previous = [], commission = 0) {
  const selectedIds = new Set((Array.isArray(selected) ? selected : []).map(value => productionStepId(value.id || value)));
  const steps = PRODUCTION_PROCESS_CATALOG
    .map(step => productionStepMeta(step))
    .filter(Boolean)
    .filter(step => selectedIds.has(step.id))
    .map(meta => {
      const id = meta.id;
      const old = (Array.isArray(previous) ? previous : []).find(step => step.id === id);
      return old
        ? { ...old, id, label: meta.label, difficulty: meta.difficulty, weight: meta.weight, tempoPrevistoMin: old.tempoPrevistoMin || 30 }
        : { id, label: meta.label, difficulty: meta.difficulty, weight: meta.weight, done: false, completedAt: null, completedByWorkerId: '', completedByWorkerName: '', paymentStatus: 'pending', paidAt: null, paidBy: '', tempoPrevistoMin: 30, actualMinutes: 0 };
    });
  return splitProductionCommission(steps, commission);
}

function productionProductId(value) {
  const normalized = text(value, 40);
  return normalized && /^[A-Za-z0-9_-]+$/.test(normalized) ? normalized : '';
}

function productionAssignmentId(orderId, productId = '') {
  return productId ? `${orderId}__${productId}` : orderId;
}

function normalizeUsername(value) {
  return text(value, 60).toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '');
}

function sellerCommissionBase(payload = {}) {
  const products = Array.isArray(payload.produtos) ? payload.produtos : [];
  const productsSubtotal = products.reduce((sum, product) => sum + money(product.valor) * Math.max(1, money(product.quantidade || 1)), 0);
  const fallbackSubtotal = Math.max(0, money(payload.subtotal) - money(payload.instalacao));
  return Math.round((productsSubtotal || fallbackSubtotal) * 100) / 100;
}

function sellerCommissionRate(value) {
  const parsed = money(value);
  return Math.min(10, Math.max(5, parsed || 5));
}

function quoteSubtotalFromProducts(payload = {}) {
  const products = Array.isArray(payload.produtos) ? payload.produtos : [];
  return products.reduce((sum, product) => sum + money(product.valor) * Math.max(1, money(product.quantidade || 1)), 0);
}

function quoteCostFromProducts(payload = {}) {
  const products = Array.isArray(payload.produtos) ? payload.produtos : [];
  return products.reduce((sum, product) => sum + money(product.custo) * Math.max(1, money(product.quantidade || 1)), 0);
}

function recalculateSellerQuotePayload(payload = {}, sellerExtraMarkup = payload.sellerExtraMarkup) {
  const desconto = money(payload.desconto);
  const ajustePreco = signedMoney(payload.ajustePreco || payload.ajuste);
  const instalacao = money(payload.instalacao);
  const subtotalProdutos = quoteSubtotalFromProducts(payload);
  const baseComissao = Math.max(0, subtotalProdutos - desconto + ajustePreco);
  const extra = money(sellerExtraMarkup);
  const subtotal = Math.max(0, baseComissao + instalacao + extra);
  const iva = payload.comIVA === 'nao' ? 0 : money(subtotal * 0.23);
  const sellerRate = sellerCommissionRate(payload.sellerCommissionRate);
  const sellerCommissionValue = payload.sellerId ? money((baseComissao * sellerRate / 100) + extra) : 0;
  const mountingRate = money(payload.mountingCommissionRate);
  const mountingCommissionValue = money(baseComissao * mountingRate / 100);
  const custoMateriais = quoteCostFromProducts(payload);
  const custoPrevisto = money(custoMateriais + sellerCommissionValue + mountingCommissionValue);
  const lucroPrevisto = money(subtotal - custoPrevisto);
  const margemPrevista = subtotal > 0 ? Math.round((lucroPrevisto / subtotal) * 10000) / 100 : 0;
  return {
    ...payload,
    subtotal,
    iva,
    total: money(subtotal + iva),
    sellerExtraMarkup: extra,
    sellerCommissionRate: sellerRate,
    sellerCommissionValue,
    mountingCommissionValue,
    custoPrevisto,
    lucroPrevisto,
    margemPrevista
  };
}

async function suppliers() {
  const snapshot = await db.collection('suppliers').get();
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(item => item.active !== false)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt'));
}

async function supplierByNif(nif) {
  const clean = digits(nif);
  return (await suppliers()).find(item => item.nif === clean) || null;
}

function expenseSupplierNif(payload = {}) {
  return digits(payload.nifFornecedor || payload.nifEmitente || payload.nif || payload.fornecedorNif);
}

function applySupplierToExpensePayload(payload = {}, supplier = {}, now = new Date().toISOString()) {
  return {
    ...payload,
    fornecedor: supplier.name,
    nifFornecedor: supplier.nif,
    categoria: supplier.category,
    tipoDespesa: supplier.expenseType,
    ivaDedutivel: supplier.ivaDedutivel !== false,
    supplierId: supplier.id,
    classificationStatus: 'classified',
    classificationSource: 'supplier_nif',
    classifiedAt: payload.classifiedAt || now,
    supplierClassificationUpdatedAt: now
  };
}

function expenseHasSupplierClassification(payload = {}, supplier = {}) {
  return payload.classificationStatus === 'classified'
    && payload.classificationSource === 'supplier_nif'
    && payload.supplierId === supplier.id
    && text(payload.fornecedor, 160) === supplier.name
    && expenseSupplierNif(payload) === supplier.nif
    && text(payload.categoria, 80).toUpperCase() === supplier.category
    && text(payload.tipoDespesa, 80) === supplier.expenseType
    && (payload.ivaDedutivel !== false) === (supplier.ivaDedutivel !== false);
}

async function classifyExpensePayloadByKnownSupplier(payload = {}, now = new Date().toISOString()) {
  const supplier = await supplierByNif(expenseSupplierNif(payload));
  if (!supplier) return { payload, supplier: null, classified: false };
  return {
    payload: applySupplierToExpensePayload(payload, supplier, now),
    supplier,
    classified: true
  };
}

async function classifyExistingExpensesForSupplier(supplier = {}, now = new Date().toISOString()) {
  if (!supplier.name || !/^\d{9}$/.test(supplier.nif)) return 0;
  const snapshot = await db.collection('events').get();
  const matchingExpenses = snapshot.docs.filter(doc => {
    const data = doc.data();
    const payload = data.payload || {};
    return !data.deleted
      && data.schema === 'despesa'
      && expenseSupplierNif(payload) === supplier.nif
      && !expenseHasSupplierClassification(payload, supplier);
  });
  await Promise.all(matchingExpenses.map(doc => {
    const data = doc.data();
    return db.collection('events').doc(doc.id).set({
      ...data,
      payload: applySupplierToExpensePayload(data.payload || {}, supplier, now),
      updated_at: now
    }, { merge: true });
  }));
  return matchingExpenses.length;
}

async function classifyExpensesByKnownSuppliers(now = new Date().toISOString()) {
  const supplierMap = new Map((await suppliers()).filter(supplier => /^\d{9}$/.test(supplier.nif)).map(supplier => [supplier.nif, supplier]));
  if (!supplierMap.size) return 0;
  const snapshot = await db.collection('events').get();
  const matches = snapshot.docs
    .map(doc => ({ doc, data: doc.data() }))
    .filter(({ data }) => {
      const payload = data.payload || {};
      const supplier = supplierMap.get(expenseSupplierNif(payload));
      return supplier
        && !data.deleted
        && data.schema === 'despesa'
        && !expenseHasSupplierClassification(payload, supplier);
    });
  await Promise.all(matches.map(({ doc, data }) => {
    const supplier = supplierMap.get(expenseSupplierNif(data.payload || {}));
    return db.collection('events').doc(doc.id).set({
      ...data,
      payload: applySupplierToExpensePayload(data.payload || {}, supplier, now),
      updated_at: now
    }, { merge: true });
  }));
  return matches.length;
}


function normalizeSupplierPayload(body = {}) {
  return {
    name: text(body.name || body.nome || body.fornecedor, 160),
    nif: digits(body.nif || body.nifFornecedor),
    category: text(body.category || body.categoria || 'OUTROS', 80).toUpperCase(),
    expenseType: text(body.expenseType || body.tipoDespesa || 'geral', 80),
    ivaDedutivel: body.ivaDedutivel !== false,
    notes: text(body.notes || body.observacoes, 500),
    active: body.active !== false
  };
}

function productSlug(value) {
  return text(value, 120)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function defaultProductId(name) {
  return `default-${productSlug(name)}`;
}

function normalizeProductPayload(body = {}) {
  const tipoProduto = ['loja', 'fabricacao'].includes(body.tipoProduto || body.type) ? (body.tipoProduto || body.type) : 'fabricacao';
  return {
    nome: text(body.nome || body.name, 160),
    categoria: text(body.categoria || body.category || 'Outros', 80),
    descricao: text(body.descricao || body.description || body.observacoes, 500),
    tipoProduto,
    precoVenda: money(body.precoVenda || body.price || body.valor),
    custoUnitario: money(body.custoUnitario || body.cost || body.custo),
    sku: text(body.sku || body.codigo, 80),
    ativo: body.ativo !== false && body.active !== false
  };
}

async function productCatalog(includeInactive = false) {
  const snapshot = await db.collection('events').get();
  const overrides = new Map();
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.schema !== 'produto_catalogo' || data.deleted) return;
    overrides.set(doc.id, { id: doc.id, ...data.payload, source: String(doc.id).startsWith('default-') ? 'default' : 'custom' });
  });

  const products = DEFAULT_PRODUCTS.map(name => {
    const id = defaultProductId(name);
    const override = overrides.get(id);
    overrides.delete(id);
    return {
      id,
      nome: name,
      categoria: 'Produtos',
      descricao: '',
      tipoProduto: 'fabricacao',
      precoVenda: 0,
      custoUnitario: 0,
      sku: '',
      ativo: true,
      source: 'default',
      ...(override || {})
    };
  });

  overrides.forEach(product => products.push({ ...product, source: product.source || 'custom' }));
  return products
    .filter(product => includeInactive || product.ativo !== false)
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt'));
}

async function sellers(includeInactive = false) {
  const snapshot = await db.collection('sellers').get();
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(item => includeInactive || item.active !== false)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt'));
}

function safeSellerForResponse(seller) {
  const { passwordHash, ...safe } = seller || {};
  return sanitizeForResponse(safe);
}

async function sellerById(id) {
  return (await sellers(true)).find(item => item.id === id) || null;
}

async function getActiveSellerByToken(token) {
  if (!token || token.length < 40 || token.length > 200) return null;
  const sessionDoc = await db.collection('seller_sessions').doc(hash(token)).get();
  if (!sessionDoc.exists) return null;
  const session = sessionDoc.data();
  if (session.revoked || Date.now() > new Date(session.expiresAt || 0).getTime()) return null;
  const seller = await sellerById(session.sellerId);
  return !seller || seller.active === false ? null : seller;
}

async function requireSeller(req, res, next) {
  try {
    const [scheme, bearer] = String(req.headers.authorization || '').split(' ');
    const seller = await getActiveSellerByToken(scheme === 'Bearer' ? bearer : '');
    if (!seller) return res.status(401).json({ success: false, message: 'Sessao invalida ou expirada. Entre novamente.' });
    req.seller = seller;
    next();
  } catch (error) {
    console.error('Erro ao validar vendedor:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel validar o acesso.' });
  }
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

function productionPaymentExpenseId(type, id) {
  return `production-${type}-expense-${hash(id).slice(0, 32)}`;
}

async function ensureProductionPaymentExpense({ id, type, workerId, workerName, amount, description, paidAt, paidBy, assignmentId = '', orderId = '', productId = '' }) {
  const value = money(amount);
  if (!id || !type || !(value > 0) || !paidAt) return null;
  const eventId = productionPaymentExpenseId(type, id);
  const now = new Date().toISOString();
  const cleanWorkerName = text(workerName || 'Colaborador de producao', 160);
  const cleanDescription = text(description || (type === 'extra' ? 'Pagamento extra de producao' : 'Comissao de producao'), 300);
  const payload = {
    fornecedor: cleanWorkerName,
    nifFornecedor: '',
    numeroFatura: `PROD-${type.toUpperCase()}-${String(id).slice(0, 40)}`,
    tipoDocumento: 'RECIBO_INTERNO',
    dataCompra: String(paidAt).slice(0, 10),
    dataVencimento: String(paidAt).slice(0, 10),
    descricao: cleanDescription,
    categoria: 'MAO DE OBRA',
    tipoDespesa: type === 'extra' ? 'pagamento_extra_producao' : 'comissao_producao',
    formaPagamento: text(paidBy || 'CRM', 80),
    valorBruto: value,
    valorIVA: 0,
    valorTotal: value,
    comIVA: 'nao',
    ivaDedutivel: false,
    statusPagamento: 'pago',
    origemLancamento: 'producao',
    classificationStatus: 'classified',
    classificationSource: 'production_payment',
    productionPaymentType: type,
    productionPaymentId: id,
    productionAssignmentId: assignmentId,
    orderId,
    productId,
    workerId: text(workerId, 120),
    workerName: cleanWorkerName
  };
  await db.collection('events').doc(eventId).set({
    schema: 'despesa',
    pageId: 'ordemproducao',
    timestamp: paidAt,
    created_at: paidAt,
    updated_at: now,
    deleted: false,
    payload
  }, { merge: true });
  return eventId;
}

async function ensurePaidProductionPaymentExpenses(assignments = []) {
  const paidAssignments = assignments.filter(item => item?.paymentStatus === 'paid' && money(item.commission) > 0);
  await Promise.all(paidAssignments.map(item => ensureProductionPaymentExpense({
    id: item.id || productionAssignmentId(item.orderId, item.productId),
    type: 'assignment',
    workerId: item.workerId,
    workerName: item.workerName,
    amount: item.commission,
    description: `Comissao de producao${item.productName ? ` - ${item.productName}` : ''}`,
    paidAt: item.paidAt,
    paidBy: item.paidBy,
    assignmentId: item.id || productionAssignmentId(item.orderId, item.productId),
    orderId: item.orderId,
    productId: item.productId || ''
  })));
}

async function productionExtraPayments() {
  const snapshot = await db.collection('production_extra_payments').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function safeExtraPaymentForWorker(payment, worker) {
  const paid = payment.paymentStatus === 'paid';
  return sanitizeForResponse({
    id: payment.id,
    extraPayment: true,
    orderId: '',
    productId: '',
    productName: 'Pagamento extra',
    workerId: worker.id,
    workerName: worker.name,
    workerIds: [worker.id],
    workers: [safeProductionWorker(worker)],
    commission: money(payment.amount),
    description: text(payment.description, 300),
    paymentStatus: paid ? 'paid' : 'pending',
    paidAt: payment.paidAt || null,
    paidBy: payment.paidBy || '',
    paymentNote: payment.paymentNote || '',
    steps: [],
    history: Array.isArray(payment.history) ? payment.history : [],
    active: payment.active !== false,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    order: {
      id: '',
      numero: 'Pagamento extra',
      cliente: text(payment.description || 'Credito adicional', 160),
      empresa: '',
      dataEntrega: payment.createdAt ? String(payment.createdAt).slice(0, 10) : '',
      produtos: [{ nome: 'Pagamento extra', tamanho: '', quantidade: 1, observacoes: text(payment.description, 300) }]
    },
    product: { id: '', nome: 'Pagamento extra', tamanho: '', quantidade: 1, observacoes: text(payment.description, 300) }
  });
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
  const workerIds = normalizeProductionWorkers(assignment.workerIds, assignment.workerId ? { id: assignment.workerId } : null);
  if (!worker || !workerIds.includes(workerId)) return null;
  return { id: assignmentId, ...assignment };
}

async function workerHasOrderAssignment(orderId, workerId) {
  const worker = (await productionWorkers()).find(item => item.id === workerId && item.active !== false);
  if (!worker) return false;
  const snapshot = await db.collection('production_assignments').get();
  return snapshot.docs.some(doc => {
    const assignment = doc.data();
    const workerIds = normalizeProductionWorkers(assignment.workerIds, assignment.workerId ? { id: assignment.workerId } : null);
    return assignment.orderId === orderId
      && assignment.active !== false
      && workerIds.includes(workerId);
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

async function deleteOrderArtifacts(orderId) {
  const assignments = await db.collection('production_assignments').get();
  const messages = await db.collection('production_messages').get();
  const events = await db.collection('events').get();
  const deletes = [];

  assignments.docs.forEach(doc => {
    if (doc.data().orderId === orderId) deletes.push(db.collection('production_assignments').doc(doc.id).delete());
  });
  messages.docs.forEach(doc => {
    if (doc.data().orderId === orderId) deletes.push(db.collection('production_messages').doc(doc.id).delete());
  });
  events.docs.forEach(doc => {
    const data = doc.data();
    if (data.schema === 'estoque_movimento' && data.payload?.orderId === orderId) deletes.push(db.collection('events').doc(doc.id).delete());
  });

  await Promise.all(deletes);
  return deletes.length;
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
app.use('/vendedor', express.static(path.join(__dirname, 'vendedor'), { index: 'index.html', fallthrough: false }));
app.use('/rotulos', express.static(path.join(__dirname, 'rotulos'), { index: 'index.html', fallthrough: false }));

app.get('/api/rotulos/public/session', async (req, res) => {
  try {
    const token = String(req.query.token || '');
    const customer = await labelCustomerByToken(token);
    if (!customer) return res.status(401).json({ success: false, message: 'Link inválido ou desativado.' });
    await ensureLabelPlatformFee(customer);
    const orders = await labelOrdersForCustomer(customer.id);
    res.json({
      success: true,
      customer: labelCustomerPublic(customer),
      templates: ROTULOS.publicTemplates(),
      orders: orders.map(order => labelOrderPublic(order.id, order.payload))
    });
  } catch (error) {
    console.error('Erro ao abrir portal de rótulos:', error);
    res.status(500).json({ success: false, message: 'Não foi possível abrir o portal de rótulos.' });
  }
});

app.post('/api/rotulos/public/orders', requestRateLimit({ windowMs: 15 * 60 * 1000, max: 30 }), async (req, res) => {
  try {
    if (containsUnsafeMarkup(req.body)) {
      return res.status(400).json({ success: false, message: 'O pedido contém conteúdo não permitido.' });
    }
    const token = String(req.body?.token || '');
    const customer = await labelCustomerByToken(token);
    if (!customer) return res.status(401).json({ success: false, message: 'Link inválido ou desativado.' });

    const requestedItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!requestedItems.length || requestedItems.length > 30) {
      return res.status(400).json({ success: false, message: 'Adicione entre 1 e 30 rótulos ao pedido.' });
    }

    const products = requestedItems.map((requestedItem, index) => {
      const template = ROTULOS.templateById(text(requestedItem.templateId, 80));
      const mealName = text(requestedItem.mealName, 60).replace(/\s+/g, ' ');
      const quantity = Number.parseInt(requestedItem.quantity, 10) || 0;
      const taxMode = requestedItem.taxMode === 'isento' ? 'isento' : 'iva';
      const hasNutrition = requestedItem.nutrition?.enabled === true;
      const nutrition = hasNutrition ? Object.fromEntries(ROTULOS.NUTRITION_FIELDS.map(field => [
        field.key,
        ROTULOS.formattedNutritionValue(requestedItem.nutrition, field)
      ])) : null;
      if (nutrition) nutrition.enabled = true;
      if (!template || !mealName) throw new Error(`Preencha corretamente o rótulo ${index + 1}.`);
      if (quantity < 15 || quantity > 99990 || quantity % 15 !== 0) {
        throw new Error(`A quantidade do rótulo ${index + 1} deve ser múltipla de 15, com mínimo de 15 unidades.`);
      }

      if (hasNutrition && !ROTULOS.NUTRITION_FIELDS.every(field => nutrition[field.key])) {
        throw new Error(`Preencha todos os valores nutricionais do rotulo ${index + 1}.`);
      }

      const unitPrice = money(customer.prices?.[template.id]);
      const net = money(unitPrice * quantity);
      const itemVat = taxMode === 'iva' ? money(net * 0.23) : 0;
      return {
        id: `rotulo_${index}_${crypto.randomBytes(4).toString('hex')}`,
        nome: mealName,
        produto: `${template.category} ${template.size}`,
        modeloRotulo: template.id,
        categoriaRotulo: template.category,
        tamanho: template.dimensions,
        hasNutrition,
        nutrition,
        nutritionText: hasNutrition ? ROTULOS.nutritionSummary(nutrition) : '',
        quantidade: quantity,
        valor: unitPrice,
        comIVA: taxMode === 'iva' ? 'sim' : 'nao',
        valorIVA: itemVat,
        subtotal: net,
        total: money(net + itemVat),
        entregue: false
      };
    });

    const subtotal = money(products.reduce((sum, product) => sum + product.subtotal, 0));
    const iva = money(products.reduce((sum, product) => sum + product.valorIVA, 0));
    const total = money(subtotal + iva);
    const now = new Date();
    const number = `ROT-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const payload = {
      numero: number,
      source: 'rotulos',
      labelCustomerId: customer.id,
      cliente: customer.name,
      email: customer.email || '',
      telemovel: customer.phone || '',
      data: now.toISOString().slice(0, 10),
      dataPedido: now.toISOString().slice(0, 10),
      recordType: 'label_order',
      status: 'pendente',
      produtos: products,
      pagamentos: [],
      subtotal,
      iva,
      valorIVA: iva,
      total,
      totalPago: 0,
      saldoPendente: total,
      comIVA: products.some(product => product.comIVA === 'sim') ? 'sim' : 'nao',
      observacoes: text(req.body?.notes, 500),
      createdBy: 'portal-rotulos'
    };
    const event = {
      schema: 'pedido',
      payload,
      pageId: 'portal-rotulos',
      timestamp: now.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      deleted: false
    };
    const ref = await db.collection('events').add(event);
    res.status(201).json({ success: true, order: labelOrderPublic(ref.id, payload) });
  } catch (error) {
    const isInputError = /Preencha corretamente|deve ser múltipla de 15/.test(error.message);
    if (!isInputError) console.error('Erro ao criar pedido de rótulos:', error);
    if (/valores nutricionais/.test(error.message)) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(isInputError ? 400 : 500).json({
      success: false,
      message: isInputError ? error.message : 'Não foi possível enviar o pedido.'
    });
  }
});

app.post('/api/rotulos/public/records/:id/hide', async (req, res) => {
  try {
    const token = String(req.body?.token || '');
    const customer = await labelCustomerByToken(token);
    const id = String(req.params.id || '');
    if (!customer) return res.status(401).json({ success: false, message: 'Link inválido ou desativado.' });
    if (!isSafeIdentifier(id)) return res.status(400).json({ success: false, message: 'Registo inválido.' });

    const ref = db.collection('events').doc(id);
    const snapshot = await ref.get();
    const event = snapshot.exists ? snapshot.data() : null;
    if (!event || event.deleted || event.schema !== 'pedido' || event.payload?.source !== 'rotulos' || event.payload?.labelCustomerId !== customer.id) {
      return res.status(404).json({ success: false, message: 'Registo não encontrado.' });
    }
    const total = money(event.payload.total);
    const totalPaid = labelPaymentTotal(event.payload);
    if (total <= 0 || totalPaid < total - 0.009) {
      return res.status(400).json({ success: false, message: 'Só é possível remover do histórico depois de estar totalmente pago.' });
    }
    await ref.set({
      ...event,
      payload: { ...event.payload, hiddenFromCustomer: true, hiddenFromCustomerAt: new Date().toISOString() },
      updated_at: new Date().toISOString()
    });
    res.json({ success: true, message: 'Registo removido do seu histórico.' });
  } catch (error) {
    console.error('Erro ao ocultar registo no portal de rótulos:', error);
    res.status(500).json({ success: false, message: 'Não foi possível remover o registo do histórico.' });
  }
});

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

app.post('/api/vendedor/login', requestRateLimit({ windowMs: 15 * 60 * 1000, max: 30 }), async (req, res) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || '');
    const seller = (await sellers()).find(item => item.username === username && item.active !== false);
    if (password.length < 8 || password.length > 120 || !seller || !verifyProductionPassword(password, seller)) {
      return res.status(401).json({ success: false, message: 'Usuario ou senha incorretos.' });
    }
    const token = crypto.randomBytes(48).toString('hex');
    const now = Date.now();
    await db.collection('seller_sessions').doc(hash(token)).set({
      sellerId: seller.id,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + PRODUCTION_SESSION_TTL_MS).toISOString(),
      revoked: false
    });
    res.json({ success: true, token });
  } catch (error) {
    console.error('Erro ao entrar no app do vendedor:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel entrar no app.' });
  }
});

async function sellerOrders(sellerId) {
  const snapshot = await db.collection('events').get();
  const rows = snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(event => !event.deleted && event.schema === 'pedido' && event.payload?.sellerId === sellerId)
    .map(event => {
      const payload = event.payload || {};
      const base = sellerCommissionBase(payload);
      const rate = sellerCommissionRate(payload.sellerCommissionRate);
      const commission = money(payload.sellerCommissionValue || (base * rate / 100));
      return sanitizeForResponse({
        id: event.id,
        numero: payload.numero || event.id,
        cliente: payload.cliente || '',
        empresa: payload.empresa || '',
        dataEntrega: payload.dataEntrega || '',
        subtotalServicos: base,
        instalacao: money(payload.instalacao),
        iva: money(payload.iva),
        total: money(payload.total),
        commissionRate: rate,
        commission,
        paymentStatus: payload.sellerCommissionStatus === 'paid' ? 'paid' : 'pending',
        paidAt: payload.sellerCommissionPaidAt || '',
        paidBy: payload.sellerCommissionPaidBy || '',
        observacoes: payload.observacoes || ''
      });
    });
  return rows.sort((a, b) => new Date(b.paidAt || b.dataEntrega || 0) - new Date(a.paidAt || a.dataEntrega || 0));
}

function paidOrderTotal(payload = {}) {
  const payments = Array.isArray(payload.pagamentos) ? payload.pagamentos : [];
  if (payments.length) {
    return money(payments
      .filter(payment => payment.status === 'pago')
      .reduce((sum, payment) => sum + money(payment.valor), 0));
  }
  return money(payload.totalPago);
}

async function sellerDebts(sellerId) {
  const snapshot = await db.collection('events').get();
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(event => !event.deleted && event.schema === 'pedido' && event.payload?.buyerSellerId === sellerId)
    .map(event => {
      const payload = event.payload || {};
      const total = money(payload.total);
      const paid = paidOrderTotal(payload);
      return sanitizeForResponse({
        id: event.id,
        numero: payload.numero || event.id,
        total,
        paid,
        debt: money(Math.max(0, total - paid)),
        status: total - paid <= 0.009 ? 'paid' : paid > 0 ? 'partial' : 'pending',
        dataEntrega: payload.dataEntrega || ''
      });
    })
    .filter(item => item.debt > 0)
    .sort((a, b) => new Date(b.dataEntrega || 0) - new Date(a.dataEntrega || 0));
}

function sellerBalanceSummary(sales = [], debts = []) {
  const commissionsDue = money(sales
    .filter(item => item.paymentStatus !== 'paid')
    .reduce((sum, item) => sum + money(item.commission), 0));
  const debtDue = money(debts.reduce((sum, item) => sum + money(item.debt), 0));
  return { commissionsDue, debtDue, net: Math.round((commissionsDue - debtDue) * 100) / 100 };
}

async function sellerQuotes(sellerId) {
  const snapshot = await db.collection('events').get();
  const rows = snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(event => !event.deleted && event.schema === 'orcamento' && event.payload?.sellerId === sellerId)
    .map(event => {
      const payload = event.payload || {};
      return sanitizeForResponse({
        id: event.id,
        codigo: payload.codigo || event.id,
        cliente: payload.cliente || '',
        empresa: payload.empresa || '',
        telemovel: payload.telemovel || '',
        email: payload.email || '',
        observacoes: payload.observacoes || '',
        subtotal: money(payload.subtotal),
        iva: money(payload.iva),
        total: money(payload.total),
        sellerExtraMarkup: money(payload.sellerExtraMarkup),
        sellerExtraMarkupChangedAt: payload.sellerExtraMarkupChangedAt || '',
        commissionRate: sellerCommissionRate(payload.sellerCommissionRate),
        commission: money(payload.sellerCommissionValue),
        status: payload.sellerQuoteStatus || payload.status || 'sent',
        validade: payload.validade || '',
        produtos: Array.isArray(payload.produtos) ? payload.produtos.map(product => ({
          nome: text(product.nome || 'Produto', 160),
          quantidade: money(product.quantidade || 1),
          valor: money(product.valor),
          observacoes: text(product.observacoes, 400)
        })) : []
      });
    });
  return rows.sort((a, b) => new Date(b.validade || 0) - new Date(a.validade || 0));
}

app.get('/api/vendedor/session', requireSeller, async (req, res) => {
  try {
    const sales = await sellerOrders(req.seller.id);
    const debts = await sellerDebts(req.seller.id);
    res.json({ success: true, seller: safeSellerForResponse(req.seller), sales, debts, balance: sellerBalanceSummary(sales, debts), quotes: await sellerQuotes(req.seller.id) });
  } catch (error) {
    console.error('Erro ao carregar painel do vendedor:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel carregar suas vendas.' });
  }
});

app.post('/api/vendedor/orcamentos/:id/valor', requireSeller, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!isSafeIdentifier(id)) return res.status(400).json({ success: false, message: 'Orcamento invalido.' });
    const ref = db.collection('events').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().schema !== 'orcamento' || doc.data().deleted) return res.status(404).json({ success: false, message: 'Orcamento nao encontrado.' });
    const current = doc.data();
    const payload = current.payload || {};
    if (payload.sellerId !== req.seller.id) return res.status(403).json({ success: false, message: 'Este orcamento nao pertence ao seu acesso.' });
    if (payload.pedidoNumero) return res.status(400).json({ success: false, message: 'Orcamento ja convertido em pedido.' });
    const now = new Date().toISOString();
    const previousExtra = money(payload.sellerExtraMarkup);
    const nextExtra = money(req.body?.sellerExtraMarkup);
    const updatedPayload = recalculateSellerQuotePayload(payload, nextExtra);
    if (nextExtra !== previousExtra) {
      updatedPayload.sellerExtraMarkupPrevious = previousExtra;
      updatedPayload.sellerExtraMarkupChangedAt = now;
      updatedPayload.sellerExtraMarkupChangedBy = req.seller.name;
    }
    await ref.set({ ...current, payload: updatedPayload, updated_at: now }, { merge: true });
    res.json({ success: true, quote: sanitizeForResponse({ id, ...updatedPayload }) });
  } catch (error) {
    console.error('Erro ao atualizar acrescimo do vendedor:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel atualizar o valor.' });
  }
});

app.post('/api/vendedor/orcamentos/:id/aprovar', requireSeller, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!isSafeIdentifier(id)) return res.status(400).json({ success: false, message: 'Orcamento invalido.' });
    const ref = db.collection('events').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().schema !== 'orcamento' || doc.data().deleted) return res.status(404).json({ success: false, message: 'Orcamento nao encontrado.' });
    const current = doc.data();
    const payload = current.payload || {};
    if (payload.sellerId !== req.seller.id) return res.status(403).json({ success: false, message: 'Este orcamento nao pertence ao seu acesso.' });
    if (payload.pedidoNumero) return res.status(400).json({ success: false, message: 'Orcamento ja convertido em pedido.' });
    const now = new Date().toISOString();
    const updatedPayload = {
      ...recalculateSellerQuotePayload(payload),
      sellerQuoteStatus: 'approved',
      status: payload.status === 'convertido' ? payload.status : 'aprovado',
      approvedBySellerAt: now
    };
    await ref.set({ ...current, payload: updatedPayload, updated_at: now }, { merge: true });
    res.json({ success: true, quote: sanitizeForResponse({ id, ...updatedPayload, entrada70: money(updatedPayload.total * 0.70), restante30: money(updatedPayload.total * 0.30) }) });
  } catch (error) {
    console.error('Erro ao aprovar orcamento pelo vendedor:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel aprovar o orcamento.' });
  }
});

app.get('/api/colaborador/session', requireWorker, async (req, res) => {
  try {
    const snapshot = await db.collection('production_assignments').get();
    const extraPayments = (await productionExtraPayments())
      .filter(item => item.active !== false && item.workerId === req.productionWorker.id)
      .map(item => safeExtraPaymentForWorker(item, req.productionWorker));
    const assignments = await Promise.all(snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(item => {
        const workerIds = normalizeProductionWorkers(item.workerIds, item.workerId ? { id: item.workerId } : null);
        return item.active !== false && workerIds.includes(req.productionWorker.id);
      })
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
      assignments: [...assignments.filter(Boolean), ...extraPayments].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
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
    const currentStep = assignment.steps.find(step => step.id === stepId);
    const requestedDone = Boolean(req.body?.done);
    if (requestedDone && currentStep?.done && currentStep.completedByWorkerId && currentStep.completedByWorkerId !== req.productionWorker.id) {
      return res.status(409).json({ success: false, message: 'Esta etapa ja foi concluida por outro colaborador.' });
    }
    if (!requestedDone && currentStep?.done && currentStep.completedByWorkerId && currentStep.completedByWorkerId !== req.productionWorker.id) {
      return res.status(403).json({ success: false, message: 'Somente quem concluiu a etapa pode reabrir.' });
    }
    const steps = assignment.steps.map(step => step.id === stepId
      ? {
        ...step,
        done: requestedDone,
        completedAt: requestedDone ? now : null,
        completedByWorkerId: requestedDone ? req.productionWorker.id : '',
        completedByWorkerName: requestedDone ? req.productionWorker.name : ''
      }
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

    const salaryOnly = text(req.body?.expenseMode, 80).toUpperCase().replace('SALARIO', 'SALÁRIO') === 'SALÁRIO';
    const documento = QR_FISCAL.interpretar(rawQr);
    const erros = QR_FISCAL.validar(documento, salaryOnly ? '' : CRM_COMPANY_NIF);
    if (erros.length) return res.status(400).json({ success: false, message: erros.join(' ') });
    if (salaryOnly) {
      documento.salaryOnly = true;
      documento.categoria = 'SALÁRIO';
      documento.valorBruto = documento.valorTotal;
      documento.valorIVA = 0;
      documento.nifEmitente = '';
      documento.nifAdquirente = '';
      documento.tipoDocumento = 'SALÁRIO';
    }
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

app.get('/api/moloni/oauth/callback', async (req, res) => {
  try {
    const state = verifyMoloniState(req.query.state);
    if (!state || !req.query.code) return res.status(400).send('Autorizacao Moloni invalida ou expirada.');
    if (!MOLONI_CLIENT_ID || !MOLONI_CLIENT_SECRET || !MOLONI_REDIRECT_URI) {
      return res.status(503).send('Credenciais Moloni nao configuradas no servidor.');
    }
    const granted = await exchangeMoloniGrant({
      grant_type: 'authorization_code',
      client_id: MOLONI_CLIENT_ID,
      redirect_uri: MOLONI_REDIRECT_URI,
      client_secret: MOLONI_CLIENT_SECRET,
      code: String(req.query.code)
    });
    const tokens = {
      ...granted,
      expires_at: Date.now() + Number(granted.expires_in || 3600) * 1000
    };
    await saveMoloniConfig({
      tokens: encryptMoloniTokens(tokens),
      connectedAt: new Date().toISOString()
    });
    res.redirect('/pages/faturacao.html?moloni=connected');
  } catch (error) {
    console.error('Erro no callback Moloni:', error);
    res.status(502).send('Nao foi possivel concluir a ligacao ao Moloni.');
  }
});

app.use(requireAuth);

app.get('/api/rotulos/customers', async (req, res) => {
  try {
    const customers = (await allLabelCustomers()).map(customer => {
      let accessToken = '';
      try {
        accessToken = decryptMoloniTokens(customer.encryptedAccessToken)?.token || '';
      } catch {
        accessToken = '';
      }
      return sanitizeForResponse({
        id: customer.id,
        name: customer.name,
        email: customer.email || '',
        phone: customer.phone || '',
        active: customer.active !== false,
        defaultTaxMode: customer.defaultTaxMode === 'isento' ? 'isento' : 'iva',
        prices: customer.prices || {},
        accessToken,
        createdAt: customer.createdAt || ''
      });
    });
    res.json({ success: true, customers, templates: ROTULOS.publicTemplates() });
  } catch (error) {
    console.error('Erro ao listar clientes de rótulos:', error);
    res.status(500).json({ success: false, message: 'Não foi possível carregar os clientes.' });
  }
});

app.post('/api/rotulos/customers', async (req, res) => {
  try {
    if (containsUnsafeMarkup(req.body)) {
      return res.status(400).json({ success: false, message: 'O cadastro contém conteúdo não permitido.' });
    }
    const name = text(req.body?.name, 160);
    if (!name) return res.status(400).json({ success: false, message: 'Indique o nome da cliente.' });
    const token = crypto.randomBytes(36).toString('base64url');
    const prices = {};
    ROTULOS.LABEL_TEMPLATES.forEach(template => {
      prices[template.id] = money(req.body?.prices?.[template.id]);
    });
    const now = new Date().toISOString();
    const customer = {
      name,
      email: text(req.body?.email, 160),
      phone: text(req.body?.phone, 60),
      defaultTaxMode: req.body?.defaultTaxMode === 'isento' ? 'isento' : 'iva',
      prices,
      active: true,
      tokenHash: hashLabelToken(token),
      encryptedAccessToken: encryptMoloniTokens({ token }),
      createdAt: now,
      updatedAt: now
    };
    const ref = await db.collection('label_customers').add(customer);
    res.status(201).json({
      success: true,
      customer: sanitizeForResponse({
        id: ref.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        active: true,
        defaultTaxMode: customer.defaultTaxMode,
        prices,
        accessToken: token
      })
    });
  } catch (error) {
    console.error('Erro ao criar cliente de rótulos:', error);
    res.status(500).json({ success: false, message: 'Não foi possível criar a cliente.' });
  }
});

app.post('/api/rotulos/customers/:id', async (req, res) => {
  try {
    if (containsUnsafeMarkup(req.body)) {
      return res.status(400).json({ success: false, message: 'O cadastro contém conteúdo não permitido.' });
    }
    const id = String(req.params.id || '');
    if (!isSafeIdentifier(id)) return res.status(400).json({ success: false, message: 'Cliente inválida.' });
    const ref = db.collection('label_customers').doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return res.status(404).json({ success: false, message: 'Cliente não encontrada.' });
    const current = snapshot.data();
    const prices = { ...(current.prices || {}) };
    ROTULOS.LABEL_TEMPLATES.forEach(template => {
      if (Object.prototype.hasOwnProperty.call(req.body?.prices || {}, template.id)) {
        prices[template.id] = money(req.body.prices[template.id]);
      }
    });
    const updated = {
      ...current,
      name: text(req.body?.name || current.name, 160),
      email: text(req.body?.email ?? current.email, 160),
      phone: text(req.body?.phone ?? current.phone, 60),
      defaultTaxMode: req.body?.defaultTaxMode === 'isento' ? 'isento' : 'iva',
      active: req.body?.active !== false,
      prices,
      updatedAt: new Date().toISOString()
    };
    await ref.set(updated);
    res.json({ success: true, customer: labelCustomerPublic({ id, ...updated }) });
  } catch (error) {
    console.error('Erro ao atualizar cliente de rótulos:', error);
    res.status(500).json({ success: false, message: 'Não foi possível atualizar a cliente.' });
  }
});

app.post('/api/rotulos/customers/:id/regenerate-link', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!isSafeIdentifier(id)) return res.status(400).json({ success: false, message: 'Cliente inválida.' });
    const ref = db.collection('label_customers').doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return res.status(404).json({ success: false, message: 'Cliente não encontrada.' });
    const token = crypto.randomBytes(36).toString('base64url');
    await ref.set({
      ...snapshot.data(),
      tokenHash: hashLabelToken(token),
      encryptedAccessToken: encryptMoloniTokens({ token }),
      updatedAt: new Date().toISOString()
    });
    res.json({ success: true, accessToken: token });
  } catch (error) {
    console.error('Erro ao gerar novo link de rótulos:', error);
    res.status(500).json({ success: false, message: 'Não foi possível gerar um novo link.' });
  }
});

app.get('/api/rotulos/orders', async (req, res) => {
  try {
    const customers = await allLabelCustomers();
    await ensureAllLabelPlatformFees(customers);
    const customerMap = new Map(customers.map(customer => [customer.id, customer]));
    const snapshot = await db.collection('events').get();
    const orders = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(event => !event.deleted && event.schema === 'pedido' && event.payload?.source === 'rotulos')
      .sort((a, b) => new Date(b.timestamp || b.created_at || 0) - new Date(a.timestamp || a.created_at || 0))
      .map(event => {
        const payload = event.payload || {};
        const totalPago = labelPaymentTotal(payload);
        return sanitizeForResponse({
          id: event.id,
          ...payload,
          recordType: payload.recordType || 'label_order',
          customer: customerMap.get(payload.labelCustomerId)?.name || payload.cliente || '',
          totalPago,
          saldoPendente: money(Math.max(0, money(payload.total) - totalPago))
        });
      });
    res.json({ success: true, orders, templates: ROTULOS.publicTemplates() });
  } catch (error) {
    console.error('Erro ao listar pedidos de rótulos:', error);
    res.status(500).json({ success: false, message: 'Não foi possível carregar os pedidos.' });
  }
});

app.post('/api/rotulos/records/:id/delete', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!isSafeIdentifier(id)) return res.status(400).json({ success: false, message: 'Registo inválido.' });
    const ref = db.collection('events').doc(id);
    const snapshot = await ref.get();
    const event = snapshot.exists ? snapshot.data() : null;
    if (!event || event.schema !== 'pedido' || event.payload?.source !== 'rotulos') {
      return res.status(404).json({ success: false, message: 'Registo não encontrado.' });
    }
    if (event.payload?.recordType === 'platform_fee') {
      await db.collection('label_fee_suppressions').doc(id).set({
        customerId: event.payload.labelCustomerId,
        billingMonth: event.payload.billingMonth,
        deletedAt: new Date().toISOString()
      });
    }
    const artifactsDeleted = await deleteOrderArtifacts(id);
    await ref.delete();
    res.json({ success: true, hardDelete: true, artifactsDeleted });
  } catch (error) {
    console.error('Erro ao excluir registo de rótulos:', error);
    res.status(500).json({ success: false, message: 'Não foi possível excluir definitivamente o registo.' });
  }
});

app.post('/api/rotulos/orders/:id/status', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const allowed = ['pendente', 'processamento', 'concluido', 'entregue', 'cancelado'];
    const status = text(req.body?.status, 40);
    if (!isSafeIdentifier(id) || !allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Pedido ou estado inválido.' });
    }
    const ref = db.collection('events').doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data().payload?.source !== 'rotulos') {
      return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });
    }
    const current = snapshot.data();
    await ref.set({
      ...current,
      payload: { ...current.payload, status },
      timestamp: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    res.json({ success: true, status });
  } catch (error) {
    console.error('Erro ao atualizar pedido de rótulos:', error);
    res.status(500).json({ success: false, message: 'Não foi possível atualizar o pedido.' });
  }
});

app.post('/api/rotulos/orders/:id/payments', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const value = money(req.body?.value);
    if (!isSafeIdentifier(id) || value <= 0) {
      return res.status(400).json({ success: false, message: 'Pedido e valor de pagamento são obrigatórios.' });
    }
    const ref = db.collection('events').doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data().payload?.source !== 'rotulos') {
      return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });
    }
    const current = snapshot.data();
    const payments = Array.isArray(current.payload.pagamentos) ? [...current.payload.pagamentos] : [];
    payments.push({
      id: `payment_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      tipo: 'parcela',
      data: text(req.body?.date, 20) || new Date().toISOString().slice(0, 10),
      valor: value,
      formaPagamento: text(req.body?.method, 60) || 'transferencia',
      status: 'pago',
      observacoes: text(req.body?.notes, 300)
    });
    const totalPago = money(payments.reduce((sum, payment) => sum + (payment.status === 'pago' ? money(payment.valor) : 0), 0));
    const payload = {
      ...current.payload,
      pagamentos: payments,
      totalPago,
      saldoPendente: money(Math.max(0, money(current.payload.total) - totalPago))
    };
    await ref.set({ ...current, payload, timestamp: new Date().toISOString(), updated_at: new Date().toISOString() });
    res.json({ success: true, totalPago, saldoPendente: payload.saldoPendente });
  } catch (error) {
    console.error('Erro ao registar pagamento de rótulos:', error);
    res.status(500).json({ success: false, message: 'Não foi possível registar o pagamento.' });
  }
});

const ZIP_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function zipCrc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = ZIP_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = (year - 1980) << 9 | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function createStoredZip(files) {
  const now = dosDateTime();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach(file => {
    const name = Buffer.from(file.name, 'utf8');
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content || '');
    const crc = zipCrc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(now.time, 10);
    local.writeUInt16LE(now.day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(now.time, 12);
    central.writeUInt16LE(now.day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + content.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function uniqueLabelFilename(item, usedNames) {
  const base = `${item.quantidade}un-${ROTULOS.safeFilename(item.nome)}`;
  let filename = `${base}.eps`;
  let suffix = 2;
  while (usedNames.has(filename.toLowerCase())) {
    filename = `${base}-${suffix}.eps`;
    suffix += 1;
  }
  usedNames.add(filename.toLowerCase());
  return filename;
}

app.get('/api/rotulos/orders/:id/eps', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!isSafeIdentifier(id)) {
      return res.status(400).json({ success: false, message: 'Pedido invÃ¡lido.' });
    }
    const snapshot = await db.collection('events').doc(id).get();
    const payload = snapshot.exists ? snapshot.data().payload : null;
    const items = payload?.source === 'rotulos' && Array.isArray(payload.produtos) ? payload.produtos : [];
    if (!items.length || payload.recordType === 'platform_fee') {
      return res.status(404).json({ success: false, message: 'Pedido de rÃ³tulos nÃ£o encontrado.' });
    }

    const usedNames = new Set();
    const files = items.map(item => ({
      name: uniqueLabelFilename(item, usedNames),
      content: ROTULOS.generateLabelEps(item.modeloRotulo, item.nome, item.nutrition)
    }));
    const zip = createStoredZip(files);
    const filename = `${ROTULOS.safeFilename(payload.numero || 'pedido-rotulos')}-eps.zip`;
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(zip.length),
      'Cache-Control': 'no-store'
    });
    res.send(zip);
  } catch (error) {
    console.error('Erro ao gerar ZIP de EPS:', error);
    res.status(500).json({ success: false, message: 'NÃ£o foi possÃ­vel gerar os EPS.' });
  }
});

app.get('/api/rotulos/orders/:id/items/:itemIndex/eps', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const itemIndex = Number.parseInt(req.params.itemIndex, 10);
    if (!isSafeIdentifier(id) || !Number.isInteger(itemIndex) || itemIndex < 0) {
      return res.status(400).json({ success: false, message: 'Ficheiro inválido.' });
    }
    const snapshot = await db.collection('events').doc(id).get();
    const payload = snapshot.exists ? snapshot.data().payload : null;
    const item = payload?.source === 'rotulos' && Array.isArray(payload.produtos) ? payload.produtos[itemIndex] : null;
    if (!item) return res.status(404).json({ success: false, message: 'Rótulo não encontrado.' });

    const eps = ROTULOS.generateLabelEps(item.modeloRotulo, item.nome, item.nutrition);
    const filename = `${item.quantidade}un-${ROTULOS.safeFilename(item.nome)}.eps`;
    res.set({
      'Content-Type': 'application/postscript',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(eps.length),
      'Cache-Control': 'no-store'
    });
    res.send(eps);
  } catch (error) {
    console.error('Erro ao gerar EPS:', error);
    res.status(500).json({ success: false, message: 'Não foi possível gerar o EPS.' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.get('/api/moloni/status', async (req, res) => {
  try {
    res.json({ success: true, ...moloniPublicStatus(await moloniConfig()) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Nao foi possivel consultar a configuracao Moloni.' });
  }
});

app.get('/api/moloni/oauth/start', async (req, res) => {
  if (!MOLONI_CLIENT_ID || !MOLONI_CLIENT_SECRET || !MOLONI_REDIRECT_URI) {
    return res.status(503).json({
      success: false,
      message: 'Configure MOLONI_CLIENT_ID, MOLONI_CLIENT_SECRET e MOLONI_REDIRECT_URI.'
    });
  }
  const state = signMoloniState({ createdAt: Date.now(), nonce: crypto.randomBytes(12).toString('hex') });
  res.json({
    success: true,
    authorizationUrl: oauthAuthorizationUrl({
      clientId: MOLONI_CLIENT_ID,
      redirectUri: MOLONI_REDIRECT_URI,
      state
    })
  });
});

app.post('/api/moloni/disconnect', async (req, res) => {
  await saveMoloniConfig({ tokens: null, connectedAt: null });
  res.json({ success: true });
});

app.post('/api/moloni/settings', async (req, res) => {
  try {
    const settings = req.body?.settings || {};
    const normalized = {
      invoiceDocumentSetId: Number(settings.invoiceDocumentSetId || 0),
      invoiceReceiptDocumentSetId: Number(settings.invoiceReceiptDocumentSetId || 0),
      receiptDocumentSetId: Number(settings.receiptDocumentSetId || 0),
      defaultProductId: Number(settings.defaultProductId || 0),
      defaultProductCategoryId: Number(settings.defaultProductCategoryId || 0),
      defaultUnitId: Number(settings.defaultUnitId || 0),
      standardTaxId: Number(settings.standardTaxId || 0),
      defaultPaymentMethodId: Number(settings.defaultPaymentMethodId || 0),
      exemptionReason: text(settings.exemptionReason || 'M99', 20),
      autoCreateProducts: settings.autoCreateProducts !== false,
      paymentMethods: Object.fromEntries(
        Object.entries(settings.paymentMethods || {}).map(([key, value]) => [text(key, 80).toLowerCase(), Number(value || 0)])
      )
    };
    const companyId = Number(req.body?.companyId || 0);
    if (MOLONI_MODE === 'live' && !(companyId > 0)) {
      return res.status(400).json({ success: false, message: 'Selecione a empresa Moloni.' });
    }
    if (MOLONI_MODE === 'live') {
      const required = [
        ['invoiceDocumentSetId', 'Selecione a serie de Faturas.'],
        ['invoiceReceiptDocumentSetId', 'Selecione a serie de Faturas-Recibo.'],
        ['receiptDocumentSetId', 'Selecione a serie de Recibos.'],
        ['defaultProductId', 'Selecione o artigo generico.'],
        ['defaultProductCategoryId', 'Selecione a categoria padrao de artigos.'],
        ['defaultUnitId', 'Selecione a unidade padrao de artigos.'],
        ['defaultPaymentMethodId', 'Selecione o metodo de pagamento predefinido.']
      ];
      const missing = required.find(([key]) => !(Number(normalized[key] || 0) > 0));
      if (missing) return res.status(400).json({ success: false, message: missing[1] });
    }
    const config = await saveMoloniConfig({ companyId, settings: normalized });
    res.json({ success: true, ...moloniPublicStatus(config) });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Configuracao Moloni invalida.' });
  }
});

app.get('/api/moloni/options', async (req, res) => {
  try {
    if (MOLONI_MODE !== 'live') {
      return res.json({
        success: true,
        mock: true,
        companies: [{ company_id: 1, name: 'Empresa de teste Moloni' }],
        documentSets: [
          { document_set_id: 101, name: 'FT Teste', document_type: 'invoice' },
          { document_set_id: 102, name: 'FR Teste', document_type: 'invoice_receipt' },
          { document_set_id: 103, name: 'RC Teste', document_type: 'receipt' }
        ],
        taxes: [{ tax_id: 23, name: 'IVA 23%' }],
        paymentMethods: [{ payment_method_id: 1, name: 'Transferencia / teste' }],
        products: [{ product_id: 1, name: 'Servico PrintPixel / teste' }],
        productCategories: [{ category_id: 1, name: 'Servicos PrintPixel / teste' }],
        measurementUnits: [{ unit_id: 1, name: 'Unidade' }]
      });
    }
    const accessToken = await moloniAccessToken();
    const client = new MoloniClient({ accessToken });
    const config = await moloniConfig();
    const companies = await client.call('companies/getAll');
    const requestedCompanyId = Number(req.query.companyId || 0);
    const realCompany = (Array.isArray(companies) ? companies : []).find(company =>
      !/demonstra/i.test(String(company?.name || ''))
    );
    const companyId = Number(requestedCompanyId || config.companyId || realCompany?.company_id || companies?.[0]?.company_id || 0);
    const common = { company_id: companyId, qty: 50, offset: 0 };
    const [documentSets, taxes, paymentMethods, products, productCategories, measurementUnits] = await Promise.all([
      client.call('documentSets/getAll', common),
      client.call('taxes/getAll', common),
      client.call('paymentMethods/getAll', common),
      client.call('products/getAll', common),
      client.call('productCategories/getAll', { ...common, parent_id: 0 }).catch(() => []),
      client.call('measurementUnits/getAll', common).catch(() => [])
    ]);
    const normalizedProductCategories = (Array.isArray(productCategories) ? productCategories : []).map(item => ({
      ...item,
      category_id: item.category_id || item.product_category_id || item.id,
      name: item.name || item.title || item.category || item.category_id || item.product_category_id || item.id
    }));
    const normalizedMeasurementUnits = (Array.isArray(measurementUnits) ? measurementUnits : []).map(item => ({
      ...item,
      unit_id: item.unit_id || item.measurement_unit_id || item.id,
      name: item.name || item.title || item.unit || item.unit_id || item.measurement_unit_id || item.id
    }));
    res.json({
      success: true,
      companyId,
      companies,
      documentSets,
      taxes,
      paymentMethods,
      products,
      productCategories: normalizedProductCategories,
      measurementUnits: normalizedMeasurementUnits
    });
  } catch (error) {
    res.status(502).json({ success: false, message: error.message || 'Falha ao sincronizar opcoes do Moloni.' });
  }
});

app.get('/api/moloni/documents', async (req, res) => {
  try {
    const documents = await moloniDocuments();
    const orderId = text(req.query.orderId, 160);
    res.json({
      success: true,
      documents: (orderId ? documents.filter(document => document.orderId === orderId) : documents).map(sanitizeForResponse)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Nao foi possivel carregar os documentos fiscais.' });
  }
});

app.post('/api/moloni/documents/preview', async (req, res) => {
  try {
    const order = await moloniOrder(req.body?.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Pedido nao encontrado.' });
    const documents = await moloniDocuments();
    const preview = buildDocumentPreview({
      order,
      type: req.body?.type,
      paymentId: req.body?.paymentId,
      amount: req.body?.amount,
      issueDate: req.body?.issueDate
    });
    if (preview.type === 'receipt') {
      const invoice = documents.find(document =>
        document.orderId === order.id && document.type === 'invoice' && document.state !== 'error'
      );
      if (!invoice) preview.errors.push('Emita primeiro a fatura deste pedido.');
      const receipted = documents
        .filter(document => document.orderId === order.id && document.type === 'receipt' && document.state !== 'error')
        .reduce((sum, document) => sum + moloniMoney(document.value), 0);
      if (preview.receiptValue > Math.max(0, preview.totals.total - receipted)) {
        preview.errors.push('O recibo ultrapassa o saldo ainda nao conciliado.');
      }
      preview.valid = preview.errors.length === 0;
      preview.invoiceDocumentId = invoice?.moloniDocumentId || '';
    }
    res.json({
      success: true,
      preview: sanitizeForResponse(preview),
      recommendation: sanitizeForResponse(recommendDocumentAction({
        order,
        documents: documents.filter(document => document.orderId === order.id)
      }))
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Nao foi possivel preparar o documento.' });
  }
});

app.post('/api/moloni/documents', async (req, res) => {
  let documentRef;
  try {
    const order = await moloniOrder(req.body?.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Pedido nao encontrado.' });
    const status = req.body?.status === 'closed' ? 'closed' : 'draft';
    const preview = buildDocumentPreview({
      order,
      type: req.body?.type,
      paymentId: req.body?.paymentId,
      amount: req.body?.amount,
      issueDate: req.body?.issueDate
    });
    const documents = await moloniDocuments();
    let invoice = null;
    if (preview.type === 'receipt') {
      invoice = documents.find(document =>
        document.orderId === order.id && document.type === 'invoice' && document.state !== 'error'
      );
      if (!invoice) preview.errors.push('Emita primeiro a fatura deste pedido.');
      const receipted = documents
        .filter(document => document.orderId === order.id && document.type === 'receipt' && document.state !== 'error')
        .reduce((sum, document) => sum + moloniMoney(document.value), 0);
      if (preview.receiptValue > Math.max(0, preview.totals.total - receipted)) {
        preview.errors.push('O recibo ultrapassa o saldo ainda nao conciliado.');
      }
    } else {
      const existingSale = documents.find(document =>
        document.orderId === order.id
        && ['invoice', 'invoice_receipt'].includes(document.type)
        && document.state !== 'error'
      );
      if (existingSale) preview.errors.push(`O pedido ja possui ${existingSale.label || 'um documento de venda'}.`);
    }
    if (preview.errors.length) {
      return res.status(400).json({ success: false, message: preview.errors.join(' '), errors: preview.errors });
    }

    const id = crypto.createHash('sha256').update(preview.idempotencyKey).digest('hex').slice(0, 32);
    documentRef = db.collection('moloni_documents').doc(id);
    const existing = await documentRef.get();
    if (existing.exists && existing.data()?.state !== 'error') {
      return res.status(409).json({ success: false, message: 'Este documento ja foi criado.', document: existing.data() });
    }

    const pending = {
      orderId: order.id,
      orderNumber: order.numero || '',
      customer: order.cliente || '',
      type: preview.type,
      label: preview.label,
      requestedStatus: status,
      state: 'processing',
      value: preview.type === 'receipt' ? preview.receiptValue : preview.totals.total,
      paymentId: preview.payment?.id || '',
      mode: MOLONI_MODE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await documentRef.set(pending);

    let result;
    if (MOLONI_MODE === 'mock') {
      result = {
        valid: 1,
        document_id: `MOCK-${Date.now()}`,
        document_number: `${preview.label.toUpperCase().replace(/[^A-Z]/g, '')}-TESTE-${String(Date.now()).slice(-6)}`
      };
    } else {
      const config = await moloniConfig();
      moloniAssertReadyForIssue(config);
      const client = new MoloniClient({ accessToken: await moloniAccessToken() });
      preview.moloniCustomerId = await ensureMoloniCustomer(client, preview, config);
      await attachMoloniProducts(client, preview, config);
      const payload = preview.type === 'receipt'
        ? moloniReceiptPayload(preview, config, invoice.moloniDocumentId, status)
        : moloniSalesPayload(preview, config, status);
      result = await client.call(moloniEndpointFor(preview.type), payload);
    }

    const documentResult = moloniDocumentResult(result);
    if (!documentResult.id) {
      console.error('Resposta Moloni sem identificador de documento:', JSON.stringify(result).slice(0, 1000));
      throw new Error(`O Moloni respondeu sem identificador para ${preview.label}. Confirme no Moloni se o rascunho foi criado antes de tentar novamente.`);
    }

    const completed = {
      ...pending,
      state: status,
      moloniDocumentId: documentResult.id,
      number: documentResult.number || '',
      response: result,
      updatedAt: new Date().toISOString()
    };
    await documentRef.set(completed);
    res.status(201).json({ success: true, document: sanitizeForResponse({ id, ...completed }) });
  } catch (error) {
    console.error('Erro ao emitir documento Moloni:', error);
    if (documentRef) {
      await documentRef.set({
        state: 'error',
        error: text(error.message, 500),
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch(() => {});
    }
    res.status(502).json({ success: false, message: error.message || 'Nao foi possivel emitir o documento.' });
  }
});

app.get('/api/moloni/documents/:id/pdf', async (req, res) => {
  try {
    const snapshot = await db.collection('moloni_documents').doc(String(req.params.id || '')).get();
    if (!snapshot.exists) return res.status(404).json({ success: false, message: 'Documento nao encontrado.' });
    const document = snapshot.data();
    if (document.mode === 'mock') {
      return res.status(409).json({ success: false, message: 'Documentos de teste nao possuem PDF fiscal.' });
    }
    const config = await moloniConfig();
    const client = new MoloniClient({ accessToken: await moloniAccessToken() });
    const result = await client.call('documents/getPDFLink', {
      company_id: Number(config.companyId),
      document_id: Number(document.moloniDocumentId),
      signed: 1
    });
    res.json({ success: true, url: result.url || result.link || result });
  } catch (error) {
    res.status(502).json({ success: false, message: error.message || 'Nao foi possivel obter o PDF.' });
  }
});

app.post('/api/moloni/documents/:id/delete', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const ref = db.collection('moloni_documents').doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return res.status(404).json({ success: false, message: 'Documento nao encontrado.' });
    const document = snapshot.data();
    if (!['draft', 'error'].includes(document.state)) {
      return res.status(409).json({
        success: false,
        message: 'Apenas documentos em rascunho ou erro podem ser removidos do CRM. Documentos fechados devem ser tratados no Moloni.'
      });
    }
    await ref.delete();
    res.json({
      success: true,
      message: document.state === 'draft'
        ? 'Documento removido do CRM. Se o rascunho existir no Moloni, apague-o tambem no Moloni.'
        : 'Documento com erro removido do CRM.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Nao foi possivel remover o documento do CRM.' });
  }
});

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
  res.json({ success: true, workers: allWorkers.filter(worker => worker.active !== false), allWorkers, steps: PRODUCTION_STEPS, processCatalog: PRODUCTION_PROCESS_CATALOG, appUrl: collaboratorUrl(req) });
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

app.get('/api/suppliers', async (req, res) => {
  res.json({ success: true, suppliers: (await suppliers()).map(sanitizeForResponse) });
});

app.post('/api/suppliers', async (req, res) => {
  try {
    const supplier = normalizeSupplierPayload(req.body || {});
    if (!supplier.name || containsUnsafeMarkup(supplier)) return res.status(400).json({ success: false, message: 'Fornecedor invalido.' });
    if (!/^\d{9}$/.test(supplier.nif)) return res.status(400).json({ success: false, message: 'NIF do fornecedor invalido.' });
    const existing = await supplierByNif(supplier.nif);
    const id = existing?.id || crypto.randomBytes(12).toString('hex');
    const now = new Date().toISOString();
    const savedSupplier = { ...existing, ...supplier, id, createdAt: existing?.createdAt || now, updatedAt: now };
    await db.collection('suppliers').doc(id).set(savedSupplier);
    const autoClassifiedCount = await classifyExistingExpensesForSupplier(savedSupplier, now);
    res.json({ success: true, supplier: sanitizeForResponse(savedSupplier), autoClassifiedCount });
  } catch (error) {
    console.error('Erro ao salvar fornecedor:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel salvar o fornecedor.' });
  }
});

app.post('/api/suppliers/:id/delete', async (req, res) => {
  try {
    const supplier = (await suppliers()).find(item => item.id === req.params.id);
    if (!supplier) return res.status(404).json({ success: false, message: 'Fornecedor nao encontrado.' });
    await db.collection('suppliers').doc(supplier.id).delete();
    res.json({ success: true, message: 'Fornecedor excluido.' });
  } catch (error) {
    console.error('Erro ao excluir fornecedor:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel excluir o fornecedor.' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    res.json({ success: true, products: (await productCatalog(includeInactive)).map(sanitizeForResponse) });
  } catch (error) {
    console.error('Erro ao listar produtos:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel carregar os produtos.' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const product = normalizeProductPayload(req.body || {});
    if (!product.nome || containsUnsafeMarkup(product)) return res.status(400).json({ success: false, message: 'Produto invalido.' });
    const id = isSafeIdentifier(req.body?.id || '') ? req.body.id : `product-${productSlug(product.nome) || crypto.randomBytes(6).toString('hex')}`;
    const existing = (await productCatalog(true)).find(item => item.id === id);
    const now = new Date().toISOString();
    const savedProduct = {
      ...existing,
      ...product,
      id,
      source: id.startsWith('default-') ? 'default' : 'custom',
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    await db.collection('events').doc(id).set({
      schema: 'produto_catalogo',
      payload: savedProduct,
      pageId: 'produtos',
      timestamp: now,
      created_at: existing?.createdAt || now,
      updated_at: now,
      deleted: false
    }, { merge: true });
    res.json({ success: true, product: sanitizeForResponse(savedProduct) });
  } catch (error) {
    console.error('Erro ao salvar produto:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel salvar o produto.' });
  }
});

app.post('/api/products/:id/delete', async (req, res) => {
  try {
    const product = (await productCatalog(true)).find(item => item.id === req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Produto nao encontrado.' });
    if (String(product.id).startsWith('default-')) {
      const now = new Date().toISOString();
      await db.collection('events').doc(product.id).set({
        schema: 'produto_catalogo',
        payload: { ...product, ativo: false, updatedAt: now },
        pageId: 'produtos',
        timestamp: now,
        updated_at: now,
        deleted: false
      }, { merge: true });
    } else {
      await db.collection('events').doc(product.id).delete();
    }
    res.json({ success: true, message: 'Produto excluido do catalogo.' });
  } catch (error) {
    console.error('Erro ao excluir produto:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel excluir o produto.' });
  }
});

function expenseNeedsClassification(payload = {}) {
  if (payload.salaryOnly || text(payload.categoria, 80).toUpperCase() === 'SALÁRIO') return false;
  const fornecedor = text(payload.fornecedor, 160);
  const categoria = text(payload.categoria, 80).toUpperCase();
  if (payload.supplierId && expenseSupplierNif(payload) && fornecedor && !/^FORNECEDOR NIF/.test(fornecedor.toUpperCase())) {
    return false;
  }
  if (payload.classificationStatus === 'classified'
    && fornecedor
    && !/^FORNECEDOR NIF/.test(fornecedor.toUpperCase())
    && expenseSupplierNif(payload)) {
    return false;
  }
  return payload.classificationStatus !== 'classified'
    || !fornecedor
    || /^FORNECEDOR NIF/.test(fornecedor.toUpperCase())
    || !categoria
    || categoria === 'OUTROS'
    || categoria === 'A CLASSIFICAR';
}

app.get('/api/expenses/unclassified', async (req, res) => {
  try {
    const autoClassifiedCount = await classifyExpensesByKnownSuppliers();
    const snapshot = await db.collection('events').get();
    const expenses = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(event => !event.deleted && event.schema === 'despesa' && expenseNeedsClassification(event.payload || {}))
      .sort((a, b) => new Date(b.timestamp || b.created_at || 0) - new Date(a.timestamp || a.created_at || 0))
      .map(event => sanitizeForResponse({ ...event.payload, id: event.id, timestamp: event.timestamp }));
    res.json({ success: true, expenses, pendingCount: expenses.length, autoClassifiedCount });
  } catch (error) {
    console.error('Erro ao listar despesas sem classificacao:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel carregar as despesas a classificar.' });
  }
});

async function saveSupplierFromClassification(body = {}, fallbackPayload = {}) {
  const supplierPayload = normalizeSupplierPayload({
    name: body.supplierName || body.fornecedor || fallbackPayload.fornecedor,
    nif: body.nif || fallbackPayload.nifFornecedor,
    category: body.category || body.categoria || fallbackPayload.categoria,
    expenseType: body.expenseType || body.tipoDespesa || fallbackPayload.tipoDespesa,
    ivaDedutivel: body.ivaDedutivel,
    notes: body.notes || ''
  });
  if (!supplierPayload.name || !/^\d{9}$/.test(supplierPayload.nif)) {
    const error = new Error('Informe fornecedor e NIF validos.');
    error.status = 400;
    throw error;
  }
  const existingSupplier = await supplierByNif(supplierPayload.nif);
  const supplierId = existingSupplier?.id || crypto.randomBytes(12).toString('hex');
  const now = new Date().toISOString();
  const savedSupplier = existingSupplier
    ? { ...existingSupplier, updatedAt: now }
    : { ...supplierPayload, id: supplierId, createdAt: now, updatedAt: now };
  if (!existingSupplier) await db.collection('suppliers').doc(supplierId).set(savedSupplier);
  return { savedSupplier, now };
}

async function expenseDocumentRefByIdentifier(id) {
  const cleanId = String(id || '');
  const directRef = db.collection('events').doc(cleanId);
  const directDoc = await directRef.get();
  if (directDoc.exists && directDoc.data().schema === 'despesa') return { ref: directRef, doc: directDoc };
  const snapshot = await db.collection('events').get();
  const match = snapshot.docs.find(doc => {
    const data = doc.data();
    return !data.deleted && data.schema === 'despesa' && String(data.payload?.id || '') === cleanId;
  });
  return match ? { ref: db.collection('events').doc(match.id), doc: match } : { ref: directRef, doc: directDoc };
}

async function classifyExpenseById(id, body = {}) {
  const { ref: expenseRef, doc: expenseDoc } = await expenseDocumentRefByIdentifier(id);
  if (!expenseDoc.exists || expenseDoc.data().schema !== 'despesa') {
    const error = new Error('Despesa nao encontrada.');
    error.status = 404;
    throw error;
  }
  const current = expenseDoc.data();
  const { savedSupplier, now } = await saveSupplierFromClassification(body, current.payload || {});
  await expenseRef.set({
    ...current,
    payload: applySupplierToExpensePayload(current.payload || {}, savedSupplier, now),
    updated_at: now
  }, { merge: true });

  let updatedCount = 1;
  if (body.applyToSameNif) {
    updatedCount += await classifyExistingExpensesForSupplier(savedSupplier, now);
  }
  return { savedSupplier, updatedCount };
}

app.post('/api/expenses/classify', async (req, res) => {
  try {
    const { savedSupplier, now } = await saveSupplierFromClassification(req.body || {});
    const updatedCount = await classifyExistingExpensesForSupplier(savedSupplier, now);
    res.json({ success: true, supplier: sanitizeForResponse(savedSupplier), updatedCount });
  } catch (error) {
    console.error('Erro ao classificar despesas por NIF:', error);
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Nao foi possivel classificar as despesas.' });
  }
});

app.post('/api/expenses/:id/classify', async (req, res) => {
  try {
    const { savedSupplier, updatedCount } = await classifyExpenseById(req.params.id, req.body || {});
    res.json({ success: true, supplier: sanitizeForResponse(savedSupplier), updatedCount });
  } catch (error) {
    console.error('Erro ao classificar despesa:', error);
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Nao foi possivel classificar a despesa.' });
  }
});

app.get('/api/sellers', async (req, res) => {
  res.json({ success: true, sellers: (await sellers(true)).map(safeSellerForResponse), appUrl: `${req.protocol}://${req.get('host')}/vendedor/` });
});

app.post('/api/sellers', async (req, res) => {
  try {
    const name = text(req.body?.name, 100);
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || '');
    if (!name || containsUnsafeMarkup(name)) return res.status(400).json({ success: false, message: 'Nome invalido.' });
    if (!/^[a-z0-9._-]{3,60}$/.test(username)) return res.status(400).json({ success: false, message: 'Usuario invalido.' });
    if (password.length < 8 || password.length > 120) return res.status(400).json({ success: false, message: 'Senha deve possuir entre 8 e 120 caracteres.' });
    if ((await sellers(true)).some(seller => seller.username === username && seller.active !== false)) return res.status(409).json({ success: false, message: 'Este vendedor ja esta cadastrado.' });
    const now = new Date().toISOString();
    const id = crypto.randomBytes(12).toString('hex');
    const seller = { id, name, username, active: true, createdAt: now, updatedAt: now, ...productionPasswordFields(password) };
    await db.collection('sellers').doc(id).set(seller);
    res.json({ success: true, seller: safeSellerForResponse(seller), appUrl: `${req.protocol}://${req.get('host')}/vendedor/` });
  } catch (error) {
    console.error('Erro ao cadastrar vendedor:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel cadastrar o vendedor.' });
  }
});

app.post('/api/sellers/:id/delete', async (req, res) => {
  try {
    const seller = await sellerById(req.params.id);
    if (!seller) return res.status(404).json({ success: false, message: 'Vendedor nao encontrado.' });
    await db.collection('sellers').doc(seller.id).delete();
    res.json({ success: true, message: 'Vendedor excluido.' });
  } catch (error) {
    console.error('Erro ao excluir vendedor:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel excluir o vendedor.' });
  }
});

app.get('/api/sales/commissions', async (req, res) => {
  const allSellers = await sellers(true);
  const snapshot = await db.collection('events').get();
  const commissions = snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(event => !event.deleted && event.schema === 'pedido' && event.payload?.sellerId)
    .map(event => {
      const payload = event.payload || {};
      const seller = allSellers.find(item => item.id === payload.sellerId);
      const base = sellerCommissionBase(payload);
      const rate = sellerCommissionRate(payload.sellerCommissionRate);
      const commission = money(payload.sellerCommissionValue || base * rate / 100);
      return sanitizeForResponse({ id: event.id, orderId: event.id, numero: payload.numero, cliente: payload.cliente, sellerId: payload.sellerId, sellerName: seller?.name || payload.sellerName || 'Vendedor', base, rate, commission, status: payload.sellerCommissionStatus === 'paid' ? 'paid' : 'pending', paidAt: payload.sellerCommissionPaidAt || '' });
    });
  const balances = await Promise.all(allSellers.map(async seller => {
    const sales = await sellerOrders(seller.id);
    const debts = await sellerDebts(seller.id);
    return sanitizeForResponse({ sellerId: seller.id, sellerName: seller.name, debts, ...sellerBalanceSummary(sales, debts) });
  }));
  res.json({ success: true, sellers: allSellers.map(safeSellerForResponse), commissions, balances });
});

app.post('/api/sales/commissions/:id/payment', async (req, res) => {
  try {
    const orderRef = db.collection('events').doc(String(req.params.id || ''));
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists || orderDoc.data().schema !== 'pedido') return res.status(404).json({ success: false, message: 'Pedido nao encontrado.' });
    const order = orderDoc.data();
    const payload = order.payload || {};
    if (!payload.sellerId) return res.status(400).json({ success: false, message: 'Pedido sem vendedor associado.' });
    const now = new Date().toISOString();
    const base = sellerCommissionBase(payload);
    const rate = sellerCommissionRate(payload.sellerCommissionRate);
    const updatedPayload = {
      ...payload,
      sellerCommissionValue: money(payload.sellerCommissionValue || base * rate / 100),
      sellerCommissionStatus: 'paid',
      sellerCommissionPaidAt: now,
      sellerCommissionPaidBy: text(req.body?.paidBy || 'CRM', 100)
    };
    await orderRef.set({ ...order, payload: updatedPayload, updated_at: now }, { merge: true });
    res.json({ success: true, commission: sanitizeForResponse({ orderId: req.params.id, ...updatedPayload }) });
  } catch (error) {
    console.error('Erro ao pagar comissao comercial:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel marcar a comissao como paga.' });
  }
});

app.get('/api/production/assignments', async (req, res) => {
  const snapshot = await db.collection('production_assignments').get();
  const assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  await ensurePaidProductionPaymentExpenses(assignments);
  res.json({ success: true, assignments: assignments.map(item => sanitizeForResponse(item)) });
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
    const allWorkers = await productionWorkers();
    const requestedWorkerIds = normalizeProductionWorkers(req.body?.workerIds, workerId ? { id: workerId } : null);
    const assignedWorkers = productionAssignmentWorkers(requestedWorkerIds, allWorkers);
    const primaryWorker = assignedWorkers[0] || null;
    if (!order) return res.status(404).json({ success: false, message: 'Ordem de producao nao encontrada.' });
    const product = productForAssignment(order, productId);
    if (req.body?.productId && !product) return res.status(400).json({ success: false, message: 'Produto da O.S. invalido.' });
    if (!assignedWorkers.length) return res.status(400).json({ success: false, message: 'Selecione ao menos um colaborador ativo.' });
    const assignmentId = productionAssignmentId(orderId, productId);
    const oldDoc = await db.collection('production_assignments').doc(assignmentId).get();
    const old = oldDoc.exists ? oldDoc.data() : {};
    const now = new Date().toISOString();
    const commission = money(req.body?.commission);
    const oldWorkerIds = normalizeProductionWorkers(old.workerIds, old.workerId ? { id: old.workerId } : null);
    const sameWorkers = oldWorkerIds.length === assignedWorkers.length && assignedWorkers.every(worker => oldWorkerIds.includes(worker.id));
    const keepPayment = old.paymentStatus === 'paid' && sameWorkers && money(old.commission) === commission;
    const assignment = {
      orderId,
      productId,
      productName: product?.nome || '',
      workerId: primaryWorker.id,
      workerName: assignedWorkers.map(worker => worker.name).join(', '),
      workerRole: primaryWorker.role,
      workerIds: assignedWorkers.map(worker => worker.id),
      workers: assignedWorkers,
      commission,
      paymentStatus: keepPayment ? 'paid' : 'pending',
      paidAt: keepPayment ? old.paidAt || null : null,
      paidBy: keepPayment ? old.paidBy || '' : '',
      paymentNote: keepPayment ? old.paymentNote || '' : '',
      steps: normalizeProductionSteps(req.body?.steps, old.steps),
      transitions: [
        ...(Array.isArray(old.transitions) ? old.transitions : []),
        ...(old.workerId && !sameWorkers ? [{
          type: 'transfer',
          fromWorkerId: old.workerId,
          fromWorkerName: old.workerName,
          toWorkerId: primaryWorker.id,
          toWorkerName: assignedWorkers.map(worker => worker.name).join(', '),
          createdAt: now
        }] : [])
      ].slice(-50),
      history: [
        ...(Array.isArray(old.history) ? old.history : []),
        assignmentHistoryEntry(old.workerId && !sameWorkers ? 'transferred' : 'assigned', {
          productId,
          productName: product?.nome || '',
          fromWorkerId: old.workerId || '',
          fromWorkerName: old.workerName || '',
          workerId: primaryWorker.id,
          workerName: assignedWorkers.map(worker => worker.name).join(', ')
        })
      ].slice(-100),
      active: true,
      createdAt: old.createdAt || now,
      updatedAt: now
    };
    assignment.steps = normalizeProductionSteps(req.body?.steps, old.steps, commission);
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
    const expenseId = await ensureProductionPaymentExpense({
      id: assignmentId,
      type: 'assignment',
      workerId: assignment.workerId,
      workerName: assignment.workerName,
      amount: assignment.commission,
      description: `Comissao de producao${assignment.productName ? ` - ${assignment.productName}` : ''}`,
      paidAt: now,
      paidBy,
      assignmentId,
      orderId,
      productId
    });
    const stockMovements = await issueStockForAssignment(orderId, productId, updated, now);
    res.json({ success: true, assignment: sanitizeForResponse({ id: assignmentId, ...updated }), stockMovements, expenseId });
  } catch (error) {
    console.error('Erro ao marcar comissao como paga:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel marcar a comissao como paga.' });
  }
});

app.get('/api/production/extra-payments', async (req, res) => {
  try {
    const payments = await productionExtraPayments();
    await Promise.all(payments
      .filter(item => item.paymentStatus === 'paid' && money(item.amount) > 0)
      .map(item => ensureProductionPaymentExpense({
        id: item.id,
        type: 'extra',
        workerId: item.workerId,
        workerName: item.workerName,
        amount: item.amount,
        description: item.description,
        paidAt: item.paidAt,
        paidBy: item.paidBy
      })));
    res.json({ success: true, payments: payments.map(sanitizeForResponse) });
  } catch (error) {
    console.error('Erro ao listar pagamentos extras:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel carregar pagamentos extras.' });
  }
});

app.post('/api/production/extra-payments', async (req, res) => {
  try {
    const workerId = String(req.body?.workerId || '');
    const worker = (await productionWorkers()).find(item => item.id === workerId && item.active !== false);
    const amount = money(req.body?.amount);
    const description = text(req.body?.description, 300);
    if (!worker) return res.status(400).json({ success: false, message: 'Selecione um colaborador ativo.' });
    if (!(amount > 0)) return res.status(400).json({ success: false, message: 'Informe um valor maior que zero.' });
    if (!description) return res.status(400).json({ success: false, message: 'Informe uma descricao para o pagamento extra.' });
    const now = new Date().toISOString();
    const id = `extra-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const payment = {
      workerId: worker.id,
      workerName: worker.name,
      amount,
      description,
      paymentStatus: 'pending',
      paidAt: null,
      paidBy: '',
      paymentNote: '',
      active: true,
      history: [
        assignmentHistoryEntry('extra_created', { workerId: worker.id, workerName: worker.name, amount, description })
      ],
      createdAt: now,
      updatedAt: now
    };
    await db.collection('production_extra_payments').doc(id).set(payment);
    res.json({ success: true, payment: sanitizeForResponse({ id, ...payment }) });
  } catch (error) {
    console.error('Erro ao criar pagamento extra:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel criar o pagamento extra.' });
  }
});

app.post('/api/production/extra-payments/:id/payment', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!isSafeIdentifier(id)) return res.status(400).json({ success: false, message: 'Pagamento extra invalido.' });
    const ref = db.collection('production_extra_payments').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().active === false) return res.status(404).json({ success: false, message: 'Pagamento extra nao encontrado.' });
    const payment = doc.data();
    if (money(payment.amount) <= 0) return res.status(400).json({ success: false, message: 'Este pagamento extra nao possui valor a pagar.' });
    const now = new Date().toISOString();
    const paidBy = text(req.body?.paidBy || 'Equipe interna', 120);
    const paymentNote = text(req.body?.note, 300);
    const updated = {
      ...payment,
      paymentStatus: 'paid',
      paidAt: now,
      paidBy,
      paymentNote,
      history: [
        ...(Array.isArray(payment.history) ? payment.history : []),
        assignmentHistoryEntry('extra_payment_paid', {
          workerId: payment.workerId,
          workerName: payment.workerName,
          paidBy,
          amount: money(payment.amount),
          note: paymentNote
        })
      ].slice(-100),
      updatedAt: now
    };
    await ref.set(updated);
    const expenseId = await ensureProductionPaymentExpense({
      id,
      type: 'extra',
      workerId: payment.workerId,
      workerName: payment.workerName,
      amount: payment.amount,
      description: payment.description,
      paidAt: now,
      paidBy
    });
    res.json({ success: true, payment: sanitizeForResponse({ id, ...updated }), expenseId });
  } catch (error) {
    console.error('Erro ao pagar extra de producao:', error);
    res.status(500).json({ success: false, message: 'Nao foi possivel marcar o pagamento extra como pago.' });
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

    const now = new Date().toISOString();
    const classification = schema === 'despesa'
      ? await classifyExpensePayloadByKnownSupplier(payload, now)
      : { payload };
    const event = {
      schema,
      payload: classification.payload,
      pageId: typeof pageId === 'string' ? pageId.slice(0, 100) : 'unknown',
      timestamp: now,
      deleted: false,
      updated_at: now
    };

    let result;
    if (id) {
      const docRef = db.collection('events').doc(id);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        await docRef.set({ ...docSnap.data(), ...event, updated: true }, { merge: true });
        result = { id, action: 'updated', exists: true };
      } else {
        await docRef.set({ ...event, created_at: now });
        result = { id, action: 'created_new', exists: false };
      }
    } else {
      const docRef = await db.collection('events').add({ ...event, created_at: now });
      result = { id: docRef.id, action: 'created', exists: false };
    }

    res.json({ status: 'success', success: true, message: 'Evento salvo no Firebase', autoClassified: Boolean(classification.classified), ...result, event });
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
    const { id, hardDelete = false } = req.body || {};
    if (!isSafeIdentifier(id)) return res.status(400).json({ error: 'ID inválido.' });
    const docRef = db.collection('events').doc(id);
    if (hardDelete === true) {
      const docSnap = await docRef.get();
      if (!docSnap.exists) return res.status(404).json({ error: 'Registro nao encontrado.' });
      const record = docSnap.data();
      const artifactsDeleted = record.schema === 'pedido' ? await deleteOrderArtifacts(id) : 0;
      await docRef.delete();
      return res.json({ status: 'success', success: true, message: 'Registro excluido definitivamente', id, hardDelete: true, artifactsDeleted });
    }
    await docRef.update({ deleted: true, deleted_at: new Date().toISOString() });
    res.json({ status: 'success', success: true, message: 'Evento marcado como deletado', id, hardDelete: false });
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

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API nao encontrada.' });
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

app.use((error, req, res, next) => {
  if (!req.path.startsWith('/api')) return next(error);
  const status = error instanceof SyntaxError && 'body' in error ? 400 : 500;
  const message = status === 400 ? 'JSON invalido na requisicao.' : 'Erro interno do servidor.';
  res.status(status).json({ success: false, message });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`CRM PRINT PIXEL ONLINE - PORTA ${PORT}`));
}

module.exports = { app, containsUnsafeMarkup, sanitizeForResponse, matchesFilters, normalizeLimit };
