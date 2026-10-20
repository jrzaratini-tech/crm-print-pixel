'use strict';

const FINANCEIRO = require('./financeiro.js');

function text(value) { return String(value || '').trim(); }
function date(value) { if (!value) return null; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed; }
function money(value) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0; }

function eventDate(event = {}) {
  const payload = event.payload || {};
  const value = event.schema === 'pedido' && payload.dataPedido
    ? payload.dataPedido
    : event.schema === 'despesa' && (payload.dataCompra || payload.dataDespesa || payload.dataFatura)
      ? (payload.dataCompra || payload.dataDespesa || payload.dataFatura)
      : event.schema === 'fatura_venda' && payload.dataFatura
        ? payload.dataFatura
        : (event.created_at || payload.dataCriacao || event.timestamp || event.createdAt);
  return date(value);
}

function periodRange(now, mode) {
  const year = now.getFullYear();
  const month = now.getMonth();
  if (mode === 'previousMonth') return { start: new Date(year, month - 1, 1), end: new Date(year, month, 0, 23, 59, 59, 999) };
  if (mode === 'quarter') return { start: new Date(year, month - 3, 1), end: new Date(year, month, 0, 23, 59, 59, 999) };
  if (mode === 'year') return { start: new Date(year, 0, 1), end: new Date(year, month, now.getDate(), 23, 59, 59, 999) };
  if (mode === 'all') return { start: new Date(0), end: new Date(8640000000000000) };
  return { start: new Date(year, month, 1), end: new Date(year, month, now.getDate(), 23, 59, 59, 999) };
}

function dashboardPeriod(events, now, mode) {
  const range = periodRange(now, mode);
  const orders = events.filter(event => event.schema === 'pedido' && eventDate(event) && eventDate(event) >= range.start && eventDate(event) <= range.end);
  const expenses = events.filter(event => event.schema === 'despesa' && eventDate(event) && eventDate(event) >= range.start && eventDate(event) <= range.end);
  const activeOrders = orders.filter(event => /^(pendente|processamento|produção|producao)$/i.test(text(event.payload?.status)));
  const completedOrders = orders.filter(event => /^(concluido|concluído|entregue|finalizado)$/i.test(text(event.payload?.status)));
  return {
    netRevenue: money(orders.reduce((sum, event) => sum + FINANCEIRO.faturamentoSemIva(event.payload || {}), 0)),
    grossRevenue: money(orders.reduce((sum, event) => sum + FINANCEIRO.totalComIva(event.payload || {}), 0)),
    expenses: money(expenses.reduce((sum, event) => sum + FINANCEIRO.numero(event.payload?.valorTotal ?? event.payload?.total ?? event.payload?.valorBruto ?? event.payload?.valor), 0)),
    orderCount: orders.length,
    activeOrders: activeOrders.length,
    completedOrders: completedOrders.length,
    sourceIds: orders.map(event => event.id),
    expenseSourceIds: expenses.map(event => event.id),
    activeOrderSourceIds: activeOrders.map(event => event.id)
  };
}

