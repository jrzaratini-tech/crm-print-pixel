'use strict';

const MOLONI_API_BASE = 'https://api.moloni.pt/v1';
const MOLONI_OAUTH_URL = 'https://www.moloni.pt/ac/root/oauth/';

function roundMoney(value) {
  const parsed = Number.parseFloat(String(value || 0).replace(',', '.'));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function cleanText(value, maxLength = 255) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeDocumentType(value) {
  const type = cleanText(value, 40);
  if (!['invoice', 'invoice_receipt', 'receipt'].includes(type)) {
    throw new Error('Tipo de documento Moloni invalido.');
  }
  return type;
}

function paidPayments(order = {}) {
  return (Array.isArray(order.pagamentos) ? order.pagamentos : [])
    .filter(payment => payment && payment.status === 'pago')
    .map((payment, index) => ({
      id: cleanText(payment.id || `payment-${index + 1}`, 120),
      type: cleanText(payment.tipo || 'pagamento', 40),
      date: cleanText(payment.data || payment.date || new Date().toISOString().slice(0, 10), 10),
      value: roundMoney(payment.valor),
      method: cleanText(payment.formaPagamento || 'outro', 80),
      notes: cleanText(payment.observacoes, 300)
    }))
    .filter(payment => payment.value > 0);
}

function orderTotals(order = {}) {
  const total = roundMoney(order.total);
  const paid = roundMoney(paidPayments(order).reduce((sum, payment) => sum + payment.value, 0));
  return {
    total,
    paid,
    outstanding: Math.max(0, roundMoney(total - paid))
  };
}

function selectPayment(order, paymentId) {
  const payments = paidPayments(order);
  if (!paymentId) return payments[payments.length - 1] || null;
  return payments.find(payment => payment.id === paymentId) || null;
}

function validateFiscalOrder(order = {}) {
  const errors = [];
  if (!cleanText(order.cliente)) errors.push('Nome do cliente em falta.');
  const nif = cleanText(order.nif).replace(/\D/g, '');
  if (nif && !/^\d{9}$/.test(nif)) errors.push('O NIF deve ter 9 digitos.');
  if (!Array.isArray(order.produtos) || !order.produtos.length) errors.push('O pedido nao tem produtos.');
  if (!(roundMoney(order.total) > 0)) errors.push('O total do pedido deve ser superior a zero.');
  return errors;
}

function documentLabel(type) {
  return {
    invoice: 'Fatura',
    invoice_receipt: 'Fatura-Recibo',
    receipt: 'Recibo'
  }[type] || type;
}

function stableReference(value, prefix = 'CRM') {
  const source = cleanText(value, 180).toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  let hash = 0;
  for (const char of cleanText(value, 220)) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `${prefix}-${source || 'ARTIGO'}-${Math.abs(hash).toString(36).toUpperCase()}`.slice(0, 60);
}

function classifyLineNature(product = {}) {
  const source = [product.nome, product.produto, product.categoria, product.tamanho, product.observacoes]
    .map(value => cleanText(value, 120).toLowerCase())
    .join(' ');
  if (/instala|montagem|aplica[cç][aã]o|coloca[cç][aã]o/.test(source)) return 'service';
  if (/desloca|transporte|entrega|viagem/.test(source)) return 'service';
  if (/servi[cç]o|m[aã]o de obra|arte|design|projeto|or[cç]amento/.test(source)) return 'service';
  return 'product';
}

function recommendDocumentAction({ order = {}, documents = [] } = {}) {
  const totals = orderTotals(order);
  const activeDocuments = (Array.isArray(documents) ? documents : []).filter(document => document && document.state !== 'error');
  const saleDocument = activeDocuments.find(document => ['invoice', 'invoice_receipt'].includes(document.type));
  const receiptDocuments = activeDocuments.filter(document => document.type === 'receipt');
  const receipted = roundMoney(receiptDocuments.reduce((sum, document) => sum + roundMoney(document.value), 0));
  const pendingReceipt = Math.max(0, roundMoney(totals.paid - receipted));

  if (!(totals.total > 0)) {
    return {
      type: 'blocked',
      documentType: 'invoice',
      title: 'Pedido sem valor para faturar',
      message: 'Este pedido não tem total positivo. Corrija o pedido antes de criar documentos fiscais.',
      amount: 0
    };
  }

  if (!saleDocument) {
    if (totals.paid >= totals.total && totals.paid <= totals.total + 0.009) {
      return {
        type: 'invoice_receipt',
        documentType: 'invoice_receipt',
        title: 'Recomendado: Fatura-Recibo',
        message: 'O pedido está totalmente pago e ainda não tem documento de venda. A opção mais direta é emitir Fatura-Recibo.',
        amount: totals.total
      };
    }
    if (totals.paid > 0 && totals.paid < totals.total) {
      return {
        type: 'invoice_then_receipt',
        documentType: 'invoice',
        title: 'Recomendado: Fatura primeiro, depois Recibo parcial',
        message: `O cliente já pagou ${totals.paid.toFixed(2)} mas ainda falta ${totals.outstanding.toFixed(2)}. Emita primeiro a Fatura do total; depois emita Recibo do pagamento recebido.`,
        amount: totals.total,
        receiptAmount: totals.paid
      };
    }
    return {
      type: 'invoice',
      documentType: 'invoice',
      title: 'Recomendado: Fatura',
      message: 'Ainda não há pagamento registado para este pedido. Emita Fatura e depois crie recibos à medida que o cliente pagar.',
      amount: totals.total
    };
  }

  if (saleDocument.type === 'invoice_receipt') {
    return {
      type: 'complete',
      documentType: 'invoice_receipt',
      title: 'Pedido já faturado e recebido',
      message: 'Este pedido já tem Fatura-Recibo. Não é necessário criar novo documento de venda.',
      amount: 0
    };
  }

  if (pendingReceipt > 0.009) {
    return {
      type: 'receipt',
      documentType: 'receipt',
      title: 'Recomendado: Recibo',
      message: `A Fatura já existe e há ${pendingReceipt.toFixed(2)} recebido ainda sem recibo. Emita Recibo para conciliar esse pagamento.`,
      amount: pendingReceipt
    };
  }

  if (totals.outstanding > 0.009) {
    return {
      type: 'wait_payment',
      documentType: 'receipt',
      title: 'Aguardar próximo pagamento',
      message: `A Fatura já existe e os pagamentos registados já estão conciliados. Falta receber ${totals.outstanding.toFixed(2)}.`,
      amount: 0
    };
  }

  return {
    type: 'complete',
    documentType: 'receipt',
    title: 'Pedido faturado e recebido',
    message: 'A Fatura já existe e os pagamentos registados estão conciliados.',
    amount: 0
  };
}

function buildDocumentPreview({ order, type, paymentId, amount, issueDate }) {
  const documentType = normalizeDocumentType(type);
  const errors = validateFiscalOrder(order);
  const totals = orderTotals(order);
  const payments = paidPayments(order);
  const payment = selectPayment(order, paymentId);
  const requestedAmount = roundMoney(amount);
  const date = cleanText(issueDate || new Date().toISOString().slice(0, 10), 10);

  if (documentType === 'receipt' && !payment && !(requestedAmount > 0)) {
    errors.push('Selecione um pagamento ou indique o valor do recibo.');
  }
  if (documentType === 'invoice_receipt' && totals.paid < totals.total) {
    errors.push('A Fatura-Recibo exige que o pedido esteja totalmente pago.');
  }
  if (documentType === 'invoice_receipt' && totals.paid > totals.total) {
    errors.push('Os pagamentos registados ultrapassam o total do pedido.');
  }

  const receiptValue = documentType === 'receipt'
    ? Math.min(totals.total, requestedAmount || payment?.value || 0)
    : documentType === 'invoice_receipt' ? totals.total : 0;

  const products = (Array.isArray(order.produtos) ? order.produtos : []).map((product, index) => ({
    order: index + 1,
    name: cleanText(product.nome || 'Produto', 160),
    summary: cleanText([product.tamanho, product.observacoes].filter(Boolean).join(' - '), 250),
    qty: Math.max(0.01, roundMoney(product.quantidade || 1)),
    price: roundMoney(product.valor),
    vatIncluded: product.comIVA !== 'nao',
    nature: classifyLineNature(product),
    reference: stableReference(product.referencia || product.sku || product.nome || `produto-${index + 1}`, classifyLineNature(product) === 'service' ? 'CRM-S' : 'CRM-P')
  }));

  const installation = roundMoney(order.instalacao);
  if (installation > 0) {
    products.push({
      order: products.length + 1,
      name: 'Instalacao / deslocacao',
      summary: '',
      qty: 1,
      price: installation,
      vatIncluded: order.comIVA !== 'nao',
      nature: 'service',
      reference: stableReference('Instalacao / deslocacao', 'CRM-S')
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    type: documentType,
    label: documentLabel(documentType),
    issueDate: date,
    order: {
      id: cleanText(order.id, 160),
      number: cleanText(order.numero, 80),
      customer: cleanText(order.cliente, 160),
      company: cleanText(order.empresa, 160),
      vat: cleanText(order.nif).replace(/\D/g, ''),
      address: cleanText(order.morada, 250),
      phone: cleanText(order.telemovel, 50)
    },
    products,
    totals,
    payments,
    payment,
    receiptValue,
    reference: `CRM-${cleanText(order.numero || order.id, 80)}`,
    idempotencyKey: [
      cleanText(order.id, 160),
      documentType,
      documentType === 'receipt' ? cleanText(payment?.id || receiptValue, 120) : 'sale'
    ].join(':')
  };
}

function flattenForm(value, prefix = '', output = new URLSearchParams()) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenForm(item, `${prefix}[${index}]`, output));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => {
      flattenForm(nested, prefix ? `${prefix}[${key}]` : key, output);
    });
  } else if (value !== undefined && value !== null) {
    output.append(prefix, String(value));
  }
  return output;
}

