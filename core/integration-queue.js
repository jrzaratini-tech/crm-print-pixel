const crypto = require('crypto');

const STATUSES = new Set(['pending', 'processing', 'retry_wait', 'succeeded', 'failed', 'cancelled']);

function text(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function iso(value, fallback = new Date().toISOString()) {
  const date = value ? new Date(value) : new Date(fallback);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function safePayload(value, maxBytes = 64 * 1024) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) throw new Error('O conteúdo da tarefa excede o limite permitido.');
  return JSON.parse(serialized);
}

function jobId(input = {}) {
  const identity = [input.source, input.operation, input.idempotencyKey]
    .map(value => text(value, 240).toLowerCase())
    .join('|');
  return `job-${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 32)}`;
}

function normalizeJob(input = {}, options = {}) {
  const now = iso(options.now);
  const source = text(input.source, 80).toLowerCase();
  const operation = text(input.operation, 120).toLowerCase();
  const idempotencyKey = text(input.idempotencyKey, 240);
  const maxAttempts = Math.min(20, Math.max(1, Math.round(number(input.maxAttempts, 5))));
  const status = STATUSES.has(input.status) ? input.status : 'pending';
  return {
    id: text(options.id || input.id || jobId({ source, operation, idempotencyKey }), 160),
    source,
    operation,
    idempotencyKey,
    status,
    priority: Math.min(100, Math.max(-100, Math.round(number(input.priority, 0)))),
    payload: safePayload(input.payload),
    attempt: Math.max(0, Math.round(number(input.attempt, 0))),
    maxAttempts,
    nextAttemptAt: iso(input.nextAttemptAt, now),
    leaseUntil: input.leaseUntil ? iso(input.leaseUntil, now) : '',
    workerId: text(input.workerId, 120),
    lastError: text(input.lastError, 1000),
    result: safePayload(input.result),
    correlationId: text(input.correlationId, 160),
    createdAt: input.createdAt ? iso(input.createdAt, now) : now,
    updatedAt: now,
    completedAt: input.completedAt ? iso(input.completedAt, now) : ''
  };
}

function validateJob(job = {}) {
  const errors = [];
  if (!job.source) errors.push('Informe a origem da tarefa.');
  if (!job.operation) errors.push('Informe a operação da tarefa.');
  if (!job.idempotencyKey) errors.push('Informe a chave de idempotência.');
  return errors;
}

function isRunnable(job = {}, now = new Date().toISOString()) {
  if (!['pending', 'retry_wait'].includes(job.status)) return false;
  return new Date(job.nextAttemptAt || 0).getTime() <= new Date(now).getTime();
}

function claim(job = {}, options = {}) {
  const now = iso(options.now);
  if (!isRunnable(job, now)) return null;
  const leaseSeconds = Math.min(3600, Math.max(30, Math.round(number(options.leaseSeconds, 300))));
  return normalizeJob({
    ...job,
    status: 'processing',
    attempt: Number(job.attempt || 0) + 1,
    workerId: text(options.workerId || 'worker', 120),
    leaseUntil: new Date(new Date(now).getTime() + leaseSeconds * 1000).toISOString(),
    lastError: ''
  }, { id: job.id, now });
}

function succeed(job = {}, result = {}, options = {}) {
  const now = iso(options.now);
  return normalizeJob({
    ...job,
    status: 'succeeded',
    result,
    workerId: '',
    leaseUntil: '',
    lastError: '',
    completedAt: now
  }, { id: job.id, now });
}

function fail(job = {}, error, options = {}) {
  const now = iso(options.now);
  const attempt = Math.max(1, Number(job.attempt || 1));
  const exhausted = attempt >= Number(job.maxAttempts || 5);
  const baseDelaySeconds = Math.min(3600, Math.max(5, Math.round(number(options.baseDelaySeconds, 30))));
  const delaySeconds = Math.min(24 * 3600, baseDelaySeconds * (2 ** Math.max(0, attempt - 1)));
  return normalizeJob({
    ...job,
    status: exhausted ? 'failed' : 'retry_wait',
    nextAttemptAt: exhausted ? job.nextAttemptAt : new Date(new Date(now).getTime() + delaySeconds * 1000).toISOString(),
    workerId: '',
    leaseUntil: '',
    lastError: error instanceof Error ? error.message : error,
    completedAt: exhausted ? now : ''
  }, { id: job.id, now });
}

function retry(job = {}, options = {}) {
  if (!['failed', 'retry_wait', 'cancelled'].includes(job.status)) return null;
  const now = iso(options.now);
  return normalizeJob({
    ...job,
    status: 'pending',
    attempt: options.resetAttempts === false ? job.attempt : 0,
    nextAttemptAt: now,
    workerId: '',
    leaseUntil: '',
    lastError: '',
    completedAt: ''
  }, { id: job.id, now });
}

function cancel(job = {}, options = {}) {
  if (['succeeded', 'cancelled'].includes(job.status)) return null;
  const now = iso(options.now);
  return normalizeJob({ ...job, status: 'cancelled', workerId: '', leaseUntil: '', completedAt: now }, { id: job.id, now });
}

module.exports = { STATUSES, cancel, claim, fail, isRunnable, jobId, normalizeJob, retry, succeed, validateJob };
