const assert = require('node:assert/strict');
const test = require('node:test');
const QUEUE = require('../core/integration-queue.js');

test('gera id determinístico e valida campos obrigatórios', () => {
  const a = QUEUE.normalizeJob({ source: 'shopify', operation: 'order.created', idempotencyKey: 'evt-123', payload: { orderId: 9 } }, { now: '2026-10-20T10:00:00.000Z' });
  const b = QUEUE.normalizeJob({ source: 'shopify', operation: 'order.created', idempotencyKey: 'evt-123' }, { now: '2026-10-20T11:00:00.000Z' });
  assert.equal(a.id, b.id);
  assert.deepEqual(QUEUE.validateJob(a), []);
  assert.equal(a.status, 'pending');
});

test('processa com lease e conclui sem perder correlação', () => {
  const pending = QUEUE.normalizeJob({ source: 'moloni', operation: 'invoice.issue', idempotencyKey: 'order-1', correlationId: 'pedido-1' }, { now: '2026-10-20T10:00:00.000Z' });
  const processing = QUEUE.claim(pending, { now: '2026-10-20T10:00:01.000Z', workerId: 'worker-a', leaseSeconds: 60 });
  assert.equal(processing.status, 'processing');
  assert.equal(processing.attempt, 1);
  assert.equal(processing.correlationId, 'pedido-1');
  const done = QUEUE.succeed(processing, { documentId: 55 }, { now: '2026-10-20T10:00:03.000Z' });
  assert.equal(done.status, 'succeeded');
  assert.equal(done.result.documentId, 55);
  assert.ok(done.completedAt);
});

test('aplica repetição exponencial e envia para falha final', () => {
  let job = QUEUE.normalizeJob({ source: 'shopify', operation: 'sync', idempotencyKey: 'sync-1', maxAttempts: 2 }, { now: '2026-10-20T10:00:00.000Z' });
  job = QUEUE.claim(job, { now: '2026-10-20T10:00:00.000Z' });
  job = QUEUE.fail(job, 'indisponível', { now: '2026-10-20T10:00:01.000Z', baseDelaySeconds: 30 });
  assert.equal(job.status, 'retry_wait');
  assert.equal(job.nextAttemptAt, '2026-10-20T10:00:31.000Z');
  job = QUEUE.claim(job, { now: '2026-10-20T10:00:31.000Z' });
  job = QUEUE.fail(job, new Error('falha definitiva'), { now: '2026-10-20T10:00:32.000Z' });
  assert.equal(job.status, 'failed');
  assert.equal(job.attempt, 2);
  assert.equal(job.lastError, 'falha definitiva');
  assert.equal(QUEUE.retry(job, { now: '2026-10-20T10:01:00.000Z' }).status, 'pending');
});
