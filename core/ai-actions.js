'use strict';

const { resolveSalesTax } = require('./sales-tax.js');

function clean(value, maximum = 255) {
  return String(value ?? '').trim().slice(0, maximum);
}

function amount(value) {
  const parsed = Number.parseFloat(String(value ?? 0).replace(',', '.'));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function isoDate(value) {
  const date = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function normalizeOrderDraft(input = {}, actor = {}) {
  const billingCountry = clean(input.billing_country || 'PT', 2).toUpperCase();
  const deliveryMode = input.delivery_mode === 'shipping' ? 'shipping' : 'pickup';
  const deliveryCountry = deliveryMode === 'pickup'
    ? 'PT'
    : clean(input.delivery_country || billingCountry, 2).toUpperCase();
  const customerType = input.customer_type === 'consumer' ? 'consumer' : 'business';
  const products = (Array.isArray(input.products) ? input.products : []).slice(0, 30).map((item, index) => ({
    id: `ai_item_${index + 1}`,
    nome: clean(item.name || 'Produto', 160),
    tamanho: clean(item.size, 120),
    quantidade: Math.max(0, amount(item.quantity || 1)),
    valor: Math.max(0, amount(item.unit_value)),
    comIVA: item.vat_applicable === false ? 'nao' : 'sim',
    observacoes: clean(item.notes, 300),
    entregue: false
  }));
  const installation = Math.max(0, amount(input.installation_value));
  const provisional = {
    cliente: clean(input.customer_name, 160),
    empresa: clean(input.company_name || input.customer_name, 160),
    nif: clean(input.vat_number, 24).toUpperCase().replace(/[^A-Z0-9]/g, ''),
    vatNumber: clean(input.vat_number, 24).toUpperCase().replace(/[^A-Z0-9]/g, ''),
    customerType,
    billingCountry,
    deliveryMode,
    deliveryCountry,
    viesStatus: clean(input.vies_status || (billingCountry === 'PT' ? 'not_applicable' : 'not_checked'), 30),
    transportEvidence: input.transport_evidence === true,
    taxTreatment: 'auto',
    taxOverrideReason: '',
    morada: clean(input.billing_address, 250),
    billingPostalCode: clean(input.billing_postal_code, 40),
    billingCity: clean(input.billing_city, 120),
    telemovel: clean(input.phone, 50),
    dataEntrega: isoDate(input.delivery_date),
    instalacao: installation,
    atendente: clean(actor.name || actor.username || 'Gestor IA', 120),
    categoriaVenda: 'Venda direta',
    status: 'pendente',
    observacoes: clean(input.notes, 1000),
    comIVA: input.installation_vat_applicable === false ? 'nao' : 'sim',
    produtos: products
  };
  const taxDecision = resolveSalesTax(provisional);
  const subtotalProducts = amount(products.reduce((sum, item) => sum + item.quantidade * item.valor, 0));
  const subtotal = amount(subtotalProducts + installation);
  let vat = 0;
  if (taxDecision.valid && taxDecision.code === 'PT_STANDARD') {
    vat = amount(products.reduce((sum, item) => sum + (item.comIVA === 'nao' ? 0 : item.quantidade * item.valor * taxDecision.rate / 100), 0)
      + (provisional.comIVA === 'nao' ? 0 : installation * taxDecision.rate / 100));
  }
  const payments = (Array.isArray(input.payments) ? input.payments : []).slice(0, 20).map((item, index) => ({
    id: `ai_payment_${index + 1}`,
    tipo: clean(item.type || 'entrada', 40),
    data: isoDate(item.date) || new Date().toISOString().slice(0, 10),
    valor: Math.max(0, amount(item.value)),
    formaPagamento: clean(item.method || 'outro', 80),
    status: item.status === 'pago' ? 'pago' : 'pendente',
    observacoes: clean(item.notes, 300)
  })).filter(item => item.valor > 0);
  if (!payments.length) {
    payments.push({
      id: 'ai_payment_1', tipo: 'entrada', data: new Date().toISOString().slice(0, 10), valor: 0,
      formaPagamento: 'outro', status: 'pendente', observacoes: 'Pagamento ainda não registado'
    });
  }
  const total = amount(subtotal + vat);
  const totalPaid = amount(payments.filter(item => item.status === 'pago').reduce((sum, item) => sum + item.valor, 0));
  const payload = {
    ...provisional,
    pagamentos: payments,
    subtotal: subtotal,
    iva: vat,
    total,
    totalPago: totalPaid,
    saldoPendente: amount(Math.max(0, total - totalPaid)),
    statusPagamento: totalPaid <= 0 ? 'pendente' : totalPaid + 0.009 >= total ? 'pago' : 'parcial',
    aiCreated: true
  };
  const errors = [];
  if (payload.cliente.length < 2) errors.push('Indique o nome do cliente.');
  if (payload.empresa.length < 2) errors.push('Indique o nome da empresa ou repita o nome do cliente.');
  if (!payload.morada) errors.push('Indique a morada de faturação.');
  if (!payload.billingPostalCode) errors.push('Indique o código postal de faturação.');
  if (!payload.billingCity) errors.push('Indique a localidade de faturação.');
  if (!payload.telemovel) errors.push('Indique o contacto telefónico.');
  if (!payload.dataEntrega) errors.push('Indique o prazo/data de entrega no formato AAAA-MM-DD.');
  if (customerType === 'business' && !payload.nif) errors.push('Indique o NIF/VAT da empresa.');
  if (!products.length) errors.push('Adicione pelo menos um produto.');
  if (products.some(item => !item.nome || item.quantidade <= 0 || item.valor < 0)) errors.push('Confirme a descrição, quantidade e valor de todas as linhas.');
  if (!(total > 0)) errors.push('O total do pedido deve ser superior a zero.');
  if (!taxDecision.valid) errors.push(...(taxDecision.errors || [taxDecision.reason]));
  return { valid: errors.length === 0, errors, payload, taxDecision };
}

function orderDraftSummary(payload = {}, taxDecision = {}) {
  return {
    title: `Criar pedido para ${payload.cliente || 'cliente'}`,
    lines: [
      `${(payload.produtos || []).length} produto(s)`,
      `Total: ${amount(payload.total).toFixed(2)} EUR`,
      `Entrega: ${payload.dataEntrega || '-'}`,
      `Fiscalidade: ${taxDecision.label || taxDecision.code || 'a validar'}`
    ],
    total: amount(payload.total),
    customer: payload.cliente || ''
  };
}

module.exports = { amount, normalizeOrderDraft, orderDraftSummary };
