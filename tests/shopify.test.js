const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const SHOPIFY = require('../core/shopify.js');

test('valida HMAC Shopify sobre o corpo bruto e domínio oficial', () => {
  const body = Buffer.from('{"id":123}');
  const secret = 'shopify-secret';
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64');
  assert.equal(SHOPIFY.verifyWebhook(body, signature, secret), true);
  assert.equal(SHOPIFY.verifyWebhook(Buffer.from('{"id":999}'), signature, secret), false);
  assert.equal(SHOPIFY.validShopDomain('print-pixel.myshopify.com'), true);
  assert.equal(SHOPIFY.validShopDomain('print-pixel.myshopify.com.attacker.test'), false);
});

test('normaliza pedido Shopify e bloqueia produção sem pagamento ou mapeamento', () => {
  const order = SHOPIFY.normalizeOrder({
    id: 123, name: '#1001', email: 'CLIENTE@EXAMPLE.COM', currency: 'EUR', financial_status: 'pending',
    subtotal_price: '100.00', total_tax: '23.00', total_price: '123.00',
    line_items: [{ id: 9, product_id: 10, variant_id: 11, sku: 'NEON-01', name: 'Neon', quantity: 1, price: '100.00', properties: [{ name: 'Texto personalizado', value: 'Pixel' }] }]
  });
  assert.equal(order.total, 123);
  assert.equal(order.email, 'cliente@example.com');
  const errors = SHOPIFY.orderExceptions(order, new Map());
  assert.ok(errors.some(item => item.code === 'payment_pending'));
  assert.ok(errors.some(item => item.code === 'unmapped_line'));
  assert.ok(errors.some(item => item.code === 'missing_artwork'));
});

test('pedido pago e mapeado fica elegível quando contém arte', () => {
  const order = SHOPIFY.normalizeOrder({
    id: 124, financial_status: 'paid', line_items: [{ sku: 'NEON-01', quantity: 1, properties: [{ name: 'Ficheiro', value: 'https://cdn.example/art.svg' }, { name: 'Texto', value: 'Pixel' }] }]
  });
  assert.deepEqual(SHOPIFY.orderExceptions(order, new Map([['neon-01', { productId: 'default-neon-led' }]])), []);
  const crm = SHOPIFY.toCrmOrder(order, new Map([['neon-01', { productId: 'default-neon-led', recipeId: 'recipe-neon-v1' }]]), { now: '2026-10-20T12:00:00.000Z' });
  assert.equal(crm.origem, 'shopify');
  assert.equal(crm.produtos[0].productId, 'default-neon-led');
  assert.equal(crm.produtos[0].recipeId, 'recipe-neon-v1');
});

test('SKUs padronizados do editor Shopify são mapeados pela família', () => {
  const order = SHOPIFY.normalizeOrder({
    id: 1015,
    name: '#1015',
    financial_status: 'paid',
    line_items: [{
      sku: 'PP-CUSTOM-LABEL-REDONDO-500-MATE',
      name: 'Rótulos personalizados',
      quantity: 1,
      price: '9.90',
      properties: [{ name: 'Formato', value: 'Redondo' }]
    }]
  });
  assert.equal(SHOPIFY.orderExceptions(order, new Map()).some(item => item.code === 'unmapped_line'), false);
  const crm = SHOPIFY.toCrmOrder(order, new Map(), { now: '2026-10-23T12:33:00.000Z' });
  assert.equal(crm.produtos[0].productId, 'default-rotulos-personalizados');
  assert.equal(crm.produtos[0].sku, 'PP-CUSTOM-LABEL-REDONDO-500-MATE');
});

