const assert = require('node:assert/strict');
const test = require('node:test');
const SCHEDULING = require('../core/scheduling.js');

test('agenda capacidade por recurso e salta fins de semana', () => {
  const plan = SCHEDULING.capacityPlan([
    { id: 'a', workerId: 'w1', estimatedMinutes: 300, dueDate: '2026-10-23' },
    { id: 'b', workerId: 'w1', estimatedMinutes: 300, dueDate: '2026-10-23' }
  ], { start: '2026-10-23T09:00:00Z', dailyMinutes: 480 });
  assert.equal(plan.jobs[0].finishDate, '2026-10-23');
  assert.equal(plan.jobs[1].finishDate, '2026-10-26');
  assert.equal(plan.jobs[1].late, true);
});
