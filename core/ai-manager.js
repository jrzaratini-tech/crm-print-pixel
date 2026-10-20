'use strict';

function text(value) { return String(value || '').trim(); }
function date(value) { const parsed = new Date(value || 0); return Number.isNaN(parsed.getTime()) ? null : parsed; }
function money(value) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0; }

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
  if (/atras|prazo/.test(value)) metric = 'lateOrders';
  else if (/fatur|fatura/.test(value)) metric = 'uninvoicedOrders';
  else if (/stock|material|comprar/.test(value)) metric = 'lowStockMaterials';
  else if (/integra|shopify|erro|falha/.test(value)) metric = 'failedIntegrations';
  else if (/orçamento|orcamento|proposta/.test(value)) metric = 'openQuotes';
  else if (/produção|producao|ordem/.test(value)) metric = 'activeAssignments';
  if (!metric) return { understood: false, answer: 'A pergunta não corresponde a um indicador determinístico disponível.', sources: [] };
  const alerts = briefing.alerts.filter(alert => ({ lateOrders: 'delay', uninvoicedOrders: 'billing', lowStockMaterials: 'stock', failedIntegrations: 'integration' }[metric] === alert.type));
  return { understood: true, metric, value: briefing.metrics[metric], answer: `O indicador ${metric} tem valor ${briefing.metrics[metric]}.`, sources: alerts.map(alert => alert.source) };
}

module.exports = { answerQuestion, buildBriefing };
