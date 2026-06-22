const fs = require('fs');
const path = require('path');

const TEMPLATE_ROOT = path.join(__dirname, '..', 'assets', 'rotulos', 'templates');

const LABEL_TEMPLATES = [
  {
    id: 'proteico-grande',
    category: 'Proteico',
    size: 'Grande',
    dimensions: '85 x 156 mm',
    file: 'proteico-grande.eps',
    preview: '/rotulos/previews/proteico-grande.webp',
    marker: 'Picadinho de vitela',
    originalText: 'Picadinho de vitela',
    baseFontSize: 56444,
    originalOffset: -236913
  },
  {
    id: 'proteico-pequeno',
    category: 'Proteico',
    size: 'Pequeno',
    dimensions: '54 x 89 mm',
    file: 'proteico-pequeno.eps',
    preview: '/rotulos/previews/proteico-pequeno.webp',
    marker: 'Fusilli gratinado c/ atum',
    originalText: 'Fusilli gratinado c/ atum',
    baseFontSize: 31750,
    originalOffset: -167642
  },
  {
    id: 'lowcarb-grande',
    category: 'Lowcarb',
    size: 'Grande',
    dimensions: '85 x 156 mm',
    file: 'lowcarb-grande.eps',
    preview: '/rotulos/previews/lowcarb-grande.webp',
    marker: 'Escalopes de frango ao molho de mostarda',
    originalText: 'Escalopes de frango ao molho de mostarda',
    baseFontSize: 38251,
    originalOffset: -369993
  },
  {
    id: 'lowcarb-pequeno',
    category: 'Lowcarb',
    size: 'Pequeno',
    dimensions: '54 x 89 mm',
    file: 'lowcarb-pequeno.eps',
    preview: '/rotulos/previews/lowcarb-pequeno.webp',
    marker: 'Lasanha lowcard de pescada',
    originalText: 'Lasanha lowcard de pescada',
    baseFontSize: 28222,
    originalOffset: 0
  },
  {
    id: 'vegetariano-grande',
    category: 'Vegetariano',
    size: 'Grande',
    dimensions: '85 x 156 mm',
    file: 'vegetariano-grande.eps',
    preview: '/rotulos/previews/vegetariano-grande.webp',
    marker: 'Caril de legumes c/ gr\\343o de bico',
    originalText: 'Caril de legumes c/ grão de bico',
    baseFontSize: 54194,
    originalOffset: 0
  },
  {
    id: 'vegetariano-pequeno',
    category: 'Vegetariano',
    size: 'Pequeno',
    dimensions: '54 x 89 mm',
    file: 'vegetariano-pequeno.eps',
    preview: '/rotulos/previews/vegetariano-pequeno.webp',
    marker: 'orta prot\\351ica vegetariana',
    originalText: 'Torta protéica vegetariana',
    baseFontSize: 31494,
    originalOffset: 0
  }
];

function templateById(id) {
  return LABEL_TEMPLATES.find(template => template.id === id) || null;
}

function publicTemplates() {
  return LABEL_TEMPLATES.map(({ file, marker, originalText, baseFontSize, originalOffset, ...template }) => template);
}

