const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { after, before, test } = require('node:test');

process.env.CRM_USERNAME = 'admin-fase1';
process.env.CRM_PASSWORD = 'palavra-passe-principal-fase1';
delete process.env.CRM_AUTH_DISABLED;

const { app } = require('../server.js');
const { db } = require('../firebase.js');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});

async function login(username, password) {
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password, returnTo: '/' })
  });
  return { response, cookie: String(response.headers.get('set-cookie') || '').split(';')[0] };
}

async function request(path, cookie, options = {}) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: { Cookie: cookie, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const contentType = response.headers.get('content-type') || '';
  return { response, body: contentType.includes('application/json') ? await response.json() : await response.text() };
}

test('cria identidade individual, aplica perfil e regista auditoria', async () => {
  const adminLogin = await login('admin-fase1', 'palavra-passe-principal-fase1');
  assert.equal(adminLogin.response.status, 303);

  await db.collection('events').doc('quote-legacy-link').set({
    schema: 'orcamento',
    payload: { codigo: 'ORC-LEGACY', cliente: 'Cliente Ligação', pedidoNumero: 'PED-LINK-1' },
    deleted: false
  });
  await db.collection('events').doc('order-legacy-link').set({
    schema: 'pedido',
    payload: { numero: 'PED-LINK-1', cliente: 'Cliente Ligação', orcamentoId: 'quote-legacy-link', pagamentos: [{ valor: 25, data: '2026-10-20' }] },
    deleted: false
  });
  await db.collection('production_assignments').doc('order-legacy-link__item_0').set({ orderId: 'order-legacy-link', productId: 'item_0' });
  await db.collection('stripe_payment_links').doc('stripe-legacy-link').set({ orderId: 'payment-legacy-wrong', orderNumber: 'PED-LINK-1' });

  const integrityPreview = await request('/api/admin/data-integrity', adminLogin.cookie);
  assert.equal(integrityPreview.response.status, 200);
  assert.ok(integrityPreview.body.report.events.changes >= 2);

  const normalizedLinks = await request('/api/admin/data-integrity/normalize', adminLogin.cookie, { method: 'POST', body: '{}' });
  assert.equal(normalizedLinks.response.status, 200);
  assert.equal(normalizedLinks.body.report.brokenLinkCount, 0);

  const linkedQuote = await db.collection('events').doc('quote-legacy-link').get();
  const linkedOrder = await db.collection('events').doc('order-legacy-link').get();
  const linkedProduction = await db.collection('production_assignments').doc('order-legacy-link__item_0').get();
  const linkedStripe = await db.collection('stripe_payment_links').doc('stripe-legacy-link').get();
  assert.equal(linkedQuote.data().payload.pedidoId, 'order-legacy-link');
  assert.equal(linkedQuote.data().links.orderUrn, 'crm:pedido:order-legacy-link');
  assert.equal(linkedOrder.data().links.quoteId, 'quote-legacy-link');
  assert.match(linkedOrder.data().payload.pagamentos[0].id, /^pay_/);
  assert.equal(linkedProduction.data().links.orderId, 'order-legacy-link');
  assert.equal(linkedStripe.data().orderId, 'order-legacy-link');
  assert.equal(linkedStripe.data().links.orderId, 'order-legacy-link');

  const integrityAfter = await request('/api/admin/data-integrity', adminLogin.cookie);
  const pendingExternal = Object.values(integrityAfter.body.report.external).reduce((sum, item) => sum + item.changes, 0);
  assert.equal(integrityAfter.body.report.events.changes, 0);
  assert.equal(pendingExternal, 0);

  const created = await request('/api/admin/users', adminLogin.cookie, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Comercial Teste',
      username: 'comercial.fase1',
      password: 'palavra-passe-comercial-123',
      role: 'comercial'
    })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.user.role, 'comercial');
  assert.equal('passwordHash' in created.body.user, false);

  const commercialLogin = await login('comercial.fase1', 'palavra-passe-comercial-123');
  assert.equal(commercialLogin.response.status, 303);

  const session = await request('/api/admin/session', commercialLogin.cookie);
  assert.equal(session.response.status, 200);
  assert.equal(session.body.user.username, 'comercial.fase1');
  assert.equal(session.body.user.permissions.includes('quotes.write'), true);

  const allowedPage = await request('/pages/orcamentos.html', commercialLogin.cookie);
  assert.equal(allowedPage.response.status, 200);
  const blockedPage = await request('/pages/faturacao.html', commercialLogin.cookie);
  assert.equal(blockedPage.response.status, 403);
  const blockedUsers = await request('/api/admin/users', commercialLogin.cookie);
  assert.equal(blockedUsers.response.status, 403);

  const credentials = await request(`/api/admin/users/${created.body.user.id}/credentials`, adminLogin.cookie, {
    method: 'POST',
    body: JSON.stringify({ password: 'nova-palavra-passe-comercial-456' })
  });
  assert.equal(credentials.response.status, 200);

  const revokedSession = await request('/api/admin/session', commercialLogin.cookie);
  assert.equal(revokedSession.response.status, 401);

  const oldPasswordLogin = await login('comercial.fase1', 'palavra-passe-comercial-123');
  assert.equal(oldPasswordLogin.response.status, 401);
  const newPasswordLogin = await login('comercial.fase1', 'nova-palavra-passe-comercial-456');
  assert.equal(newPasswordLogin.response.status, 303);

  const audit = await request('/api/admin/audit?limit=50', adminLogin.cookie);
  assert.equal(audit.response.status, 200);
  assert.equal(audit.body.events.some(event => event.action === 'admin.user.create'), true);
  assert.equal(audit.body.events.some(event => event.action === 'admin.user.password.reset'), true);
  assert.equal(audit.body.events.some(event => event.action === 'auth.login' && event.actor.username === 'comercial.fase1'), true);
});

