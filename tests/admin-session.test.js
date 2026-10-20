const assert = require('node:assert/strict');
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

  const integrityPreview = await request('/api/admin/data-integrity', adminLogin.cookie);
  assert.equal(integrityPreview.response.status, 200);
  assert.ok(integrityPreview.body.report.events.changes >= 2);

  const normalizedLinks = await request('/api/admin/data-integrity/normalize', adminLogin.cookie, { method: 'POST', body: '{}' });
  assert.equal(normalizedLinks.response.status, 200);
  assert.equal(normalizedLinks.body.report.brokenLinkCount, 0);

  const linkedQuote = await db.collection('events').doc('quote-legacy-link').get();
  const linkedOrder = await db.collection('events').doc('order-legacy-link').get();
  const linkedProduction = await db.collection('production_assignments').doc('order-legacy-link__item_0').get();
  assert.equal(linkedQuote.data().payload.pedidoId, 'order-legacy-link');
  assert.equal(linkedQuote.data().links.orderUrn, 'crm:pedido:order-legacy-link');
  assert.equal(linkedOrder.data().links.quoteId, 'quote-legacy-link');
  assert.match(linkedOrder.data().payload.pagamentos[0].id, /^pay_/);
  assert.equal(linkedProduction.data().links.orderId, 'order-legacy-link');

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