function textWeight(value) {
  return Array.from(String(value || '')).reduce((total, character) => {
    if (/\s/.test(character)) return total + 0.32;
    if (/[ilI1.,'|]/.test(character)) return total + 0.32;
    if (/[mwMW@%]/.test(character)) return total + 0.9;
    if (/[A-ZÀ-Ý]/.test(character)) return total + 0.67;
    return total + 0.55;
  }, 0);
}

function postScriptString(value) {
  return Array.from(String(value || '')).map(character => {
    if (character === '\\' || character === '(' || character === ')') return `\\${character}`;
    const code = character.charCodeAt(0);
    if (code >= 32 && code <= 126) return character;
    if (code <= 255) return `\\${code.toString(8).padStart(3, '0')}`;
    const fallback = character.normalize('NFD').replace(/[\u0300-\u036f]/g, '')[0];
    return fallback && fallback.charCodeAt(0) <= 126 ? fallback : '?';
  }).join('');
}

function splitBinaryEps(buffer) {
  const isDosEps = buffer.length >= 30 && buffer.readUInt32LE(0) === 0xc6d3d0c5;
  if (!isDosEps) return { prefix: null, postScript: buffer, suffix: Buffer.alloc(0) };

  const postScriptOffset = buffer.readUInt32LE(4);
  const postScriptLength = buffer.readUInt32LE(8);
  const previewOffset = buffer.readUInt32LE(20);
  const previewLength = buffer.readUInt32LE(24);
  const suffixStart = previewLength ? previewOffset : postScriptOffset + postScriptLength;

  return {
    prefix: Buffer.from(buffer.subarray(0, postScriptOffset)),
    postScript: Buffer.from(buffer.subarray(postScriptOffset, postScriptOffset + postScriptLength)),
    suffix: Buffer.from(buffer.subarray(suffixStart)),
    previewLength
  };
}

function rebuildBinaryEps(parts, postScript) {
  if (!parts.prefix) return postScript;
  const prefix = Buffer.from(parts.prefix);
  const postScriptOffset = prefix.length;
  const previewOffset = postScriptOffset + postScript.length;
  prefix.writeUInt32LE(postScriptOffset, 4);
  prefix.writeUInt32LE(postScript.length, 8);
  prefix.writeUInt32LE(previewOffset, 20);
  prefix.writeUInt32LE(parts.previewLength || parts.suffix.length, 24);
  return Buffer.concat([prefix, postScript, parts.suffix]);
}

function generateLabelEps(templateId, mealName) {
  const template = templateById(templateId);
  if (!template) throw new Error('Modelo de rótulo inválido.');

  const cleanName = String(mealName || '').replace(/\s+/g, ' ').trim();
  if (!cleanName || cleanName.length > 60) throw new Error('O nome da marmita deve ter entre 1 e 60 caracteres.');

  const source = fs.readFileSync(path.join(TEMPLATE_ROOT, template.file));
  const parts = splitBinaryEps(source);
  const postScript = parts.postScript.toString('latin1');
  const markerIndex = postScript.indexOf(template.marker);
  if (markerIndex < 0) throw new Error(`Texto variável não encontrado no modelo ${template.id}.`);

  const fontStart = postScript.lastIndexOf('/_', markerIndex);
  const textEnd = postScript.indexOf('\nT', markerIndex);
  if (fontStart < 0 || textEnd < 0) throw new Error(`Bloco de texto inválido no modelo ${template.id}.`);

  const originalBlock = postScript.slice(fontStart, textEnd + 2);
  const fontMatch = originalBlock.match(/^(\/_[^\s]+-ArialMT)\s+[\d.]+\s+z/m);
  if (!fontMatch) throw new Error(`Fonte variável não encontrada no modelo ${template.id}.`);

  const originalWeight = Math.max(1, textWeight(template.originalText));
  const newWeight = Math.max(1, textWeight(cleanName));
  const fitRatio = Math.min(1, originalWeight / newWeight);
  const fontSize = Math.round(template.baseFontSize * Math.max(0.48, fitRatio));
  const renderedRatio = (fontSize * newWeight) / (template.baseFontSize * originalWeight);
  const offset = template.originalOffset
    ? Math.round(template.originalOffset * renderedRatio)
    : 0;
  const replacement = `${fontMatch[1]} ${fontSize.toFixed(5)} z\r\n${offset} 0 (${postScriptString(cleanName)}) @t\r\nT`;
  const generatedPostScript = Buffer.from(
    postScript.slice(0, fontStart) + replacement + postScript.slice(textEnd + 2),
    'latin1'
  );
  const result = rebuildBinaryEps(parts, generatedPostScript);

  if (!result.includes(Buffer.from('CutContour', 'latin1'))) {
    throw new Error('A linha CutContour não foi preservada no EPS gerado.');
  }
  return result;
}

function safeFilename(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'rotulo';
}

module.exports = {
  LABEL_TEMPLATES,
  generateLabelEps,
  publicTemplates,
  safeFilename,
  templateById
};
