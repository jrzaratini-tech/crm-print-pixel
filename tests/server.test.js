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
  assert.equal(moduleResult.response.status, 200);
  assert.equal(presetsResult.response.status, 200);
  assert.equal(financialResult.response.status, 200);
  assert.equal(fiscalQrResult.response.status, 200);
  assert.equal(pageResult.response.status, 200);
  assert.equal(scanPageResult.response.status, 200);
  assert.match(moduleResult.body, /calcularFicha/);
  assert.match(presetsResult.body, /Fonte de alimentação/);
  assert.match(financialResult.body, /faturamentoSemIva/);
  assert.match(fiscalQrResult.body, /interpretar/);
  assert.match(pageResult.body, /Cadastro de Materiais/);
  assert.match(scanPageResult.body, /Ler QR fiscal/);
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
