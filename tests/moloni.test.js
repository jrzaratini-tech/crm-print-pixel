const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MoloniClient,
  buildDocumentPreview,
  classifyLineNature,
  flattenForm,
  isMoloniAuthExpiredError,
  moloniDocumentResult,
  orderTotals,
  paidPayments,
  recommendDocumentAction
} = require('../core/moloni.js');

const order = {
  id: 'pedido-1',
  numero: '2026-001',
  cliente: 'Cliente Teste',
  nif: '123456789',
  total: 1000,
  produtos: [{ nome: 'Letra caixa', quantidade: 1, valor: 1000, comIVA: 'sim' }],
  pagamentos: [
    { id: 'pag-1', status: 'pago', valor: 300, data: '2026-06-20', formaPagamento: 'transferencia' },
    { id: 'pag-2', status: 'pendente', valor: 700, data: '2026-06-22', formaPagamento: 'dinheiro' }
  ]
};

test('calcula pagamentos e saldo do pedido', () => {
  assert.equal(paidPayments(order).length, 1);
  assert.deepEqual(orderTotals(order), { total: 1000, paid: 300, outstanding: 700 });
});

test('prepara uma fatura valida para o total do pedido', () => {
  const preview = buildDocumentPreview({ order, type: 'invoice', issueDate: '2026-06-22' });
  assert.equal(preview.valid, true);
  assert.equal(preview.totals.total, 1000);
  assert.equal(preview.idempotencyKey, 'pedido-1:invoice:sale');
});

test('classifica linhas Moloni como produto ou servico com referencia estavel', () => {
  const preview = buildDocumentPreview({
    order: {
      ...order,
      produtos: [{ nome: 'Reclamo luminoso', quantidade: 1, valor: 900, comIVA: 'sim' }],
      instalacao: 100
    },
    type: 'invoice'
  });
  assert.equal(preview.products[0].nature, 'product');
  assert.match(preview.products[0].reference, /^CRM-P-/);
  assert.equal(preview.products[1].nature, 'service');
  assert.match(preview.products[1].reference, /^CRM-S-/);
  assert.equal(classifyLineNature({ nome: 'Instalacao e deslocacao' }), 'service');
  assert.equal(classifyLineNature({ nome: 'Vinil impresso' }), 'product');
});

test('impede fatura-recibo quando existe pagamento parcial', () => {
  const preview = buildDocumentPreview({ order, type: 'invoice_receipt' });
  assert.equal(preview.valid, false);
  assert.match(preview.errors.join(' '), /totalmente pago/);
});

test('prepara recibo com o valor do pagamento escolhido', () => {
  const preview = buildDocumentPreview({ order, type: 'receipt', paymentId: 'pag-1' });
  assert.equal(preview.valid, true);
  assert.equal(preview.receiptValue, 300);
  assert.equal(preview.idempotencyKey, 'pedido-1:receipt:pag-1');
});

test('recomenda fatura quando o pedido tem pagamento parcial e ainda nao foi faturado', () => {
  const recommendation = recommendDocumentAction({ order, documents: [] });
  assert.equal(recommendation.documentType, 'invoice');
  assert.equal(recommendation.type, 'invoice_then_receipt');
  assert.equal(recommendation.amount, 1000);
  assert.equal(recommendation.receiptAmount, 300);
});

test('recomenda fatura-recibo quando o pedido esta totalmente pago sem documento de venda', () => {
  const recommendation = recommendDocumentAction({
    order: { ...order, pagamentos: [{ id: 'pag-full', status: 'pago', valor: 1000 }] },
    documents: []
  });
  assert.equal(recommendation.documentType, 'invoice_receipt');
  assert.equal(recommendation.type, 'invoice_receipt');
});

test('recomenda recibo quando ja existe fatura e pagamento por conciliar', () => {
  const recommendation = recommendDocumentAction({
    order,
    documents: [{ type: 'invoice', state: 'closed', value: 1000 }]
  });
  assert.equal(recommendation.documentType, 'receipt');
  assert.equal(recommendation.type, 'receipt');
  assert.equal(recommendation.amount, 300);
});

test('reconhece pedido completo quando fatura e recibos ja cobrem pagamentos', () => {
  const recommendation = recommendDocumentAction({
    order: { ...order, pagamentos: [{ id: 'pag-full', status: 'pago', valor: 1000 }] },
    documents: [
      { type: 'invoice', state: 'closed', value: 1000 },
      { type: 'receipt', state: 'closed', value: 1000 }
    ]
  });
  assert.equal(recommendation.type, 'complete');
});

test('serializa estruturas aninhadas para formularios Moloni', () => {
  const form = flattenForm({ products: [{ name: 'Teste', taxes: [{ tax_id: 23 }] }] });
  assert.equal(form.get('products[0][name]'), 'Teste');
  assert.equal(form.get('products[0][taxes][0][tax_id]'), '23');
});

test('extrai identificador de documento Moloni em respostas variadas', () => {
  assert.deepEqual(
    { id: moloniDocumentResult({ document_id: 123, document_number: 'FT A/1' }).id, number: moloniDocumentResult({ document_id: 123, document_number: 'FT A/1' }).number },
    { id: '123', number: 'FT A/1' }
  );
  assert.deepEqual(
    { id: moloniDocumentResult({ data: { document: { id: 456, number: 'FR A/2' } } }).id, number: moloniDocumentResult({ data: { document: { id: 456, number: 'FR A/2' } } }).number },
    { id: '456', number: 'FR A/2' }
  );
  assert.equal(moloniDocumentResult({ valid: 1 }).id, '');
});

test('trata lista textual da API Moloni como erro de validacao', async () => {
  const client = new MoloniClient({
    accessToken: 'token-teste',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ['2 customer_id 1 0']
    })
  });
  await assert.rejects(
    () => client.call('invoices/insert', { customer_id: 0 }),
    /customer_id/
  );
});

test('mantem listas de objetos Moloni como respostas validas', async () => {
  const client = new MoloniClient({
    accessToken: 'token-teste',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => [{ product_id: 1, name: 'Produto' }]
    })
  });
  const products = await client.call('products/getAll', {});
  assert.equal(products[0].product_id, 1);
});

test('reconhece refresh token Moloni expirado', () => {
  assert.equal(isMoloniAuthExpiredError(new Error('Refresh token has expired (1784554839 - 1784656710)')), true);
  assert.equal(isMoloniAuthExpiredError({ details: { error: 'invalid_grant' } }), true);
  assert.equal(isMoloniAuthExpiredError(new Error('Erro devolvido pela API Moloni.')), false);
});
