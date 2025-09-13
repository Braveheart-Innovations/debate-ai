import type { DemoPackV1, DemoChat, DemoDebate, DemoCompare } from '@/types/demo';

const DEMO_ALLOWED = ['claude', 'openai', 'google'] as const;

const rotationState: Record<string, number> = {};

let cachedPack: DemoPackV1 | null = null;

export class DemoContentService {
  static async getPack(): Promise<DemoPackV1> {
    if (cachedPack) return cachedPack;
    // Local static import so bundlers include the asset
    const pack = (await import('@/assets/demo/demo-pack.v1.json')).default as DemoPackV1;
    cachedPack = pack;
    return pack;
  }

  static clearCache(): void {
    cachedPack = null;
  }

  static comboKey(providers: string[]): string {
    const ids = providers
      .map(p => p.toLowerCase())
      .filter(p => (DEMO_ALLOWED as readonly string[]).includes(p))
      .sort();
    return ids.join('+');
  }

  static async getChatSampleForProviders(providers: string[]): Promise<DemoChat | null> {
    const pack = await this.getPack();
    const key = this.comboKey(providers);
    const ids = pack.routing?.chat?.[key];
    if (!ids || ids.length === 0) return null;
    const idx = rotationState[key] ?? 0;
    const chosen = ids[idx % ids.length];
    rotationState[key] = (idx + 1) % ids.length;
    const sample = pack.chats.find(c => c.id === chosen) || null;
    return sample;
  }

  static async listChatSamples(providers: string[]): Promise<Pick<DemoChat, 'id'|'title'>[]> {
    const pack = await this.getPack();
    const key = this.comboKey(providers);
    const ids = pack.routing?.chat?.[key] || [];
    return ids.map(id => {
      const c = pack.chats.find(x => x.id === id);
      return c ? { id: c.id, title: c.title } : { id, title: id };
    });
  }

  static async listCompareSamples(providers: string[]): Promise<Array<{ id: string; title: string }>> {
    const pack = await this.getPack();
    const key = this.comboKey(providers);
    const ids = pack.routing?.compare?.[key] || [];
    return ids.map(id => {
      const c = pack.compares.find(x => x.id === id);
      return c ? { id: c.id, title: c.title } : { id, title: id };
    });
  }

  static async findChatById(id: string): Promise<DemoChat | null> {
    const pack = await this.getPack();
    return pack.chats.find(c => c.id === id) || null;
  }

  static async findCompareById(id: string): Promise<DemoCompare | null> {
    const pack = await this.getPack();
    return pack.compares.find(c => c.id === id) || null;
  }

  static async getDebateSampleForProviders(providers: string[], persona: string): Promise<DemoDebate | null> {
    const pack = await this.getPack();
    const key = this.comboKey(providers) + ':' + (persona || 'default');
    const ids = pack.routing?.debate?.[key];
    if (!ids || ids.length === 0) return null;
    const idx = rotationState[key] ?? 0;
    const chosen = ids[idx % ids.length];
    rotationState[key] = (idx + 1) % ids.length;
    return pack.debates.find(d => d.id === chosen) || null;
  }

  static async getCompareSampleForProviders(providers: string[]): Promise<DemoCompare | null> {
    const pack = await this.getPack();
    const key = this.comboKey(providers);
    const ids = pack.routing?.compare?.[key];
    if (!ids || ids.length === 0) return null;
    const idx = rotationState[key] ?? 0;
    const chosen = ids[idx % ids.length];
    rotationState[key] = (idx + 1) % ids.length;
    return pack.compares.find(c => c.id === chosen) || null;
  }

  static async listDebateSamples(providers: string[], persona: string): Promise<Array<{ id: string; title: string; topic: string }>> {
    const pack = await this.getPack();
    const key = this.comboKey(providers) + ':' + (persona || 'default');
    const ids = pack.routing?.debate?.[key] || [];
    return ids.map(id => {
      const d = pack.debates.find(x => x.id === id);
      return d ? { id: d.id, title: d.topic, topic: d.topic } : { id, title: id, topic: id };
    });
  }

  static async findDebateById(id: string): Promise<DemoDebate | null> {
    const pack = await this.getPack();
    return pack.debates.find(d => d.id === id) || null;
  }
}

export default DemoContentService;
