'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeVat, resolveSalesTax } = require('../core/sales-tax.js');

test('aplica IVA português a cliente belga que levanta na loja', () => {
  const decision = resolveSalesTax({
    customerType: 'business',
    billingCountry: 'BE',
    deliveryMode: 'pickup',
    deliveryCountry: 'BE',
    nif: 'BE0123456789',
    viesStatus: 'valid'
  });
  assert.equal(decision.valid, true);
  assert.equal(decision.code, 'PT_STANDARD');
  assert.equal(decision.taxCountry, 'PT');
  assert.equal(decision.rate, 23);
});

test('aplica M16 apenas com VAT VIES e transporte comprovado', () => {
  const decision = resolveSalesTax({
    customerType: 'business',
    billingCountry: 'BE',
    deliveryMode: 'shipping',
    deliveryCountry: 'BE',
    nif: 'BE0123456789',
    viesStatus: 'valid',
    transportEvidence: true
  });
  assert.equal(decision.valid, true);
  assert.equal(decision.code, 'EU_B2B_M16');
  assert.equal(decision.exemptionReason, 'M16');
});

test('bloqueia M16 sem prova de transporte', () => {
  const decision = resolveSalesTax({
    customerType: 'business', billingCountry: 'BE', deliveryMode: 'shipping', deliveryCountry: 'BE',
    nif: 'BE0123456789', viesStatus: 'valid'
  });
  assert.equal(decision.valid, false);
  assert.match(decision.reason, /prova de transporte/i);
});

test('bloqueia B2C europeu sem configuração OSS', () => {
  const decision = resolveSalesTax({ customerType: 'consumer', billingCountry: 'BE', deliveryMode: 'shipping', deliveryCountry: 'BE' });
  assert.equal(decision.valid, false);
  assert.match(decision.reason, /OSS/i);
});

test('normaliza VAT internacional sem perder prefixo', () => {
  assert.equal(normalizeVat('be 0123.456.789', 'BE'), 'BE0123456789');
  assert.equal(normalizeVat('123456789', 'PT'), 'PT123456789');
});

test('exige justificação para alteração manual do tratamento fiscal', () => {
  const decision = resolveSalesTax({ billingCountry: 'BE', deliveryMode: 'shipping', deliveryCountry: 'BE', taxTreatment: 'pt_standard' });
  assert.equal(decision.valid, false);
  assert.match(decision.reason, /motivo da alteração manual/i);
});
