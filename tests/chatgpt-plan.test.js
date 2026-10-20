'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const CHATGPT_PLAN = require('../core/chatgpt-plan.js');

test('cria autorização oficial com PKCE, callback local e escopos do plano', () => {
  const attempt = CHATGPT_PLAN.createAuthorizationAttempt({
    hostId: 'urn:uuid:123e4567-e89b-42d3-a456-426614174000',
    redirectUri: 'http://127.0.0.1:1455/auth/callback',
    appName: 'PrintPixel CRM'
  });
  const url = new URL(attempt.url);
  assert.equal(url.origin, 'https://auth.openai.com');
  assert.equal(url.searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:1455/auth/callback');
  assert.match(url.searchParams.get('scope'), /chatgpt\.tokens\.use\.direct/);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(attempt.codeVerifier.length > 50);
});

test('gera e valida identificador oficial do host OAuth', () => {
  const hostId = CHATGPT_PLAN.newHostId();
  assert.equal(CHATGPT_PLAN.validHostId(hostId), true);
  assert.equal(CHATGPT_PLAN.validHostId('host-printpixel'), false);
});

test('cifra credenciais e recusa uma chave diferente', () => {
  const secret = 'uma-chave-de-teste-bastante-longa-123';
  const encrypted = CHATGPT_PLAN.encryptCredentials({ access_token: 'segredo', refresh_token: 'renovar' }, secret);
  assert.equal(CHATGPT_PLAN.decryptCredentials(encrypted, secret).access_token, 'segredo');
  assert.throws(() => CHATGPT_PLAN.decryptCredentials(encrypted, 'outra-chave-de-teste-bastante-longa'), /authenticate|autenticar|Unsupported state/i);
});

test('só conclui uma resposta quando o stream envia response.completed', async () => {
  const events = [
    'data: {"type":"response.output_text.delta","delta":"Ligação "}',
    'data: {"type":"response.output_text.delta","delta":"validada."}',
    'data: {"type":"response.completed"}'
  ].join('\n\n');
  const output = await CHATGPT_PLAN.createResponse({
    accessToken: 'token',
    model: 'gpt-5.6-sol',
    reasoningEffort: 'medium',
    input: 'teste'
  }, async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(body.store, false);
    assert.equal(body.stream, true);
    assert.equal(body.reasoning.effort, 'medium');
    assert.equal(body.instructions, undefined);
    return { ok: true, text: async () => events };
  });
  assert.equal(output, 'Ligação validada.');
});

test('interrompe uma resposta da IA que ultrapassa o tempo limite', async () => {
  await assert.rejects(
    CHATGPT_PLAN.createResponse({
      accessToken: 'token',
      model: 'gpt-5.6-sol',
      reasoningEffort: 'medium',
      input: 'teste',
      timeoutMs: 10
    }, async (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    })),
    error => error.code === 'ai_response_timeout'
  );
});

test('deixa o modelo escolher uma ferramenta e devolve o resultado para a resposta final', async () => {
  let requestCount = 0;
  const executed = [];
  const result = await CHATGPT_PLAN.createToolResponse({
    accessToken: 'token',
    model: 'gpt-5.6-sol',
    reasoningEffort: 'medium',
    input: [{ role: 'user', content: 'Qual é o faturamento?' }],
    tools: [{ type: 'function', name: 'get_dashboard_metrics', parameters: { type: 'object', properties: {} } }],
    executeTool: async (name, args) => {
      executed.push({ name, args });
      return { grossRevenue: 123 };
    }
  }, async (url, options) => {
    requestCount += 1;
    const body = JSON.parse(options.body);
    assert.equal(body.stream, true);
    assert.equal(body.store, false);
    assert.equal(body.tool_choice, 'auto');
    if (requestCount === 1) {
      const completed = { type: 'response.completed', response: { output: [{ type: 'function_call', call_id: 'call_1', name: 'get_dashboard_metrics', arguments: '{"period":"current_month"}' }] } };
      return { ok: true, text: async () => `data: ${JSON.stringify(completed)}\n\n` };
    }
    assert.ok(body.input.some(item => item.type === 'function_call_output' && item.call_id === 'call_1'));
    const events = [
      'data: {"type":"response.output_text.delta","delta":"O faturamento é 123 €."}',
      'data: {"type":"response.completed","response":{"output":[{"type":"message"}]}}'
    ].join('\n\n');
    return { ok: true, text: async () => events };
  });
  assert.equal(result.text, 'O faturamento é 123 €.');
  assert.deepEqual(executed, [{ name: 'get_dashboard_metrics', args: { period: 'current_month' } }]);
  assert.deepEqual(result.usedTools.map(item => item.name), ['get_dashboard_metrics']);
});

test('recupera o texto final quando o plano o envia apenas no evento de conclusão', async () => {
  const completed = {
    type: 'response.completed',
    response: { output: [{ type: 'message', content: [{ type: 'output_text', text: 'Resposta final do CRM.' }] }] }
  };
  const result = await CHATGPT_PLAN.createToolResponse({
    accessToken: 'token', model: 'gpt-5.6-sol', reasoningEffort: 'medium', input: 'teste', tools: [], executeTool: async () => ({})
  }, async () => ({ ok: true, text: async () => `data: ${JSON.stringify(completed)}\n\n` }));
  assert.equal(result.text, 'Resposta final do CRM.');
});
