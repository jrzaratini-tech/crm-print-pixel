const test = require('node:test');
const assert = require('node:assert/strict');
const GESTAO = require('../core/gestao.js');

test('calcula orcamento profissional com ficha tecnica e margem minima', () => {
  const resumo = GESTAO.resumoOrcamentoProfissional({
    comIVA: 'sim',
    produtos: [{
      nome: 'Placa ACM',
      quantidade: 1,
      valor: 80,
      materiais: [{ materialId: 'acm', formula: 'area', larguraCm: 100, alturaCm: 100, quantidade: 1 }]
    }]
  }, [{ id: 'acm', nome: 'ACM', formulaPadrao: 'area', unidade: 'm2', precoCusto: 50 }], { margemMinima: 50 });

  assert.equal(resumo.custoPrevisto, 50);
  assert.equal(resumo.precoMinimo, 100);
  assert.equal(resumo.precoSugerido, 100);
  assert.equal(resumo.abaixoMargem, true);
});

test('gera roteiro produtivo por tipo de produto', () => {
  const roteiro = GESTAO.roteiroPadraoProduto({ nome: 'Letreiro LED neon com instalacao' });
  const labels = roteiro.map(etapa => etapa.label);
  assert.ok(labels.includes('Arte / projeto'));
  assert.ok(labels.includes('LED / solda'));
  assert.ok(labels.includes('Instalacao'));
});

test('compara previsto x realizado com tempo e comissao', () => {
  const comparativo = GESTAO.previstoRealizadoPedido({
    id: 'pedido-1',
    payload: {
      numero: 'P1',
      cliente: 'Cliente',
      subtotal: 500,
      total: 615,
      iva: 115,
      produtos: [{ nome: 'Painel', custo: 100, quantidade: 1, valor: 500 }]
    }
  }, [{
    orderId: 'pedido-1',
    commission: 50,
    timeLogs: [{ minutes: 120 }]
  }], [], { custoHoraMedio: 30 });

  assert.equal(comparativo.custoPrevisto, 100);
  assert.equal(comparativo.custoReal, 210);
  assert.equal(comparativo.status, 'acima_do_previsto');
});

test('calcula estoque inteligente e DRE gerencial', () => {
  const eventos = [
    { schema: 'pedido', payload: { subtotal: 500, total: 615, iva: 115, produtos: [{ custo: 120, quantidade: 1 }] }, timestamp: '2026-06-05' },
    { schema: 'despesa', payload: { valorBruto: 100 }, timestamp: '2026-06-05' },
    { schema: 'estoque_movimento', payload: { materialId: 'led', quantidade: -3 }, timestamp: '2026-06-05' }
  ];
  const estoque = GESTAO.estoqueInteligente([{ id: 'led', nome: 'Fita LED', estoqueAtual: 4, estoqueMinimo: 5, unidade: 'm' }], eventos);
  const dre = GESTAO.dreGerencial(eventos, [{ commission: 30 }], { custosFixos: 5000, margemContribuicao: 50 });

  assert.equal(estoque[0].status, 'comprar');
  assert.equal(estoque[0].sugestaoCompra, 4);
  assert.equal(dre.vendasLiquidas, 500);
  assert.equal(dre.resultadoOperacional, 250);
  assert.equal(dre.pontoEquilibrio, 10000);
});
