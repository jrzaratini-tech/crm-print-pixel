const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

const TEMPLATE_ROOT = path.join(__dirname, '..', 'assets', 'rotulos', 'templates');
const LABEL_FONT_PATH = path.join(__dirname, '..', 'assets', 'fonts', 'Arimo-Variable.ttf');
const LABEL_FONT = opentype.loadSync(LABEL_FONT_PATH);

const LABEL_TEMPLATES = [
  {
    id: 'proteico-grande',
    category: 'Proteico',
    size: 'Grande',
    dimensions: '85 x 156 mm',
    file: 'proteico-grande.eps',
    nutritionFile: 'proteico-grande-nutricional.eps',
    preview: '/rotulos/previews/proteico-grande.webp',
    marker: 'Picadinho de vitela',
    originalText: 'Picadinho de vitela',
    baseFontSize: 56444,
    nutritionFontSize: 22595,
    originalOffset: -236913
  },
  {
    id: 'proteico-pequeno',
    category: 'Proteico',
    size: 'Pequeno',
    dimensions: '54 x 89 mm',
    file: 'proteico-pequeno.eps',
    nutritionFile: 'proteico-pequeno-nutricional.eps',
    preview: '/rotulos/previews/proteico-pequeno.webp',
    marker: 'Fusilli gratinado c/ atum',
    originalText: 'Fusilli gratinado c/ atum',
    baseFontSize: 31750,
    nutritionFontSize: 18590,
    originalOffset: -167642
  },
  {
    id: 'lowcarb-grande',
    category: 'Lowcarb',
    size: 'Grande',
    dimensions: '85 x 156 mm',
    file: 'lowcarb-grande.eps',
    nutritionFile: 'lowcarb-grande-nutricional.eps',
    preview: '/rotulos/previews/lowcarb-grande.webp',
    marker: 'Escalopes de frango ao molho de mostarda',
    nutritionMarker: 'Escalopes de frang',
    nutritionOriginalText: 'Escalopes de frango',
    nutritionRemoveMarkers: ['(o)'],
    originalText: 'Escalopes de frango ao molho de mostarda',
    baseFontSize: 38251,
    nutritionFontSize: 22595,
    originalOffset: -369993
  },
  {
    id: 'lowcarb-pequeno',
    category: 'Lowcarb',
    size: 'Pequeno',
    dimensions: '54 x 89 mm',
    file: 'lowcarb-pequeno.eps',
    nutritionFile: 'lowcarb-pequeno-nutricional.eps',
    preview: '/rotulos/previews/lowcarb-pequeno.webp',
    marker: 'Lasanha lowcard de pescada',
    originalText: 'Lasanha lowcard de pescada',
    baseFontSize: 28222,
    nutritionFontSize: 18590,
    originalOffset: 0
  },
  {
    id: 'vegetariano-grande',
    category: 'Vegetariano',
    size: 'Grande',
    dimensions: '85 x 156 mm',
    file: 'vegetariano-grande.eps',
    nutritionFile: 'vegetariano-grande-nutricional.eps',
    preview: '/rotulos/previews/vegetariano-grande.webp',
    marker: 'Caril de legumes c/ gr\\343o de bico',
    nutritionMarker: 'Caril de legumes',
    nutritionOriginalText: 'Caril de legumes',
    originalText: 'Caril de legumes c/ grão de bico',
    baseFontSize: 54194,
    nutritionFontSize: 22595,
    originalOffset: 0
  },
  {
    id: 'vegetariano-pequeno',
    category: 'Vegetariano',
    size: 'Pequeno',
    dimensions: '54 x 89 mm',
    file: 'vegetariano-pequeno.eps',
    nutritionFile: 'vegetariano-pequeno-nutricional.eps',
    preview: '/rotulos/previews/vegetariano-pequeno.webp',
    marker: 'orta prot\\351ica vegetariana',
    originalText: 'Torta protéica vegetariana',
    baseFontSize: 31494,
    nutritionFontSize: 18590,
    originalOffset: 0
  }
];

