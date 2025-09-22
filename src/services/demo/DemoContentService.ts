import type { DemoChat, DemoCompare, DemoDebate, DemoRecordingSession } from '@/types/demo';
import {
  comboKey as manifestComboKey,
  getRecordingsByProviders,
  recordingsById,
  type DemoRecordingEntry,
} from '@/assets/demo/recordingsManifest';

const rotationState: Record<string, number> = {};
const listeners = new Set<() => void>();

function cloneRecording<T extends DemoChat | DemoCompare | DemoDebate>(
  entry: DemoRecordingEntry<T>
): T {
  // Deep clone so callers can safely mutate without affecting the manifest copy
  const cloned = JSON.parse(JSON.stringify(entry.data)) as T;
  if (cloned && typeof cloned === 'object') {
    (cloned as { id?: string }).id = entry.id;
  }
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

  private static rotateSample<T extends DemoChat | DemoCompare | DemoDebate>(
    type: 'chat' | 'compare' | 'debate',
    providers: string[]
  ): T | null {
    const available = getRecordingsByProviders<T>(type, providers);
    if (available.length === 0) return null;

    const key = `${type}:${this.comboKey(providers)}`;
    const idx = rotationState[key] ?? 0;
    const entry = available[idx % available.length];
    rotationState[key] = (idx + 1) % available.length;
    return cloneRecording(entry);
  }

  static async getChatSampleForProviders(providers: string[]): Promise<DemoChat | null> {
    return this.rotateSample<DemoChat>('chat', providers);
  }

  static listChatSamples(
    providers: string[],
    _options: { includeDrafts?: boolean } = {}
  ): Array<{ id: string; title: string }> {
    return getRecordingsByProviders<DemoChat>('chat', providers).map((entry) => ({
      id: entry.id,
      title: entry.title || entry.id,
    }));
  }

  static async findChatById(id: string): Promise<DemoChat | null> {
    const entry = recordingsById.get(id) as DemoRecordingEntry<DemoChat> | undefined;
    if (!entry || entry.type !== 'chat') return null;
    return cloneRecording(entry);
  }

  static async getCompareSampleForProviders(providers: string[]): Promise<DemoCompare | null> {
    return this.rotateSample<DemoCompare>('compare', providers);
  }

  static listCompareSamples(
    providers: string[],
    _options: { includeDrafts?: boolean } = {}
  ): Array<{ id: string; title: string }> {
    return getRecordingsByProviders<DemoCompare>('compare', providers).map((entry) => ({
      id: entry.id,
      title: entry.title || entry.id,
    }));
  }

  static async findCompareById(id: string): Promise<DemoCompare | null> {
    const entry = recordingsById.get(id) as DemoRecordingEntry<DemoCompare> | undefined;
    if (!entry || entry.type !== 'compare') return null;
    return cloneRecording(entry);
  }

  static async getDebateSampleForProviders(
    providers: string[],
    _persona?: string
  ): Promise<DemoDebate | null> {
    return this.rotateSample<DemoDebate>('debate', providers);
  }

  static listDebateSamples(
    providers: string[],
    _persona?: string,
    _options: { includeDrafts?: boolean } = {}
  ): Array<{ id: string; title: string; topic: string }> {
    return getRecordingsByProviders<DemoDebate>('debate', providers).map((entry) => ({
      id: entry.id,
      title: entry.title || entry.topic || entry.id,
      topic: entry.topic || entry.title || entry.id,
    }));
  }

  static async findDebateById(id: string): Promise<DemoDebate | null> {
    const entry = recordingsById.get(id) as DemoRecordingEntry<DemoDebate> | undefined;
    if (!entry || entry.type !== 'debate') return null;
    return cloneRecording(entry);
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

  static async ingestRecording(_session: DemoRecordingSession | null | undefined): Promise<void> {
    // Recordings are built from the filesystem manifest; runtime ingestion is no-op.
    if (process.env.NODE_ENV === 'development') {
      console.warn('[DemoContentService] Recording captured. Run `node scripts/demo/build-recordings-manifest.js` to regenerate the manifest.');
    }
    notifyListeners();
  }
}

export default DemoContentService;