function dashboardSnapshot(events, now) {
  const orders = events.filter(event => event.schema === 'pedido');
  const expenses = events.filter(event => event.schema === 'despesa');
  const receivable = orders.reduce((sum, event) => {
    const payload = event.payload || {};
    const total = FINANCEIRO.totalComIva(payload);
    const savedBalance = payload.saldoRestante ?? payload.saldoPendente;
    const paid = FINANCEIRO.numero(payload.totalPago ?? payload.valorPago ?? payload.pago);
    return sum + Math.max(0, savedBalance !== undefined && savedBalance !== null && savedBalance !== '' ? FINANCEIRO.numero(savedBalance) : total - paid);
  }, 0);
  const payable = expenses.reduce((sum, event) => {
    const payload = event.payload || {};
    if (/^(pago|paga|paid|liquidado|finalizado)$/i.test(text(payload.statusPagamento || payload.status))) return sum;
    const savedBalance = payload.saldoRestante ?? payload.saldoPendente;
    const total = FINANCEIRO.numero(payload.valorTotal ?? payload.total ?? payload.valorBruto ?? payload.valor);
    const paidFromList = Array.isArray(payload.pagamentos) ? payload.pagamentos.reduce((subtotal, payment) => subtotal + FINANCEIRO.numero(payment.valor ?? payment.valorPago ?? payment.total), 0) : 0;
    const paid = paidFromList || FINANCEIRO.numero(payload.totalPago ?? payload.valorPago ?? payload.pago);
    return sum + Math.max(0, savedBalance !== undefined && savedBalance !== null && savedBalance !== '' ? FINANCEIRO.numero(savedBalance) : total - paid);
  }, 0);
  return {
    currentMonth: dashboardPeriod(events, now, 'currentMonth'),
    previousMonth: dashboardPeriod(events, now, 'previousMonth'),
    lastCompleteQuarter: dashboardPeriod(events, now, 'quarter'),
    currentYear: dashboardPeriod(events, now, 'year'),
    allTime: dashboardPeriod(events, now, 'all'),
    accounts: {
      receivable: money(receivable),
      payable: money(payable),
      receivableSourceIds: orders.map(event => event.id),
      payableSourceIds: expenses.map(event => event.id)
    }
  };
}

function buildBriefing(input = {}, options = {}) {
  const now = date(options.now) || new Date();
  const today = now.toISOString().slice(0, 10);
  const events = Array.isArray(input.events) ? input.events.filter(event => !event.deleted) : [];
  const orders = events.filter(event => event.schema === 'pedido');
  const quotes = events.filter(event => event.schema === 'orcamento');
  const expenses = events.filter(event => event.schema === 'despesa');
  const assignments = Array.isArray(input.assignments) ? input.assignments.filter(item => item.active !== false) : [];
  const materials = Array.isArray(input.materials) ? input.materials.filter(item => item.ativo !== false) : [];
  const jobs = Array.isArray(input.jobs) ? input.jobs : [];
  const exceptions = Array.isArray(input.exceptions) ? input.exceptions.filter(item => item.status !== 'resolved') : [];

  const openOrders = orders.filter(event => !/concluido|entregue|cancelado/i.test(text(event.payload?.status)));
  const lateOrders = openOrders.filter(event => event.payload?.dataEntrega && text(event.payload.dataEntrega).slice(0, 10) < today);
  const uninvoiced = orders.filter(event => !event.payload?.numeroFatura && !event.payload?.faturado && !/cancelado/i.test(text(event.payload?.status)));
  const openQuotes = quotes.filter(event => !/convertido|rejeitado|cancelado/i.test(text(event.payload?.status)));
  const lowStock = materials.filter(material => Number(material.estoqueMinimo || 0) > 0 && Number(material.estoqueAtual || 0) <= Number(material.estoqueMinimo || 0));
  const failedJobs = jobs.filter(job => job.status === 'failed');
  const activeAssignments = assignments.filter(item => item.paymentStatus !== 'paid');
  const pendingExpenses = expenses.filter(event => /pending|a classificar/i.test(text(`${event.payload?.classificationStatus} ${event.payload?.categoria}`)));
  const dashboard = dashboardSnapshot(events, now);

  const alerts = [];
  lateOrders.forEach(event => alerts.push({ severity: 'high', type: 'delay', message: `${event.payload?.numero || event.id} está atrasado.`, source: { schema: 'pedido', id: event.id } }));
  failedJobs.forEach(job => alerts.push({ severity: 'high', type: 'integration', message: `${job.source}/${job.operation} falhou após ${job.attempt} tentativa(s).`, source: { collection: 'integration_jobs', id: job.id } }));
  exceptions.forEach(item => alerts.push({ severity: 'medium', type: 'exception', message: `${item.orderNumber || item.externalOrderId || item.id} precisa de intervenção.`, source: { collection: 'integration_exceptions', id: item.id } }));
  lowStock.forEach(material => alerts.push({ severity: 'medium', type: 'stock', message: `${material.nome} atingiu o stock mínimo.`, source: { schema: 'material', id: material.id } }));
  pendingExpenses.forEach(event => alerts.push({ severity: 'medium', type: 'fiscal', message: `Despesa ${event.payload?.fornecedor || event.id} aguarda classificação.`, source: { schema: 'despesa', id: event.id } }));

  return {
    generatedAt: now.toISOString(),
    metrics: {
      openOrders: openOrders.length, lateOrders: lateOrders.length, openQuotes: openQuotes.length,
      activeAssignments: activeAssignments.length, uninvoicedOrders: uninvoiced.length,
      lowStockMaterials: lowStock.length, failedIntegrations: failedJobs.length,
      openIntegrationExceptions: exceptions.length,
      openOrderValue: money(openOrders.reduce((sum, event) => sum + money(event.payload?.total), 0))
    },
    dashboard,
    alerts: alerts.slice(0, 100),
    summary: alerts.length
      ? `${alerts.filter(item => item.severity === 'high').length} alerta(s) prioritário(s) e ${alerts.length} alerta(s) no total exigem atenção.`
      : 'Não existem alertas operacionais pendentes nos dados consultados.',
    sources: { events: events.length, assignments: assignments.length, materials: materials.length, jobs: jobs.length, exceptions: exceptions.length }
  };
}

