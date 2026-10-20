const assert = require('node:assert/strict');
const test = require('node:test');
const MANAGER = require('../core/ai-manager.js');

test('gera resumo rastreável com atrasos, stock e falhas', () => {
  const briefing = MANAGER.buildBriefing({
    events: [{ id: 'p1', schema: 'pedido', payload: { numero: 'P1', status: 'processamento', dataEntrega: '2026-10-10', total: 123 } }],
    materials: [{ id: 'm1', nome: 'LED', estoqueAtual: 1, estoqueMinimo: 2 }],
    jobs: [{ id: 'j1', source: 'shopify', operation: 'orders/paid', status: 'failed', attempt: 5 }]
  }, { now: '2026-10-20T10:00:00.000Z' });
  assert.equal(briefing.metrics.lateOrders, 1);
  assert.equal(briefing.metrics.lowStockMaterials, 1);
  assert.equal(briefing.metrics.failedIntegrations, 1);
  assert.ok(briefing.alerts.every(alert => alert.source));
});

test('responde somente indicadores conhecidos e devolve fontes', () => {
  const briefing = MANAGER.buildBriefing({ events: [{ id: 'p1', schema: 'pedido', payload: { status: 'processamento', dataEntrega: '2026-10-10' } }] }, { now: '2026-10-20T10:00:00.000Z' });
  const answer = MANAGER.answerQuestion('Quais pedidos estão atrasados?', briefing);
  assert.equal(answer.understood, true);
  assert.equal(answer.value, 1);
  assert.equal(answer.sources[0].id, 'p1');
  assert.equal(MANAGER.answerQuestion('Qual é a cor mais bonita?', briefing).understood, false);
});

test('resume prioridades e responde com linguagem de gestão', () => {
  const briefing = MANAGER.buildBriefing({ events: [{ id: 'p1', schema: 'pedido', payload: { status: 'processamento', dataEntrega: '2026-10-10' } }] }, { now: '2026-10-20T10:00:00.000Z' });
  const priorities = MANAGER.answerQuestion('Quais são as prioridades de hoje?', briefing);
  assert.equal(priorities.understood, true);
  assert.equal(priorities.value, 1);
  assert.match(priorities.answer, /alerta/i);
  assert.match(MANAGER.answerQuestion('Existem encomendas atrasadas?', briefing).answer, /fora do prazo/i);
});
