const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { app } = require('../server.js');
const { db } = require('../firebase.js');
const ROTULOS = require('../core/rotulos.js');
const FINANCEIRO = require('../core/financeiro.js');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});

async function request(path, options = {}) {
  const response = await fetch(baseUrl + path, options);
  const contentType = response.headers.get('content-type') || '';
  return {
    response,
    body: contentType.includes('application/json') ? await response.json() : await response.text()
  };
}

async function post(path, body) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function mobilePost(path, body, token) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
}

async function workerRequest(path, token, options = {}) {
  return request(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
}

async function workerPost(path, body, token) {
  return workerRequest(path, token, { method: 'POST', body: JSON.stringify(body) });
}

test('responde erros de API em JSON', async () => {
  const missing = await request('/api/rota-inexistente');
  assert.equal(missing.response.status, 404);
  assert.equal(missing.response.headers.get('content-type').includes('application/json'), true);
  assert.equal(missing.body.success, false);
  assert.equal(missing.body.message, 'API nao encontrada.');

  const invalidJson = await request('/api/expenses/despesa-teste/classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"supplierName":'
  });
  assert.equal(invalidJson.response.status, 400);
  assert.equal(invalidJson.response.headers.get('content-type').includes('application/json'), true);
  assert.equal(invalidJson.body.message, 'JSON invalido na requisicao.');
});

test('não publica arquivos internos', async () => {
  for (const path of ['/server.js', '/firebase.js', '/package.json', '/DATA/database/core.db', '/core/database.js']) {
    const { response } = await request(path);
    assert.equal(response.status, 404, path);
  }
});

