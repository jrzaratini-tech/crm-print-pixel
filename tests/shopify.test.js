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
