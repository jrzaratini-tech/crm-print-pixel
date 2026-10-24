const assert = require('node:assert/strict');
const test = require('node:test');
const { generateDraftPdf } = require('../core/draft-pdf.js');

test('gera PDF de conferencia claramente marcado como rascunho', () => {
  const pdf = generateDraftPdf(
    { label: 'Fatura', orderNumber: '2026/0201', customer: 'Xana Bélgica', value: 405.9 },
    {
      issueDate: '2026-10-24',
      order: { number: '2026/0201', customer: 'Xana Bélgica', vat: 'BE0604994740', billingCountry: 'BE' },
      products: [{ name: 'Material impresso', qty: 1, price: 405.9, vatIncluded: true, taxRate: 23 }],
      taxDecision: { code: 'PT_STANDARD', label: 'IVA normal de Portugal', rate: 23 },
      totals: { total: 405.9 }
    }
  );
  const body = pdf.toString('latin1');
  assert.ok(pdf.subarray(0, 8).equals(Buffer.from('%PDF-1.4')));
  assert.match(body, /RASCUNHO - SEM VALOR FISCAL/);
  assert.match(body, /BE0604994740/);
  assert.match(body, /405,90 EUR/);
  assert.match(body, /\/Type \/Page/);
});
