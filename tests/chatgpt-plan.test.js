'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const CHATGPT_PLAN = require('../core/chatgpt-plan.js');

test('cria autorização oficial com PKCE, callback local e escopos do plano', () => {
  const attempt = CHATGPT_PLAN.createAuthorizationAttempt({
    hostId: 'host-printpixel',
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
