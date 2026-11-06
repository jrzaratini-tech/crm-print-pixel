'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeOrderDraft, normalizeOrderUpdate, orderDraftSummary, orderUpdateSummary } = require('../core/ai-actions.js');

function completeDraft(overrides = {}) {
  return {
    customer_name: 'Xana Bélgica',
    company_name: 'Xana Bélgica BV',
    vat_number: 'BE0604994740',
    phone: '+32 470 000 000',
    customer_type: 'business',
    billing_address: 'Rue Exemple 10',
    billing_postal_code: '1000',
    billing_city: 'Bruxelles',
    billing_country: 'BE',
    delivery_mode: 'pickup',
    delivery_country: 'BE',
    delivery_date: '2026-11-15',
    installation_value: 50,
    installation_vat_applicable: true,
    vies_status: 'valid',
    transport_evidence: false,
    notes: 'Cliente levanta na loja.',
    products: [{ name: 'Impressão', size: '100x100 cm', quantity: 2, unit_value: 100, vat_applicable: true, notes: null }],
    payments: [],
    ...overrides
  };
}

test('pedido IA de cliente belga com levantamento aplica IVA português', () => {
  const result = normalizeOrderDraft(completeDraft(), { name: 'Administrador' });

  assert.equal(result.valid, true);
  assert.equal(result.payload.deliveryCountry, 'PT');
  assert.equal(result.taxDecision.code, 'PT_STANDARD');
  assert.equal(result.payload.subtotal, 250);
  assert.equal(result.payload.iva, 57.5);
  assert.equal(result.payload.total, 307.5);
  assert.equal(result.payload.aiCreated, true);
  assert.match(orderDraftSummary(result.payload, result.taxDecision).lines.join(' '), /307\.50 EUR/);
});

test('pedido IA intracomunitário só aplica M16 com transporte e VIES válido', () => {
  const result = normalizeOrderDraft(completeDraft({
    delivery_mode: 'shipping',
    delivery_country: 'BE',
    transport_evidence: true
  }));

  assert.equal(result.valid, true);
  assert.equal(result.taxDecision.code, 'EU_B2B_M16');
  assert.equal(result.payload.iva, 0);
  assert.equal(result.payload.total, 250);
});

test('pedido IA incompleto não pode gerar uma ação confirmável', () => {
  const result = normalizeOrderDraft({ customer_name: 'X', products: [] });

  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 6);
  assert.ok(result.errors.some(error => /morada/i.test(error)));
  assert.ok(result.errors.some(error => /produto/i.test(error)));
  assert.ok(result.errors.some(error => /total/i.test(error)));
});

function emptyUpdate(overrides = {}) {
  return {
    customer_name: null, company_name: null, vat_number: null, phone: null, customer_type: null,
    billing_address: null, billing_postal_code: null, billing_city: null, billing_country: null,
    delivery_mode: null, delivery_country: null, delivery_date: null,
    installation_value: null, installation_vat_applicable: null, vies_status: null,
    transport_evidence: null, notes: null, status: null, products: null, payments: null,
    ...overrides
  };
}

test('atualização IA preserva listas não alteradas e exige confirmação posterior', () => {
  const current = { ...normalizeOrderDraft(completeDraft()).payload, numero: '2026/0042' };
  const originalProducts = current.produtos;
  const result = normalizeOrderUpdate(emptyUpdate({ notes: 'Nova nota confirmável.', status: 'processamento' }), current, { id: 'admin-1' });

  assert.equal(result.valid, true);
  assert.equal(result.payload.observacoes, 'Nova nota confirmável.');
  assert.equal(result.payload.status, 'processamento');
  assert.equal(result.payload.produtos, originalProducts);
  assert.equal(result.payload.aiUpdatedBy, 'admin-1');
  assert.deepEqual(result.changes, ['observações', 'estado']);
  assert.match(orderUpdateSummary('order-1', result.payload, result.changes, result.taxDecision).title, /2026\/0042/);
});

test('atualização IA recalcula o total ao substituir produtos', () => {
  const current = { ...normalizeOrderDraft(completeDraft()).payload, numero: '2026/0043' };
  const result = normalizeOrderUpdate(emptyUpdate({
    products: [{ name: 'Letreiro', size: '50x50 cm', quantity: 2, unit_value: 200, vat_applicable: true, notes: null }]
  }), current);

  assert.equal(result.valid, true);
  assert.equal(result.payload.subtotal, 450);
  assert.equal(result.payload.iva, 103.5);
  assert.equal(result.payload.total, 553.5);
});

test('atualização IA sem mudanças não gera ação confirmável', () => {
  const current = normalizeOrderDraft(completeDraft()).payload;
  const result = normalizeOrderUpdate(emptyUpdate(), current);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /pelo menos uma alteração/);
});
