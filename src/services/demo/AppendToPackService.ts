const DEFAULT_ENDPOINT = 'http://127.0.0.1:8889/append';

export class AppendToPackService {
  static async append(session: unknown, endpoint: string = DEFAULT_ENDPOINT): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return { ok: false, error: `HTTP ${res.status}: ${txt}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error)?.message || String(e) };
    }
  }
}

export default AppendToPackService;
