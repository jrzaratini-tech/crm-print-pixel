const assert = require('node:assert/strict');
const { test } = require('node:test');
const QR_FISCAL = require('../core/qr-fiscal.js');

test('interpreta campos essenciais do QR fiscal português', () => {
  const documento = QR_FISCAL.interpretar('A:501234567*B:509876543*D:FT*F:20260602*G:FT 2026/18*O:123.00*N:23.00');
  assert.equal(documento.nifEmitente, '501234567');
  assert.equal(documento.nifAdquirente, '509876543');
  assert.equal(documento.tipoDocumento, 'FT');
  assert.equal(documento.numeroFatura, 'FT 2026/18');
  assert.equal(documento.dataCompra, '2026-06-02');
  assert.equal(documento.valorTotal, 123);
  assert.equal(documento.valorIVA, 23);
  assert.equal(documento.valorBruto, 100);
  assert.deepEqual(QR_FISCAL.validar(documento, '509876543'), []);
});

test('rejeita QR fiscal que não pertence ao NIF configurado', () => {
  const documento = QR_FISCAL.interpretar('A:501234567*B:500000000*D:FT*F:20260602*G:FT 2026/19*O:123.00*N:23.00');
  assert.match(QR_FISCAL.validar(documento, '509876543').join(' '), /não pertence/);
});
