const crypto = require('crypto');

const RECIPE_STATUSES = new Set(['draft', 'active', 'retired']);

function text(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slug(value) {
  return text(value, 160)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function normalizeMaterials(materials = []) {
  if (!Array.isArray(materials)) return [];
  return materials.slice(0, 80).map((item, index) => ({
    materialId: text(item?.materialId || item?.id, 120),
    name: text(item?.name || item?.nome, 160),
    quantity: Math.max(0, number(item?.quantity ?? item?.quantidade, 0)),
    unit: text(item?.unit || item?.unidade || 'un', 30),
    wastePercent: Math.min(100, Math.max(0, number(item?.wastePercent ?? item?.desperdicioPercentual, 0))),
    formula: text(item?.formula || 'fixed', 60),
    order: index + 1
  })).filter(item => item.materialId || item.name);
}

function normalizeSteps(steps = []) {
  if (!Array.isArray(steps)) return [];
  return steps.slice(0, 80).map((item, index) => {
    const label = text(typeof item === 'string' ? item : (item?.label || item?.name || item?.nome), 160);
    return {
      id: text(typeof item === 'object' && item?.id ? item.id : slug(label), 100),
      label,
      estimatedMinutes: Math.max(0, Math.round(number(item?.estimatedMinutes ?? item?.tempoPrevistoMin, 0))),
      required: item?.required !== false,
      order: index + 1
    };
  }).filter(item => item.label);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

function checksum(recipe = {}) {
  const relevant = stableValue({
    productId: recipe.productId,
    family: recipe.family,
    name: recipe.name,
    materials: recipe.materials,
    steps: recipe.steps,
    parameters: recipe.parameters
  });
  return crypto.createHash('sha256').update(JSON.stringify(relevant)).digest('hex');
}

function scopeKey(recipe = {}) {
  return recipe.productId ? `product:${recipe.productId}` : `family:${slug(recipe.family)}`;
}

function normalizeRecipe(input = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const version = Math.max(1, Math.round(number(options.version ?? input.version, 1)));
  const family = text(input.family || input.familia || input.category || input.categoria, 120);
  const productId = text(input.productId, 120);
  const name = text(input.name || input.nome || family, 160);
  const status = RECIPE_STATUSES.has(options.status || input.status) ? (options.status || input.status) : 'draft';
  const id = text(options.id || input.id || `recipe-${slug(productId || family || name)}-v${version}`, 160);
  const recipe = {
    id,
    productId,
    family,
    name,
    version,
    status,
    materials: normalizeMaterials(input.materials || input.materiais),
    steps: normalizeSteps(input.steps || input.etapas),
    parameters: input.parameters && typeof input.parameters === 'object' && !Array.isArray(input.parameters)
      ? stableValue(input.parameters)
      : {},
    notes: text(input.notes || input.observacoes, 1000),
    basedOnId: text(options.basedOnId || input.basedOnId, 160),
    createdAt: options.createdAt || input.createdAt || now,
    createdBy: text(options.createdBy || input.createdBy || 'system', 120),
    updatedAt: now
  };
  recipe.scopeKey = scopeKey(recipe);
  recipe.checksum = checksum(recipe);
  return recipe;
}

function validateRecipe(recipe = {}) {
  const errors = [];
  if (!recipe.productId && !recipe.family) errors.push('Associe a receita a um produto ou informe uma família.');
  if (!recipe.name) errors.push('Informe o nome da receita.');
  if (!recipe.steps?.length && !recipe.materials?.length) errors.push('Informe pelo menos um material ou uma etapa.');
  return errors;
}

function snapshot(recipe = {}) {
  if (!recipe.id) return null;
  return stableValue({
    id: recipe.id,
    productId: recipe.productId || '',
    family: recipe.family || '',
    name: recipe.name || '',
    version: Number(recipe.version || 1),
    materials: normalizeMaterials(recipe.materials),
    steps: normalizeSteps(recipe.steps),
    parameters: recipe.parameters || {},
    checksum: recipe.checksum || checksum(recipe),
    activatedAt: recipe.activatedAt || ''
  });
}

function normalizeMapping(input = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const source = slug(input.source || input.origem);
  const externalType = slug(input.externalType || input.tipoExterno || 'product');
  const externalKey = text(input.externalKey || input.externalId || input.sku, 200);
  const identity = `${source}|${externalType}|${externalKey.toLowerCase()}`;
  return {
    id: text(options.id || input.id || `mapping-${crypto.createHash('sha1').update(identity).digest('hex').slice(0, 24)}`, 160),
    source,
    externalType,
    externalKey,
    productId: text(input.productId, 120),
    recipeId: text(input.recipeId, 160),
    recipeVersion: Math.max(0, Math.round(number(input.recipeVersion, 0))),
    active: input.active !== false,
    notes: text(input.notes || input.observacoes, 500),
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

function validateMapping(mapping = {}) {
  const errors = [];
  if (!mapping.source) errors.push('Informe a origem externa.');
  if (!mapping.externalKey) errors.push('Informe a chave externa, SKU ou ID.');
  if (!mapping.productId && !mapping.recipeId) errors.push('Associe o mapeamento a um produto ou receita.');
  return errors;
}

module.exports = {
  checksum,
  normalizeMapping,
  normalizeMaterials,
  normalizeRecipe,
  normalizeSteps,
  scopeKey,
  snapshot,
  validateMapping,
  validateRecipe
};