test('todo o catálogo ativo da loja possui mapeamento redundante no CRM', () => {
  const products = [
    ['10964933017937', 'PP-SQUARE-STICKER-35-50-MATE', 'Autocolante com corte na silhueta', 'default-autocolante-com-corte-na-silhueta'],
    ['11017702015313', 'PP-LASER-RETANGULAR-ESPELHO-DOURADO-SEM', 'Corte Laser Personalizado 3 mm', 'default-corte-laser-personalizado-3-mm'],
    ['11016801026385', 'PP-MULTICUT-1000X600-NOMASK', 'Folha de Autocolantes com Recorte', 'default-folha-de-autocolantes-com-recorte'],
    ['10975816155473', 'LONA-440', 'Lona personalizada', 'default-lona-personalizada'],
    ['11015974617425', 'PP-LABEL-PACK-205', 'Pack de Etiquetas Personalizadas 205 un', 'default-pack-de-etiquetas-personalizadas-205-un'],
    ['10975904072017', 'PLACA-PVC-5MM', 'Placa personalizada', 'default-placa-personalizada'],
    ['10975963775313', 'PP-ROLLUP-85X200-1', 'Roll-up personalizado', 'default-roll-up-personalizado'],
    ['10964932755793', 'PP-CUSTOM-LABEL-RETANGULAR-50-MATE', 'Rótulos personalizados', 'default-rotulos-personalizados'],
    ['10975963840849', 'PP-XBANNER-80X180-1', 'X-banner personalizado', 'default-x-banner-personalizado']
  ];
  for (const [productExternalId, sku, name, productId] of products) {
    assert.equal(SHOPIFY.standardSiteMapping({ productExternalId, sku: '', name }).productId, productId);
    assert.equal(SHOPIFY.standardSiteMapping({ productExternalId: '', sku, name: '' }).productId, productId);
    assert.equal(SHOPIFY.standardSiteMapping({ productExternalId: '', sku: '', name: `${name} - variante` }).productId, productId);
  }
});

test('levantamento em loja aceita moradas nulas e preserva dados fiscais e pagamento', () => {
  const order = SHOPIFY.normalizeOrder({
    id: 1014,
    name: '#1014',
    financial_status: 'paid',
    currency: 'EUR',
    total_price: '22.14',
    created_at: '2026-10-22T18:45:00.000Z',
    updated_at: '2026-10-22T18:46:00.000Z',
    customer: { first_name: 'Juliana', last_name: 'Leite' },
    billing_address: null,
    shipping_address: null,
    note_attributes: [{ name: 'NIF', value: '123 456 789' }],
    shipping_lines: [{ title: 'Recolha Local da loja', price: '0.00' }],
    line_items: [{ id: 1, product_id: 2, variant_id: 3, sku: 'PP-MULTICUT-1000X600-NOMASK', name: 'Folha de Autocolantes com Recorte', quantity: 1, price: '18.00', properties: [] }]
  });
  assert.equal(order.pickup, true);
  assert.equal(order.fulfillmentMode, 'pickup');
  assert.equal(order.taxId, '123456789');
  assert.deepEqual(order.shippingAddress, { name: '', company: '', address1: '', address2: '', city: '', province: '', postalCode: '', country: '', phone: '' });

  const mapping = new Map([['pp-multicut-1000x600-nomask', { productId: 'default-adesivo-vinil-impresso-com-recorte' }]]);
  assert.deepEqual(SHOPIFY.orderExceptions(order, mapping), []);
  const crm = SHOPIFY.toCrmOrder(order, mapping, { now: '2026-10-22T18:46:00.000Z' });
  assert.equal(crm.levantamentoLoja, true);
  assert.equal(crm.morada, '');
  assert.equal(crm.nif, '123456789');
  assert.equal(crm.pagamentos[0].status, 'pago');
  assert.equal(crm.totalPago, 22.14);
  assert.equal(crm.saldoPendente, 0);
});

test('reconciliação deteta pedidos ausentes e divergências de valor', () => {
  const report = SHOPIFY.reconcileOrders([
    { externalOrderId: '1', name: '#1', total: 123, financialStatus: 'paid' },
    { externalOrderId: '2', name: '#2', total: 50, financialStatus: 'paid' }
  ], [
    { externalOrderId: '1', numero: '#1', total: 120, paymentStatus: 'paid' },
    { externalOrderId: '3', numero: '#3', total: 75, paymentStatus: 'paid' }
  ]);
  assert.equal(report.ok, false);
  assert.equal(report.missingInCrm[0].externalOrderId, '2');
  assert.equal(report.missingInShopify[0].externalOrderId, '3');
  assert.deepEqual(report.mismatches[0].differences, ['total']);
});
