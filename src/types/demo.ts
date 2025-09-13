export interface DemoMessageEvent {
  type: 'message' | 'stream' | 'tool-start' | 'tool-end' | 'image-grid' | 'pause' | 'divider';
  role?: 'user' | 'assistant' | 'system';
  content?: string;
  delayMs?: number;
  attachments?: Array<{ type: 'image' | 'document'; uri: string; alt?: string }>;
  tool?: { name: string; arguments?: unknown; result?: unknown };
  meta?: Record<string, unknown>;
  // For assistant messages, which provider/persona is speaking
  speakerProvider?: 'claude' | 'openai' | 'google';
  speakerPersona?: string; // e.g., 'default' | 'George' | 'Prof. Sage'
}

export interface DemoChat {
  id: string;
  title: string;
  events: DemoMessageEvent[];
  tags?: string[];
}

export interface DemoDebate {
  id: string;
  topic: string;
  participants: string[]; // names of AIs/personas
  events: DemoMessageEvent[];
}

export interface DemoCompareRun {
  id: string;
  label: string; // e.g., provider/model/persona
  columns: Array<{
    name: string; // left/right label
    events: DemoMessageEvent[];
  }>;
}

export interface DemoCompare {
  id: string;
  title: string;
  category: 'provider' | 'model' | 'persona';
  runs: DemoCompareRun[];
}

export interface DemoHistoryRef {
  id: string;
  type: 'chat' | 'debate' | 'compare';
  refId: string; // id into chats/debates/compares
}

export interface DemoPackV1 {
  version: '1';
  locale: 'en-US' | string;
  chats: DemoChat[];
  debates: DemoDebate[];
  compares: DemoCompare[];
  historyRefs: DemoHistoryRef[];
  assets: Record<string, string>; // name -> uri
  meta: { build: string; createdAt: string };
  routing?: {
    chat?: Record<string, string[]>; // comboKey -> chat IDs
    debate?: Record<string, string[]>; // e.g., 'claude+openai:George' -> debate IDs
    compare?: Record<string, string[]>; // comboKey -> compare IDs
  };
}
