'use strict';

const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
]);

function clean(value, max = 120) {
  return String(value || '').trim().slice(0, max);
}

function countryCode(value, fallback = '') {
  const code = clean(value, 2).toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : fallback;
}

function normalizeVat(value, fallbackCountry = '') {
  const compact = clean(value, 24).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!compact) return '';
  if (/^[A-Z]{2}/.test(compact)) return compact;
  const country = countryCode(fallbackCountry);
  return country ? `${country}${compact}` : compact;
}

function fiscalInputs(order = {}) {
  const billingCountry = countryCode(
    order.billingCountry || order.paisFaturacao || order.moradaFaturacao?.country,
    'PT'
  );
  const deliveryMode = clean(order.deliveryMode || order.tipoEntrega || (order.levantamentoLoja ? 'pickup' : 'pickup'), 30).toLowerCase();
  const deliveryCountry = deliveryMode === 'pickup'
    ? 'PT'
    : countryCode(order.deliveryCountry || order.paisEntrega || order.moradaEntrega?.country, billingCountry);
  const customerType = clean(order.customerType || order.tipoCliente || (order.empresa ? 'business' : 'consumer'), 30).toLowerCase();
  const normalizedVat = normalizeVat(order.vatNumber || order.nif, billingCountry);
  return {
    billingCountry,
    deliveryCountry,
    deliveryMode: deliveryMode === 'shipping' ? 'shipping' : 'pickup',
    customerType: customerType === 'business' ? 'business' : 'consumer',
    vat: billingCountry === 'PT' ? normalizedVat.replace(/^PT/, '') : normalizedVat,
    viesStatus: clean(order.viesStatus || order.estadoVies, 30).toLowerCase(),
    transportEvidence: order.transportEvidence === true || order.transportEvidence === 'true' || order.provaTransporte === 'sim',
    override: clean(order.taxTreatment || order.tratamentoFiscal || 'auto', 40).toLowerCase(),
    overrideReason: clean(order.taxOverrideReason || order.motivoTratamentoFiscal, 300)
  };
}

function ptStandard(inputs, reason = '') {
  return {
    valid: true,
    code: 'PT_STANDARD',
    label: 'IVA português — taxa normal',
    taxCountry: 'PT',
    rate: 23,
    taxable: true,
    exemptionReason: '',
    legalMention: '',
    reason: reason || 'Operação localizada em Portugal.',
    inputs
  };
}

function exempt(inputs, code, label, reason) {
  return {
    valid: true,
    code,
    label,
    taxCountry: inputs.deliveryCountry,
    rate: 0,
    taxable: false,
    exemptionReason: code === 'EU_B2B_M16' ? 'M16' : 'M05',
    legalMention: code === 'EU_B2B_M16' ? 'Isento artigo 14.º do RITI' : 'Isento artigo 14.º do CIVA',
    reason,
    inputs
  };
}

function blocked(inputs, message) {
  return {
    valid: false,
    code: 'REVIEW_REQUIRED',
    label: 'Revisão fiscal necessária',
    taxCountry: inputs.deliveryCountry,
    rate: 0,
    taxable: false,
    exemptionReason: '',
    legalMention: '',
    reason: message,
    errors: [message],
    inputs
  };
}

function validateM16(inputs) {
  if (inputs.customerType !== 'business') return blocked(inputs, 'A isenção M16 exige que o cliente seja uma empresa.');
  if (!EU_COUNTRIES.has(inputs.deliveryCountry) || inputs.deliveryCountry === 'PT') return blocked(inputs, 'A isenção M16 exige destino noutro Estado-Membro da União Europeia.');
  if (!inputs.vat || !inputs.vat.startsWith(inputs.billingCountry) || inputs.vat.length < 6) return blocked(inputs, 'Indique o VAT intracomunitário completo do cliente, incluindo o prefixo do país.');
  if (inputs.viesStatus !== 'valid') return blocked(inputs, 'Valide o VAT do cliente no VIES antes de aplicar a isenção M16.');
  if (!inputs.transportEvidence) return blocked(inputs, 'Confirme e conserve a prova de transporte dos bens para o outro Estado-Membro.');
  return exempt(inputs, 'EU_B2B_M16', 'Transmissão intracomunitária — M16', 'Empresa da UE com VAT validado e transporte intracomunitário comprovado.');
}

function validateExport(inputs) {
  if (EU_COUNTRIES.has(inputs.deliveryCountry)) return blocked(inputs, 'A isenção de exportação M05 exige destino fora da União Europeia.');
  if (!inputs.transportEvidence) return blocked(inputs, 'Confirme e conserve a prova de exportação antes de aplicar M05.');
  return exempt(inputs, 'EXPORT_M05', 'Exportação — M05', 'Exportação de bens para fora da União Europeia com saída comprovada.');
}

function resolveSalesTax(order = {}) {
  const inputs = fiscalInputs(order);
  if (inputs.override !== 'auto' && !inputs.overrideReason) {
    return blocked(inputs, 'Indique o motivo da alteração manual do tratamento fiscal.');
  }
  if (inputs.override === 'pt_standard') return ptStandard(inputs, 'Tratamento de IVA português selecionado no pedido.');
  if (inputs.override === 'eu_b2b_m16') return validateM16(inputs);
  if (inputs.override === 'export_m05') return validateExport(inputs);

  if (inputs.deliveryCountry === 'PT' || inputs.deliveryMode === 'pickup') {
    return ptStandard(inputs, inputs.deliveryMode === 'pickup'
      ? 'Bens levantados na loja em Portugal; aplica-se IVA português, salvo prova e enquadramento intracomunitário aprovados.'
      : 'Entrega em Portugal.');
  }
  if (EU_COUNTRIES.has(inputs.deliveryCountry)) {
    if (inputs.customerType === 'business') return validateM16(inputs);
    return blocked(inputs, 'Venda B2C enviada para outro país da UE: configure primeiro o OSS e a taxa de IVA do país de destino no Moloni.');
  }
  return validateExport(inputs);
}

module.exports = { EU_COUNTRIES, countryCode, fiscalInputs, normalizeVat, resolveSalesTax };
