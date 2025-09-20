import { DemoContentService } from '@/services/demo/DemoContentService';
import type { DemoRecordingSession } from '@/types/demo';

const DEFAULT_ENDPOINT = 'http://127.0.0.1:8889/append';
const PACKER_HEALTH_PATH = '/health';
const PACKER_UNAVAILABLE_ERROR = 'Demo packer dev server not reachable. Run `npm run demo:packer` in the project root.';

export class AppendToPackService {
  static async append(session: unknown, endpoint: string = DEFAULT_ENDPOINT): Promise<{ ok: boolean; error?: string }> {
    try {
      void DemoContentService.ingestRecording(session as DemoRecordingSession);
    } catch {
      // ignore local ingestion errors; we still try to append remotely
    }

    const baseUrl = endpoint.replace(/\/?append$/, '');
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const healthUrl = `${normalizedBase}${PACKER_HEALTH_PATH}`;

    try {
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), 1500);
      try {
        const healthRes = await fetch(healthUrl, { method: 'GET', signal: ac.signal });
        if (!healthRes.ok) {
          return { ok: false, error: PACKER_UNAVAILABLE_ERROR };
        }
      } catch {
        return { ok: false, error: PACKER_UNAVAILABLE_ERROR };
      } finally {
        clearTimeout(timeout);
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return { ok: false, error: `HTTP ${res.status}: ${txt}` };
      }
      try {
        await DemoContentService.ingestRecording(session as DemoRecordingSession);
      } catch {
        // local ingestion already attempted; ignore follow-up errors
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error)?.message || String(e) };
    }
  }
}

export default AppendToPackService;
