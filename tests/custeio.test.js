const assert = require('node:assert/strict');
const { test } = require('node:test');
const CUSTEIO = require('../core/custeio.js');

test('calcula adesivo por metro quadrado com perda', () => {
  const result = CUSTEIO.calcular(
    { formula: 'area', larguraCm: 200, alturaCm: 100, quantidade: 1 },
    { unidade: 'm²', precoCusto: 10, perdaPercentual: 10 }
  );
  assert.equal(result.consumo, 2.2);
  assert.equal(result.custo, 22);
});

test('arredonda consumo de placa pelo tamanho comercial', () => {
  const result = CUSTEIO.calcular(
    { formula: 'placa', larguraCm: 250, alturaCm: 150, quantidade: 1 },
    { larguraCm: 200, alturaCm: 100, precoCusto: 50 }
  );
  assert.equal(result.consumo, 2);
  assert.equal(result.custo, 100);
});

test('calcula perfil por barra comercial', () => {
  const result = CUSTEIO.calcular(
    { formula: 'barra', comprimentoM: 7, quantidade: 1 },
    { comprimentoM: 3, precoCusto: 12 }
  );
  assert.equal(result.consumo, 3);
  assert.equal(result.custo, 36);
});

test('calcula fita led por contorno e módulos por densidade', () => {
  const fita = CUSTEIO.calcular(
    { formula: 'perimetro', larguraCm: 100, alturaCm: 50, quantidade: 1 },
    { unidade: 'm', precoCusto: 4 }
  );
  const modulos = CUSTEIO.calcular(
    { formula: 'densidade_area', larguraCm: 200, alturaCm: 100, quantidade: 1 },
    { unidade: 'un', precoCusto: 1.5, densidadePorM2: 12 }
  );
  assert.equal(fita.consumo, 3);
  assert.equal(fita.custo, 12);
  assert.equal(modulos.consumo, 24);
  assert.equal(modulos.custo, 36);
});
