/** Ported from symposium-ai-web src/services/artifacts/__tests__/BundleDetectionService.test.ts (Phase 3), logic unchanged. */
import { detectBundle, type ExecutionOutputs } from '../BundleDetectionService';

describe('BundleDetectionService', () => {
  // =========================================================================
  // Helpers
  // =========================================================================

  /** Shorthand to build an HTML output entry */
  const html = (filename: string, content: string) => ({ content, filename });

  /** Shorthand to build a data output entry with base64-encoded content */
  const data = (filename: string, raw: string) => ({
    filename,
    base64: btoa(raw),
    size: raw.length,
  });

  /** Shorthand to build a data output with pre-encoded base64 (for binary) */
  const dataRaw = (filename: string, base64: string, size: number) => ({
    filename,
    base64,
    size,
  });

  // =========================================================================
  // 1. No bundle needed: single HTML + no data
  // =========================================================================

  describe('no bundle needed', () => {
    it('returns shouldBundle=false for a single HTML output with no data', () => {
      const outputs: ExecutionOutputs = {
        htmlOutputs: [html('index.html', '<html><body>Hello</body></html>')],
        dataOutputs: [],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(false);
      expect(result.manifest).toBeNull();
      expect(result.unbundledHtml).toHaveLength(1);
      expect(result.unbundledHtml[0].filename).toBe('index.html');
      expect(result.unbundledData).toHaveLength(0);
    });

    // =========================================================================
    // 2. No bundle needed: multiple HTML files that don't reference each other
    // =========================================================================

    it('returns shouldBundle=false when multiple HTML files do not reference each other', () => {
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('chart1.html', '<html><body>Chart 1</body></html>'),
          html('chart2.html', '<html><body>Chart 2</body></html>'),
        ],
        dataOutputs: [],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(false);
      expect(result.manifest).toBeNull();
      expect(result.unbundledHtml).toHaveLength(2);
      expect(result.unbundledData).toHaveLength(0);
    });
  });

  // =========================================================================
  // 3. Bundle detected: HTML references a CSS file in dataOutputs
  // =========================================================================

  describe('bundle detected', () => {
    it('bundles when HTML references a CSS file in dataOutputs', () => {
      const cssContent = 'body { margin: 0; color: red; }';
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', '<html><head><link rel="stylesheet" href="styles.css"></head><body>Hi</body></html>'),
        ],
        dataOutputs: [
          data('styles.css', cssContent),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      expect(result.manifest).not.toBeNull();
      expect(result.manifest!.version).toBe(1);
      expect(result.manifest!.entryPoint).toBe('index.html');

      // Both files should be in the manifest
      expect(Object.keys(result.manifest!.files)).toHaveLength(2);
      expect(result.manifest!.files['index.html']).toBeDefined();
      expect(result.manifest!.files['styles.css']).toBeDefined();

      // CSS should be decoded from base64 to text
      expect(result.manifest!.files['styles.css'].mimeType).toBe('text/css');
      expect(result.manifest!.files['styles.css'].content).toBe(cssContent);
      expect(result.manifest!.files['styles.css'].isBase64).toBeUndefined();

      // Nothing left unbundled
      expect(result.unbundledHtml).toHaveLength(0);
      expect(result.unbundledData).toHaveLength(0);
    });

    // =========================================================================
    // 4. Bundle detected: HTML references a JS file
    // =========================================================================

    it('bundles when HTML references a JS file', () => {
      const jsContent = 'console.log("hello");';
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('app.html', '<html><body><script src="app.js"></script></body></html>'),
        ],
        dataOutputs: [
          data('app.js', jsContent),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      expect(result.manifest).not.toBeNull();
      expect(Object.keys(result.manifest!.files)).toHaveLength(2);
      expect(result.manifest!.files['app.js']).toBeDefined();
      expect(result.manifest!.files['app.js'].mimeType).toBe('application/javascript');
      expect(result.manifest!.files['app.js'].content).toBe(jsContent);
      expect(result.manifest!.files['app.js'].isBase64).toBeUndefined();
    });

    // =========================================================================
    // 5. Bundle detected: HTML references an image (PNG)
    // =========================================================================

    it('bundles when HTML references a PNG image, storing as base64', () => {
      const fakePngBase64 = btoa('fake-png-binary-data');
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', '<html><body><img src="logo.png"></body></html>'),
        ],
        dataOutputs: [
          dataRaw('logo.png', fakePngBase64, 100),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      expect(result.manifest).not.toBeNull();
      expect(result.manifest!.files['logo.png']).toBeDefined();
      expect(result.manifest!.files['logo.png'].mimeType).toBe('image/png');
      expect(result.manifest!.files['logo.png'].content).toBe(fakePngBase64);
      expect(result.manifest!.files['logo.png'].isBase64).toBe(true);
      expect(result.manifest!.files['logo.png'].size).toBe(100);
    });

    // =========================================================================
    // 6. Bundle detected: multi-page - HTML references another HTML file
    // =========================================================================

    it('bundles when one HTML file references another HTML file', () => {
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', '<html><body><a href="about.html">About</a></body></html>'),
          html('about.html', '<html><body>About page</body></html>'),
        ],
        dataOutputs: [],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      expect(result.manifest).not.toBeNull();
      expect(Object.keys(result.manifest!.files)).toHaveLength(2);
      expect(result.manifest!.files['index.html']).toBeDefined();
      expect(result.manifest!.files['about.html']).toBeDefined();
      expect(result.manifest!.files['index.html'].mimeType).toBe('text/html');
      expect(result.manifest!.files['about.html'].mimeType).toBe('text/html');
    });

    it('bundles HTML sites written inside /output subdirectories', () => {
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('sf-audit/index.html', '<html><head><link rel="stylesheet" href="styles.css"></head><body><a href="packet.html">Packet</a></body></html>'),
          html('sf-audit/packet.html', '<html><body>Packet</body></html>'),
        ],
        dataOutputs: [
          data('sf-audit/styles.css', 'body { color: #111; }'),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      expect(result.manifest!.entryPoint).toBe('sf-audit/index.html');
      expect(result.manifest!.files['sf-audit/index.html']).toBeDefined();
      expect(result.manifest!.files['sf-audit/packet.html']).toBeDefined();
      expect(result.manifest!.files['sf-audit/styles.css']).toBeDefined();
      expect(result.unbundledHtml).toHaveLength(0);
      expect(result.unbundledData).toHaveLength(0);
    });
  });

  // =========================================================================
  // Entry point selection
  // =========================================================================

  describe('entry point selection', () => {
    // =========================================================================
    // 7. index.html preferred over other HTML files
    // =========================================================================

    it('prefers index.html as the entry point', () => {
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('dashboard.html', '<html><body><a href="index.html">Home</a></body></html>'),
          html('index.html', '<html><body><a href="dashboard.html">Dashboard</a></body></html>'),
        ],
        dataOutputs: [],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      expect(result.manifest!.entryPoint).toBe('index.html');
    });

    // =========================================================================
    // 8. dashboard.html used when no index.html
    // =========================================================================

    it('uses dashboard.html when no index.html is present', () => {
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('dashboard.html', '<html><body><a href="settings.html">Settings</a></body></html>'),
          html('settings.html', '<html><body>Settings</body></html>'),
        ],
        dataOutputs: [],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      expect(result.manifest!.entryPoint).toBe('dashboard.html');
    });

    // =========================================================================
    // 9. Alphabetically first when neither index.html nor dashboard.html
    // =========================================================================

    it('uses alphabetically first HTML file when neither index.html nor dashboard.html exists', () => {
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('zebra.html', '<html><body><a href="alpha.html">Go</a></body></html>'),
          html('alpha.html', '<html><body>Alpha</body></html>'),
        ],
        dataOutputs: [],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      expect(result.manifest!.entryPoint).toBe('alpha.html');
    });
  });

  // =========================================================================
  // 10. Mixed outputs: some referenced (bundled), some not (unbundled)
  // =========================================================================

  describe('mixed outputs', () => {
    it('correctly splits referenced files into bundle and leaves unreferenced files unbundled', () => {
      const cssContent = 'body { color: blue; }';
      const csvContent = 'name,value\nfoo,1';
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', '<html><head><link rel="stylesheet" href="styles.css"></head><body>Main</body></html>'),
          html('standalone.html', '<html><body>Standalone chart</body></html>'),
        ],
        dataOutputs: [
          data('styles.css', cssContent),
          data('results.csv', csvContent),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);

      // Bundle should contain index.html and styles.css
      expect(Object.keys(result.manifest!.files)).toHaveLength(2);
      expect(result.manifest!.files['index.html']).toBeDefined();
      expect(result.manifest!.files['styles.css']).toBeDefined();

      // standalone.html should be unbundled (it doesn't reference any sibling)
      expect(result.unbundledHtml).toHaveLength(1);
      expect(result.unbundledHtml[0].filename).toBe('standalone.html');

      // results.csv should be unbundled (nothing references it)
      expect(result.unbundledData).toHaveLength(1);
      expect(result.unbundledData[0].filename).toBe('results.csv');
    });
  });

  // =========================================================================
  // 11. External URLs are ignored (not treated as sibling refs)
  // =========================================================================

  describe('external URL handling', () => {
    it('ignores https:// references and does not treat them as sibling files', () => {
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('page.html', '<html><head><link rel="stylesheet" href="https://cdn.example.com/bootstrap.css"></head><body>Content</body></html>'),
        ],
        dataOutputs: [
          data('other.css', 'body { margin: 0; }'),
        ],
      };

      const result = detectBundle(outputs);

      // The HTML does not reference other.css, only an external URL
      expect(result.shouldBundle).toBe(false);
      expect(result.manifest).toBeNull();
      expect(result.unbundledHtml).toHaveLength(1);
      expect(result.unbundledData).toHaveLength(1);
    });

    it('ignores data:, javascript:, mailto:, and blob: URLs', () => {
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('page.html', `
            <html><body>
              <a href="javascript:void(0)">Click</a>
              <a href="mailto:test@example.com">Email</a>
              <img src="data:image/png;base64,abc123">
              <a href="#section">Anchor</a>
            </body></html>
          `),
        ],
        dataOutputs: [
          data('unreferenced.js', 'console.log("not referenced");'),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(false);
    });
  });

  // =========================================================================
  // 12. CSS references: @import and url() references detected
  // =========================================================================

  describe('CSS reference detection', () => {
    it('detects @import references in HTML content', () => {
      const resetCss = '* { margin: 0; padding: 0; }';
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', `
            <html><head><style>
              @import "reset.css";
              body { color: black; }
            </style></head><body>Content</body></html>
          `),
        ],
        dataOutputs: [
          data('reset.css', resetCss),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      expect(result.manifest!.files['reset.css']).toBeDefined();
      expect(result.manifest!.files['reset.css'].content).toBe(resetCss);
    });

    it('detects @import url() references in HTML content', () => {
      const fontCss = '@font-face { font-family: custom; }';
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', `
            <html><head><style>
              @import url("fonts.css");
            </style></head><body>Content</body></html>
          `),
        ],
        dataOutputs: [
          data('fonts.css', fontCss),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      expect(result.manifest!.files['fonts.css']).toBeDefined();
    });

    it('detects url() references in inline styles', () => {
      const bgPngBase64 = btoa('fake-background-png');
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', `
            <html><head><style>
              .hero { background: url(bg.png) no-repeat; }
            </style></head><body>Content</body></html>
          `),
        ],
        dataOutputs: [
          dataRaw('bg.png', bgPngBase64, 50),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      expect(result.manifest!.files['bg.png']).toBeDefined();
      expect(result.manifest!.files['bg.png'].isBase64).toBe(true);
    });
  });

  // =========================================================================
  // 13. Empty inputs
  // =========================================================================

  describe('empty inputs', () => {
    it('returns shouldBundle=false for completely empty arrays', () => {
      const outputs: ExecutionOutputs = {
        htmlOutputs: [],
        dataOutputs: [],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(false);
      expect(result.manifest).toBeNull();
      expect(result.unbundledHtml).toHaveLength(0);
      expect(result.unbundledData).toHaveLength(0);
    });

    it('returns shouldBundle=false for single data output with no HTML', () => {
      const outputs: ExecutionOutputs = {
        htmlOutputs: [],
        dataOutputs: [data('data.csv', 'a,b\n1,2')],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(false);
      expect(result.manifest).toBeNull();
      expect(result.unbundledData).toHaveLength(1);
    });
  });

  // =========================================================================
  // 14. Text data files: CSS/JS decoded from base64 to text in manifest
  // =========================================================================

  describe('text data file handling', () => {
    it('decodes CSS from base64 to plain text in the manifest', () => {
      const cssContent = '.container { display: flex; gap: 16px; }';
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', '<html><head><link rel="stylesheet" href="layout.css"></head><body></body></html>'),
        ],
        dataOutputs: [
          data('layout.css', cssContent),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      const cssFile = result.manifest!.files['layout.css'];
      expect(cssFile.mimeType).toBe('text/css');
      expect(cssFile.content).toBe(cssContent);
      expect(cssFile.isBase64).toBeUndefined();
    });

    it('decodes JS from base64 to plain text in the manifest', () => {
      const jsContent = 'document.addEventListener("DOMContentLoaded", () => { init(); });';
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', '<html><body><script src="main.js"></script></body></html>'),
        ],
        dataOutputs: [
          data('main.js', jsContent),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      const jsFile = result.manifest!.files['main.js'];
      expect(jsFile.mimeType).toBe('application/javascript');
      expect(jsFile.content).toBe(jsContent);
      expect(jsFile.isBase64).toBeUndefined();
    });

    it('decodes JSON from base64 to plain text in the manifest', () => {
      const jsonContent = '{"key": "value", "count": 42}';
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', '<html><body><script src="config.json"></script></body></html>'),
        ],
        dataOutputs: [
          data('config.json', jsonContent),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      const jsonFile = result.manifest!.files['config.json'];
      expect(jsonFile.mimeType).toBe('application/json');
      expect(jsonFile.content).toBe(jsonContent);
      expect(jsonFile.isBase64).toBeUndefined();
    });

    it('decodes SVG from base64 to plain text in the manifest', () => {
      const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="50"/></svg>';
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', '<html><body><img src="icon.svg"></body></html>'),
        ],
        dataOutputs: [
          data('icon.svg', svgContent),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      const svgFile = result.manifest!.files['icon.svg'];
      expect(svgFile.mimeType).toBe('image/svg+xml');
      // SVG starts with 'image/' so it is treated as binary by isBinaryMime
      expect(svgFile.isBase64).toBe(true);
    });
  });

  // =========================================================================
  // 15. Binary data files: PNG/image files stored as base64 with isBase64=true
  // =========================================================================

  describe('binary data file handling', () => {
    it('stores PNG as base64 with isBase64=true', () => {
      const pngBase64 = btoa('PNG-binary-content');
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', '<html><body><img src="photo.png"></body></html>'),
        ],
        dataOutputs: [
          dataRaw('photo.png', pngBase64, 200),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      const pngFile = result.manifest!.files['photo.png'];
      expect(pngFile.mimeType).toBe('image/png');
      expect(pngFile.content).toBe(pngBase64);
      expect(pngFile.isBase64).toBe(true);
      expect(pngFile.size).toBe(200);
    });

    it('stores JPEG as base64 with isBase64=true', () => {
      const jpegBase64 = btoa('JPEG-binary-content');
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', '<html><body><img src="photo.jpg"></body></html>'),
        ],
        dataOutputs: [
          dataRaw('photo.jpg', jpegBase64, 300),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      const jpgFile = result.manifest!.files['photo.jpg'];
      expect(jpgFile.mimeType).toBe('image/jpeg');
      expect(jpgFile.content).toBe(jpegBase64);
      expect(jpgFile.isBase64).toBe(true);
    });

    it('stores GIF as base64 with isBase64=true', () => {
      const gifBase64 = btoa('GIF-binary-content');
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', '<html><body><img src="animation.gif"></body></html>'),
        ],
        dataOutputs: [
          dataRaw('animation.gif', gifBase64, 150),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      const gifFile = result.manifest!.files['animation.gif'];
      expect(gifFile.mimeType).toBe('image/gif');
      expect(gifFile.isBase64).toBe(true);
    });

    it('stores WOFF2 font as base64 with isBase64=true', () => {
      const woff2Base64 = btoa('WOFF2-font-data');
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', `
            <html><head><style>
              @font-face { src: url(custom.woff2); }
            </style></head><body>Content</body></html>
          `),
        ],
        dataOutputs: [
          dataRaw('custom.woff2', woff2Base64, 500),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      const fontFile = result.manifest!.files['custom.woff2'];
      expect(fontFile.mimeType).toBe('font/woff2');
      expect(fontFile.isBase64).toBe(true);
    });

    it('stores unknown extension as binary with application/octet-stream', () => {
      const binBase64 = btoa('binary-blob');
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', '<html><body><a href="data.bin">Download</a></body></html>'),
        ],
        dataOutputs: [
          dataRaw('data.bin', binBase64, 75),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      const binFile = result.manifest!.files['data.bin'];
      expect(binFile.mimeType).toBe('application/octet-stream');
      expect(binFile.isBase64).toBe(true);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('handles ./ prefixed references by normalizing them', () => {
      const cssContent = 'h1 { font-size: 24px; }';
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', '<html><head><link rel="stylesheet" href="./styles.css"></head></html>'),
        ],
        dataOutputs: [
          data('styles.css', cssContent),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      expect(result.manifest!.files['styles.css']).toBeDefined();
    });

    it('ignores query strings and hash fragments in references', () => {
      const jsContent = 'var x = 1;';
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', '<html><body><script src="app.js?v=1.2.3#module"></script></body></html>'),
        ],
        dataOutputs: [
          data('app.js', jsContent),
        ],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      expect(result.manifest!.files['app.js']).toBeDefined();
    });

    it('does not self-reference: an HTML file referencing itself is ignored', () => {
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('page.html', '<html><body><a href="page.html">Self</a></body></html>'),
        ],
        dataOutputs: [
          data('unrelated.css', 'body {}'),
        ],
      };

      const result = detectBundle(outputs);

      // page.html references itself, not a sibling, so no bundle
      expect(result.shouldBundle).toBe(false);
    });

    it('includes referenced HTML even if it does not reference anything itself', () => {
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', '<html><body><a href="passive.html">Link</a></body></html>'),
          html('passive.html', '<html><body>No outgoing references</body></html>'),
        ],
        dataOutputs: [],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      // Both should be in the bundle: index.html references passive.html
      expect(result.manifest!.files['index.html']).toBeDefined();
      expect(result.manifest!.files['passive.html']).toBeDefined();
    });

    it('computes size of HTML files using TextEncoder byte length', () => {
      // Use a string with multi-byte characters to test TextEncoder usage
      const htmlContent = '<html><body>Hello</body></html>';
      const outputs: ExecutionOutputs = {
        htmlOutputs: [
          html('index.html', htmlContent),
          html('page2.html', '<html><body><a href="index.html">Link</a></body></html>'),
        ],
        dataOutputs: [],
      };

      const result = detectBundle(outputs);

      expect(result.shouldBundle).toBe(true);
      const expectedSize = new TextEncoder().encode(htmlContent).length;
      expect(result.manifest!.files['index.html'].size).toBe(expectedSize);
    });
  });
});