function answerQuestion(question, briefing) {
  const value = text(question).toLowerCase();
  let metric = '';
  if (/(quanto|qual|valor|total|mostra|dashboard|painel).*(fatur|receita|vendas)|(faturamento|faturação|receita|vendas).*(quanto|qual|valor|total|dashboard|painel)/.test(value)) {
    const periodKey = /m[eê]s anterior|ultimo mes|último mês/.test(value) ? 'previousMonth'
      : /trimestre/.test(value) ? 'lastCompleteQuarter'
        : /ano/.test(value) ? 'currentYear'
          : /todo|total histor|sempre/.test(value) ? 'allTime'
            : 'currentMonth';
    const period = briefing.dashboard?.[periodKey] || { netRevenue: 0, grossRevenue: 0, orderCount: 0, sourceIds: [] };
    const labels = { currentMonth: 'mês atual', previousMonth: 'mês anterior', lastCompleteQuarter: 'último trimestre completo', currentYear: 'ano atual', allTime: 'todo o período' };
    return {
      understood: true,
      metric: `dashboard.${periodKey}.revenue`,
      value: period.grossRevenue,
      answer: `No dashboard, o faturamento de ${labels[periodKey]} é ${period.netRevenue.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })} líquido e ${period.grossRevenue.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })} bruto, calculado a partir de ${period.orderCount} pedido(s).`,
      sources: (period.sourceIds || []).map(id => ({ schema: 'pedido', id }))
    };
  }
  if (/(quanto|qual|valor|total|mostra|dashboard|painel).*(despes)|(despes).*(quanto|qual|valor|total|dashboard|painel)/.test(value)) {
    const period = briefing.dashboard?.currentMonth || { expenses: 0, expenseSourceIds: [] };
    return { understood: true, metric: 'dashboard.currentMonth.expenses', value: period.expenses, answer: `As despesas mostradas no dashboard para o mês atual totalizam ${period.expenses.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}.`, sources: (period.expenseSourceIds || []).map(id => ({ schema: 'despesa', id })) };
  }
  if (/restante a receber|contas? a receber|quanto.*receber|receber.*quanto/.test(value)) {
    const accounts = briefing.dashboard?.accounts || { receivable: 0, receivableSourceIds: [] };
    return { understood: true, metric: 'dashboard.accounts.receivable', value: accounts.receivable, answer: `O restante a receber mostrado no dashboard é ${accounts.receivable.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}.`, sources: (accounts.receivableSourceIds || []).map(id => ({ schema: 'pedido', id })) };
  }
  if (/restante a pagar|contas? a pagar|quanto.*pagar|pagar.*quanto/.test(value)) {
    const accounts = briefing.dashboard?.accounts || { payable: 0, payableSourceIds: [] };
    return { understood: true, metric: 'dashboard.accounts.payable', value: accounts.payable, answer: `O restante a pagar mostrado no dashboard é ${accounts.payable.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}.`, sources: (accounts.payableSourceIds || []).map(id => ({ schema: 'despesa', id })) };
  }
  if (/quantos?.*(pedidos? ativos?)|pedidos? ativos?.*(quantos?|dashboard|painel)/.test(value)) {
    const period = briefing.dashboard?.currentMonth || { activeOrders: 0, activeOrderSourceIds: [] };
    return { understood: true, metric: 'dashboard.currentMonth.activeOrders', value: period.activeOrders, answer: `O dashboard mostra ${period.activeOrders} pedido(s) ativo(s) no mês atual.`, sources: (period.activeOrderSourceIds || []).map(id => ({ schema: 'pedido', id })) };
  }
  if (/meu dia|começar|comecar|resumo geral|situação geral|situacao geral|organiza/.test(value)) {
    const metrics = briefing.metrics;
    const opening = briefing.alerts.length ? briefing.summary : 'Não existem alertas operacionais pendentes.';
    return {
      understood: true,
      metric: 'dailyOverview',
      value: briefing.alerts.length,
      answer: `${opening} Estão em acompanhamento ${metrics.openOrders} pedido(s), ${metrics.activeAssignments} trabalho(s) em produção, ${metrics.openQuotes} orçamento(s) em aberto e ${metrics.uninvoicedOrders} pedido(s) sem faturação registada.`,
      sources: briefing.alerts.map(alert => alert.source)
    };
  }
  if (/prioridad|atenção|atencao/.test(value)) {
    return {
      understood: true,
      metric: 'priorities',
      value: briefing.alerts.length,
      answer: briefing.summary,
      sources: briefing.alerts.map(alert => alert.source)
    };
  }
  if (/atras|prazo/.test(value)) metric = 'lateOrders';
  else if (/sem fatur|falta fatur|por fatur|pedido.*fatura|fatura.*pedido/.test(value)) metric = 'uninvoicedOrders';
  else if (/stock|material|comprar/.test(value)) metric = 'lowStockMaterials';
  else if (/integra|shopify|erro|falha/.test(value)) metric = 'failedIntegrations';
  else if (/orçamento|orcamento|proposta/.test(value)) metric = 'openQuotes';
  else if (/produção|producao|ordem/.test(value)) metric = 'activeAssignments';
  if (!metric) return { understood: false, answer: 'A pergunta não corresponde a um indicador determinístico disponível.', sources: [] };
  const alerts = briefing.alerts.filter(alert => ({ lateOrders: 'delay', uninvoicedOrders: 'billing', lowStockMaterials: 'stock', failedIntegrations: 'integration' }[metric] === alert.type));
  const count = Number(briefing.metrics[metric] || 0);
  const messages = {
    lateOrders: count ? `Existem ${count} pedido(s) fora do prazo que precisam de acompanhamento.` : 'Não existem pedidos atrasados neste momento.',
    uninvoicedOrders: count ? `Existem ${count} pedido(s) ainda sem faturação registada.` : 'Todos os pedidos aplicáveis têm faturação registada.',
    lowStockMaterials: count ? `Existem ${count} material(is) no nível mínimo de stock.` : 'Não existem materiais abaixo do stock mínimo.',
    failedIntegrations: count ? `Existem ${count} integração(ões) em falha que precisam de revisão.` : 'As integrações não apresentam falhas finais.',
    openQuotes: count ? `Existem ${count} orçamento(s) em aberto a aguardar decisão.` : 'Não existem orçamentos em aberto.',
    activeAssignments: count ? `Existem ${count} trabalho(s) ativos em produção.` : 'Não existem trabalhos ativos em produção.'
  };
  return { understood: true, metric, value: count, answer: messages[metric], sources: alerts.map(alert => alert.source) };
}

module.exports = { answerQuestion, buildBriefing };