test('publica modulo de custeio e pagina de materiais', async () => {
  const moduleResult = await request('/core/custeio.js');
  const presetsResult = await request('/core/materiais-padrao.js');
  const financialResult = await request('/core/financeiro.js');
  const fiscalQrResult = await request('/core/qr-fiscal.js');
  const managementModuleResult = await request('/core/gestao.js');
  const menuResult = await request('/menu/menu.config.js');
  const pageResult = await request('/pages/materiais.html');
  const expensesPageResult = await request('/pages/despesas.html');
  const orderFormPageResult = await request('/pages/novopedido.html');
  const orderBudgetPageResult = await request('/pages/novoorcamento.html');
  const calculatorPageResult = await request('/pages/calculadora.html');
  const productsPageResult = await request('/pages/produtos.html');
  const ordersPageResult = await request('/pages/pedidos.html');
  const billingPageResult = await request('/pages/faturacao.html');
  const dashboardPageResult = await request('/pages/dashboard.html');
  const scanPageResult = await request('/scan-fatura.html');
  const mobilePageResult = await request('/mobile/');
  const mobileQrLibraryResult = await request('/mobile/vendor/jsQR.js');
  const linksPageResult = await request('/pages/links.html');
  const suppliersPageResult = await request('/pages/fornecedores.html');
  const classifyExpensesPageResult = await request('/pages/classificar-despesas.html');
  const commissionsPageResult = await request('/pages/comissoes.html');
  const inboxPageResult = await request('/pages/importacoes-fiscais.html');
  const productionPageResult = await request('/pages/ordemproducao.html');
  const workerAppResult = await request('/colaborador/');
  const sellerAppResult = await request('/vendedor/');
  const sellerScriptResult = await request('/vendedor/app.js');
  const workerStylesResult = await request('/colaborador/styles.css');
  const workerScriptResult = await request('/colaborador/app.js');
  const labelsAdminPageResult = await request('/pages/rotulos.html');
  const labelsPortalResult = await request('/rotulos/');
  const labelsPreviewResult = await request('/rotulos/previews/proteico-grande.webp');
  assert.equal(moduleResult.response.status, 200);
  assert.equal(presetsResult.response.status, 200);
  assert.equal(financialResult.response.status, 200);
  assert.equal(fiscalQrResult.response.status, 200);
  assert.equal(managementModuleResult.response.status, 200);
  assert.equal(menuResult.response.status, 200);
  assert.equal(pageResult.response.status, 200);
  assert.equal(expensesPageResult.response.status, 200);
  assert.equal(orderFormPageResult.response.status, 200);
  assert.equal(orderBudgetPageResult.response.status, 200);
  assert.equal(calculatorPageResult.response.status, 200);
  assert.equal(productsPageResult.response.status, 200);
  assert.equal(ordersPageResult.response.status, 200);
  assert.equal(billingPageResult.response.status, 200);
  assert.equal(dashboardPageResult.response.status, 200);
  assert.equal(scanPageResult.response.status, 200);
  assert.equal(mobilePageResult.response.status, 200);
  assert.equal(mobileQrLibraryResult.response.status, 200);
  assert.equal(linksPageResult.response.status, 200);
  assert.equal(suppliersPageResult.response.status, 200);
  assert.equal(classifyExpensesPageResult.response.status, 200);
  assert.equal(commissionsPageResult.response.status, 200);
  assert.equal(inboxPageResult.response.status, 200);
  assert.equal(productionPageResult.response.status, 200);
  assert.equal(workerAppResult.response.status, 200);
  assert.equal(sellerAppResult.response.status, 200);
  assert.equal(sellerScriptResult.response.status, 200);
  assert.equal(workerStylesResult.response.status, 200);
  assert.equal(workerScriptResult.response.status, 200);
  assert.equal(labelsAdminPageResult.response.status, 200);
  assert.equal(labelsPortalResult.response.status, 200);
  assert.equal(labelsPreviewResult.response.status, 200);
  assert.match(moduleResult.body, /calcularFicha/);
  assert.match(presetsResult.body, /Fonte de alimentação/);
  assert.match(financialResult.body, /faturamentoSemIva/);
  assert.match(fiscalQrResult.body, /interpretar/);
  assert.match(managementModuleResult.body, /painelGestao/);
  assert.match(menuResult.body, /nav_calculadora/);
  assert.match(menuResult.body, /nav_produtos/);
  assert.match(menuResult.body, /nav_faturacao/);
  assert.match(menuResult.body, /pages\/calculadora\.html/);
  assert.match(menuResult.body, /pages\/produtos\.html/);
  assert.match(menuResult.body, /pages\/rotulos\.html/);
  assert.match(labelsAdminPageResult.body, /Portal de Rótulos/);
  assert.match(labelsAdminPageResult.body, /api\/rotulos\/orders/);
  assert.match(labelsAdminPageResult.body, /Baixar todos EPS/);
  assert.match(labelsPortalResult.body, /Pedidos de rótulos/);
  assert.match(labelsPortalResult.body, /api\/rotulos\/public\/orders/);
  assert.match(pageResult.body, /Cadastro de Materiais/);
  assert.match(pageResult.body, /Hora de maquina \/ mao de obra/);
  assert.match(presetsResult.body, /Router CNC/);
  assert.match(productsPageResult.body, /Cadastro de Produtos/);
  assert.match(productsPageResult.body, /api\/products/);
  assert.match(productsPageResult.body, /tipoProduto/);
  assert.match(productsPageResult.body, /precoVenda/);
  assert.match(productsPageResult.body, /Produto loja \/ preco fixo/);
  assert.match(orderFormPageResult.body, /delivery-btn/);
  assert.match(orderFormPageResult.body, /loadProductCatalog/);
  assert.match(orderFormPageResult.body, /product-delivered/);
  assert.match(orderFormPageResult.body, /pedido\.produtos\.\$\{index\}\.entregue/);
  assert.match(orderFormPageResult.body, /window\.location\.href = 'pedidos\.html'/);
  assert.match(orderFormPageResult.body, /window\.addEventListener\('coreCommitSuccess'/);
  assert.match(orderFormPageResult.body, /setAttribute\('data-original-text', 'ATUALIZAR PEDIDO'\)/);
  assert.match(orderFormPageResult.body, /sellerCommissionRate/);
  assert.match(orderFormPageResult.body, /sellerCommissionValue/);
  assert.match(orderFormPageResult.body, /item-iva-select/);
  assert.match(orderFormPageResult.body, /buyerSellerId/);
  assert.match(ordersPageResult.body, /excluirPedido/);
  assert.match(ordersPageResult.body, /faturacao\.html\?orderId=/);
  assert.match(billingPageResult.body, /Faturação Moloni/);
  assert.match(billingPageResult.body, /api\/moloni\/documents\/preview/);
  assert.match(billingPageResult.body, /Modo de teste/);
  assert.match(billingPageResult.body, /button type="button" class="order/);
  assert.match(billingPageResult.body, /recommendationBox/);
  assert.match(billingPageResult.body, /defaultProductCategory/);
  assert.match(billingPageResult.body, /defaultUnit/);
  assert.match(billingPageResult.body, /autoCreateProducts/);
  assert.match(billingPageResult.body, /\{\s*\.\.\.\(event\.payload \|\| \{\}\), id: event\.id\s*\}/);
  assert.match(billingPageResult.body, /Recomendado: Fatura primeiro, depois Recibo parcial/);
  assert.match(ordersPageResult.body, /hardDelete: true/);
  assert.match(expensesPageResult.body, /excluirDespesa/);
  assert.match(expensesPageResult.body, /hardDelete: true/);
  assert.match(orderBudgetPageResult.body, /Letra Caixa PETG 3D/);
  assert.match(orderBudgetPageResult.body, /loadProductCatalog/);
  assert.match(orderBudgetPageResult.body, /descontoOrcamento/);
  assert.match(orderBudgetPageResult.body, /valorInstalacao/);
  assert.match(orderBudgetPageResult.body, /margemDesejadaOrcamento/);
  assert.match(orderBudgetPageResult.body, /sellerExtraMarkup/);
  assert.match(orderBudgetPageResult.body, /mountingCommissionRate/);
  assert.match(orderBudgetPageResult.body, /sellerCommissionValue/);
  assert.match(orderBudgetPageResult.body, /addStoreProductBtn/);
  assert.match(orderBudgetPageResult.body, /produto_loja/);
  assert.match(orderBudgetPageResult.body, /data-store-product/);
  assert.match(orderBudgetPageResult.body, /Preco fixo - margem loja 50%/);
  assert.match(orderBudgetPageResult.body, /valor \* 0\.5/);
  assert.match(orderBudgetPageResult.body, /ajustarPrecosParaMargem/);
  assert.match(orderBudgetPageResult.body, /Abrir ficha tecnica/);
  assert.match(orderBudgetPageResult.body, /tech-petg-kg/);
  assert.match(orderBudgetPageResult.body, /tech-petg-horas/);
  assert.match(orderBudgetPageResult.body, /tech-petg-custo-hora/);
  assert.doesNotMatch(orderBudgetPageResult.body, /tech-petg-open-calculator/);
  assert.doesNotMatch(orderBudgetPageResult.body, /petgCalculatorModal/);
  assert.doesNotMatch(orderBudgetPageResult.body, /petgCalculatorBody/);
  assert.doesNotMatch(orderBudgetPageResult.body, /closePetgCalculatorBtn/);
  assert.doesNotMatch(orderBudgetPageResult.body, /savePetgCalculatorBtn/);
  assert.doesNotMatch(orderBudgetPageResult.body, /petg-inline-calculator/);
  assert.doesNotMatch(orderBudgetPageResult.body, /tech-petg-add-entry/);
  assert.doesNotMatch(orderBudgetPageResult.body, /atualizarPreviewPetgItem/);
  assert.match(orderBudgetPageResult.body, /calcularItemTecnico/);
  assert.doesNotMatch(orderBudgetPageResult.body, /Textos e alturas do mesmo trabalho/);
  assert.match(calculatorPageResult.body, /Letras caixa impressas/);
  assert.match(calculatorPageResult.body, /data-calculator-tab="vinyl"/);
  assert.match(calculatorPageResult.body, /data-calculator-tab="partial-vat"/);
  assert.match(calculatorPageResult.body, /Componentes adicionais/);
  assert.doesNotMatch(calculatorPageResult.body, /calculateBtn/);
  assert.doesNotMatch(calculatorPageResult.body, /addEstimatedLedBtn/);
  assert.doesNotMatch(calculatorPageResult.body, /Profundidade padrão \(mm\)/);
  assert.match(calculatorPageResult.body, /petgTotalKg/);
  assert.match(calculatorPageResult.body, /petgTextCount/);
  assert.match(calculatorPageResult.body, /petgPrintTime/);
  assert.match(calculatorPageResult.body, /petgLedAmount/);
  assert.match(calculatorPageResult.body, /id="vinylWidthMm"/);
  assert.match(calculatorPageResult.body, /id="vinylHeightMm"/);
  assert.match(calculatorPageResult.body, /id="vinylQuantity"/);
  assert.match(calculatorPageResult.body, /value="35"/);
  assert.match(calculatorPageResult.body, /value="sheets"/);
  assert.match(calculatorPageResult.body, /value="5"/);
  assert.match(calculatorPageResult.body, /id="partialVatTotal"/);
  assert.match(calculatorPageResult.body, /id="partialVatRate"/);
  assert.match(calculatorPageResult.body, /id="partialVatDepositPercent"/);
  assert.match(calculatorPageResult.body, /id="partialVatInvoicePercent"/);
  assert.match(calculatorPageResult.body, /partialVatPayNow/);
  assert.match(calculatorPageResult.body, /calculatePartialVat/);
  assert.doesNotMatch(calculatorPageResult.body, /vinylSummary/);
  assert.match(pageResult.body, /supplierTableOption/);
  assert.match(pageResult.body, /registerSupplierTableBtn/);
  assert.match(calculatorPageResult.body, /Novo item cadastrado/);
  assert.match(calculatorPageResult.body, /Preço unitário/);
  assert.doesNotMatch(calculatorPageResult.body, /Altura \(cm\)/);
  assert.match(calculatorPageResult.body, /petg-entry-width-mm/);
  assert.match(calculatorPageResult.body, /Preço sugerido/);
  assert.match(ordersPageResult.body, /produto-modal-entregue/);
  assert.match(ordersPageResult.body, /entrega-badge/);
  assert.doesNotMatch(dashboardPageResult.body, /Gest&atilde;o Profissional/);
  assert.match(dashboardPageResult.body, /Ponto de Equilíbrio/);
  assert.match(dashboardPageResult.body, /pontoEquilibrio/);
  assert.match(dashboardPageResult.body, /bateuMeta/);
  assert.match(dashboardPageResult.body, /Faturamento bruto/);
  assert.match(dashboardPageResult.body, /deliveryCalendarBtn/);
  assert.match(dashboardPageResult.body, /deliveryMonthPicker/);
  assert.match(dashboardPageResult.body, /renderDeliveryCalendar/);
  assert.match(dashboardPageResult.body, /plannerFindDate/);
  assert.match(dashboardPageResult.body, /planejarPrazoEntrega/);
  assert.match(dashboardPageResult.body, /holidaysForYear/);
  assert.match(dashboardPageResult.body, /delivery-day .*weekend/);
  assert.match(dashboardPageResult.body, /suggested-delivery/);
  assert.doesNotMatch(dashboardPageResult.body, /plannerDeliveryCapacity/);
  assert.doesNotMatch(dashboardPageResult.body, /plannerProductionCapacity/);
  assert.match(dashboardPageResult.body, /rgba\(34, 197, 94/);
  assert.match(dashboardPageResult.body, /rgba\(239, 68, 68/);
  assert.match(scanPageResult.body, /Ler QR fiscal/);
  assert.match(mobilePageResult.body, /PrintPixel Fiscal/);
  assert.match(mobilePageResult.body, /Despesa da empresa/);
  assert.match(mobilePageResult.body, /Gasto pessoal/);
  assert.match(scanPageResult.body, /Lançar o total pago como SALÁRIO/);
  assert.match(mobilePageResult.body, /vendor\/jsQR\.js/);
  assert.match(workerAppResult.body, /PrintPixel Produ/);
  assert.match(workerAppResult.body, /Entrar no app/);
  assert.match(workerStylesResult.body, /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  assert.match(linksPageResult.body, /PrintPixel Fiscal Móvel/);
  assert.match(linksPageResult.body, /App da produção/);
  assert.match(linksPageResult.body, /Usuários cadastrados/);
  assert.doesNotMatch(linksPageResult.body, /CRM_MOBILE_ACCESS_KEY/);
  assert.match(linksPageResult.body, /openSeller/);
  assert.match(menuResult.body, /nav_fornecedores/);
  assert.match(menuResult.body, /nav_classificar_despesas/);
  assert.match(menuResult.body, /nav_comissoes/);
  assert.match(suppliersPageResult.body, /supplierForm/);
  assert.match(classifyExpensesPageResult.body, /expenses\/unclassified/);
  assert.match(classifyExpensesPageResult.body, /pendingCount/);
  assert.match(classifyExpensesPageResult.body, /Classificando/);
  assert.match(classifyExpensesPageResult.body, /dataset\.nif/);
  assert.match(classifyExpensesPageResult.body, /BRICO DEPÔT/);
  assert.match(suppliersPageResult.body, /BRICO DEPÔT/);
  assert.match(commissionsPageResult.body, /sellerForm/);
  assert.match(sellerAppResult.body, /PrintPixel Vendedor/);
  assert.match(sellerScriptResult.body, /api\/vendedor\/session/);
  assert.match(sellerAppResult.body, /Orçamentos enviados/);
  assert.match(sellerScriptResult.body, /api\/vendedor\/orcamentos/);
  assert.match(productionPageResult.body, /classificationOverlay/);
  assert.match(productionPageResult.body, /workerFilter/);
  assert.match(productionPageResult.body, /Desclassificar e devolver à fila/);
  assert.match(productionPageResult.body, /classificationProduct/);
  assert.match(productionPageResult.body, /Controle de comissoes da producao/);
  assert.match(productionPageResult.body, /data-payment-filter="process"/);
  assert.match(workerAppResult.body, /Concluido a receber/);
  assert.match(workerAppResult.body, /Historico \/ pagos/);
  assert.match(workerAppResult.body, /assignedValue/);
  assert.doesNotMatch(workerScriptResult.body, /Iniciar tempo/);
  assert.doesNotMatch(workerScriptResult.body, /etapas\/tempo/);
  assert.match(workerScriptResult.body, /Todos os processos deste trabalho foram executados/);
  assert.match(productionPageResult.body, /HISTÓRICO DA PRODUÇÃO POR ARTIGO/);
});

test('gerencia catalogo de produtos para pedidos e orcamentos', async () => {
  const initial = await request('/api/products');
  assert.equal(initial.response.status, 200);
  assert.equal(initial.body.success, true);
  assert.equal(initial.body.products.some(product => product.nome === 'Letra Caixa PETG 3D'), true);

  const created = await post('/api/products', {
    nome: 'Produto Teste Catalogo',
    categoria: 'Letreiro',
    descricao: 'Produto criado pelo teste'
  });
  assert.equal(created.response.status, 200);
  assert.equal(created.body.success, true);
  assert.equal(created.body.product.nome, 'Produto Teste Catalogo');

  const updated = await post('/api/products', {
    id: created.body.product.id,
    nome: 'Produto Teste Catalogo Editado',
    categoria: 'ACM',
    descricao: 'Produto editado pelo teste'
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.product.categoria, 'ACM');

  const listed = await request('/api/products');
  assert.equal(listed.body.products.some(product => product.nome === 'Produto Teste Catalogo Editado'), true);

  const storeProduct = await post('/api/products', {
    nome: 'Produto Loja Teste',
    categoria: 'Produtos',
    descricao: 'Produto com preco final',
    tipoProduto: 'loja',
    precoVenda: 123.45,
    custoUnitario: 70,
    sku: 'LOJA-001'
  });
  assert.equal(storeProduct.response.status, 200);
  assert.equal(storeProduct.body.product.tipoProduto, 'loja');
  assert.equal(storeProduct.body.product.precoVenda, 123.45);
  assert.equal(storeProduct.body.product.custoUnitario, 70);
  assert.equal(storeProduct.body.product.sku, 'LOJA-001');

  const listedWithStore = await request('/api/products');
  const savedStoreProduct = listedWithStore.body.products.find(product => product.id === storeProduct.body.product.id);
  assert.equal(savedStoreProduct.nome, 'Produto Loja Teste');
  assert.equal(savedStoreProduct.tipoProduto, 'loja');

  const deleted = await request(`/api/products/${created.body.product.id}/delete`, { method: 'POST' });
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.body.success, true);

  const deletedStore = await request(`/api/products/${storeProduct.body.product.id}/delete`, { method: 'POST' });
  assert.equal(deletedStore.response.status, 200);
  assert.equal(deletedStore.body.success, true);

  const afterDelete = await request('/api/products');
  assert.equal(afterDelete.body.products.some(product => product.id === created.body.product.id), false);
  assert.equal(afterDelete.body.products.some(product => product.id === storeProduct.body.product.id), false);
});

test('classifica OS para colaborador com login sem expor precos e permite chat privado', async () => {
  const order = await post('/api/database/commit', {
    schema: 'pedido',
    pageId: 'test',
    payload: {
      numero: 'PED-PROD-1',
      cliente: 'Cliente Producao',
      empresa: 'Empresa Teste',
      total: 999,
      subtotal: 800,
      produtos: [{ nome: 'Letreiro', tamanho: '100x50', quantidade: 1, valor: 999 }]
    }
  });
  const created = await post('/api/production/workers', { name: 'Montador Teste', username: 'montador.teste', password: 'senha-segura-123', role: 'montagem' });
  assert.equal(created.response.status, 200);
  assert.equal('passwordHash' in created.body.worker, false);
  assert.match(created.body.appUrl, /\/colaborador\/$/);
  const workers = await request('/api/production/workers');
  assert.equal('passwordHash' in workers.body.workers[0], false);
  const deniedLogin = await post('/api/colaborador/login', { username: 'montador.teste', password: 'senha-incorreta' });
  assert.equal(deniedLogin.response.status, 401);
  const login = await post('/api/colaborador/login', { username: 'montador.teste', password: 'senha-segura-123' });
  assert.equal(login.response.status, 200);
  const token = login.body.token;
  assert.match(token, /^[a-f0-9]{96}$/);

  const classified = await post('/api/production/assignments', {
    orderId: order.body.id,
    workerId: created.body.worker.id,
    commission: 75,
    steps: ['montagem_da_estrutura', 'limpeza_embalagem']
  });
  assert.equal(classified.response.status, 200);
  assert.equal(classified.body.assignment.commission, 75);

  const session = await workerRequest('/api/colaborador/session', token);
  assert.equal(session.response.status, 200);
  assert.equal(session.body.assignments.length, 1);
  assert.equal(session.body.assignments[0].order.produtos[0].nome, 'Letreiro');
  assert.equal('valor' in session.body.assignments[0].order.produtos[0], false);
  assert.equal('total' in session.body.assignments[0].order, false);

  const step = await workerPost(`/api/colaborador/ordens/${order.body.id}/etapas`, { stepId: 'limpeza_embalagem', done: true }, token);
  assert.equal(step.response.status, 200);
  assert.equal(step.body.steps.find(item => item.id === 'limpeza_embalagem').done, true);

  const workerChat = await workerPost(`/api/colaborador/ordens/${order.body.id}/chat`, { message: 'Preciso confirmar a fixacao.' }, token);
  assert.equal(workerChat.response.status, 200);
  const adminChat = await post(`/api/production/assignments/${order.body.id}/chat`, { message: 'Confirmado, use buchas metalicas.' });
  assert.equal(adminChat.response.status, 200);
  assert.equal(adminChat.body.messages.length, 2);

  const rotated = await post(`/api/production/workers/${created.body.worker.id}/credentials`, { password: 'nova-senha-segura-456' });
  assert.equal(rotated.response.status, 200);
  const expired = await workerRequest('/api/colaborador/session', token);
  assert.equal(expired.response.status, 401);
  const relogin = await post('/api/colaborador/login', { username: 'montador.teste', password: 'nova-senha-segura-456' });
  assert.equal(relogin.response.status, 200);
  const rotatedToken = relogin.body.token;
  const rotatedSession = await workerRequest('/api/colaborador/session', rotatedToken);
  assert.equal(rotatedSession.response.status, 200);

  const revoked = await post(`/api/production/workers/${created.body.worker.id}/revoke`, {});
  assert.equal(revoked.response.status, 200);
  const blocked = await workerRequest('/api/colaborador/session', rotatedToken);
  assert.equal(blocked.response.status, 401);
});

test('cada colaborador visualiza somente as OS atribuidas a ele independentemente do perfil', async () => {
  const secondOrder = await post('/api/database/commit', { schema: 'pedido', pageId: 'test', payload: { numero: 'PED-PROD-2', cliente: 'Cliente Dois', produtos: [{ nome: 'Painel' }] } });
  const mounting = await post('/api/production/workers', { name: 'Montagem Dois', username: 'montagem.dois', password: 'senha-segura-789', role: 'montagem' });
  const commercial = await post('/api/production/workers', { name: 'Comercial', username: 'comercial', password: 'senha-segura-abc', role: 'comercial' });
  await post('/api/production/assignments', { orderId: secondOrder.body.id, workerId: mounting.body.worker.id, commission: 50, steps: ['limpeza_embalagem'] });
  const mountingLogin = await post('/api/colaborador/login', { username: 'montagem.dois', password: 'senha-segura-789' });
  const commercialLogin = await post('/api/colaborador/login', { username: 'comercial', password: 'senha-segura-abc' });
  const mountingSession = await workerRequest('/api/colaborador/session', mountingLogin.body.token);
  const commercialSession = await workerRequest('/api/colaborador/session', commercialLogin.body.token);
  assert.equal(mountingSession.body.assignments.length, 1);
  assert.equal(commercialSession.body.assignments.length, 0);
  assert.equal(commercialSession.body.assignments.some(item => item.orderId === secondOrder.body.id), false);
});

test('controla pagamento de comissao e move trabalho pago para historico do colaborador', async () => {
  const order = await post('/api/database/commit', { schema: 'pedido', pageId: 'test', payload: { numero: 'PED-PAG-1', cliente: 'Cliente Pagamento', produtos: [{ nome: 'Caixa Slim' }] } });
  const worker = await post('/api/production/workers', { name: 'Montador Pagamento', username: 'montador.pagamento', password: 'senha-segura-pagamento', role: 'montagem' });
  const login = await post('/api/colaborador/login', { username: 'montador.pagamento', password: 'senha-segura-pagamento' });
  await post('/api/production/assignments', { orderId: order.body.id, workerId: worker.body.worker.id, commission: 90, steps: ['montagem_da_estrutura', 'limpeza_embalagem'] });

  const earlyPayment = await post(`/api/production/assignments/${order.body.id}/payment`, {});
  assert.equal(earlyPayment.response.status, 400);

  await workerPost(`/api/colaborador/ordens/${order.body.id}/etapas`, { stepId: 'montagem_da_estrutura', done: true }, login.body.token);
  await workerPost(`/api/colaborador/ordens/${order.body.id}/etapas`, { stepId: 'limpeza_embalagem', done: true }, login.body.token);

  const paid = await post(`/api/production/assignments/${order.body.id}/payment`, { paidBy: 'Responsavel financeiro' });
  assert.equal(paid.response.status, 200);
  assert.equal(paid.body.assignment.paymentStatus, 'paid');
  assert.equal(paid.body.assignment.history.at(-1).type, 'payment_paid');

  const session = await workerRequest('/api/colaborador/session', login.body.token);
  const task = session.body.assignments.find(item => item.orderId === order.body.id);
  assert.equal(task.paymentStatus, 'paid');
  assert.ok(task.paidAt);

  const blockedUpdate = await workerPost(`/api/colaborador/ordens/${order.body.id}/etapas`, { stepId: 'limpeza_embalagem', done: false }, login.body.token);
  assert.equal(blockedUpdate.response.status, 400);
});

test('devolve OS para fila e transfere para novo colaborador preservando progresso', async () => {
  const order = await post('/api/database/commit', { schema: 'pedido', pageId: 'test', payload: { numero: 'PED-ESTEIRA-1', cliente: 'Cliente Esteira', produtos: [{ nome: 'Letreiro' }] } });
  const designer = await post('/api/production/workers', { name: 'Projetista Esteira', username: 'projetista.esteira', password: 'senha-segura-projetista', role: 'projetista' });
  const mounting = await post('/api/production/workers', { name: 'Montagem Esteira', username: 'montagem.esteira', password: 'senha-segura-montagem', role: 'montagem' });
  const designerLogin = await post('/api/colaborador/login', { username: 'projetista.esteira', password: 'senha-segura-projetista' });
  const mountingLogin = await post('/api/colaborador/login', { username: 'montagem.esteira', password: 'senha-segura-montagem' });
  await post('/api/production/assignments', { orderId: order.body.id, workerId: designer.body.worker.id, commission: 30, steps: ['gabarito_de_instalacao', 'limpeza_embalagem'] });
  const completed = await workerPost(`/api/colaborador/ordens/${order.body.id}/etapas`, { stepId: 'gabarito_de_instalacao', done: true }, designerLogin.body.token);
  assert.equal(completed.response.status, 200);

  const unassigned = await post(`/api/production/assignments/${order.body.id}/unassign`, {});
  assert.equal(unassigned.response.status, 200);
  assert.equal(unassigned.body.assignment.active, false);
  const designerChatBlocked = await workerRequest(`/api/colaborador/ordens/${order.body.id}/chat`, designerLogin.body.token);
  assert.equal(designerChatBlocked.response.status, 404);

  const transferred = await post('/api/production/assignments', { orderId: order.body.id, workerId: mounting.body.worker.id, commission: 70, steps: ['gabarito_de_instalacao', 'limpeza_embalagem'] });
  assert.equal(transferred.response.status, 200);
  assert.equal(transferred.body.assignment.steps.find(step => step.id === 'gabarito_de_instalacao').done, true);
  assert.equal(transferred.body.assignment.transitions.at(-1).type, 'transfer');
  const mountingSession = await workerRequest('/api/colaborador/session', mountingLogin.body.token);
  assert.ok(mountingSession.body.assignments.some(item => item.orderId === order.body.id));
});

test('classifica produtos da mesma OS para colaboradores diferentes com historico individual', async () => {
  const order = await post('/api/database/commit', {
    schema: 'pedido',
    pageId: 'test',
    payload: {
      numero: 'PED-ITENS-1',
      cliente: 'Cliente Multiplos Artigos',
      produtos: [
        { nome: 'Letreiro Neon', tamanho: '120x60', quantidade: 1, valor: 700 },
        { nome: 'Placa ACM', tamanho: '200x100', quantidade: 1, valor: 500 }
      ]
    }
  });
  const neonWorker = await post('/api/production/workers', { name: 'Operador Neon', username: 'operador.neon', password: 'senha-segura-neon', role: 'montagem' });
  const acmWorker = await post('/api/production/workers', { name: 'Operador ACM', username: 'operador.acm', password: 'senha-segura-acm', role: 'montagem' });
  const neonLogin = await post('/api/colaborador/login', { username: 'operador.neon', password: 'senha-segura-neon' });
  const acmLogin = await post('/api/colaborador/login', { username: 'operador.acm', password: 'senha-segura-acm' });
  await post('/api/production/assignments', { orderId: order.body.id, productId: 'item_0', workerId: neonWorker.body.worker.id, commission: 45, steps: ['aplicar_e_soldar_led', 'limpeza_embalagem'] });
  await post('/api/production/assignments', { orderId: order.body.id, productId: 'item_1', workerId: acmWorker.body.worker.id, commission: 35, steps: ['corte_laser', 'limpeza_embalagem'] });
  const invalidProduct = await post('/api/production/assignments', { orderId: order.body.id, productId: 'item_1_extra', workerId: acmWorker.body.worker.id, commission: 35, steps: ['limpeza_embalagem'] });
  assert.equal(invalidProduct.response.status, 400);

  const neonSession = await workerRequest('/api/colaborador/session', neonLogin.body.token);
  const acmSession = await workerRequest('/api/colaborador/session', acmLogin.body.token);
  const neonTask = neonSession.body.assignments.find(item => item.orderId === order.body.id);
  const acmTask = acmSession.body.assignments.find(item => item.orderId === order.body.id);
  assert.equal(neonTask.product.nome, 'Letreiro Neon');
  assert.equal(acmTask.product.nome, 'Placa ACM');
  assert.equal('valor' in neonTask.product, false);
  assert.equal(neonTask.order.produtos.length, 1);
  assert.equal(neonTask.order.produtos[0].nome, 'Letreiro Neon');

  const completed = await workerPost(`/api/colaborador/ordens/${order.body.id}/etapas`, { productId: 'item_0', stepId: 'aplicar_e_soldar_led', done: true }, neonLogin.body.token);
  assert.equal(completed.response.status, 200);
  const assignments = await request('/api/production/assignments');
  const neonAssignment = assignments.body.assignments.find(item => item.orderId === order.body.id && item.productId === 'item_0');
  const acmAssignment = assignments.body.assignments.find(item => item.orderId === order.body.id && item.productId === 'item_1');
  assert.equal(neonAssignment.steps.find(step => step.id === 'aplicar_e_soldar_led').done, true);
  assert.equal(acmAssignment.steps.find(step => step.id === 'corte_laser').done, false);
  assert.equal(neonAssignment.history.at(-1).type, 'step_completed');
  assert.equal(neonAssignment.history.at(-1).workerName, 'Operador Neon');

  const transferred = await post('/api/production/assignments', { orderId: order.body.id, productId: 'item_0', workerId: acmWorker.body.worker.id, commission: 55, steps: ['aplicar_e_soldar_led', 'limpeza_embalagem'] });
  assert.equal(transferred.response.status, 200);
  assert.equal(transferred.body.assignment.steps.find(step => step.id === 'aplicar_e_soldar_led').done, true);
  assert.equal(transferred.body.assignment.history.at(-1).type, 'transferred');
  const previousWorkerSession = await workerRequest('/api/colaborador/session', neonLogin.body.token);
  assert.equal(previousWorkerSession.body.assignments.some(item => item.orderId === order.body.id && item.productId === 'item_0'), false);
});

test('mostra o mesmo trabalho para varios colaboradores e trava etapa concluida', async () => {
  const order = await post('/api/database/commit', { schema: 'pedido', pageId: 'test', payload: { numero: 'PED-EQUIPE-1', cliente: 'Cliente Equipe', produtos: [{ nome: 'Letreiro compartilhado' }] } });
  const firstWorker = await post('/api/production/workers', { name: 'Operador Um', username: 'operador.um', password: 'senha-segura-um', role: 'montagem' });
  const secondWorker = await post('/api/production/workers', { name: 'Operador Dois', username: 'operador.dois', password: 'senha-segura-dois', role: 'montagem' });
  const firstLogin = await post('/api/colaborador/login', { username: 'operador.um', password: 'senha-segura-um' });
  const secondLogin = await post('/api/colaborador/login', { username: 'operador.dois', password: 'senha-segura-dois' });

  const classified = await post('/api/production/assignments', {
    orderId: order.body.id,
    workerIds: [firstWorker.body.worker.id, secondWorker.body.worker.id],
    commission: 100,
    steps: ['montagem_da_estrutura', 'limpeza_embalagem']
  });
  assert.equal(classified.response.status, 200);
  assert.equal(classified.body.assignment.workerIds.length, 2);
  assert.equal(classified.body.assignment.steps.reduce((sum, step) => sum + step.commissionValue, 0), 100);

  const firstSession = await workerRequest('/api/colaborador/session', firstLogin.body.token);
  const secondSession = await workerRequest('/api/colaborador/session', secondLogin.body.token);
  assert.equal(firstSession.body.assignments.some(item => item.orderId === order.body.id), true);
  assert.equal(secondSession.body.assignments.some(item => item.orderId === order.body.id), true);

  const completed = await workerPost(`/api/colaborador/ordens/${order.body.id}/etapas`, { stepId: 'montagem_da_estrutura', done: true }, firstLogin.body.token);
  assert.equal(completed.response.status, 200);
  assert.equal(completed.body.steps.find(step => step.id === 'montagem_da_estrutura').completedByWorkerName, 'Operador Um');

  const blocked = await workerPost(`/api/colaborador/ordens/${order.body.id}/etapas`, { stepId: 'montagem_da_estrutura', done: true }, secondLogin.body.token);
  assert.equal(blocked.response.status, 409);

  const earlyPayment = await post(`/api/production/assignments/${order.body.id}/payment`, { paidBy: 'Financeiro' });
  assert.equal(earlyPayment.response.status, 400);
});

test('aponta tempo real, baixa estoque e gera visao gerencial', async () => {
  const material = await post('/api/database/commit', {
    schema: 'material',
    pageId: 'test',
    payload: { nome: 'Fita LED teste', formulaPadrao: 'linear', unidade: 'm', precoCusto: 10, estoqueAtual: 3, estoqueMinimo: 5, ativo: true }
  });
  const order = await post('/api/database/commit', {
    schema: 'pedido',
    pageId: 'test',
    payload: {
      numero: 'PED-GESTAO-1',
      cliente: 'Cliente Gestao',
      subtotal: 300,
      total: 369,
      iva: 69,
      produtos: [{
        nome: 'Letreiro LED',
        quantidade: 1,
        valor: 300,
        custo: 20,
        materiais: [{ materialId: material.body.id, formula: 'linear', comprimentoM: 2, quantidade: 1 }]
      }]
    }
  });
  const worker = await post('/api/production/workers', { name: 'Apontador Tempo', username: 'apontador.tempo', password: 'senha-segura-tempo', role: 'montagem' });
  const login = await post('/api/colaborador/login', { username: 'apontador.tempo', password: 'senha-segura-tempo' });
  await post('/api/production/assignments', { orderId: order.body.id, productId: 'item_0', workerId: worker.body.worker.id, commission: 25, steps: ['aplicar_e_soldar_led'] });

  const started = await workerPost(`/api/colaborador/ordens/${order.body.id}/etapas/tempo`, { productId: 'item_0', stepId: 'aplicar_e_soldar_led', action: 'start' }, login.body.token);
  assert.equal(started.response.status, 200);
  const stopped = await workerPost(`/api/colaborador/ordens/${order.body.id}/etapas/tempo`, { productId: 'item_0', stepId: 'aplicar_e_soldar_led', action: 'stop' }, login.body.token);
  assert.equal(stopped.response.status, 200);
  assert.ok(stopped.body.assignment.timeLogs[0].minutes >= 1);

  await workerPost(`/api/colaborador/ordens/${order.body.id}/etapas`, { productId: 'item_0', stepId: 'aplicar_e_soldar_led', done: true }, login.body.token);
  const paid = await post(`/api/production/assignments/${order.body.id}/payment`, { productId: 'item_0', paidBy: 'Financeiro' });
  assert.equal(paid.response.status, 200);
  assert.equal(paid.body.stockMovements.length, 1);

  const stock = await post('/api/database/query', { schema: 'estoque_movimento', limit: 20 });
  assert.ok(stock.body.events.some(event => event.payload.orderId === order.body.id && event.payload.quantidade < 0));
  const overview = await request('/api/management/overview');
  assert.equal(overview.response.status, 200);
  assert.ok(overview.body.overview.dre);
  assert.ok(overview.body.overview.previstoRealizado.some(item => item.orderId === order.body.id));
  assert.ok(overview.body.overview.estoque.some(item => item.id === material.body.id && item.status === 'comprar'));
});

test('exclui usuario de producao e bloqueia novo login', async () => {
  const created = await post('/api/production/workers', { name: 'Usuario Excluir', username: 'usuario.excluir', password: 'senha-segura-excluir', role: 'montagem' });
  assert.equal(created.response.status, 200);
  const removed = await post(`/api/production/workers/${created.body.worker.id}/delete`, {});
  assert.equal(removed.response.status, 200);
  const login = await post('/api/colaborador/login', { username: 'usuario.excluir', password: 'senha-segura-excluir' });
  assert.equal(login.response.status, 401);
  const workers = await request('/api/production/workers');
  assert.equal(workers.body.workers.some(worker => worker.username === 'usuario.excluir'), false);
});

test('permite recriar login de usuario de producao inativo', async () => {
  const created = await post('/api/production/workers', { name: 'Usuario Inativo', username: 'usuario.inativo', password: 'senha-segura-inativo', role: 'montagem' });
  assert.equal(created.response.status, 200);
  const revoked = await post(`/api/production/workers/${created.body.worker.id}/revoke`, {});
  assert.equal(revoked.response.status, 200);
  const workersWithInactive = await request('/api/production/workers');
  assert.equal(workersWithInactive.body.allWorkers.some(worker => worker.username === 'usuario.inativo' && worker.active === false), true);
  const recreated = await post('/api/production/workers', { name: 'Usuario Recriado', username: 'usuario.inativo', password: 'senha-segura-recriado', role: 'montagem' });
  assert.equal(recreated.response.status, 200);
  const login = await post('/api/colaborador/login', { username: 'usuario.inativo', password: 'senha-segura-recriado' });
  assert.equal(login.response.status, 200);
});

test('ativa celular e lanca compra manual automaticamente', async () => {
  const login = await post('/api/mobile/login', { deviceName: 'Celular teste', accessKey: 'dev-mobile-key' });
  assert.equal(login.response.status, 200);
  assert.match(login.body.token, /^[a-f0-9]{96}$/);

  const sent = await mobilePost('/api/mobile/documents', {
    entryType: 'expense',
    nifEmitente: '503456789',
    nifAdquirente: '509876543',
    tipoDocumento: 'FT',
    numeroFatura: 'FT MOBILE/1',
    dataCompra: '2026-06-02',
    valorTotal: 246,
    valorIVA: 46
  }, login.body.token);
  assert.equal(sent.response.status, 200);

  const inbox = await request('/api/mobile/inbox');
  assert.equal(inbox.response.status, 200);
  assert.ok(inbox.body.documents.some(item => item.numeroFatura === 'FT MOBILE/1' && item.status === 'approved'));
  const saved = await post('/api/database/query', { schema: 'despesa', filters: { id: sent.body.eventId } });
  assert.equal(saved.body.events[0].payload.valorBruto, 200);
});

test('executa faturacao Moloni simulada com validacao e bloqueio de duplicados', async () => {
  const createdOrder = await post('/api/database/commit', {
    schema: 'pedido',
    pageId: 'test-moloni',
    payload: {
      id: 'stale-payload-id',
      numero: 'PED-MOLONI-1',
      cliente: 'Cliente Fiscal',
      empresa: 'Cliente Fiscal Lda',
      nif: '123456789',
      total: 123,
      produtos: [{ nome: 'Letreiro teste', quantidade: 1, valor: 123, comIVA: 'sim' }],
      pagamentos: [{ id: 'pag-moloni-1', status: 'pago', valor: 50, data: '2026-06-22', formaPagamento: 'transferencia' }]
    }
  });
  assert.equal(createdOrder.response.status, 200);

  const status = await request('/api/moloni/status');
  assert.equal(status.response.status, 200);
  assert.equal(status.body.mode, 'mock');

  const preview = await post('/api/moloni/documents/preview', {
    orderId: createdOrder.body.id,
    type: 'invoice',
    issueDate: '2026-06-22'
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.preview.valid, true);
  assert.equal(preview.body.preview.order.id, createdOrder.body.id);

  const invoice = await post('/api/moloni/documents', {
    orderId: createdOrder.body.id,
    type: 'invoice',
    issueDate: '2026-06-22',
    status: 'draft'
  });
  assert.equal(invoice.response.status, 201);
  assert.equal(invoice.body.document.mode, 'mock');
  assert.equal(invoice.body.document.state, 'draft');

  const deletedDraft = await post(`/api/moloni/documents/${invoice.body.document.id}/delete`, {});
  assert.equal(deletedDraft.response.status, 200);
  assert.equal(deletedDraft.body.success, true);

  const listedAfterDelete = await request(`/api/moloni/documents?orderId=${createdOrder.body.id}`);
  assert.equal(listedAfterDelete.response.status, 200);
  assert.equal(listedAfterDelete.body.documents.length, 0);

  const invoiceAgain = await post('/api/moloni/documents', {
    orderId: createdOrder.body.id,
    type: 'invoice',
    issueDate: '2026-06-22',
    status: 'draft'
  });
  assert.equal(invoiceAgain.response.status, 201);

  const duplicate = await post('/api/moloni/documents', {
    orderId: createdOrder.body.id,
    type: 'invoice',
    issueDate: '2026-06-22',
    status: 'draft'
  });
  assert.equal(duplicate.response.status, 400);
  assert.match(duplicate.body.message, /ja possui/);

  const receipt = await post('/api/moloni/documents', {
    orderId: createdOrder.body.id,
    type: 'receipt',
    paymentId: 'pag-moloni-1',
    issueDate: '2026-06-22',
    status: 'closed'
  });
  assert.equal(receipt.response.status, 201);
  assert.equal(receipt.body.document.value, 50);

  const deleteClosed = await post(`/api/moloni/documents/${receipt.body.document.id}/delete`, {});
  assert.equal(deleteClosed.response.status, 409);
  assert.match(deleteClosed.body.message, /Documentos fechados/);

  const listed = await request(`/api/moloni/documents?orderId=${createdOrder.body.id}`);
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.documents.length, 2);
});

test('modo salario ignora NIF e IVA da nota e registra somente o valor', async () => {
  const login = await post('/api/mobile/login', { deviceName: 'Celular salario', accessKey: 'dev-mobile-key' });
  const sent = await mobilePost('/api/mobile/documents', {
    expenseMode: 'SALÁRIO',
    rawQr: 'A:501111111*B:502222222*D:FT*F:20260618*G:FT SALARIO/1*O:750.00*N:140.24'
  }, login.body.token);
  assert.equal(sent.response.status, 200);

  const saved = await post('/api/database/query', { schema: 'despesa', filters: { id: sent.body.eventId } });
  const payload = saved.body.events[0].payload;
  assert.equal(payload.categoria, 'SALÁRIO');
  assert.equal(payload.valorTotal, 750);
  assert.equal(payload.valorBruto, 750);
  assert.equal(payload.valorIVA, 0);
  assert.equal(payload.nifFornecedor, '');
  assert.equal(payload.classificationStatus, 'classified');
});

test('lanca QR fiscal automaticamente e bloqueia nova leitura duplicada', async () => {
  const login = await post('/api/mobile/login', { deviceName: 'Celular QR', accessKey: 'dev-mobile-key' });
  const body = { rawQr: 'A:504567890*B:509876543*D:FT*F:20260602*G:FT MOBILE/QR1*O:123.00*N:23.00' };
  const sent = await mobilePost('/api/mobile/documents', body, login.body.token);
  assert.equal(sent.response.status, 200);
  assert.equal(sent.body.message, 'Fatura cadastrada com sucesso.');

  const duplicate = await mobilePost('/api/mobile/documents', body, login.body.token);
  assert.equal(duplicate.response.status, 409);
  assert.match(duplicate.body.message, /ja foi enviada ou cadastrada/);
});

test('migra documento antigo em revisao para lancamento automatico', async () => {
  const fingerprint = 'a'.repeat(64);
  await db.collection('mobile_invoice_inbox').doc(fingerprint).set({
    id: fingerprint,
    fingerprint,
    entryType: 'expense',
    nifEmitente: '505678901',
    nifAdquirente: '509876543',
    tipoDocumento: 'FT',
    numeroFatura: 'FT LEGACY/1',
    dataCompra: '2026-06-02',
    valorTotal: 61.5,
    valorIVA: 11.5,
    valorBruto: 50,
    source: 'mobile_qr',
    status: 'pending_review',
    deviceId: 'legacy-device',
    deviceName: 'Celular antigo',
    createdAt: '2026-06-02T12:00:00.000Z'
  });
  const inbox = await request('/api/mobile/inbox');
  assert.equal(inbox.response.status, 200);
  assert.ok(inbox.body.documents.some(item => item.numeroFatura === 'FT LEGACY/1' && item.status === 'approved'));
  const saved = await post('/api/database/query', { schema: 'despesa', filters: { id: `mobile-${fingerprint.slice(0, 40)}` } });
  assert.equal(saved.body.count, 1);
});

test('classifica despesas antigas por fornecedor cadastrado pelo NIF', async () => {
  const first = await post('/api/database/commit', {
    schema: 'despesa',
    payload: { fornecedor: 'Fornecedor NIF 508111222', nifFornecedor: '508111222', categoria: 'OUTROS', valorTotal: 40, origemLancamento: 'mobile_qr' },
    pageId: 'test'
  });
  const second = await post('/api/database/commit', {
    schema: 'despesa',
    payload: { fornecedor: 'Fornecedor NIF 508111222', nifFornecedor: '508111222', categoria: 'OUTROS', valorTotal: 60, origemLancamento: 'mobile_qr' },
    pageId: 'test'
  });

  const pending = await request('/api/expenses/unclassified');
  assert.ok(pending.body.expenses.some(item => item.id === first.body.id));

  const classified = await post(`/api/expenses/${first.body.id}/classify`, {
    supplierName: 'Fornecedor Teste',
    nif: '508111222',
    category: 'COMBUSTIVEL',
    expenseType: 'combustivel',
    applyToSameNif: true
  });
  assert.equal(classified.response.status, 200);
  assert.equal(classified.body.updatedCount, 2);

  const updated = await post('/api/database/query', { schema: 'despesa', filters: { id: second.body.id } });
  assert.equal(updated.body.events[0].payload.fornecedor, 'Fornecedor Teste');
  assert.equal(updated.body.events[0].payload.categoria, 'COMBUSTIVEL');
  assert.equal(updated.body.events[0].payload.classificationStatus, 'classified');
});

test('cadastrar fornecedor classifica despesas antigas automaticamente pelo NIF', async () => {
  const legacy = await post('/api/database/commit', {
    schema: 'despesa',
    payload: { fornecedor: 'Fornecedor NIF 507333444', nifFornecedor: '507333444', categoria: 'A CLASSIFICAR', valorTotal: 80 },
    pageId: 'test'
  });

  const supplier = await post('/api/suppliers', {
    name: 'Fornecedor Auto Antigo',
    nif: '507333444',
    category: 'ENERGIA',
    expenseType: 'energia',
    ivaDedutivel: false
  });
  assert.equal(supplier.response.status, 200);
  assert.equal(supplier.body.autoClassifiedCount, 1);

  const updated = await post('/api/database/query', { schema: 'despesa', filters: { id: legacy.body.id } });
  const payload = updated.body.events[0].payload;
  assert.equal(payload.fornecedor, 'Fornecedor Auto Antigo');
  assert.equal(payload.categoria, 'ENERGIA');
  assert.equal(payload.tipoDespesa, 'energia');
  assert.equal(payload.ivaDedutivel, false);
  assert.equal(payload.classificationStatus, 'classified');
  assert.equal(payload.classificationSource, 'supplier_nif');
});

test('lancamento novo de despesa usa fornecedor cadastrado pelo NIF', async () => {
  const supplier = await post('/api/suppliers', {
    name: 'Fornecedor Auto Novo',
    nif: '507333555',
    category: 'CTT',
    expenseType: 'correios'
  });
  assert.equal(supplier.response.status, 200);

  const expense = await post('/api/database/commit', {
    schema: 'despesa',
    payload: { fornecedor: 'Fornecedor NIF 507333555', nifFornecedor: '507333555', categoria: 'OUTROS', valorTotal: 25 },
    pageId: 'test'
  });
  assert.equal(expense.body.autoClassified, true);
  assert.equal(expense.body.event.payload.fornecedor, 'Fornecedor Auto Novo');
  assert.equal(expense.body.event.payload.categoria, 'CTT');
  assert.equal(expense.body.event.payload.tipoDespesa, 'correios');
  assert.equal(expense.body.event.payload.supplierId, supplier.body.supplier.id);
});

test('classifica despesas por NIF mesmo sem ID na URL', async () => {
  const expense = await post('/api/database/commit', {
    schema: 'despesa',
    payload: { fornecedor: 'Fornecedor NIF 507333556', nifFornecedor: '507333556', categoria: 'OUTROS', valorTotal: 33 },
    pageId: 'test'
  });

  const classified = await post('/api/expenses/classify', {
    supplierName: 'Fornecedor Sem ID',
    nif: '507333556',
    category: 'IMPOSTOS',
    expenseType: 'fiscal'
  });
  assert.equal(classified.response.status, 200);
  assert.equal(classified.body.updatedCount, 1);

  const updated = await post('/api/database/query', { schema: 'despesa', filters: { id: expense.body.id } });
  assert.equal(updated.body.events[0].payload.fornecedor, 'Fornecedor Sem ID');
  assert.equal(updated.body.events[0].payload.categoria, 'IMPOSTOS');
  assert.equal(updated.body.events[0].payload.classificationSource, 'supplier_nif');
});

test('classificacao por NIF usa cadastro existente e remove item da fila', async () => {
  const supplier = await post('/api/suppliers', {
    name: 'Fornecedor Cadastro Mestre',
    nif: '507333557',
    category: 'BRICO DEPÔT',
    expenseType: 'material construcao',
    ivaDedutivel: false
  });
  assert.equal(supplier.response.status, 200);

  const expense = await post('/api/database/commit', {
    schema: 'despesa',
    payload: { fornecedor: 'Fornecedor NIF 507333557', nifFornecedor: '507333557', categoria: 'OUTROS', tipoDespesa: '', valorTotal: 44 },
    pageId: 'test'
  });

  const classified = await post(`/api/expenses/${expense.body.id}/classify`, {
    supplierName: 'Nome digitado nao deve vencer cadastro',
    nif: '507333557',
    category: 'OUTROS',
    expenseType: 'digitado',
    ivaDedutivel: true,
    applyToSameNif: true
  });
  assert.equal(classified.response.status, 200);

  const updated = await post('/api/database/query', { schema: 'despesa', filters: { id: expense.body.id } });
  const payload = updated.body.events[0].payload;
  assert.equal(payload.fornecedor, 'Fornecedor Cadastro Mestre');
  assert.equal(payload.categoria, 'BRICO DEPÔT');
  assert.equal(payload.tipoDespesa, 'material construcao');
  assert.equal(payload.ivaDedutivel, false);
  assert.equal(payload.classificationStatus, 'classified');

  const pending = await request('/api/expenses/unclassified');
  assert.equal(pending.body.expenses.some(item => item.id === expense.body.id), false);
});

test('despesa vinculada a fornecedor nao volta para a fila mesmo com categoria antiga', async () => {
  const supplier = await post('/api/suppliers', {
    name: 'Dimatur Teste',
    nif: '507333558',
    category: 'DIMATUR',
    expenseType: 'material'
  });
  assert.equal(supplier.response.status, 200);
  await db.collection('events').doc('legacy-dimatur-no-return').set({
    schema: 'despesa',
    payload: {
      fornecedor: 'Dimatur Teste',
      nifFornecedor: '507333558',
      categoria: 'OUTROS',
      supplierId: supplier.body.supplier.id,
      classificationStatus: 'classified',
      valorTotal: 70
    },
    deleted: false,
    timestamp: new Date().toISOString()
  });

  const pending = await request('/api/expenses/unclassified');
  assert.equal(pending.response.status, 200);
  assert.equal(typeof pending.body.pendingCount, 'number');
  assert.equal(pending.body.expenses.some(item => item.id === 'legacy-dimatur-no-return'), false);
});

test('fila usa ID real do documento mesmo quando payload tem id antigo', async () => {
  await db.collection('events').doc('doc-real-dimatur').set({
    schema: 'despesa',
    payload: {
      id: 'payload-antigo-dimatur',
      fornecedor: 'Fornecedor NIF 507333559',
      nifFornecedor: '507333559',
      categoria: 'OUTROS',
      valorTotal: 90
    },
    deleted: false,
    timestamp: new Date().toISOString()
  });

  const pending = await request('/api/expenses/unclassified');
  const row = pending.body.expenses.find(item => item.nifFornecedor === '507333559');
  assert.equal(row.id, 'doc-real-dimatur');

  const classified = await post(`/api/expenses/${row.id}/classify`, {
    supplierName: 'Dimatur Documento Real',
    nif: '507333559',
    category: 'DIMATUR',
    expenseType: 'material',
    applyToSameNif: true
  });
  assert.equal(classified.response.status, 200);

  const after = await request('/api/expenses/unclassified');
  assert.equal(after.body.expenses.some(item => item.id === 'doc-real-dimatur'), false);
});

test('fila de despesas reconcilia pendencias com fornecedores ja cadastrados', async () => {
  const supplier = await post('/api/suppliers', {
    name: 'Fornecedor Reconciliado',
    nif: '507333666',
    category: 'MANUTENCAO',
    expenseType: 'manutencao'
  });
  assert.equal(supplier.response.status, 200);
  await db.collection('events').doc('legacy-reconcile-507333666').set({
    schema: 'despesa',
    payload: { fornecedor: 'Fornecedor NIF 507333666', nifFornecedor: '507333666', categoria: 'OUTROS', valorTotal: 110 },
    deleted: false,
    timestamp: new Date().toISOString()
  });

  const pending = await request('/api/expenses/unclassified');
  assert.equal(pending.response.status, 200);
  assert.equal(pending.body.autoClassifiedCount, 1);
  assert.equal(pending.body.expenses.some(item => item.id === 'legacy-reconcile-507333666'), false);

  const updated = await post('/api/database/query', { schema: 'despesa', filters: { id: 'legacy-reconcile-507333666' } });
  assert.equal(updated.body.events[0].payload.fornecedor, 'Fornecedor Reconciliado');
  assert.equal(updated.body.events[0].payload.classificationSource, 'supplier_nif');
});

test('cadastra vendedor, calcula comissao sem IVA e instalacao e exibe no app', async () => {
  const seller = await post('/api/sellers', { name: 'Vendedor Teste', username: 'vendedor.teste', password: 'senha-segura-vendedor' });
  assert.equal(seller.response.status, 200);

  const order = await post('/api/database/commit', {
    schema: 'pedido',
    pageId: 'test',
    payload: {
      numero: 'PED-VEND-1',
      cliente: 'Cliente Vendedor',
      produtos: [{ nome: 'Letreiro', quantidade: 1, valor: 1000 }],
      instalacao: 200,
      subtotal: 1200,
      iva: 276,
      total: 1476,
      sellerId: seller.body.seller.id,
      sellerName: seller.body.seller.name,
      sellerCommissionRate: 7
    }
  });

  const commissions = await request('/api/sales/commissions');
  const commission = commissions.body.commissions.find(item => item.orderId === order.body.id);
  assert.equal(commission.base, 1000);
  assert.equal(commission.commission, 70);
  assert.equal(commission.status, 'pending');

  const login = await post('/api/vendedor/login', { username: 'vendedor.teste', password: 'senha-segura-vendedor' });
  assert.equal(login.response.status, 200);
  const sellerSession = await workerRequest('/api/vendedor/session', login.body.token);
  assert.equal(sellerSession.body.sales.length, 1);
  assert.equal(sellerSession.body.sales[0].commission, 70);

  const paid = await post(`/api/sales/commissions/${order.body.id}/payment`, { paidBy: 'Financeiro' });
  assert.equal(paid.response.status, 200);
  const afterPay = await workerRequest('/api/vendedor/session', login.body.token);
  assert.equal(afterPay.body.sales[0].paymentStatus, 'paid');
});

test('calcula saldo liquido entre comissoes e divida de compras do vendedor', async () => {
  const seller = await post('/api/sellers', { name: 'Vendedor Devedor', username: 'vendedor.devedor', password: 'senha-segura-devedor' });
  const commissionOrder = await post('/api/database/commit', {
    schema: 'pedido',
    pageId: 'test',
    payload: {
      numero: 'PED-COMISSAO-SALDO',
      produtos: [{ nome: 'Venda', quantidade: 1, valor: 1000, comIVA: 'sim' }],
      subtotal: 1000,
      total: 1230,
      sellerId: seller.body.seller.id,
      sellerCommissionRate: 10
    }
  });
  assert.equal(commissionOrder.response.status, 200);

  const purchaseOrder = await post('/api/database/commit', {
    schema: 'pedido',
    pageId: 'test',
    payload: {
      numero: 'PED-COMPRA-VENDEDOR',
      produtos: [{ nome: 'Compra', quantidade: 1, valor: 200 }],
      subtotal: 200,
      total: 200,
      buyerSellerId: seller.body.seller.id,
      pagamentos: [{ valor: 100, status: 'pago' }]
    }
  });
  assert.equal(purchaseOrder.response.status, 200);

  const balances = await request('/api/sales/commissions');
  const balance = balances.body.balances.find(item => item.sellerId === seller.body.seller.id);
  assert.equal(balance.commissionsDue, 100);
  assert.equal(balance.debtDue, 100);
  assert.equal(balance.net, 0);

  const login = await post('/api/vendedor/login', { username: 'vendedor.devedor', password: 'senha-segura-devedor' });
  const session = await workerRequest('/api/vendedor/session', login.body.token);
  assert.equal(session.body.debts[0].debt, 100);
  assert.equal(session.body.balance.net, 0);
});

test('rejeita uso do app movel sem dispositivo ativado', async () => {
  const result = await post('/api/mobile/documents', {
    nifEmitente: '503456789',
    numeroFatura: 'FT MOBILE/2',
    dataCompra: '2026-06-02',
    valorTotal: 10
  });
  assert.equal(result.response.status, 401);
});

test('salva, consulta com filtro por id e exclui registro', async () => {
  const saved = await post('/api/database/commit', { schema: 'pedido', payload: { cliente: 'Teste', total: 123 }, pageId: 'test' });
  assert.equal(saved.response.status, 200);
  assert.ok(saved.body.id);

  const filtered = await post('/api/database/query', { schema: 'pedido', filters: { id: saved.body.id } });
  assert.equal(filtered.response.status, 200);
  assert.equal(filtered.body.count, 1);
  assert.equal(filtered.body.events[0].payload.cliente, 'Teste');

  const deleted = await post('/api/database/delete', { id: saved.body.id });
  assert.equal(deleted.response.status, 200);

  const afterDelete = await post('/api/database/query', { schema: 'pedido', filters: { id: saved.body.id } });
  assert.equal(afterDelete.body.count, 0);
});

test('exclui definitivamente pedido e despesa do banco', async () => {
  const pedido = await post('/api/database/commit', { schema: 'pedido', payload: { cliente: 'Excluir Pedido', total: 321 }, pageId: 'test' });
  const despesa = await post('/api/database/commit', { schema: 'despesa', payload: { fornecedor: 'Excluir Despesa', valorTotal: 45 }, pageId: 'test' });
  await db.collection('production_assignments').doc(`${pedido.body.id}__item_0`).set({ orderId: pedido.body.id, productId: 'item_0', active: true });
  await db.collection('production_messages').doc(`msg-${pedido.body.id}`).set({ orderId: pedido.body.id, message: 'Teste' });
  await db.collection('events').doc(`stock-${pedido.body.id}`).set({ schema: 'estoque_movimento', payload: { orderId: pedido.body.id, quantidade: -1 }, deleted: false });

  const deletedPedido = await post('/api/database/delete', { id: pedido.body.id, hardDelete: true });
  const deletedDespesa = await post('/api/database/delete', { id: despesa.body.id, hardDelete: true });

  assert.equal(deletedPedido.response.status, 200);
  assert.equal(deletedPedido.body.hardDelete, true);
  assert.equal(deletedPedido.body.artifactsDeleted, 3);
  assert.equal(deletedDespesa.response.status, 200);
  assert.equal(deletedDespesa.body.hardDelete, true);

  const pedidos = await post('/api/database/query', { schema: 'pedido', filters: { id: pedido.body.id } });
  const despesas = await post('/api/database/query', { schema: 'despesa', filters: { id: despesa.body.id } });
  const assignment = await db.collection('production_assignments').doc(`${pedido.body.id}__item_0`).get();
  const message = await db.collection('production_messages').doc(`msg-${pedido.body.id}`).get();
  const stock = await db.collection('events').doc(`stock-${pedido.body.id}`).get();
  assert.equal(pedidos.body.count, 0);
  assert.equal(despesas.body.count, 0);
  assert.equal(assignment.exists, false);
  assert.equal(message.exists, false);
  assert.equal(stock.exists, false);
});

test('rejeita payload com HTML executável', async () => {
  const result = await post('/api/database/commit', { schema: 'pedido', payload: { cliente: '<img src=x onerror=alert(1)>' } });
  assert.equal(result.response.status, 400);
});

test('rejeita upload inválido ou acima do limite', async () => {
  const invalid = await post('/api/upload/nota-fiscal', {
    sessionId: 'UPL-test',
    despesaId: 'pending-test',
    fileData: { tipo: 'text/html', base64: Buffer.from('<script>alert(1)</script>').toString('base64') }
  });
  assert.equal(invalid.response.status, 400);

  const large = await post('/api/upload/nota-fiscal', {
    sessionId: 'UPL-large',
    despesaId: 'pending-large',
    fileData: { tipo: 'image/jpeg', base64: Buffer.alloc(501 * 1024).toString('base64') }
  });
  assert.equal(large.response.status, 400);
});

test('recebe QR fiscal por sessão temporária para revisão no CRM', async () => {
  const session = await post('/api/importacao-fiscal/session', {});
  assert.equal(session.response.status, 200);
  assert.match(session.body.token, /^[a-f0-9]{64}$/);

  const received = await post('/api/importacao-fiscal/receber', {
    token: session.body.token,
    rawQr: 'A:501234567*B:509876543*D:FT*F:20260602*G:FT 2026/20*O:123.00*N:23.00'
  });
  assert.equal(received.response.status, 200);

  const check = await request(`/api/importacao-fiscal/check?token=${session.body.token}`);
  assert.equal(check.response.status, 200);
  assert.equal(check.body.status, 'uploaded');
  assert.equal(check.body.documento.valorBruto, 100);
  assert.equal(check.body.documento.valorIVA, 23);
});

test('leitor fiscal do CRM pergunta e transforma gasto pessoal em salario pelo total com IVA', async () => {
  const session = await post('/api/importacao-fiscal/session', {});
  const received = await post('/api/importacao-fiscal/receber', {
    token: session.body.token,
    expenseMode: 'SALÁRIO',
    rawQr: 'A:501234568*B:500000000*D:FT*F:20260618*G:FT PESSOAL/1*O:123.00*N:23.00'
  });
  assert.equal(received.response.status, 200);

  const check = await request(`/api/importacao-fiscal/check?token=${session.body.token}`);
  assert.equal(check.body.documento.salaryOnly, true);
  assert.equal(check.body.documento.categoria, 'SALÁRIO');
  assert.equal(check.body.documento.valorTotal, 123);
  assert.equal(check.body.documento.valorBruto, 123);
  assert.equal(check.body.documento.valorIVA, 0);
  assert.equal(check.body.documento.nifEmitente, '');
  assert.equal(check.body.documento.nifAdquirente, '');
});

test('bloqueia importação fiscal duplicada', async () => {
  await post('/api/database/commit', {
    schema: 'despesa',
    pageId: 'test',
    payload: {
      nifFornecedor: '501234567',
      numeroFatura: 'FT 2026/21',
      dataCompra: '2026-06-02',
      valorTotal: 123
    }
  });
  const session = await post('/api/importacao-fiscal/session', {});
  const received = await post('/api/importacao-fiscal/receber', {
    token: session.body.token,
    rawQr: 'A:501234567*B:509876543*D:FT*F:20260602*G:FT 2026/21*O:123.00*N:23.00'
  });
  assert.equal(received.response.status, 409);
});

test('gera EPS de rótulos com nome variável e preserva CutContour', () => {
  for (const template of ROTULOS.LABEL_TEMPLATES) {
    const eps = ROTULOS.generateLabelEps(template.id, 'Teste');
    const postScript = eps.toString('latin1');
    assert.equal(Buffer.isBuffer(eps), true);
    assert.equal(eps.includes(Buffer.from('CutContour', 'latin1')), true);
    assert.equal(eps.includes(Buffer.from('%%LabelText: Teste', 'latin1')), true);
    assert.equal(eps.includes(Buffer.from(`%%LabelFontSize: ${template.baseFontSize}`, 'latin1')), true);
    const textOffset = Number(postScript.match(/%%LabelTextOffset: (-?\d+)/)?.[1]);
    if (template.originalOffset) {
      assert.ok(textOffset < 0, `${template.id} deve centralizar pela ancora do Corel`);
    } else {
      assert.ok(textOffset > 0, `${template.id} deve centralizar dentro da caixa original`);
    }
    assert.match(postScript, /Texto convertido em curvas/);
    assert.match(postScript, /curveto/);
    assert.equal(eps.readUInt32LE(0), 0xc6d3d0c5);
    assert.equal(eps.readUInt32LE(20), eps.readUInt32LE(4) + eps.readUInt32LE(8));

    const longTextEps = ROTULOS.generateLabelEps(template.id, 'Escalopes de frango ao molho de mostarda e legumes').toString('latin1');
    const adjustedSize = Number(longTextEps.match(/%%LabelFontSize: (\d+)/)?.[1]);
    assert.ok(adjustedSize < template.baseFontSize);

    const nutritionEps = ROTULOS.generateLabelEps(template.id, 'Teste', {
      enabled: true,
      kcal: '455',
      protein: '18',
      carbs: '54',
      fat: '16',
      fiber: '10'
    }).toString('latin1');
    assert.match(nutritionEps, /%%LabelNutrition: kcal=455/);
    assert.match(nutritionEps, /%%LabelNutrition: protein=18g/);
  }
});

test('portal de rótulos cria cliente, pedido, pagamento e EPS', async () => {
  const prices = Object.fromEntries(ROTULOS.LABEL_TEMPLATES.map(template => [template.id, 0.5]));
  const createdCustomer = await post('/api/rotulos/customers', {
    name: 'Cliente Rótulos Teste',
    email: 'rotulos@example.com',
    phone: '910000000',
    defaultTaxMode: 'iva',
    prices
  });
  assert.equal(createdCustomer.response.status, 201);
  assert.ok(createdCustomer.body.customer.accessToken);

  const token = createdCustomer.body.customer.accessToken;
  const session = await request(`/api/rotulos/public/session?token=${encodeURIComponent(token)}`);
  assert.equal(session.response.status, 200);
  assert.equal(session.body.customer.name, 'Cliente Rótulos Teste');
  assert.equal(session.body.templates.length, 6);
  const platformFee = session.body.orders.find(item => item.recordType === 'platform_fee');
  assert.ok(platformFee);
  assert.equal(platformFee.total, 15);
  assert.equal(platformFee.canHide, false);

  const platformFeeDoc = await db.collection('events').doc(platformFee.id).get();
  assert.equal(FINANCEIRO.faturamentoSemIva(platformFeeDoc.data().payload), 12.2);
  const earlyHideFee = await post(`/api/rotulos/public/records/${platformFee.id}/hide`, { token });
  assert.equal(earlyHideFee.response.status, 400);

  const paidFee = await post(`/api/rotulos/orders/${platformFee.id}/payments`, { value: 15, method: 'transferencia' });
  assert.equal(paidFee.response.status, 200);
  const paidSession = await request(`/api/rotulos/public/session?token=${encodeURIComponent(token)}`);
  assert.equal(paidSession.body.orders.find(item => item.id === platformFee.id).canHide, true);
  const hiddenFee = await post(`/api/rotulos/public/records/${platformFee.id}/hide`, { token });
  assert.equal(hiddenFee.response.status, 200);
  const hiddenSession = await request(`/api/rotulos/public/session?token=${encodeURIComponent(token)}`);
  assert.equal(hiddenSession.body.orders.some(item => item.id === platformFee.id), false);
  const adminBeforeDelete = await request('/api/rotulos/orders');
  assert.equal(adminBeforeDelete.body.orders.some(item => item.id === platformFee.id), true);
  const deletedFee = await post(`/api/rotulos/records/${platformFee.id}/delete`, {});
  assert.equal(deletedFee.response.status, 200);
  const adminAfterDelete = await request('/api/rotulos/orders');
  assert.equal(adminAfterDelete.body.orders.some(item => item.id === platformFee.id), false);

  const createdOrder = await post('/api/rotulos/public/orders', {
    token,
    items: [
      {
        templateId: 'proteico-grande',
        mealName: 'Frango à portuguesa',
        quantity: 90,
        taxMode: 'iva',
        nutrition: { enabled: true, kcal: '455', protein: '18', carbs: '54', fat: '16', fiber: '10' }
      },
      { templateId: 'vegetariano-pequeno', mealName: 'Caril de legumes', quantity: 45, taxMode: 'isento' }
    ]
  });
  assert.equal(createdOrder.response.status, 201);
  assert.equal(createdOrder.body.order.subtotal, 67.5);
  assert.equal(createdOrder.body.order.iva, 10.35);
  assert.equal(createdOrder.body.order.total, 77.85);
  assert.equal(createdOrder.body.order.produtos[0].hasNutrition, true);
  assert.match(createdOrder.body.order.produtos[0].nutritionText, /Kcal: 455/);

  const orderId = createdOrder.body.order.id;
  const epsResponse = await fetch(`${baseUrl}/api/rotulos/orders/${orderId}/items/0/eps`);
  const eps = Buffer.from(await epsResponse.arrayBuffer());
  assert.equal(epsResponse.status, 200);
  assert.match(epsResponse.headers.get('content-disposition'), /filename="90un-Frango-a-portuguesa\.eps"/);
  assert.equal(eps.includes(Buffer.from('CutContour', 'latin1')), true);
  assert.equal(eps.includes(Buffer.from('%%LabelText: Frango a portuguesa', 'latin1')), true);
  assert.equal(eps.includes(Buffer.from('%%LabelNutrition: kcal=455', 'latin1')), true);

  const zipResponse = await fetch(`${baseUrl}/api/rotulos/orders/${orderId}/eps`);
  const zip = Buffer.from(await zipResponse.arrayBuffer());
  assert.equal(zipResponse.status, 200);
  assert.equal(zipResponse.headers.get('content-type'), 'application/zip');
  assert.match(zipResponse.headers.get('content-disposition'), /filename="ROT-\d+-[A-F0-9]+-eps\.zip"/);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.includes(Buffer.from('90un-Frango-a-portuguesa.eps')), true);
  assert.equal(zip.includes(Buffer.from('45un-Caril-de-legumes.eps')), true);

  const payment = await post(`/api/rotulos/orders/${orderId}/payments`, { value: 40, method: 'mbway' });
  assert.equal(payment.response.status, 200);
  assert.equal(payment.body.totalPago, 40);
  assert.equal(payment.body.saldoPendente, 37.85);

  const status = await post(`/api/rotulos/orders/${orderId}/status`, { status: 'processamento' });
  assert.equal(status.response.status, 200);
  const refreshed = await request(`/api/rotulos/public/session?token=${encodeURIComponent(token)}`);
  const order = refreshed.body.orders.find(item => item.id === orderId);
  assert.equal(order.status, 'processamento');
  assert.equal(order.totalPago, 40);
  assert.equal(order.saldoPendente, 37.85);
  const earlyHideOrder = await post(`/api/rotulos/public/records/${orderId}/hide`, { token });
  assert.equal(earlyHideOrder.response.status, 400);
  const finalPayment = await post(`/api/rotulos/orders/${orderId}/payments`, { value: 37.85, method: 'mbway' });
  assert.equal(finalPayment.response.status, 200);
  const hiddenOrder = await post(`/api/rotulos/public/records/${orderId}/hide`, { token });
  assert.equal(hiddenOrder.response.status, 200);
  const afterOrderHide = await request(`/api/rotulos/public/session?token=${encodeURIComponent(token)}`);
  assert.equal(afterOrderHide.body.orders.some(item => item.id === orderId), false);
  const adminKeepsHiddenOrder = await request('/api/rotulos/orders');
  assert.equal(adminKeepsHiddenOrder.body.orders.some(item => item.id === orderId), true);

  const invalidQuantity = await post('/api/rotulos/public/orders', {
    token,
    items: [{ templateId: 'proteico-grande', mealName: 'Quantidade inválida', quantity: 20, taxMode: 'iva' }]
  });
  assert.equal(invalidQuantity.response.status, 400);
  assert.match(invalidQuantity.body.message, /múltipla de 15/);
});

test('estatísticas respondem sem exigir índice composto do Firestore', async () => {
  const { response, body } = await request('/api/database/stats');
  assert.equal(response.status, 200);
  assert.equal(body.status, 'success');
  assert.equal(typeof body.stats.total, 'number');
});

test('neutraliza HTML perigoso que ja exista no banco', async () => {
  await db.collection('events').doc('legacy-xss').set({
    schema: 'pedido',
    payload: { cliente: '<img src=x onerror=alert(1)>' },
    deleted: false,
    timestamp: new Date().toISOString()
  });

  const result = await post('/api/database/query', { schema: 'pedido', filters: { id: 'legacy-xss' } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.events[0].payload.cliente, '&lt;img src=x onerror=alert(1)&gt;');
});
