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
    { schema: 'pedido', created_at: '2026-04-10T12:00:00', payload: { numeroFatura: 'FT 2026/1', subtotal: 10000, iva: 2300, total: 12300 } },
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
  assert.equal(resumo.entregaDeclaracao.getDate(), 21);
  assert.equal(resumo.entregaDeclaracao.getMonth(), 8);
  assert.equal(resumo.pagamento.getDate(), 25);
  assert.equal(resumo.pagamento.getMonth(), 8);
});

test('identifica credito trimestral de IVA a recuperar', () => {
  const eventos = [
    { schema: 'pedido', created_at: '2026-01-10T12:00:00', payload: { numeroFatura: 'FT 2026/2', iva: 100, total: 535 } },
    { schema: 'despesa', created_at: '2026-03-01T12:00:00', payload: { valorIVA: 230, valorTotal: 1230, comIVA: 'sim' } }
  ];

  const resumo = FINANCEIRO.resumoIvaTrimestral(eventos, new Date('2026-02-02T12:00:00'));
  assert.equal(resumo.saldo, -130);
  assert.equal(resumo.situacao, 'receber');
});

test('usa faturas de venda como fonte fiscal sem duplicar IVA de pedidos', () => {
  const eventos = [
    { schema: 'pedido', created_at: '2026-04-10T12:00:00', payload: { iva: 230, total: 1230 } },
    { schema: 'fatura_venda', created_at: '2026-04-11T12:00:00', payload: { dataFatura: '2026-04-11', iva: 115, total: 615 } }
  ];
  const resumo = FINANCEIRO.resumoIvaTrimestral(eventos, new Date('2026-06-02T12:00:00'));
  assert.equal(resumo.ivaVendas, 115);
  assert.equal(resumo.fonteVendas, 'faturas');
});

test('nao conta pedidos ainda nao faturados como IVA de vendas', () => {
  const eventos = [
    { schema: 'pedido', created_at: '2026-07-10T12:00:00', payload: { iva: 230, total: 1230 } },
    { schema: 'pedido', created_at: '2026-07-11T12:00:00', payload: { numeroFatura: 'FT 2026/10', iva: 115, total: 615 } }
  ];
  const resumo = FINANCEIRO.resumoIvaTrimestral(eventos, new Date('2026-09-01T12:00:00'));
  assert.equal(resumo.ivaVendas, 115);
  assert.equal(resumo.documentosVenda, 1);
  assert.equal(resumo.fonteVendas, 'pedidos_faturados');
});

test('usa data fiscal, elimina duplicados e desconta notas de credito', () => {
  const eventos = [
    { id: 'a', schema: 'fatura_venda', created_at: '2026-07-01T12:00:00', payload: { dataFatura: '2026-06-30', nifEmitente: '301621500', numeroFatura: 'FT 1', iva: 230 } },
    { id: 'b', schema: 'fatura_venda', created_at: '2026-06-30T13:00:00', payload: { dataFatura: '2026-06-30', nifEmitente: '301621500', numeroFatura: 'FT 1', iva: 230 } },
    { id: 'c', schema: 'fatura_venda', created_at: '2026-06-29T12:00:00', payload: { dataFatura: '2026-06-29', nifEmitente: '301621500', numeroFatura: 'NC 1', tipoDocumento: 'Nota de crédito', iva: 23 } }
  ];
  const resumo = FINANCEIRO.resumoIvaTrimestral(eventos, new Date('2026-06-30T18:00:00'));
  assert.equal(resumo.ivaVendas, 207);
  assert.equal(resumo.documentosVenda, 2);
});

test('aplica percentagem explicita e regra de 50 por cento ao gasoleo', () => {
  assert.equal(FINANCEIRO.percentualIvaDedutivel({ categoria: 'COMBUSTÍVEL', ivaDedutivel: true }), 50);
  assert.equal(FINANCEIRO.ivaCompraDedutivel({ categoria: 'COMBUSTÍVEL', valorIVA: 46 }), 23);
  assert.equal(FINANCEIRO.ivaCompraDedutivel({ categoria: 'TELEFONE/INTERNET', valorIVA: 23, percentualIvaDedutivel: 40 }), 9.2);
  assert.equal(FINANCEIRO.ivaCompraDedutivel({ categoria: 'ALIMENTAÇÃO', valorIVA: 23 }), 0);
  assert.equal(FINANCEIRO.ivaCompraDedutivel({ categoria: 'A CLASSIFICAR', classificationStatus: 'pending', valorIVA: 23 }), 0);
});

test('reproduz os valores confirmados da declaracao do segundo trimestre de 2026', () => {
  const eventos = [
    { schema: 'fatura_venda', payload: { dataFatura: '2026-04-15', numeroFatura: 'FT Q2/1', iva: 500 } },
    { schema: 'fatura_venda', payload: { dataFatura: '2026-06-20', numeroFatura: 'FT Q2/2', iva: 412.37 } },
    { schema: 'despesa', payload: { dataCompra: '2026-05-10', numeroFatura: 'FC Q2/1', categoria: 'MATERIAIS', valorIVA: 484.18, percentualIvaDedutivel: 100 } },
    { schema: 'despesa', payload: { dataCompra: '2026-06-12', numeroFatura: 'FC Q2/2', categoria: 'COMBUSTÍVEL', valorIVA: 100 } }
  ];
  const resumo = FINANCEIRO.resumoIvaTrimestral(eventos, new Date('2026-06-30T18:00:00'));
  assert.equal(resumo.ivaVendas, 912.37);
  assert.equal(resumo.ivaComprasDedutivel, 534.18);
  assert.equal(resumo.saldo, 378.19);
});

test('interpreta valores monetarios em formato portugues', () => {
  assert.equal(FINANCEIRO.numero('€ 1.608,21'), 1608.21);
  assert.equal(FINANCEIRO.ivaRegistado({ iva: '€ 583,23' }), 583.23);
});
