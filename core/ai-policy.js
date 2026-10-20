'use strict';

const DEFAULT_AI_POLICY = Object.freeze({
  provider: 'openai_chatgpt_plan',
  model: 'gpt-5.6-sol',
  reasoningEffort: 'medium',
  enabled: true,
  weeklyLimitPercentage: 25,
  allowSilentFallback: false,
  paidFallbackEnabled: false
});

function integerInRange(value, minimum, maximum, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function normalizeAiPolicy(value = {}) {
  return {
    ...DEFAULT_AI_POLICY,
    enabled: value.enabled !== false,
    weeklyLimitPercentage: integerInRange(
      value.weeklyLimitPercentage,
      1,
      100,
      DEFAULT_AI_POLICY.weeklyLimitPercentage
    )
  };
}

function validateAiPolicyUpdate(value = {}) {
  const errors = [];
  const lockedFields = {
    provider: DEFAULT_AI_POLICY.provider,
    model: DEFAULT_AI_POLICY.model,
    reasoningEffort: DEFAULT_AI_POLICY.reasoningEffort,
    allowSilentFallback: false,
    paidFallbackEnabled: false
  };

  Object.entries(lockedFields).forEach(([field, expected]) => {
    if (Object.prototype.hasOwnProperty.call(value, field) && value[field] !== expected) {
      errors.push(`${field} não pode ser alterado nesta fase.`);
    }
  });

  if (Object.prototype.hasOwnProperty.call(value, 'weeklyLimitPercentage')) {
    const limit = Number(value.weeklyLimitPercentage);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      errors.push('weeklyLimitPercentage deve ser um inteiro entre 1 e 100.');
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, 'enabled') && typeof value.enabled !== 'boolean') {
    errors.push('enabled deve ser verdadeiro ou falso.');
  }

  return errors;
}

function publicAiStatus(config = {}, options = {}) {
  const policy = normalizeAiPolicy(config.policy || config);
  const connection = config.connection || {};
  const connected = Boolean(connection.authorizedAt && !connection.revokedAt);
  const signInConfigured = Boolean(options.signInConfigured);

  return {
    provider: policy.provider,
    model: policy.model,
    reasoningEffort: policy.reasoningEffort,
    enabled: policy.enabled,
    weeklyLimitPercentage: policy.weeklyLimitPercentage,
    allowSilentFallback: false,
    paidFallbackEnabled: false,
    connected,
    signInConfigured,
    stage: connected ? 'connected' : (signInConfigured ? 'ready_to_connect' : 'foundation'),
    authorizedAt: connected ? String(connection.authorizedAt || '') : '',
    accountLabel: connected ? String(connection.accountLabel || '') : '',
    nextAction: connected
      ? 'A ligação está pronta para validar os modelos disponíveis na conta.'
      : (signInConfigured
        ? 'Conecte a conta ChatGPT Pro para validar o GPT-5.6 Sol.'
        : 'Configure o cliente oficial Sign in with ChatGPT para ativar a ligação.')
  };
}

module.exports = {
  DEFAULT_AI_POLICY,
  normalizeAiPolicy,
  publicAiStatus,
  validateAiPolicyUpdate
};
