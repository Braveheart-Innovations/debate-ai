import { pagesDir, parseRenderResult, renderScript } from '../pdfPages';

describe('PDF page rendering', () => {
  it('caches per upload and content', () => {
    expect(pagesDir({ id: 'abc', sha256: '0123456789abcdef0123' })).toBe('/home/user/.symposium/pdf-pages/abc-0123456789abcdef');
  });

  it('renders each job once at the browser\'s scale and reports page counts', () => {
    const code = renderScript([{ key: '/home/user/.symposium/pdf-pages/a-1', path: '/uploads/a.pdf' }]);
    expect(code).toContain('import pypdfium2 as pdfium');
    expect(code).toContain('render(scale=1.5)');
    expect(code).toContain('"path":"/uploads/a.pdf"');
    expect(code).toContain('done.json');
  });

  it('reads the result line and ignores other output', () => {
    expect(parseRenderResult('warning: x\n__PDF_PAGES__{"/k":3,"/j":{"error":"bad"}}\n')).toEqual({ '/k': 3, '/j': { error: 'bad' } });
    expect(parseRenderResult('nothing here')).toEqual({});
    expect(parseRenderResult('__PDF_PAGES__{oops')).toEqual({});
  });
});