function moloniDocumentResult(result = {}) {
  const directIdKeys = new Set([
    'document_id',
    'documentId',
    'invoice_id',
    'invoiceId',
    'invoice_receipt_id',
    'invoiceReceiptId',
    'receipt_id',
    'receiptId'
  ]);
  const numberKeys = new Set([
    'document_number',
    'documentNumber',
    'invoice_number',
    'invoiceNumber',
    'receipt_number',
    'receiptNumber',
    'number'
  ]);
  const normalize = value => {
    const clean = cleanText(value, 120);
    return clean && clean !== '0' ? clean : '';
  };
  const find = (value, path = []) => {
    if (!value || typeof value !== 'object') return { id: '', number: '' };
    const entries = Array.isArray(value)
      ? value.map((item, index) => [String(index), item])
      : Object.entries(value);
    let number = '';
    for (const [key, nested] of entries) {
      if (!number && numberKeys.has(key)) number = normalize(nested);
    }
    for (const [key, nested] of entries) {
      if (directIdKeys.has(key)) {
        const id = normalize(nested);
        if (id) return { id, number };
      }
    }
    for (const [key, nested] of entries) {
      if (key === 'id' && /document|invoice|receipt/i.test(path.join('.'))) {
        const id = normalize(nested);
        if (id) return { id, number };
      }
      const found = find(nested, [...path, key]);
      if (found.id) return { id: found.id, number: found.number || number };
      if (!number && found.number) number = found.number;
    }
    if (!path.length && Object.prototype.hasOwnProperty.call(value, 'id')) {
      const id = normalize(value.id);
      if (id) return { id, number };
    }
    return { id: '', number };
  };
  const found = find(result);
  return {
    id: found.id,
    number: found.number,
    raw: result
  };
}

function oauthAuthorizationUrl({ clientId, redirectUri, state }) {
  const url = new URL(MOLONI_OAUTH_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  return url.toString();
}

class MoloniClient {
  constructor({ accessToken, fetchImpl = fetch }) {
    this.accessToken = accessToken;
    this.fetchImpl = fetchImpl;
  }

  async call(endpoint, payload = {}) {
    const url = new URL(`${MOLONI_API_BASE}/${endpoint.replace(/^\/+/, '')}/`);
    url.searchParams.set('access_token', this.accessToken);
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: flattenForm(payload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.error || body?.valid === 0) {
      const error = new Error(body?.error_description || body?.message || 'Erro devolvido pela API Moloni.');
      error.status = response.status;
      error.details = body;
      throw error;
    }
    return body;
  }
}

module.exports = {
  MOLONI_API_BASE,
  MoloniClient,
  buildDocumentPreview,
  cleanText,
  classifyLineNature,
  documentLabel,
  flattenForm,
  moloniDocumentResult,
  oauthAuthorizationUrl,
  orderTotals,
  paidPayments,
  recommendDocumentAction,
  roundMoney
};
