'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const AI_QUOTE = require('../core/ai-quote.js');

const catalog = [
  { nome: 'Neon LED' },
  { nome: 'Logo 3D com LED' },
  { nome: 'Letra Caixa PETG 3D' },
  { nome: 'Outro' }
];

test('normaliza a análise e obriga a correspondência com o catálogo real', () => {
  const analysis = AI_QUOTE.normalizeAnalysis({
    summary: 'Logo iluminado para montra',
    productType: 'logo luminoso',
    catalogMatch: 'Logo 3d com led',
    confidence: 1.4,
    dimensions: { widthCm: 80, heightCm: 35 },
    quantity: 2,
    materials: ['PETG', 'LED'],
    questions: ['Qual a cor?']
  }, catalog);
  assert.equal(analysis.catalogMatch, 'Logo 3D com LED');
  assert.equal(analysis.confidence, 1);
  assert.equal(analysis.quantity, 2);
  assert.match(analysis.draftProduct.tamanho, /80 cm largura/);
  assert.equal(analysis.draftProduct.valor, 0);
});

test('calcula preço sugerido pela mediana do histórico sem deixar a IA inventar valores', () => {
  const estimate = AI_QUOTE.historicalEstimate([
    { schema: 'orcamento', payload: { produtos: [{ nome: 'Neon LED', valor: 100 }] } },
    { schema: 'pedido', payload: { produtos: [{ nome: 'Neon LED', valor: 140 }] } },
    { schema: 'pedido', payload: { produtos: [{ nome: 'Neon LED', valor: 120 }] } },
    { schema: 'pedido', deleted: true, payload: { produtos: [{ nome: 'Neon LED', valor: 999 }] } }
  ], 'Neon LED');
  assert.deepEqual(estimate, { available: true, sampleCount: 3, unitPrice: 120, rangeMin: 100, rangeMax: 140 });
});

test('extrai JSON mesmo quando o modelo inclui uma cerca de código', () => {
  const parsed = AI_QUOTE.extractJson('```json\n{"summary":"teste"}\n```');
  assert.equal(parsed.summary, 'teste');
});

test('prompt proíbe invenções e inclui somente produtos cadastrados', () => {
  const prompt = AI_QUOTE.quotePrompt({ description: 'referência anexada', catalog });
  assert.match(prompt, /Não invente medidas, materiais, preço ou certeza/);
  assert.match(prompt, /Logo 3D com LED/);
  assert.match(prompt, /referência anexada/);
});
