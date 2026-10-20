'use strict';

function text(value, maximum = 500) {
  return String(value || '').trim().slice(0, maximum);
}

function number(value, minimum = 0, maximum = 1000000) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : 0;
}

function list(value, maximumItems = 12, maximumLength = 240) {
  return (Array.isArray(value) ? value : []).slice(0, maximumItems).map(item => text(item, maximumLength)).filter(Boolean);
}

function normalizeName(value) {
  return text(value, 200).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function extractJson(output) {
  const source = String(output || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('A IA não devolveu uma análise estruturada. Tente novamente.');
  return JSON.parse(source.slice(start, end + 1));
}

function normalizeAnalysis(raw = {}, catalog = []) {
  const catalogNames = catalog.map(product => text(product.nome, 160)).filter(Boolean);
  const requestedMatch = normalizeName(raw.catalogMatch || raw.productType);
  const catalogMatch = catalogNames.find(name => normalizeName(name) === requestedMatch)
    || catalogNames.find(name => requestedMatch && (normalizeName(name).includes(requestedMatch) || requestedMatch.includes(normalizeName(name))))
    || 'Outro';
  const dimensions = raw.dimensions || {};
  const quantity = Math.max(1, Math.round(number(raw.quantity, 1, 1000) || 1));
  const sizeParts = [];
  if (number(dimensions.widthCm)) sizeParts.push(`${number(dimensions.widthCm)} cm largura`);
  if (number(dimensions.heightCm)) sizeParts.push(`${number(dimensions.heightCm)} cm altura`);
  if (number(dimensions.depthCm)) sizeParts.push(`${number(dimensions.depthCm)} cm profundidade`);
  return {
    summary: text(raw.summary, 1000),
    productType: text(raw.productType || catalogMatch, 160),
    catalogMatch,
    confidence: number(raw.confidence, 0, 1),
    dimensions: {
      widthCm: number(dimensions.widthCm, 0, 10000),
      heightCm: number(dimensions.heightCm, 0, 10000),
      depthCm: number(dimensions.depthCm, 0, 10000)
    },
    quantity,
    materials: list(raw.materials),
    productionSteps: list(raw.productionSteps),
    questions: list(raw.questions),
    assumptions: list(raw.assumptions),
    warnings: list(raw.warnings),
    draftProduct: {
      nome: catalogMatch,
      tamanho: sizeParts.join(' × '),
      quantidade: quantity,
      custo: 0,
      valor: 0,
      observacoes: text(raw.summary, 800)
    }
  };
}

function historicalEstimate(events = [], productName = '') {
  const target = normalizeName(productName);
  if (!target || target === 'outro') return { available: false, sampleCount: 0, unitPrice: 0, rangeMin: 0, rangeMax: 0 };
  const prices = [];
  for (const event of events) {
    if (event?.deleted || !['orcamento', 'pedido'].includes(event?.schema)) continue;
    const products = Array.isArray(event.payload?.produtos) ? event.payload.produtos : [];
    for (const product of products) {
      const name = normalizeName(product.nome || product.produto);
      if (!name || !(name.includes(target) || target.includes(name))) continue;
      const unitPrice = number(product.valor || product.preco, 0, 1000000);
      if (unitPrice > 0) prices.push(unitPrice);
    }
  }
  if (!prices.length) return { available: false, sampleCount: 0, unitPrice: 0, rangeMin: 0, rangeMax: 0 };
  prices.sort((a, b) => a - b);
  const middle = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  return {
    available: true,
    sampleCount: prices.length,
    unitPrice: Math.round(median * 100) / 100,
    rangeMin: Math.round(prices[0] * 100) / 100,
    rangeMax: Math.round(prices[prices.length - 1] * 100) / 100
  };
}

function quotePrompt({ description = '', catalog = [] } = {}) {
  const names = catalog.map(product => text(product.nome, 160)).filter(Boolean);
  return [
    'Analise o pedido e a imagem como assistente técnico da PrintPixel, uma gráfica especializada em LED neon, logos para montras, letras e impressão 3D.',
    `Produtos permitidos no catálogo: ${names.join('; ') || 'Outro'}.`,
    'Não invente medidas, materiais, preço ou certeza. Quando não for possível determinar algo, coloque 0, liste a dúvida em questions e explique em assumptions.',
    'Escolha catalogMatch exatamente entre os nomes do catálogo; use Outro apenas se nenhum servir.',
    'Devolva SOMENTE JSON válido, sem markdown, neste formato:',
    '{"summary":"","productType":"","catalogMatch":"","confidence":0,"dimensions":{"widthCm":0,"heightCm":0,"depthCm":0},"quantity":1,"materials":[],"productionSteps":[],"questions":[],"assumptions":[],"warnings":[]}',
    `Descrição fornecida pelo utilizador: ${text(description, 3000) || 'Sem descrição adicional.'}`
  ].join('\n');
}

module.exports = { extractJson, historicalEstimate, normalizeAnalysis, normalizeName, quotePrompt };
