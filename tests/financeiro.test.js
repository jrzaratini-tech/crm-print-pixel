const assert = require('node:assert/strict');
const { test } = require('node:test');
const FINANCEIRO = require('../core/financeiro.js');

test('usa subtotal como faturamento liquido sem IVA', () => {
  const payload = { subtotal: 10000, iva: 2300, total: 12300, comIVA: 'sim' };
  assert.equal(FINANCEIRO.faturamentoSemIva(payload), 10000);
  assert.equal(FINANCEIRO.totalComIva(payload), 12300);
});

test('subtrai IVA quando registro nao possui subtotal', () => {
  assert.equal(FINANCEIRO.faturamentoSemIva({ total: 12300, iva: 2300 }), 10000);
});

test('remove IVA proporcional em registro legado', () => {
  assert.equal(FINANCEIRO.faturamentoSemIva({ total: 12300, comIVA: 'sim' }), 10000);
});

test('mantem valor integral quando pedido e isento de IVA', () => {
  assert.equal(FINANCEIRO.faturamentoSemIva({ total: 10000, comIVA: 'nao' }), 10000);
});