const NUTRITION_FIELDS = [
  { key: 'kcal', label: 'Kcal', marker: '455', unit: '' },
  { key: 'protein', label: 'Proteina', marker: '18g', unit: 'g' },
  { key: 'carbs', label: 'Hidratos', marker: '54g', unit: 'g' },
  { key: 'fat', label: 'Gorduras', marker: '16g', unit: 'g' },
  { key: 'fiber', label: 'Fibras', marker: '10g', unit: 'g' }
];

function templateById(id) {
  return LABEL_TEMPLATES.find(template => template.id === id) || null;
}

function publicTemplates() {
  return LABEL_TEMPLATES.map(({
    file,
    nutritionFile,
    marker,
    nutritionMarker,
    nutritionOriginalText,
    nutritionRemoveMarkers,
    originalText,
    baseFontSize,
    nutritionFontSize,
    originalOffset,
    ...template
  }) => template);
}

function postScriptNumber(value) {
  return Number(value.toFixed(3)).toString();
}

function vectorTextPostScript(value, fontSize, offset) {
  const outline = LABEL_FONT.getPath(value, offset, 0, fontSize);
  const commands = ['% Texto convertido em curvas para preservar todos os caracteres', 'newpath'];
  let currentX = 0;
  let currentY = 0;

  outline.commands.forEach(command => {
    if (command.type === 'M') {
      currentX = command.x;
      currentY = -command.y;
      commands.push(`${postScriptNumber(currentX)} ${postScriptNumber(currentY)} moveto`);
    } else if (command.type === 'L') {
      currentX = command.x;
      currentY = -command.y;
      commands.push(`${postScriptNumber(currentX)} ${postScriptNumber(currentY)} lineto`);
    } else if (command.type === 'C') {
      currentX = command.x;
      currentY = -command.y;
      commands.push(
        `${postScriptNumber(command.x1)} ${postScriptNumber(-command.y1)} `
        + `${postScriptNumber(command.x2)} ${postScriptNumber(-command.y2)} `
        + `${postScriptNumber(currentX)} ${postScriptNumber(currentY)} curveto`
      );
    } else if (command.type === 'Q') {
      const controlX1 = currentX + (2 / 3) * (command.x1 - currentX);
      const controlY1 = currentY + (2 / 3) * (-command.y1 - currentY);
      const endX = command.x;
      const endY = -command.y;
      const controlX2 = endX + (2 / 3) * (command.x1 - endX);
      const controlY2 = endY + (2 / 3) * (-command.y1 - endY);
      commands.push(
        `${postScriptNumber(controlX1)} ${postScriptNumber(controlY1)} `
        + `${postScriptNumber(controlX2)} ${postScriptNumber(controlY2)} `
        + `${postScriptNumber(endX)} ${postScriptNumber(endY)} curveto`
      );
      currentX = endX;
      currentY = endY;
    } else if (command.type === 'Z') {
      commands.push('closepath');
    }
  });
  commands.push('fill');
  return commands.join('\r\n');
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

function replaceTextBlock(postScript, marker, replacement, startAt, templateId) {
  const markerIndex = postScript.indexOf(marker, startAt);
  if (markerIndex < 0) throw new Error(`Texto variavel nao encontrado no modelo ${templateId}.`);

  const fontStart = postScript.lastIndexOf('/_', markerIndex);
  const textEnd = postScript.indexOf('\nT', markerIndex);
  if (fontStart < 0 || textEnd < 0) throw new Error(`Bloco de texto invalido no modelo ${templateId}.`);
  return {
    postScript: postScript.slice(0, fontStart) + replacement + postScript.slice(textEnd + 2),
    markerIndex
  };
}

function formattedNutritionValue(nutrition, field) {
  const raw = nutrition?.[field.key];
  const normalized = String(raw ?? '').replace(',', '.').replace(/[^\d.]/g, '');
  if (!normalized) return '';
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0 || number > 9999) return '';
  const value = Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2))).replace('.', ',');
  return `${value}${field.unit}`;
}

function hasCompleteNutrition(nutrition) {
  return NUTRITION_FIELDS.every(field => formattedNutritionValue(nutrition, field));
}

function nutritionSummary(nutrition) {
  return NUTRITION_FIELDS
    .map(field => `${field.label}: ${formattedNutritionValue(nutrition, field)}`)
    .join(' | ');
}

