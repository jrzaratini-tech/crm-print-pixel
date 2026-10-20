const crypto = require('crypto');

function text(value, max = 300) {
  return String(value || '').trim().slice(0, max);
}

function money(value) {
  const parsed = Number.parseFloat(String(value ?? '0').replace(',', '.'));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function validShopDomain(value) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(text(value, 255));
}

function verifyWebhook(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || !signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const actualBuffer = Buffer.from(String(signature), 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function webhookMetadata(headers = {}) {
  const read = name => headers[String(name).toLowerCase()] ?? headers[name] ?? '';
  const shopDomain = text(read('x-shopify-shop-domain'), 255).toLowerCase();
  return {
    webhookId: text(read('x-shopify-webhook-id'), 160),
    eventId: text(read('x-shopify-event-id'), 160),
    topic: text(read('x-shopify-topic'), 120).toLowerCase(),
    shopDomain,
    apiVersion: text(read('x-shopify-api-version'), 40),
    triggeredAt: text(read('x-shopify-triggered-at'), 80)
  };
}

function normalizeAddress(address = {}) {
  return {
    name: text(address.name || [address.first_name, address.last_name].filter(Boolean).join(' '), 200),
    company: text(address.company, 200),
    address1: text(address.address1, 240),
    address2: text(address.address2, 240),
    city: text(address.city, 120),
    province: text(address.province || address.province_code, 120),
    postalCode: text(address.zip, 40),
    country: text(address.country_code || address.country, 80).toUpperCase(),
    phone: text(address.phone, 60)
  };
}

function normalizeLine(line = {}) {
  const properties = Array.isArray(line.properties)
    ? line.properties.map(item => ({ name: text(item?.name, 120), value: text(item?.value, 1000) })).filter(item => item.name)
    : [];
  return {
    externalLineId: text(line.id, 120),
    productExternalId: text(line.product_id, 120),
    variantExternalId: text(line.variant_id, 120),
    sku: text(line.sku, 200),
    name: text(line.name || line.title, 240),
    variantTitle: text(line.variant_title, 200),
    quantity: Math.max(0, Math.round(Number(line.quantity || 0))),
    unitPrice: money(line.price),
    totalDiscount: money(line.total_discount),
    taxable: line.taxable !== false,
    taxLines: Array.isArray(line.tax_lines) ? line.tax_lines.map(tax => ({ title: text(tax.title, 120), rate: Number(tax.rate || 0), price: money(tax.price) })) : [],
    properties
  };
}

function normalizeOrder(order = {}, metadata = {}) {
  const lineItems = Array.isArray(order.line_items) ? order.line_items.map(normalizeLine) : [];
  const financialStatus = text(order.financial_status, 60).toLowerCase();
  const cancelled = Boolean(order.cancelled_at || order.cancel_reason);
  return {
    source: 'shopify',
    externalOrderId: text(order.id, 160),
    orderNumber: text(order.order_number || order.name, 100),
    name: text(order.name, 100),
    email: text(order.email || order.contact_email, 240).toLowerCase(),
    phone: text(order.phone || order.customer?.phone, 60),
    customerExternalId: text(order.customer?.id, 160),
    customerName: text([order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' '), 200),
    currency: text(order.currency, 12).toUpperCase(),
    subtotal: money(order.current_subtotal_price ?? order.subtotal_price),
    discounts: money(order.current_total_discounts ?? order.total_discounts),
    shipping: money(order.total_shipping_price_set?.shop_money?.amount),
    tax: money(order.current_total_tax ?? order.total_tax),
    total: money(order.current_total_price ?? order.total_price),
    financialStatus,
    fulfillmentStatus: text(order.fulfillment_status || 'unfulfilled', 60).toLowerCase(),
    cancelled,
    paid: ['paid', 'partially_refunded'].includes(financialStatus) && !cancelled,
    billingAddress: normalizeAddress(order.billing_address),
    shippingAddress: normalizeAddress(order.shipping_address),
    lineItems,
    note: text(order.note, 2000),
    tags: text(order.tags, 500),
    createdAt: text(order.created_at, 80),
    updatedAt: text(order.updated_at, 80),
    shopDomain: text(metadata.shopDomain, 255),
    webhookId: text(metadata.webhookId, 160),
    topic: text(metadata.topic, 120)
  };
}

function orderExceptions(order = {}, mappings = new Map()) {
  const errors = [];
  if (!order.externalOrderId) errors.push({ code: 'missing_order_id', message: 'Pedido Shopify sem identificador.' });
  if (!order.lineItems?.length) errors.push({ code: 'missing_lines', message: 'Pedido Shopify sem linhas.' });
  if (!order.paid) errors.push({ code: order.cancelled ? 'cancelled' : 'payment_pending', message: order.cancelled ? 'Pedido cancelado.' : 'Pagamento ainda não confirmado.' });
  (order.lineItems || []).forEach((line, index) => {
    const keys = [line.sku, line.variantExternalId, line.productExternalId].filter(Boolean).map(String);
    if (!keys.some(key => mappings.has(key.toLowerCase()))) errors.push({ code: 'unmapped_line', line: index + 1, key: keys[0] || '', message: `Linha ${index + 1} sem mapeamento de produto.` });
    const hasFiles = line.properties.some(property => /file|ficheiro|upload|art|imagem|image|design/i.test(property.name) && property.value);
    const expectsCustomization = line.properties.some(property => /personal|texto|nome|cor|medida|tamanho/i.test(property.name));
    if (expectsCustomization && !hasFiles) errors.push({ code: 'missing_artwork', line: index + 1, message: `Linha ${index + 1} personalizada sem ficheiro de arte identificado.` });
  });
  return errors;
}

function mappingForLine(line = {}, mappings = new Map()) {
  const keys = [line.sku, line.variantExternalId, line.productExternalId].filter(Boolean).map(value => String(value).toLowerCase());
  for (const key of keys) if (mappings.has(key)) return mappings.get(key);
  return null;
}

function toCrmOrder(order = {}, mappings = new Map(), options = {}) {
  const now = options.now || new Date().toISOString();
  return {
    numero: order.name || order.orderNumber || `SHOPIFY-${order.externalOrderId}`,
    cliente: order.customerName || order.email || 'Cliente Shopify',
    email: order.email || '',
    telefone: order.phone || '',
    status: order.cancelled ? 'cancelado' : 'processamento',
    origem: 'shopify',
    source: 'shopify',
    externalOrderId: order.externalOrderId,
    shopifyOrderId: order.externalOrderId,
    shopifyDomain: order.shopDomain,
    moeda: order.currency || 'EUR',
    subtotal: order.subtotal,
    desconto: order.discounts,
    portes: order.shipping,
    iva: order.tax,
    total: order.total,
    pago: order.paid,
    paymentStatus: order.financialStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    moradaFaturacao: order.billingAddress,
    moradaEntrega: order.shippingAddress,
    observacoes: order.note || '',
    tags: order.tags || '',
    dataEntrada: (order.createdAt || now).slice(0, 10),
    produtos: (order.lineItems || []).map(line => {
      const mapping = mappingForLine(line, mappings) || {};
      return {
        nome: line.name,
        quantidade: line.quantity,
        valor: line.unitPrice,
        desconto: line.totalDiscount,
        productId: mapping.productId || '',
        recipeId: mapping.recipeId || '',
        sku: line.sku,
        externalLineId: line.externalLineId,
        shopifyProductId: line.productExternalId,
        shopifyVariantId: line.variantExternalId,
        personalizacao: line.properties
      };
    }),
    integration: { source: 'shopify', webhookId: order.webhookId, topic: order.topic, importedAt: now }
  };
}

function reconcileOrders(shopifyOrders = [], crmOrders = []) {
  const external = new Map(shopifyOrders.map(order => [String(order.externalOrderId || order.id), order]));
  const internal = new Map(crmOrders.map(order => [String(order.externalOrderId || order.shopifyOrderId), order]));
  const missingInCrm = [];
  const missingInShopify = [];
  const mismatches = [];
  external.forEach((order, id) => {
    const crm = internal.get(id);
    if (!crm) return missingInCrm.push({ externalOrderId: id, orderNumber: order.name || order.orderNumber || '' });
    const differences = [];
    if (Math.abs(money(order.total) - money(crm.total)) > 0.01) differences.push('total');
    if (order.financialStatus && crm.paymentStatus && String(order.financialStatus).toLowerCase() !== String(crm.paymentStatus).toLowerCase()) differences.push('paymentStatus');
    if (differences.length) mismatches.push({ externalOrderId: id, differences, shopify: { total: money(order.total), paymentStatus: order.financialStatus }, crm: { total: money(crm.total), paymentStatus: crm.paymentStatus } });
  });
  internal.forEach((order, id) => { if (!external.has(id)) missingInShopify.push({ externalOrderId: id, orderNumber: order.numero || '' }); });
  return { checkedShopify: external.size, checkedCrm: internal.size, missingInCrm, missingInShopify, mismatches, ok: !missingInCrm.length && !missingInShopify.length && !mismatches.length };
}

module.exports = { mappingForLine, normalizeAddress, normalizeLine, normalizeOrder, orderExceptions, reconcileOrders, toCrmOrder, validShopDomain, verifyWebhook, webhookMetadata };
