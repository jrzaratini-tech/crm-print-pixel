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

test('calcula letras caixa PETG com perfil real de impressao e sem limitar por volume', () => {
  const result = GESTAO.calcularLetraCaixaPETG({
    palavra: 'AMOR',
    alturaCm: 60,
    profundidadeCm: 5,
    precoKgFilamento: 18,
    perdaPercentual: 10,
    gramasPorHora: 75
  });

  assert.equal(result.paredeMm, 0.8);
  assert.equal(result.larguraLinhaMm, 0.42);
  assert.equal(result.alturaCamadaMm, 0.28);
  assert.equal(result.preenchimentoPercentual, 90);
  assert.equal(result.impressora, 'ELEGOO Neptune 4 Max');
  assert.equal(result.detalhes.length, 4);
  assert.ok(result.gramasTotal > 0);
  assert.ok(result.horasTotal > 0);
  assert.ok(result.custoTotal > result.custoFilamento);
  assert.equal(result.cabeNaMaquina, true);
  assert.equal(result.segmentacaoRecomendada, true);
});

test('ajusta PETG com apontamentos reais anteriores', () => {
  const base = GESTAO.calcularLetraCaixaPETG({
    palavra: 'A',
    alturaCm: 30,
    profundidadeCm: 5,
    precoKgFilamento: 18,
    gramasPorHora: 75
  });
  const learned = GESTAO.calcularLetraCaixaPETG({
    palavra: 'A',
    alturaCm: 30,
    profundidadeCm: 5,
    precoKgFilamento: 18,
    gramasPorHora: 75,
    historicoReal: [{
      gramasEstimadas: base.gramasTotal,
      gramasReais: base.gramasTotal * 1.2,
      horasEstimadas: base.horasTotal,
      horasReais: base.horasTotal * 1.1
    }]
  });

  assert.equal(learned.aprendizado.amostras, 1);
  assert.equal(learned.aprendizado.fatorMaterial, 1.2);
  assert.equal(learned.aprendizado.fatorTempo, 1.1);
  assert.ok(learned.gramasTotal > base.gramasTotal);
  assert.ok(learned.horasTotal > base.horasTotal);
});

test('calcula letreiro PETG com multiplas alturas e LED estimado', () => {
  const result = GESTAO.calcularLetreiroPETG({
    entradas: [
      { texto: 'CRISTIANA FABIANA', alturaCm: 12, profundidadeCm: 5 },
      { texto: 'MAKEUP HAIRSTYLIST', alturaCm: 5, profundidadeCm: 5 }
    ],
    precoKgFilamento: 18,
    gramasPorHora: 75,
    fatorLed: 1.2
  });

  assert.equal(result.partes.length, 2);
  assert.ok(result.gramasTotal > 0);
  assert.ok(result.horasTotal > 0);
  assert.ok(result.contornoTotalM > 0);
  assert.ok(result.larguraEstimadaM > 0);
  assert.ok(result.entradas[0].larguraEstimadaCm > result.entradas[1].larguraEstimadaCm);
  assert.ok(result.ledEstimadoM > result.contornoTotalM);
  assert.equal(result.ledFinalM, result.ledEstimadoM);
});

test('permite corrigir manualmente a metragem de LED no letreiro PETG', () => {
  const result = GESTAO.calcularLetreiroPETG({
    entradas: [{ texto: 'AMOR', alturaCm: 30, profundidadeCm: 5 }],
    precoKgFilamento: 18,
    ledManualM: 15
  });

  assert.equal(result.ledFinalM, 15);
  assert.notEqual(result.ledEstimadoM, result.ledFinalM);
});

test('usa largura horizontal informada para ajustar PETG tempo e LED', () => {
  const base = GESTAO.calcularLetreiroPETG({
    entradas: [{ texto: 'AMOR', alturaMm: 300, profundidadeMm: 50 }],
    precoKgFilamento: 18
  });
  const ajustado = GESTAO.calcularLetreiroPETG({
    entradas: [{ texto: 'AMOR', alturaMm: 300, profundidadeMm: 50, larguraMm: base.larguraEstimadaMm * 1.5 }],
    precoKgFilamento: 18
  });

  assert.ok(ajustado.gramasTotal > base.gramasTotal);
  assert.ok(ajustado.horasTotal > base.horasTotal);
  assert.ok(ajustado.ledFinalM > base.ledFinalM);
  assert.equal(ajustado.entradas[0].fatorLargura, 1.5);
});

test('conta letras da palavra removendo acentos e espacos', () => {
  assert.deepEqual(GESTAO.lettersFromWord('AMOR'), [
    { letter: 'A', quantidade: 1 },
    { letter: 'M', quantidade: 1 },
    { letter: 'O', quantidade: 1 },
    { letter: 'R', quantidade: 1 }
  ]);
});
