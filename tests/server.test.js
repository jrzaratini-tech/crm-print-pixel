const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
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

async function request(path, options = {}) {
  const response = await fetch(baseUrl + path, options);
  const contentType = response.headers.get('content-type') || '';
  return {
    response,
    body: contentType.includes('application/json') ? await response.json() : await response.text()
  };
}

async function post(path, body) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function mobilePost(path, body, token) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
}

async function workerRequest(path, token, options = {}) {
  return request(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
}

async function workerPost(path, body, token) {
  return workerRequest(path, token, { method: 'POST', body: JSON.stringify(body) });
}

test('não publica arquivos internos', async () => {
  for (const path of ['/server.js', '/firebase.js', '/package.json', '/DATA/database/core.db', '/core/database.js']) {
    const { response } = await request(path);
    assert.equal(response.status, 404, path);
  }
});

test('publica modulo de custeio e pagina de materiais', async () => {
  const moduleResult = await request('/core/custeio.js');
  const presetsResult = await request('/core/materiais-padrao.js');
  const financialResult = await request('/core/financeiro.js');
  const fiscalQrResult = await request('/core/qr-fiscal.js');
  const pageResult = await request('/pages/materiais.html');
  const scanPageResult = await request('/scan-fatura.html');
  const mobilePageResult = await request('/mobile/');
  const mobileQrLibraryResult = await request('/mobile/vendor/jsQR.js');
  const linksPageResult = await request('/pages/links.html');
  const inboxPageResult = await request('/pages/importacoes-fiscais.html');
  const productionPageResult = await request('/pages/ordemproducao.html');
  const workerAppResult = await request('/colaborador/');
  assert.equal(moduleResult.response.status, 200);
  assert.equal(presetsResult.response.status, 200);
  assert.equal(financialResult.response.status, 200);
  assert.equal(fiscalQrResult.response.status, 200);
  assert.equal(pageResult.response.status, 200);
  assert.equal(scanPageResult.response.status, 200);
  assert.equal(mobilePageResult.response.status, 200);
  assert.equal(mobileQrLibraryResult.response.status, 200);
  assert.equal(linksPageResult.response.status, 200);
  assert.equal(inboxPageResult.response.status, 200);
  assert.equal(productionPageResult.response.status, 200);
  assert.equal(workerAppResult.response.status, 200);
  assert.match(moduleResult.body, /calcularFicha/);
  assert.match(presetsResult.body, /Fonte de alimentação/);
  assert.match(financialResult.body, /faturamentoSemIva/);
  assert.match(fiscalQrResult.body, /interpretar/);
  assert.match(pageResult.body, /Cadastro de Materiais/);
  assert.match(scanPageResult.body, /Ler QR fiscal/);
  assert.match(mobilePageResult.body, /PrintPixel Fiscal/);
  assert.match(mobilePageResult.body, /vendor\/jsQR\.js/);
  assert.match(workerAppResult.body, /PrintPixel Produ/);
  assert.match(workerAppResult.body, /Entrar no app/);
  assert.match(linksPageResult.body, /PrintPixel Fiscal Móvel/);
  assert.match(linksPageResult.body, /App da produção/);
  assert.match(productionPageResult.body, /classificationOverlay/);
  assert.match(productionPageResult.body, /workerFilter/);
});

test('classifica OS para colaborador com login sem expor precos e permite chat privado', async () => {
  const order = await post('/api/database/commit', {
    schema: 'pedido',
    pageId: 'test',
    payload: {
      numero: 'PED-PROD-1',
      cliente: 'Cliente Producao',
      empresa: 'Empresa Teste',
      total: 999,
      subtotal: 800,
      produtos: [{ nome: 'Letreiro', tamanho: '100x50', quantidade: 1, valor: 999 }]
    }
  });
  const created = await post('/api/production/workers', { name: 'Montador Teste', username: 'montador.teste', password: 'senha-segura-123', role: 'montagem' });
  assert.equal(created.response.status, 200);
  assert.equal('passwordHash' in created.body.worker, false);
  assert.match(created.body.appUrl, /\/colaborador\/$/);
  const workers = await request('/api/production/workers');
  assert.equal('passwordHash' in workers.body.workers[0], false);
  const deniedLogin = await post('/api/colaborador/login', { username: 'montador.teste', password: 'senha-incorreta' });
  assert.equal(deniedLogin.response.status, 401);
  const login = await post('/api/colaborador/login', { username: 'montador.teste', password: 'senha-segura-123' });
  assert.equal(login.response.status, 200);
  const token = login.body.token;
  assert.match(token, /^[a-f0-9]{96}$/);

  const classified = await post('/api/production/assignments', {
    orderId: order.body.id,
    workerId: created.body.worker.id,
    commission: 75,
    steps: ['montagem_da_estrutura', 'acabamento']
  });
  assert.equal(classified.response.status, 200);
  assert.equal(classified.body.assignment.commission, 75);

  const session = await workerRequest('/api/colaborador/session', token);
  assert.equal(session.response.status, 200);
  assert.equal(session.body.assignments.length, 1);
  assert.equal(session.body.assignments[0].order.produtos[0].nome, 'Letreiro');
  assert.equal('valor' in session.body.assignments[0].order.produtos[0], false);
  assert.equal('total' in session.body.assignments[0].order, false);

  const step = await workerPost(`/api/colaborador/ordens/${order.body.id}/etapas`, { stepId: 'acabamento', done: true }, token);
  assert.equal(step.response.status, 200);
  assert.equal(step.body.steps.find(item => item.id === 'acabamento').done, true);

  const workerChat = await workerPost(`/api/colaborador/ordens/${order.body.id}/chat`, { message: 'Preciso confirmar a fixacao.' }, token);
  assert.equal(workerChat.response.status, 200);
  const adminChat = await post(`/api/production/assignments/${order.body.id}/chat`, { message: 'Confirmado, use buchas metalicas.' });
  assert.equal(adminChat.response.status, 200);
  assert.equal(adminChat.body.messages.length, 2);

  const rotated = await post(`/api/production/workers/${created.body.worker.id}/credentials`, { password: 'nova-senha-segura-456' });
  assert.equal(rotated.response.status, 200);
  const expired = await workerRequest('/api/colaborador/session', token);
  assert.equal(expired.response.status, 401);
  const relogin = await post('/api/colaborador/login', { username: 'montador.teste', password: 'nova-senha-segura-456' });
  assert.equal(relogin.response.status, 200);
  const rotatedToken = relogin.body.token;
  const rotatedSession = await workerRequest('/api/colaborador/session', rotatedToken);
  assert.equal(rotatedSession.response.status, 200);

  const revoked = await post(`/api/production/workers/${created.body.worker.id}/revoke`, {});
  assert.equal(revoked.response.status, 200);
  const blocked = await workerRequest('/api/colaborador/session', rotatedToken);
  assert.equal(blocked.response.status, 401);
});

test('comercial visualiza todas as OS classificadas e montagem somente as atribuidas', async () => {
  const secondOrder = await post('/api/database/commit', { schema: 'pedido', pageId: 'test', payload: { numero: 'PED-PROD-2', cliente: 'Cliente Dois', produtos: [{ nome: 'Painel' }] } });
  const mounting = await post('/api/production/workers', { name: 'Montagem Dois', username: 'montagem.dois', password: 'senha-segura-789', role: 'montagem' });
  const commercial = await post('/api/production/workers', { name: 'Comercial', username: 'comercial', password: 'senha-segura-abc', role: 'comercial' });
  await post('/api/production/assignments', { orderId: secondOrder.body.id, workerId: mounting.body.worker.id, commission: 50, steps: ['acabamento'] });
  const mountingLogin = await post('/api/colaborador/login', { username: 'montagem.dois', password: 'senha-segura-789' });
  const commercialLogin = await post('/api/colaborador/login', { username: 'comercial', password: 'senha-segura-abc' });
  const mountingSession = await workerRequest('/api/colaborador/session', mountingLogin.body.token);
  const commercialSession = await workerRequest('/api/colaborador/session', commercialLogin.body.token);
  assert.equal(mountingSession.body.assignments.length, 1);
  assert.ok(commercialSession.body.assignments.length >= 1);
  assert.ok(commercialSession.body.assignments.some(item => item.orderId === secondOrder.body.id));
});

test('ativa celular e lanca compra manual automaticamente', async () => {
  const login = await post('/api/mobile/login', { deviceName: 'Celular teste', accessKey: 'dev-mobile-key' });
  assert.equal(login.response.status, 200);
  assert.match(login.body.token, /^[a-f0-9]{96}$/);

  const sent = await mobilePost('/api/mobile/documents', {
    entryType: 'expense',
    nifEmitente: '503456789',
    nifAdquirente: '509876543',
    tipoDocumento: 'FT',
    numeroFatura: 'FT MOBILE/1',
    dataCompra: '2026-06-02',
    valorTotal: 246,
    valorIVA: 46
  }, login.body.token);
  assert.equal(sent.response.status, 200);

  const inbox = await request('/api/mobile/inbox');
  assert.equal(inbox.response.status, 200);
  assert.ok(inbox.body.documents.some(item => item.numeroFatura === 'FT MOBILE/1' && item.status === 'approved'));
  const saved = await post('/api/database/query', { schema: 'despesa', filters: { id: sent.body.eventId } });
  assert.equal(saved.body.events[0].payload.valorBruto, 200);
});

test('lanca QR fiscal automaticamente e bloqueia nova leitura duplicada', async () => {
  const login = await post('/api/mobile/login', { deviceName: 'Celular QR', accessKey: 'dev-mobile-key' });
  const body = { rawQr: 'A:504567890*B:509876543*D:FT*F:20260602*G:FT MOBILE/QR1*O:123.00*N:23.00' };
  const sent = await mobilePost('/api/mobile/documents', body, login.body.token);
  assert.equal(sent.response.status, 200);
  assert.equal(sent.body.message, 'Fatura cadastrada com sucesso.');

  const duplicate = await mobilePost('/api/mobile/documents', body, login.body.token);
  assert.equal(duplicate.response.status, 409);
  assert.match(duplicate.body.message, /ja foi enviada ou cadastrada/);
});

test('migra documento antigo em revisao para lancamento automatico', async () => {
  const fingerprint = 'a'.repeat(64);
  await db.collection('mobile_invoice_inbox').doc(fingerprint).set({
    id: fingerprint,
    fingerprint,
    entryType: 'expense',
    nifEmitente: '505678901',
    nifAdquirente: '509876543',
    tipoDocumento: 'FT',
    numeroFatura: 'FT LEGACY/1',
    dataCompra: '2026-06-02',
    valorTotal: 61.5,
    valorIVA: 11.5,
    valorBruto: 50,
    source: 'mobile_qr',
    status: 'pending_review',
    deviceId: 'legacy-device',
    deviceName: 'Celular antigo',
    createdAt: '2026-06-02T12:00:00.000Z'
  });
  const inbox = await request('/api/mobile/inbox');
  assert.equal(inbox.response.status, 200);
  assert.ok(inbox.body.documents.some(item => item.numeroFatura === 'FT LEGACY/1' && item.status === 'approved'));
  const saved = await post('/api/database/query', { schema: 'despesa', filters: { id: `mobile-${fingerprint.slice(0, 40)}` } });
  assert.equal(saved.body.count, 1);
});

test('rejeita uso do app movel sem dispositivo ativado', async () => {
  const result = await post('/api/mobile/documents', {
    nifEmitente: '503456789',
    numeroFatura: 'FT MOBILE/2',
    dataCompra: '2026-06-02',
    valorTotal: 10
  });
  assert.equal(result.response.status, 401);
});

test('salva, consulta com filtro por id e exclui registro', async () => {
  const saved = await post('/api/database/commit', { schema: 'pedido', payload: { cliente: 'Teste', total: 123 }, pageId: 'test' });
  assert.equal(saved.response.status, 200);
  assert.ok(saved.body.id);

  const filtered = await post('/api/database/query', { schema: 'pedido', filters: { id: saved.body.id } });
  assert.equal(filtered.response.status, 200);
  assert.equal(filtered.body.count, 1);
  assert.equal(filtered.body.events[0].payload.cliente, 'Teste');

  const deleted = await post('/api/database/delete', { id: saved.body.id });
  assert.equal(deleted.response.status, 200);

  const afterDelete = await post('/api/database/query', { schema: 'pedido', filters: { id: saved.body.id } });
  assert.equal(afterDelete.body.count, 0);
});

test('rejeita payload com HTML executável', async () => {
  const result = await post('/api/database/commit', { schema: 'pedido', payload: { cliente: '<img src=x onerror=alert(1)>' } });
  assert.equal(result.response.status, 400);
});

test('rejeita upload inválido ou acima do limite', async () => {
  const invalid = await post('/api/upload/nota-fiscal', {
    sessionId: 'UPL-test',
    despesaId: 'pending-test',
    fileData: { tipo: 'text/html', base64: Buffer.from('<script>alert(1)</script>').toString('base64') }
  });
  assert.equal(invalid.response.status, 400);

  const large = await post('/api/upload/nota-fiscal', {
    sessionId: 'UPL-large',
    despesaId: 'pending-large',
    fileData: { tipo: 'image/jpeg', base64: Buffer.alloc(501 * 1024).toString('base64') }
  });
  assert.equal(large.response.status, 400);
});

test('recebe QR fiscal por sessão temporária para revisão no CRM', async () => {
  const session = await post('/api/importacao-fiscal/session', {});
  assert.equal(session.response.status, 200);
  assert.match(session.body.token, /^[a-f0-9]{64}$/);

  const received = await post('/api/importacao-fiscal/receber', {
    token: session.body.token,
    rawQr: 'A:501234567*B:509876543*D:FT*F:20260602*G:FT 2026/20*O:123.00*N:23.00'
  });
  assert.equal(received.response.status, 200);

  const check = await request(`/api/importacao-fiscal/check?token=${session.body.token}`);
  assert.equal(check.response.status, 200);
  assert.equal(check.body.status, 'uploaded');
  assert.equal(check.body.documento.valorBruto, 100);
  assert.equal(check.body.documento.valorIVA, 23);
});

test('bloqueia importação fiscal duplicada', async () => {
  await post('/api/database/commit', {
    schema: 'despesa',
    pageId: 'test',
    payload: {
      nifFornecedor: '501234567',
      numeroFatura: 'FT 2026/21',
      dataCompra: '2026-06-02',
      valorTotal: 123
    }
  });
  const session = await post('/api/importacao-fiscal/session', {});
  const received = await post('/api/importacao-fiscal/receber', {
    token: session.body.token,
    rawQr: 'A:501234567*B:509876543*D:FT*F:20260602*G:FT 2026/21*O:123.00*N:23.00'
  });
  assert.equal(received.response.status, 409);
});

test('estatísticas respondem sem exigir índice composto do Firestore', async () => {
  const { response, body } = await request('/api/database/stats');
  assert.equal(response.status, 200);
  assert.equal(body.status, 'success');
  assert.equal(typeof body.stats.total, 'number');
});

test('neutraliza HTML perigoso que ja exista no banco', async () => {
  await db.collection('events').doc('legacy-xss').set({
    schema: 'pedido',
    payload: { cliente: '<img src=x onerror=alert(1)>' },
    deleted: false,
    timestamp: new Date().toISOString()
  });

  const result = await post('/api/database/query', { schema: 'pedido', filters: { id: 'legacy-xss' } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.events[0].payload.cliente, '&lt;img src=x onerror=alert(1)&gt;');
});
