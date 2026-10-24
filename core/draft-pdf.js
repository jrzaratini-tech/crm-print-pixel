function pdfText(value) {
  return String(value ?? '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/€/g, 'EUR')
    .replace(/[^\x20-\xFF]/g, '?')
    .replace(/([\\()])/g, '\\$1');
}

function money(value) {
  return `${Number(value || 0).toFixed(2).replace('.', ',')} EUR`;
}

function wrap(value, width = 82) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  words.forEach(word => {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= width) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word.slice(0, width);
    }
  });
  if (line) lines.push(line);
  return lines;
}

function textCommand(x, y, size, value, bold = false) {
  return `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET\n`;
}

function lineCommand(x1, y1, x2, y2, gray = 0.8) {
  return `${gray} G ${x1} ${y1} m ${x2} ${y2} l S\n`;
}

function buildPage(lines, pageNumber, pageCount) {
  let content = '';
  content += textCommand(45, 800, 21, 'RASCUNHO - SEM VALOR FISCAL', true);
  content += textCommand(45, 779, 10, 'Pre-visualizacao gerada pelo CRM Print Pixel. Nao substitui o documento fiscal do Moloni.');
  content += lineCommand(45, 768, 550, 768, 0.25);
  let y = 744;
  lines.forEach(item => {
    if (item.rule) {
      content += lineCommand(45, y + 5, 550, y + 5, item.gray ?? 0.82);
      y -= item.gap ?? 13;
      return;
    }
    content += textCommand(item.x ?? 45, y, item.size ?? 10, item.text, item.bold);
    y -= item.gap ?? 15;
  });
  content += lineCommand(45, 40, 550, 40, 0.82);
  content += textCommand(45, 24, 8, `Pagina ${pageNumber} de ${pageCount} - documento em rascunho`);
  return content;
}

function generateDraftPdf(document, preview, options = {}) {
  const order = preview.order || {};
  const tax = preview.taxDecision || {};
  const items = Array.isArray(preview.products) ? preview.products : [];
  const header = [
    { text: options.companyName || 'Print Pixel', size: 15, bold: true, gap: 20 },
    { text: `Tipo: ${document.label || preview.label || 'Documento'} (rascunho)`, bold: true },
    { text: `Pedido: ${order.number || document.orderNumber || '-'}` },
    { text: `Data: ${preview.issueDate || String(document.createdAt || '').slice(0, 10) || '-'}` },
    { rule: true, gap: 15 },
    { text: 'CLIENTE', size: 11, bold: true },
    { text: order.company || order.customer || document.customer || 'Cliente nao indicado' },
    { text: `VAT/NIF: ${order.vat || '-'}` },
    { text: `Pais de faturacao: ${order.billingCountry || 'PT'}` },
    ...wrap([order.address, order.postalCode, order.city].filter(Boolean).join(', ')).map(text => ({ text })),
    { rule: true, gap: 15 },
    { text: 'LINHAS', size: 11, bold: true },
    { text: 'Qtd.    Descricao                                      Preco unit.        Total', bold: true, size: 9 },
    { rule: true, gap: 12 }
  ];

  const rows = [];
  items.forEach(item => {
    const qty = Number(item.qty || 0);
    const unit = Number(item.price || 0);
    const total = qty * unit;
    const description = [item.name, item.summary].filter(Boolean).join(' - ');
    const descriptionLines = wrap(description, 48);
    rows.push({
      text: `${qty.toFixed(2).replace('.', ',').padEnd(7)} ${descriptionLines[0].padEnd(48)} ${money(unit).padStart(13)} ${money(total).padStart(13)}`,
      size: 8
    });
    descriptionLines.slice(1).forEach(text => rows.push({ text: `        ${text}`, size: 8 }));
    const taxLabel = item.vatIncluded
      ? `IVA ${Number(item.taxRate || tax.rate || 0).toFixed(0)}% incluido`
      : `Isento ${item.exemptionReason || tax.exemptionReason || ''}`.trim();
    rows.push({ text: `        ${taxLabel}`, size: 8, gap: 13 });
  });

  const totals = [
    { rule: true, gap: 17 },
    { text: `Regra fiscal: ${tax.label || tax.code || 'Conforme pedido'}`, bold: true },
    { text: `TOTAL: ${money(preview.totals?.total ?? document.value)}`, size: 15, bold: true, gap: 21 },
    { text: 'Este ficheiro serve apenas para conferencia. O PDF fiscal oficial fica disponivel depois de fechar o documento no Moloni.', size: 9 }
  ];

  const firstCapacity = 25;
  const nextCapacity = 39;
  const pages = [];
  let remaining = rows.slice();
  pages.push([...header, ...remaining.splice(0, firstCapacity)]);
  while (remaining.length > nextCapacity) pages.push(remaining.splice(0, nextCapacity));
  if (pages.length === 1 || pages[pages.length - 1].length + remaining.length + totals.length <= nextCapacity) {
    pages[pages.length - 1].push(...remaining, ...totals);
  } else {
    pages.push([...remaining, ...totals]);
  }

  const objects = [];
  const pageRefs = pages.map((_, index) => 5 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageRefs.map(ref => `${ref} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((page, index) => {
    const pageRef = 5 + index * 2;
    const contentRef = pageRef + 1;
    const stream = buildPage(page, index + 1, pages.length);
    objects[pageRef] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentRef} 0 R >>`;
    objects[contentRef] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream`;
  });

  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offsets = [0];
  let position = chunks[0].length;
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = position;
    const chunk = Buffer.from(`${id} 0 obj\n${objects[id]}\nendobj\n`, 'latin1');
    chunks.push(chunk);
    position += chunk.length;
  }
  const xrefPosition = position;
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}

module.exports = { generateDraftPdf };
