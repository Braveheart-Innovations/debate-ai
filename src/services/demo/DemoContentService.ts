import type { DemoChat, DemoCompare, DemoDebate } from '@/types/demo';
import {
  comboKey as manifestComboKey,
  getRecordingsByProviders,
  recordingsById,
  type DemoRecordingEntryOf,
  type DemoRecordingType,
} from '@/assets/demo/recordingsManifest';

const rotationState: Record<string, number> = {};
const listeners = new Set<() => void>();

interface DemoDataByType {
  chat: DemoChat;
  compare: DemoCompare;
  debate: DemoDebate;
}

function cloneRecording<K extends DemoRecordingType>(entry: DemoRecordingEntryOf<K>): DemoDataByType[K] {
  // Deep clone so callers can safely mutate without affecting the manifest copy
  const cloned: DemoDataByType[K] = JSON.parse(JSON.stringify(entry.data));
  cloned.id = entry.id;
  return cloned;
}

function notifyListeners(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // swallow listener errors
    }
  });
}

export class DemoContentService {
  static comboKey(providers: string[]): string {
    return manifestComboKey(providers);
  }

  private static rotateSample<K extends DemoRecordingType>(
    type: K,
    providers: string[]
  ): DemoDataByType[K] | null {
    const available = getRecordingsByProviders(type, providers);
    if (available.length === 0) return null;

    const key = `${type}:${this.comboKey(providers)}`;
    const idx = rotationState[key] ?? 0;
    const entry = available[idx % available.length];
    rotationState[key] = (idx + 1) % available.length;
    return cloneRecording(entry);
  }

  static async getChatSampleForProviders(providers: string[]): Promise<DemoChat | null> {
    return this.rotateSample('chat', providers);
  }

  static listChatSamples(
    providers: string[],
    _options: { includeDrafts?: boolean } = {}
  ): Array<{ id: string; title: string }> {
    return getRecordingsByProviders('chat', providers).map((entry) => ({
      id: entry.id,
      title: entry.title || entry.id,
    }));
  }

  static async findChatById(id: string): Promise<DemoChat | null> {
    const entry = recordingsById.get(id);
    if (!entry || entry.type !== 'chat') return null;
    return cloneRecording<'chat'>(entry);
  }

  static async getCompareSampleForProviders(providers: string[]): Promise<DemoCompare | null> {
    return this.rotateSample('compare', providers);
  }

  static listCompareSamples(
    providers: string[],
    _options: { includeDrafts?: boolean } = {}
  ): Array<{ id: string; title: string }> {
    return getRecordingsByProviders('compare', providers).map((entry) => ({
      id: entry.id,
      title: entry.title || entry.id,
    }));
  }

  static async findCompareById(id: string): Promise<DemoCompare | null> {
    const entry = recordingsById.get(id);
    if (!entry || entry.type !== 'compare') return null;
    return cloneRecording<'compare'>(entry);
  }

  static async getDebateSampleForProviders(
    providers: string[],
    _persona?: string
  ): Promise<DemoDebate | null> {
    return this.rotateSample('debate', providers);
  }

  static listDebateSamples(
    providers: string[],
    _persona?: string,
    _options: { includeDrafts?: boolean } = {}
  ): Array<{ id: string; title: string; topic: string }> {
    return getRecordingsByProviders('debate', providers).map((entry) => ({
      id: entry.id,
      title: entry.title || entry.topic || entry.id,
      topic: entry.topic || entry.title || entry.id,
    }));
  }

  static async findDebateById(id: string): Promise<DemoDebate | null> {
    const entry = recordingsById.get(id);
    if (!entry || entry.type !== 'debate') return null;
    return cloneRecording<'debate'>(entry);
  }

  static subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  static clearCache(): void {
    // Nothing is cached anymore, but we keep the method for API compatibility.
    notifyListeners();
  }

  static async ingestRecording(_session: object | null | undefined): Promise<void> {
    // Recordings are built from the filesystem manifest; runtime ingestion is no-op.
    if (process.env.NODE_ENV === 'development') {
      console.warn('[DemoContentService] Recording captured. Run `node scripts/demo/build-recordings-manifest.js` to regenerate the manifest.');
    }
    notifyListeners();
  }
}

export default DemoContentService;