test('confirma uma ação IA uma única vez e cria o pedido auditável', async () => {
  const adminLogin = await login('admin-fase1', 'palavra-passe-principal-fase1');
  assert.equal(adminLogin.response.status, 303);
  const permissions = ['orders.read', 'orders.write', 'quotes.read', 'finance.read', 'fiscal.read', 'fiscal.write', 'catalog.read', 'production.read', 'management.read', 'integrations.manage'];
  const permissionFingerprint = crypto.createHash('sha256').update(permissions.join('|')).digest('hex').slice(0, 24);
  const actionId = 'aia_test_confirm_order';
  await db.collection('ai_pending_actions').doc(actionId).set({
    ownerId: 'environment-admin',
    permissionFingerprint,
    type: 'create_order',
    status: 'pending',
    payload: {
      cliente: 'Cliente IA Teste', empresa: 'Cliente IA Teste, Lda.', nif: '501964843', vatNumber: '501964843',
      customerType: 'business', billingCountry: 'PT', deliveryMode: 'pickup', deliveryCountry: 'PT',
      viesStatus: 'not_applicable', transportEvidence: false, taxTreatment: 'auto', taxOverrideReason: '',
      morada: 'Rua de Teste 1', billingPostalCode: '1000-001', billingCity: 'Lisboa', telemovel: '910000000',
      dataEntrega: '2026-11-20', instalacao: 0, atendente: 'Gestor IA', categoriaVenda: 'Venda direta',
      status: 'pendente', observacoes: 'Criado por confirmação de teste.', comIVA: 'sim',
      produtos: [{ id: 'ai_item_1', nome: 'Impressão teste', tamanho: 'A4', quantidade: 1, valor: 10, comIVA: 'sim', observacoes: '', entregue: false }],
      pagamentos: [{ id: 'ai_payment_1', tipo: 'entrada', data: '2026-10-24', valor: 0, formaPagamento: 'outro', status: 'pendente', observacoes: '' }],
      subtotal: 10, iva: 2.3, total: 12.3, totalPago: 0, saldoPendente: 12.3, statusPagamento: 'pendente', aiCreated: true
    },
    summary: { title: 'Criar pedido para Cliente IA Teste', lines: ['Total: 12.30 EUR'] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });

  const confirmed = await request(`/api/ai/actions/${actionId}/confirm`, adminLogin.cookie, { method: 'POST', body: '{}' });
  assert.equal(confirmed.response.status, 201);
  assert.match(confirmed.body.message, /Pedido \d{4}\/\d{4} criado com sucesso/);
  assert.match(confirmed.body.redirectUrl, /^\/pages\/novopedido\.html\?id=/);
  const created = await db.collection('events').doc(confirmed.body.result.id).get();
  assert.equal(created.exists, true);
  assert.equal(created.data().schema, 'pedido');
  assert.equal(created.data().payload.aiCreated, true);
  assert.equal(created.data().payload.aiCreatedBy, 'environment-admin');

  const repeated = await request(`/api/ai/actions/${actionId}/confirm`, adminLogin.cookie, { method: 'POST', body: '{}' });
  assert.equal(repeated.response.status, 409);
});
