const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function inlineScripts(file) {
  const html = fs.readFileSync(file, 'utf8');
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
}

test('JavaScript embutido dos novos painéis possui sintaxe válida', () => {
  const files = ['pages/integracoes.html', 'pages/fecho-fiscal.html', 'pages/aprendizagem.html'];
  files.forEach(file => {
    const scripts = inlineScripts(file);
    assert.ok(scripts.length > 0, `${file} deve possuir script embutido`);
    scripts.forEach(source => assert.doesNotThrow(() => new Function(source), `${file} contém JavaScript inválido`));
  });
});