function mealTextTargetWidth(template, withNutrition) {
  const referenceText = withNutrition && template.nutritionOriginalText
    ? template.nutritionOriginalText
    : template.originalText;
  return LABEL_FONT.getAdvanceWidth(referenceText, template.baseFontSize);
}

function mealTextOffset(template, renderedWidth, targetWidth) {
  if (template.originalOffset) return Math.round(-renderedWidth / 2);
  return Math.round(Math.max(0, targetWidth - renderedWidth) / 2);
}

function generateLabelEps(templateId, mealName, nutrition = null) {
  const template = templateById(templateId);
  if (!template) throw new Error('Modelo de rótulo inválido.');

  const cleanName = String(mealName || '').replace(/\s+/g, ' ').trim();
  const withNutrition = Boolean(nutrition && nutrition.enabled);
  if (withNutrition && !hasCompleteNutrition(nutrition)) {
    throw new Error('Preencha todos os valores da informacao nutricional.');
  }
  if (!cleanName || cleanName.length > 60) throw new Error('O nome da marmita deve ter entre 1 e 60 caracteres.');

  const source = fs.readFileSync(path.join(TEMPLATE_ROOT, withNutrition ? template.nutritionFile : template.file));
  const parts = splitBinaryEps(source);
  let postScript = parts.postScript.toString('latin1');
  const mealMarker = withNutrition && template.nutritionMarker ? template.nutritionMarker : template.marker;
  const markerIndex = postScript.indexOf(mealMarker);
  if (markerIndex < 0) throw new Error(`Texto variável não encontrado no modelo ${template.id}.`);

  const fontStart = postScript.lastIndexOf('/_', markerIndex);
  const textEnd = postScript.indexOf('\nT', markerIndex);
  if (fontStart < 0 || textEnd < 0) throw new Error(`Bloco de texto inválido no modelo ${template.id}.`);

  const originalWidth = mealTextTargetWidth(template, withNutrition);
  const requestedWidth = LABEL_FONT.getAdvanceWidth(cleanName, template.baseFontSize);
  const fitRatio = Math.min(1, originalWidth / Math.max(1, requestedWidth));
  const fontSize = Math.round(template.baseFontSize * Math.max(0.48, fitRatio));
  const renderedWidth = LABEL_FONT.getAdvanceWidth(cleanName, fontSize);
  const offset = mealTextOffset(template, renderedWidth, originalWidth);
  const safeComment = cleanName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?');
  const replacement = `%%LabelText: ${safeComment}\r\n%%LabelFontSize: ${fontSize}\r\n%%LabelTextOffset: ${offset}\r\n${vectorTextPostScript(cleanName, fontSize, offset)}\r\nT`;
  postScript = postScript.slice(0, fontStart) + replacement + postScript.slice(textEnd + 2);
  if (withNutrition && Array.isArray(template.nutritionRemoveMarkers)) {
    let removeStart = markerIndex + replacement.length;
    template.nutritionRemoveMarkers.forEach(marker => {
      const result = replaceTextBlock(postScript, marker, '%%LabelTextTailRemoved\r\nT', removeStart, template.id);
      postScript = result.postScript;
      removeStart = result.markerIndex;
    });
  }

  if (withNutrition) {
    let startAt = postScript.indexOf('(Fibras)');
    if (startAt < 0) startAt = 0;
    NUTRITION_FIELDS.forEach(field => {
      const value = formattedNutritionValue(nutrition, field);
      const valueComment = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?');
      const nutritionReplacement = `%%LabelNutrition: ${field.key}=${valueComment}\r\n${vectorTextPostScript(value, template.nutritionFontSize, 0)}\r\nT`;
      const result = replaceTextBlock(postScript, field.marker, nutritionReplacement, startAt, template.id);
      postScript = result.postScript;
      startAt = result.markerIndex + nutritionReplacement.length;
    });
  }

  const generatedPostScript = Buffer.from(postScript, 'latin1');
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
  NUTRITION_FIELDS,
  formattedNutritionValue,
  generateLabelEps,
  nutritionSummary,
  publicTemplates,
  safeFilename,
  templateById
};
