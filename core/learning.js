'use strict';

function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function text(value, fallback = 'Sem família') { return String(value || fallback).trim().slice(0, 160); }
function median(values = []) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function confidence(sampleSize, dispersion) {
  if (sampleSize >= 20 && dispersion <= 0.2) return 'high';
  if (sampleSize >= 10 && dispersion <= 0.35) return 'medium';
  return 'low';
}

function recommendations(records = [], options = {}) {
  const minimumSample = Math.max(3, Number(options.minimumSample || 5));
  const groups = new Map();
  records.forEach(record => {
    const family = text(record.family || record.productFamily || record.productName);
    const estimated = number(record.estimatedMinutes);
    const actual = number(record.actualMinutes);
    if (!(estimated > 0 && actual > 0)) return;
    const ratio = actual / estimated;
    if (ratio < 0.25 || ratio > 4) return;
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family).push({ ...record, ratio });
  });
  return Array.from(groups.entries()).map(([family, samples]) => {
    const ratios = samples.map(item => item.ratio);
    const factor = median(ratios);
    const mad = median(ratios.map(value => Math.abs(value - factor)));
    const dispersion = factor ? mad / factor : 1;
    return {
      id: `learning-${family.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      family, sampleSize: samples.length, minimumSample,
      eligible: samples.length >= minimumSample,
      confidence: confidence(samples.length, dispersion),
      currentFactor: 1,
      recommendedTimeFactor: Math.round(factor * 1000) / 1000,
      dispersion: Math.round(dispersion * 1000) / 1000,
      explanation: samples.length < minimumSample
        ? `Amostra insuficiente: ${samples.length}/${minimumSample} trabalhos válidos.`
        : `Mediana do tempo realizado versus previsto em ${samples.length} trabalhos, após remoção de anomalias extremas.`,
      sourceIds: samples.map(item => String(item.id || '')).filter(Boolean)
    };
  }).sort((a, b) => a.family.localeCompare(b.family, 'pt'));
}

function approval(recommendation = {}, input = {}, options = {}) {
  if (!recommendation.eligible) throw new Error('A recomendação ainda não possui amostra mínima.');
  if (!['approve', 'reject', 'revert'].includes(input.action)) throw new Error('Ação de aprendizagem inválida.');
  return {
    id: options.id || `${recommendation.id}-v${Math.max(1, Number(options.version || 1))}`,
    recommendationId: recommendation.id,
    family: recommendation.family,
    version: Math.max(1, Number(options.version || 1)),
    action: input.action,
    factor: input.action === 'approve' ? recommendation.recommendedTimeFactor : 1,
    confidence: recommendation.confidence,
    sampleSize: recommendation.sampleSize,
    explanation: recommendation.explanation,
    notes: text(input.notes, ''),
    approvedBy: text(options.approvedBy, 'system'),
    createdAt: options.now || new Date().toISOString()
  };
}

module.exports = { approval, confidence, median, recommendations };
