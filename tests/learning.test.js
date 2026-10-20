const assert = require('node:assert/strict');
const test = require('node:test');
const LEARNING = require('../core/learning.js');

test('aprendizagem exige amostra mínima e ignora anomalias extremas', () => {
  const records = [60, 66, 72, 60, 72, 600].map((actualMinutes, index) => ({ id: `a${index}`, family: 'Neon LED', estimatedMinutes: 60, actualMinutes }));
  const result = LEARNING.recommendations(records, { minimumSample: 5 })[0];
  assert.equal(result.sampleSize, 5);
  assert.equal(result.eligible, true);
  assert.equal(result.recommendedTimeFactor, 1.1);
  assert.ok(result.sourceIds.length === 5);
});

test('aprovação cria versão explicada e reversível', () => {
  const recommendation = { id: 'learning-neon', family: 'Neon LED', eligible: true, recommendedTimeFactor: 1.15, confidence: 'medium', sampleSize: 12, explanation: 'Mediana.' };
  const approved = LEARNING.approval(recommendation, { action: 'approve', notes: 'Validado' }, { version: 2, approvedBy: 'gestor', now: '2026-10-20T12:00:00.000Z' });
  assert.equal(approved.version, 2);
  assert.equal(approved.factor, 1.15);
  const reverted = LEARNING.approval(recommendation, { action: 'revert' }, { version: 3 });
  assert.equal(reverted.factor, 1);
});
