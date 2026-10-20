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

test('organiza o dia com uma visão geral segura quando a IA não está ligada', () => {
  const briefing = MANAGER.buildBriefing({ events: [{ id: 'p1', schema: 'pedido', payload: { status: 'processamento', total: 150 } }] }, { now: '2026-10-20T10:00:00.000Z' });
  const overview = MANAGER.answerQuestion('Analise o meu dia e diga por onde devo começar.', briefing);
  assert.equal(overview.understood, true);
  assert.equal(overview.metric, 'dailyOverview');
  assert.match(overview.answer, /1 pedido\(s\)/);
});

test('responde o faturamento mostrado no dashboard com líquido e bruto do mês atual', () => {
  const briefing = MANAGER.buildBriefing({ events: [
    { id: 'p1', schema: 'pedido', created_at: '2026-10-05T10:00:00.000Z', payload: { subtotal: 100, total: 123, iva: 23 } },
    { id: 'p2', schema: 'pedido', created_at: '2026-09-28T10:00:00.000Z', payload: { subtotal: 200, total: 246, iva: 46 } }
  ] }, { now: '2026-10-20T10:00:00.000Z' });
  const answer = MANAGER.answerQuestion('Quanto era o faturamento que estava mostrando no dashboard?', briefing);
  assert.equal(answer.understood, true);
  assert.equal(answer.metric, 'dashboard.currentMonth.revenue');
  assert.equal(answer.value, 123);
  assert.match(answer.answer, /100,00\s*€/);
  assert.match(answer.answer, /123,00\s*€/);
  assert.deepEqual(answer.sources, [{ schema: 'pedido', id: 'p1' }]);
});

test('distingue faturamento de pedidos ainda sem fatura', () => {
  const briefing = MANAGER.buildBriefing({ events: [
    { id: 'p1', schema: 'pedido', created_at: '2026-10-05T10:00:00.000Z', payload: { total: 123, status: 'processamento' } }
  ] }, { now: '2026-10-20T10:00:00.000Z' });
  const revenue = MANAGER.answerQuestion('Qual é o faturamento do mês?', briefing);
  const pending = MANAGER.answerQuestion('Quais pedidos ainda estão sem faturar?', briefing);
  assert.equal(revenue.metric, 'dashboard.currentMonth.revenue');
  assert.equal(pending.metric, 'uninvoicedOrders');
});

test('responde os restantes cartões financeiros do dashboard', () => {
  const briefing = MANAGER.buildBriefing({ events: [
    { id: 'p1', schema: 'pedido', created_at: '2026-10-05T10:00:00.000Z', payload: { total: 123, totalPago: 23, status: 'processamento' } },
    { id: 'd1', schema: 'despesa', created_at: '2026-10-06T10:00:00.000Z', payload: { valorTotal: 80, valorPago: 20, statusPagamento: 'pendente' } }
  ] }, { now: '2026-10-20T10:00:00.000Z' });
  assert.equal(MANAGER.answerQuestion('Quanto mostra em despesas no dashboard?', briefing).value, 80);
  assert.equal(MANAGER.answerQuestion('Qual é o restante a receber?', briefing).value, 100);
  assert.equal(MANAGER.answerQuestion('Quanto existe para pagar?', briefing).value, 60);
  assert.equal(MANAGER.answerQuestion('Quantos pedidos ativos mostra o painel?', briefing).value, 1);
});
