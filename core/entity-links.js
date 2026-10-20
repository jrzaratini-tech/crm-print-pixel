const crypto = require('crypto');

const LINK_VERSION = 1;

function cleanId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9._:-]{1,200}$/.test(id) ? id : '';
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizedText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

function customerKey(payload = {}) {
  const nif = digits(payload.nif || payload.nifCliente || payload.vatNumber);
  if (nif.length >= 8) return `nif:${nif}`;
  const email = String(payload.email || payload.emailCliente || '').trim().toLowerCase();
  if (email && email.includes('@')) return `email:${email.slice(0, 160)}`;
  const phone = digits(payload.telemovel || payload.telefone || payload.phone);
  if (phone.length >= 7) return `phone:${phone}`;
  const name = normalizedText(payload.empresa || payload.cliente || payload.customer);
  return name ? `name:${name}` : '';
}

function urn(type, id) {
  const safeType = normalizedText(type).replace(/-/g, '_');
  const safeId = cleanId(id);
  return safeType && safeId ? `crm:${safeType}:${safeId}` : '';
}

function stablePaymentId(orderId, payment = {}, index = 0) {
  const existing = cleanId(payment.id || payment.paymentId);
  if (existing) return existing;
  const seed = [orderId, payment.data || payment.date || '', payment.valor || payment.amount || 0, payment.formaPagamento || payment.method || '', index].join('|');
  return `pay_${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 20)}`;
}

function normalizePayments(orderId, payments) {
  if (!Array.isArray(payments)) return payments;
  return payments.map((payment, index) => ({
    ...payment,
    id: stablePaymentId(orderId, payment, index),
    orderId
  }));
}

function eventIdentity(id, schema) {
  return {
    version: LINK_VERSION,
    type: String(schema || ''),
    id: cleanId(id),
    urn: urn(schema, id)
  };
}

function eventLinks(id, schema, payload = {}) {
  const quoteId = schema === 'orcamento'
    ? cleanId(id)
    : cleanId(payload.orcamentoId || payload.quoteId);
  const orderId = schema === 'pedido'
    ? cleanId(id)
    : cleanId(payload.pedidoId || payload.orderId);
  return {
    version: LINK_VERSION,
    customerKey: customerKey(payload),
    quoteId,
    quoteUrn: urn('orcamento', quoteId),
    orderId,
    orderUrn: urn('pedido', orderId),
    orderNumber: String(payload.numero || payload.pedidoNumero || payload.orderNumber || '').trim().slice(0, 100),
    paymentIds: schema === 'pedido' && Array.isArray(payload.pagamentos)
      ? payload.pagamentos.map((payment, index) => stablePaymentId(orderId, payment, index))
      : []
  };
}

function normalizeEvent(id, event = {}) {
  const schema = String(event.schema || '').trim();
  const payload = { ...(event.payload || {}) };
  if (schema === 'pedido') {
    payload.crmOrderId = cleanId(id);
    if (Array.isArray(payload.pagamentos)) payload.pagamentos = normalizePayments(cleanId(id), payload.pagamentos);
  }
  if (schema === 'orcamento') payload.crmQuoteId = cleanId(id);
  return {
    ...event,
    payload,
    identity: eventIdentity(id, schema),
    links: eventLinks(id, schema, payload)
  };
}

function externalLinks(type, id, record = {}) {
  const orderId = cleanId(record.orderId || record.pedidoId);
  const paymentId = cleanId(record.paymentId);
  return {
    version: LINK_VERSION,
    selfUrn: urn(type, id),
    orderId,
    orderUrn: urn('pedido', orderId),
    paymentId,
    paymentUrn: paymentId && orderId ? `crm:pedido:${orderId}:pagamento:${paymentId}` : ''
  };
}

module.exports = {
  LINK_VERSION,
  cleanId,
  customerKey,
  eventIdentity,
  eventLinks,
  externalLinks,
  normalizeEvent,
  normalizePayments,
  stablePaymentId,
  urn
};
