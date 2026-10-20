const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');

process.env.CRM_AUTH_DISABLED = 'true';
process.env.CHATGPT_SIGN_IN_ENABLED = 'true';
process.env.CHATGPT_TOKEN_ENCRYPTION_KEY = 'chave-de-teste-chatgpt-com-mais-de-24-caracteres';

const { app } = require('../server.js');

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
  return { response, body: await response.json() };
}

async function post(path, body) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('aplica a política central do Gestor IA sem fallback pago ou troca de modelo', async () => {
  const initial = await request('/api/ai/status');
  assert.equal(initial.response.status, 200);
  assert.equal(initial.body.model, 'gpt-5.6-sol');
  assert.equal(initial.body.reasoningEffort, 'medium');
  assert.equal(initial.body.allowSilentFallback, false);
  assert.equal(initial.body.paidFallbackEnabled, false);

  const saved = await post('/api/ai/settings', { enabled: true, weeklyLimitPercentage: 35 });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.weeklyLimitPercentage, 35);
  assert.equal(saved.body.model, 'gpt-5.6-sol');

  const forbidden = await post('/api/ai/settings', { model: 'gpt-6-luna' });
  assert.equal(forbidden.response.status, 400);
  assert.match(forbidden.body.message, /não pode ser alterado/);

  const paidFallback = await post('/api/ai/settings', { paidFallbackEnabled: true });
  assert.equal(paidFallback.response.status, 400);
  assert.match(paidFallback.body.message, /não pode ser alterado/);
});

test('gera código temporário para transferir a autorização local', async () => {
  const generated = await post('/api/ai/connect-code', {});
  assert.equal(generated.response.status, 200);
  assert.ok(generated.body.importCode.length >= 32);
  assert.match(generated.body.command, /npm run ai:connect/);
  assert.match(generated.body.command, /--import-code/);

  const rejected = await post('/api/ai/import-credentials', { importCode: 'incorreto' });
  assert.equal(rejected.response.status, 401);
  assert.match(rejected.body.message, /inválido ou expirado/);
});
