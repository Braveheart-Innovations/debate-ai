import type {
  DemoPackV1,
  DemoChat,
  DemoDebate,
  DemoCompare,
  DemoRecordingSession,
} from '@/types/demo';

const DEMO_ALLOWED = ['claude', 'openai', 'google'] as const;

const rotationState: Record<string, number> = {};

let cachedPack: DemoPackV1 | null = null;
const listeners = new Set<() => void>();

function ensureRouting(pack: DemoPackV1): void {
  if (!pack.routing) pack.routing = {};
  if (!pack.routing.chat) pack.routing.chat = {};
  if (!pack.routing.debate) pack.routing.debate = {};
  if (!pack.routing.compare) pack.routing.compare = {};
}

function notifyListeners(): void {
  listeners.forEach(listener => {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  });
}

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
    notifyListeners();
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

  static async listChatSamples(
    providers: string[],
    options: { includeDrafts?: boolean } = {},
  ): Promise<Pick<DemoChat, 'id'|'title'>[]> {
    const pack = await this.getPack();
    const key = this.comboKey(providers);
    const ids = (pack.routing?.chat?.[key] || []).filter(id => options.includeDrafts || !/_rec_/i.test(id));
    return ids.map(id => {
      const c = pack.chats.find(x => x.id === id);
      return c ? { id: c.id, title: c.title } : { id, title: id };
    });
  }

  static async listCompareSamples(
    providers: string[],
    options: { includeDrafts?: boolean } = {},
  ): Promise<Array<{ id: string; title: string }>> {
    const pack = await this.getPack();
    const key = this.comboKey(providers);
    const ids = (pack.routing?.compare?.[key] || []).filter(id => options.includeDrafts || !/_rec_/i.test(id));
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

  static async listDebateSamples(
    providers: string[],
    persona: string,
    options: { includeDrafts?: boolean } = {},
  ): Promise<Array<{ id: string; title: string; topic: string }>> {
    const pack = await this.getPack();
    const key = this.comboKey(providers) + ':' + (persona || 'default');
    const ids = (pack.routing?.debate?.[key] || []).filter(id => options.includeDrafts || !/_rec_/i.test(id));
    return ids.map(id => {
      const d = pack.debates.find(x => x.id === id);
      return d ? { id: d.id, title: d.topic, topic: d.topic } : { id, title: id, topic: id };
    });
  }

  static async findDebateById(id: string): Promise<DemoDebate | null> {
    const pack = await this.getPack();
    return pack.debates.find(d => d.id === id) || null;
  }

  static subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  static async ingestRecording(session: DemoRecordingSession | null | undefined): Promise<void> {
    if (!session?.id) return;
    const pack = await this.getPack();
    ensureRouting(pack);

    const isDraft = /_rec_/i.test(session.id);

    if (session.type === 'chat') {
      const entry = {
        id: session.id,
        title: session.title,
        events: session.events,
        tags: session.tags ?? [],
      } satisfies DemoChat;
      const idx = pack.chats.findIndex(c => c.id === session.id);
      if (idx >= 0) pack.chats[idx] = entry;
      else pack.chats.push(entry);
      if (session.comboKey) {
        const key = session.comboKey;
        if (isDraft) {
          const list = pack.routing!.chat![key];
          if (list) pack.routing!.chat![key] = list.filter(id => id !== session.id);
        } else {
          const list = pack.routing!.chat![key] ?? (pack.routing!.chat![key] = []);
          if (!list.includes(session.id)) list.push(session.id);
        }
      }
    } else if (session.type === 'debate') {
      const entry = {
        id: session.id,
        topic: session.topic,
        participants: session.participants ?? [],
        events: session.events,
      } satisfies DemoDebate;
      const idx = pack.debates.findIndex(d => d.id === session.id);
      if (idx >= 0) pack.debates[idx] = entry;
      else pack.debates.push(entry);
      if (session.comboKey) {
        const key = session.comboKey;
        if (isDraft) {
          const list = pack.routing!.debate![key];
          if (list) pack.routing!.debate![key] = list.filter(id => id !== session.id);
        } else {
          const list = pack.routing!.debate![key] ?? (pack.routing!.debate![key] = []);
          if (!list.includes(session.id)) list.push(session.id);
        }
      }
    } else if (session.type === 'compare') {
      const entry = {
        id: session.id,
        title: session.title,
        category: session.category ?? 'provider',
        runs: session.runs,
      } satisfies DemoCompare;
      const idx = pack.compares.findIndex(c => c.id === session.id);
      if (idx >= 0) pack.compares[idx] = entry;
      else pack.compares.push(entry);
      if (session.comboKey) {
        const key = session.comboKey;
        if (isDraft) {
          const list = pack.routing!.compare![key];
          if (list) pack.routing!.compare![key] = list.filter(id => id !== session.id);
        } else {
          const list = pack.routing!.compare![key] ?? (pack.routing!.compare![key] = []);
          if (!list.includes(session.id)) list.push(session.id);
        }
      }
    }

    notifyListeners();
  }
}

export default DemoContentService;
