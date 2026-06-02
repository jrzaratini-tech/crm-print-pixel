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

test('apura IVA trimestral de vendas e compras dedutiveis', () => {
  const eventos = [
    { schema: 'pedido', created_at: '2026-04-10T12:00:00', payload: { subtotal: 10000, iva: 2300, total: 12300 } },
    { schema: 'despesa', created_at: '2026-05-12T12:00:00', payload: { valorBruto: 1000, valorIVA: 230, valorTotal: 1230, comIVA: 'sim' } },
    { schema: 'despesa', created_at: '2026-05-13T12:00:00', payload: { valorBruto: 500, valorIVA: 115, valorTotal: 615, comIVA: 'sim', ivaDedutivel: false } },
    { schema: 'despesa', created_at: '2026-04-01T12:00:00', payload: { dataCompra: '2026-03-31', valorIVA: 46, valorTotal: 246, comIVA: 'sim' } },
    { schema: 'pedido', created_at: '2026-03-31T12:00:00', payload: { subtotal: 1000, iva: 230, total: 1230 } }
  ];

  const resumo = FINANCEIRO.resumoIvaTrimestral(eventos, new Date('2026-06-02T12:00:00'));
  assert.equal(resumo.trimestre, 2);
  assert.equal(resumo.ivaVendas, 2300);
  assert.equal(resumo.ivaComprasDedutivel, 230);
  assert.equal(resumo.saldo, 2070);
  assert.equal(resumo.situacao, 'pagar');
  assert.equal(resumo.entregaDeclaracao.getDate(), 20);
  assert.equal(resumo.entregaDeclaracao.getMonth(), 7);
  assert.equal(resumo.pagamento.getDate(), 25);
  assert.equal(resumo.pagamento.getMonth(), 7);
});

test('identifica credito trimestral de IVA a recuperar', () => {
  const eventos = [
    { schema: 'pedido', created_at: '2026-01-10T12:00:00', payload: { iva: 100, total: 535 } },
    { schema: 'despesa', created_at: '2026-03-01T12:00:00', payload: { valorIVA: 230, valorTotal: 1230, comIVA: 'sim' } }
  ];

  const resumo = FINANCEIRO.resumoIvaTrimestral(eventos, new Date('2026-02-02T12:00:00'));
  assert.equal(resumo.saldo, -130);
  assert.equal(resumo.situacao, 'receber');
});
