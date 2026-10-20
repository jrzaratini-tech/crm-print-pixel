const test = require('node:test');
const assert = require('node:assert/strict');
const RECIPES = require('../core/technical-recipes.js');

test('normaliza receita técnica e produz snapshot estável', () => {
  const recipe = RECIPES.normalizeRecipe({
    productId: 'product-neon',
    family: 'Neon LED',
    name: 'Neon base acrílica',
    materials: [{ materialId: 'acrilico-6', quantity: 1.2, unit: 'm2', wastePercent: 10 }],
    steps: [{ label: 'Soldar LED', estimatedMinutes: 90 }],
    parameters: { alturaObrigatoria: true }
  }, { version: 3, status: 'active', now: '2026-10-20T10:00:00.000Z' });

  assert.equal(recipe.version, 3);
  assert.equal(recipe.scopeKey, 'product:product-neon');
  assert.equal(recipe.materials[0].wastePercent, 10);
  assert.equal(recipe.steps[0].id, 'soldar-led');
  assert.equal(recipe.checksum.length, 64);
  assert.deepEqual(RECIPES.validateRecipe(recipe), []);
  const snapshot = RECIPES.snapshot(recipe);
  assert.equal(snapshot.version, 3);
  assert.equal('notes' in snapshot, false);
  assert.equal(snapshot.checksum, recipe.checksum);
});

test('checksum muda com conteúdo mas não com ordem das chaves', () => {
  const first = RECIPES.normalizeRecipe({ family: '3D', name: 'PETG', steps: ['Imprimir'], parameters: { b: 2, a: 1 } });
  const same = RECIPES.normalizeRecipe({ family: '3D', name: 'PETG', steps: ['Imprimir'], parameters: { a: 1, b: 2 } });
  const changed = RECIPES.normalizeRecipe({ family: '3D', name: 'PETG', steps: ['Pintar'], parameters: { a: 1, b: 2 } });
  assert.equal(first.checksum, same.checksum);
  assert.notEqual(first.checksum, changed.checksum);
});

test('mapeamento externo recebe identidade determinística', () => {
  const first = RECIPES.normalizeMapping({ source: 'Site', externalKey: 'NEON-01', productId: 'product-neon' });
  const second = RECIPES.normalizeMapping({ source: 'site', externalKey: 'NEON-01', productId: 'product-neon' });
  assert.equal(first.id, second.id);
  assert.equal(first.source, 'site');
  assert.deepEqual(RECIPES.validateMapping(first), []);
});
