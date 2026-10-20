const assert = require('node:assert/strict');
const { test } = require('node:test');
const LINKS = require('../core/entity-links.js');

test('normaliza identidade e vínculos de orçamento e pedido', () => {
  const quote = LINKS.normalizeEvent('orc_1', {
    schema: 'orcamento',
    payload: { cliente: 'Cliente Teste', nif: 'PT 123 456 789', pedidoId: 'ped_1', pedidoNumero: 'PED-1' }
  });
  const order = LINKS.normalizeEvent('ped_1', {
    schema: 'pedido',
    payload: { cliente: 'Cliente Teste', nif: '123456789', orcamentoId: 'orc_1', numero: 'PED-1' }
  });

  assert.equal(quote.identity.urn, 'crm:orcamento:orc_1');
  assert.equal(quote.links.orderId, 'ped_1');
  assert.equal(order.links.quoteId, 'orc_1');
  assert.equal(order.links.customerKey, quote.links.customerKey);
});

test('atribui identificadores estáveis aos pagamentos incorporados', () => {
  const source = { schema: 'pedido', payload: { pagamentos: [{ valor: 50, data: '2026-10-20', formaPagamento: 'transferencia' }] } };
  const first = LINKS.normalizeEvent('ped_pag', source);
  const second = LINKS.normalizeEvent('ped_pag', source);

  assert.match(first.payload.pagamentos[0].id, /^pay_[a-f0-9]{20}$/);
  assert.equal(first.payload.pagamentos[0].id, second.payload.pagamentos[0].id);
  assert.equal(first.payload.pagamentos[0].orderId, 'ped_pag');
  assert.deepEqual(first.links.paymentIds, [first.payload.pagamentos[0].id]);
});

test('liga registos externos ao pedido canónico', () => {
  const links = LINKS.externalLinks('documento_fiscal', 'doc_1', { orderId: 'ped_1', paymentId: 'pay_1' });
  assert.equal(links.orderUrn, 'crm:pedido:ped_1');
  assert.equal(links.paymentUrn, 'crm:pedido:ped_1:pagamento:pay_1');
});
