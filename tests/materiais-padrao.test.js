const assert = require('node:assert/strict');
const { test } = require('node:test');
const MATERIAIS_PADRAO = require('../core/materiais-padrao.js');

test('lista familias padrao da operacao', () => {
  const keys = MATERIAIS_PADRAO.materiais.map(material => material.key);
  for (const key of ['fonte', 'acrilico', 'acm', 'pvc_expandido', 'metalon_aluminio', 'perfil_caixa_slim', 'perfil_caixa_luz', 'canto_ligacao', 'fita_led_zigzag', 'fita_led_vtec', 'led_neon', 'modulo_led_1w', 'filamento_petg', 'adesivo', 'outro']) {
    assert.ok(keys.includes(key), key);
  }
});

test('filamento petg usa cadastro por kg para letras caixa 3d', () => {
  const petg = MATERIAIS_PADRAO.get('filamento_petg');
  assert.equal(petg.unidade, 'kg');
  assert.equal(petg.categoria, 'Impressao 3D');
  assert.equal(petg.questions[1].fixed, '1,75 mm');
});

test('fonte pergunta tensao e potencia padronizadas', () => {
  const fonte = MATERIAIS_PADRAO.get('fonte');
  assert.deepEqual(fonte.questions[0].options, ['12 V', '24 V']);
  assert.deepEqual(fonte.questions[1].options, ['40 W', '60 W', '100 W', '150 W', '200 W', '300 W', '400 W', '500 W']);
});

test('pvc e perfis usam medidas comerciais definidas', () => {
  assert.deepEqual(MATERIAIS_PADRAO.get('pvc_expandido').questions[0].options, ['1 mm', '2 mm', '3 mm', '5 mm', '10 mm', '15 mm', '19 mm']);
  assert.equal(MATERIAIS_PADRAO.get('metalon_aluminio').comprimentoM, 3);
  assert.equal(MATERIAIS_PADRAO.get('perfil_caixa_slim').comprimentoM, 3);
  assert.equal(MATERIAIS_PADRAO.get('perfil_caixa_luz').comprimentoM, 3);
});
