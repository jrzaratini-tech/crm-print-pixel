const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildDocumentPreview,
  flattenForm,
  orderTotals,
  paidPayments
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

test('serializa estruturas aninhadas para formularios Moloni', () => {
  const form = flattenForm({ products: [{ name: 'Teste', taxes: [{ tax_id: 23 }] }] });
  assert.equal(form.get('products[0][name]'), 'Teste');
  assert.equal(form.get('products[0][taxes][0][tax_id]'), '23');
});
