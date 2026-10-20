const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  DEFAULT_AI_POLICY,
  normalizeAiPolicy,
  publicAiStatus,
  validateAiPolicyUpdate
} = require('../core/ai-policy.js');

test('define GPT-5.6 Sol com raciocínio médio como política imutável', () => {
  const policy = normalizeAiPolicy({
    model: 'outro-modelo',
    reasoningEffort: 'high',
    allowSilentFallback: true,
    paidFallbackEnabled: true
  });

  assert.equal(policy.provider, 'openai_chatgpt_plan');
  assert.equal(policy.model, 'gpt-5.6-sol');
  assert.equal(policy.reasoningEffort, 'medium');
  assert.equal(policy.allowSilentFallback, false);
  assert.equal(policy.paidFallbackEnabled, false);
});

test('aceita apenas o limite semanal e o estado de ativação', () => {
  assert.deepEqual(validateAiPolicyUpdate({ enabled: false, weeklyLimitPercentage: 40 }), []);
  assert.match(validateAiPolicyUpdate({ weeklyLimitPercentage: 0 })[0], /inteiro entre 1 e 100/);
  assert.match(validateAiPolicyUpdate({ model: 'gpt-6-luna' })[0], /não pode ser alterado/);
  assert.match(validateAiPolicyUpdate({ paidFallbackEnabled: true })[0], /não pode ser alterado/);
});

test('normaliza limites e não expõe uma ligação inexistente', () => {
  const policy = normalizeAiPolicy({ weeklyLimitPercentage: 120 });
  assert.equal(policy.weeklyLimitPercentage, 100);

  const status = publicAiStatus({ policy }, { signInConfigured: false });
  assert.equal(status.connected, false);
  assert.equal(status.stage, 'foundation');
  assert.equal(status.model, DEFAULT_AI_POLICY.model);
  assert.equal(status.paidFallbackEnabled, false);
});

test('considera ligada somente uma autorização não revogada', () => {
  const connected = publicAiStatus({
    connection: { authorizedAt: '2026-10-20T10:00:00.000Z', accountLabel: 'Conta Pro' }
  }, { signInConfigured: true });
  assert.equal(connected.connected, true);
  assert.equal(connected.stage, 'connected');
  assert.equal(connected.accountLabel, 'Conta Pro');

  const revoked = publicAiStatus({
    connection: { authorizedAt: '2026-10-20T10:00:00.000Z', revokedAt: '2026-10-20T11:00:00.000Z' }
  }, { signInConfigured: true });
  assert.equal(revoked.connected, false);
});
