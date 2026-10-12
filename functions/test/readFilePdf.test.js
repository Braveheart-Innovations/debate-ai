const assert = require('node:assert/strict');
const test = require('node:test');

const { executeReadFileTool } = require('../lib/analyze/engine/tools/executeReadFileTool');

/** A one-page PDF (Helvetica text), with a correct xref. */
function pdf(pageTexts) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageTexts.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pageTexts.length} >>`,
  ];
  const fontId = 3 + pageTexts.length * 2;
  pageTexts.forEach((text, i) => {
    const stream = text ? `BT /F1 18 Tf 20 100 Td (${text}) Tj ET` : '';
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, 'latin1')).buffer;
}

const files = (bytes) => ({ readFile: async () => bytes });

test('read_file on a PDF returns its text page by page, not PDF syntax (F12)', async () => {
  const result = await executeReadFileTool(files(pdf(['Revenue rose 12 percent', 'Margins held'])), 'c1', { path: '/uploads/brief.pdf' });
  assert.equal(result.success, true);
  assert.match(result.content, /File: brief\.pdf \(pdf\)/);
  assert.match(result.content, /Pages: 2 \(extracted text\)/);
  assert.match(result.content, /--- Page 1 ---\nRevenue rose 12 percent/);
  assert.match(result.content, /--- Page 2 ---\nMargins held/);
  assert.doesNotMatch(result.content, /%PDF-/);
});

test('a PDF read as "text", or without a .pdf name, is still read as a PDF', async () => {
  const result = await executeReadFileTool(files(pdf(['Hello'])), 'c2', { path: '/uploads/scan', format: 'text' });
  assert.match(result.content, /\(pdf\)/);
  assert.match(result.content, /Hello/);
});

test('a PDF with no text layer says so and where its pages go', async () => {
  const result = await executeReadFileTool(files(pdf([''])), 'c3', { path: '/uploads/scan.pdf' });
  assert.equal(result.success, true);
  assert.match(result.content, /no text layer/);
  assert.match(result.content, /pypdfium2/);
});

test('max_chars pages through a PDF\'s text like any text file', async () => {
  const result = await executeReadFileTool(files(pdf(['Revenue rose 12 percent'])), 'c4', { path: '/uploads/brief.pdf', max_chars: 10 });
  assert.match(result.content, /Content slice: chars 0-10 of \d+/);
  assert.match(result.content, /\[Content truncated - next offset: 10\]/);
});
