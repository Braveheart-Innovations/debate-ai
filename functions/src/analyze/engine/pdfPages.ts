/**
 * Page images of the session's PDF uploads, for vision (scanned PDFs). The
 * browser rendered every page with pdf.js at 1.5× to PNG on upload and added
 * them to the first model call of every turn (web lib/pdf-utils.ts
 * renderPdfPages + AnalyzeSessionContext sendMessage). Here pypdfium2
 * renders them in the sandbox, cached per upload and content under
 * /home/user/.symposium (outside /output, so capture never sees them). A new
 * sandbox renders again on first use.
 */
import type { MessageAttachment } from '../contract/types';
import { getSandboxService } from '../../sandbox/callables';
import { readWholeFile } from './sandboxBridge';
import { loadUploadRecords, type UploadRecord } from './uploads';

/** web pdf-utils RENDER_SCALE: ~918×1188 for US Letter. */
export const RENDER_SCALE = 1.5;
const PAGES_ROOT = '/home/user/.symposium/pdf-pages';
/** Its own kernel, so rendering never touches the operator's variables. */
const RENDER_KERNEL = 'pdf-pages';
const RENDER_TIMEOUT_MS = 300_000;
const RESULT_PREFIX = '__PDF_PAGES__';

interface RenderJob {
  key: string;
  path: string;
}

/** The cache directory for one upload's bytes (a re-upload with new content renders again). */
export function pagesDir(upload: Pick<UploadRecord, 'id' | 'sha256'>): string {
  return `${PAGES_ROOT}/${upload.id}-${upload.sha256.slice(0, 16)}`;
}

/** Python that renders each job's pages once and prints {key: pageCount | {error}}. */
export function renderScript(jobs: RenderJob[]): string {
  return `
import json, os
results = {}
try:
    import pypdfium2 as pdfium
except ImportError as error:
    pdfium = None
    results = {job["key"]: {"error": f"pypdfium2 unavailable: {error}"} for job in ${JSON.stringify(jobs)}}
if pdfium is not None:
    for job in ${JSON.stringify(jobs)}:
        out_dir = job["key"]
        done = os.path.join(out_dir, "done.json")
        try:
            if os.path.exists(done):
                with open(done) as fh:
                    results[out_dir] = json.load(fh)["pages"]
                continue
            os.makedirs(out_dir, exist_ok=True)
            pdf = pdfium.PdfDocument(job["path"])
            try:
                count = len(pdf)
                for index in range(count):
                    page = pdf[index]
                    try:
                        page.render(scale=${RENDER_SCALE}).to_pil().save(os.path.join(out_dir, f"page-{index + 1}.png"))
                    finally:
                        page.close()
            finally:
                pdf.close()
            with open(done, "w") as fh:
                json.dump({"pages": count}, fh)
            results[out_dir] = count
        except Exception as error:
            results[out_dir] = {"error": str(error)}
print("${RESULT_PREFIX}" + json.dumps(results))
`;
}

export function parseRenderResult(stdout: string): Record<string, number | { error: string }> {
  const line = stdout.split('\n').reverse().find((entry) => entry.startsWith(RESULT_PREFIX));
  if (!line) return {};
  try {
    return JSON.parse(line.slice(RESULT_PREFIX.length)) as Record<string, number | { error: string }>;
  } catch {
    return {};
  }
}

/**
 * Every page of every PDF upload, as the browser attached them: PNG data
 * URLs named page-N.png, in upload order. A PDF that can't be rendered is
 * skipped (the browser logged and moved on too).
 */
export async function loadPdfPageAttachments(uid: string, sessionId: string, sandboxSessionKey: string): Promise<MessageAttachment[]> {
  const pdfs = (await loadUploadRecords(uid, sessionId)).filter((upload) => upload.mimeType === 'application/pdf');
  if (pdfs.length === 0) return [];

  const service = getSandboxService();
  const jobs = pdfs.map((upload) => ({ key: pagesDir(upload), path: upload.pythonPath }));
  let results: Record<string, number | { error: string }> = {};
  try {
    const run = await service.execute(uid, sandboxSessionKey, renderScript(jobs), RENDER_TIMEOUT_MS, RENDER_KERNEL);
    results = parseRenderResult(run.stdout);
    if (!run.success) console.warn('[analyzeRun] PDF page rendering failed', { sessionId, error: run.error });
  } finally {
    await service.releaseKernel(uid, sandboxSessionKey, RENDER_KERNEL).catch(() => undefined);
  }

  const attachments: MessageAttachment[] = [];
  for (const job of jobs) {
    const pages = results[job.key];
    if (typeof pages !== 'number') {
      console.warn('[analyzeRun] PDF pages unavailable', { path: job.path, error: pages?.error ?? 'not rendered' });
      continue;
    }
    for (let page = 1; page <= pages; page += 1) {
      const base64 = (await readWholeFile(uid, sandboxSessionKey, `${job.key}/page-${page}.png`)).toString('base64');
      attachments.push({
        type: 'image',
        uri: `data:image/png;base64,${base64}`,
        mimeType: 'image/png',
        base64,
        fileName: `page-${page}.png`,
      });
    }
  }
  return attachments;
}
