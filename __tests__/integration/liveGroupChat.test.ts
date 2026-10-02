import fs from 'fs';
import path from 'path';

import { getProviderDefaultModel } from '@/config/modelConfigs';
import { AIService } from '@/services/aiAdapter';
import { ChatOrchestrator } from '@/services/chat/ChatOrchestrator';
import { isDemoModeEnabled } from '@/services/demo/demoMode';
import { addMessage, updateMessage, type AppDispatch } from '@/store';
import type { AI, AIProvider, ChatSession, Message } from '@/types';

/**
 * Live multi-AI Chat smoke: runs the real ChatOrchestrator + adapters for a
 * Gemini → ChatGPT → Claude round (then a rotated second round) and prints the
 * transcript for review. Guards the "third AI thinks it said the first AI's
 * words" regression with real models.
 *
 *   LIVE_GROUP_CHAT_TEST=1 npm run test:group-chat:live
 */

jest.mock('@/services/demo/demoMode', () => ({
  isDemoModeEnabled: jest.fn(),
}));

// See liveModelRouting.test.ts: jest-expo replaces fetch; use host-realm undici.
const hostRequire = process
  .getBuiltinModule('node:module')
  .createRequire(process.cwd() + '/package.json');
const nativeFetch = (hostRequire('undici') as { fetch: typeof fetch }).fetch;
const liveEnabled = process.env.LIVE_GROUP_CHAT_TEST === '1';

const loadEnvFile = (fileName: string): void => {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    }
  }
};

const LINEUP: Array<{ provider: AIProvider; name: string; keyEnv: string }> = [
  { provider: 'google', name: 'Gemini', keyEnv: 'GEMINI_API_KEY' },
  { provider: 'openai', name: 'ChatGPT', keyEnv: 'OPENAI_API_KEY' },
  { provider: 'claude', name: 'Claude', keyEnv: 'CLAUDE_API_KEY' },
];

const ROUNDS = [
  'Since the Great Wall of China is visible from the Moon with the naked eye, what does that say about how big it is? Keep it to a short paragraph.',
  'Fair enough. So what is the most visible human-made thing from low Earth orbit? Short answer.',
];

const describeLive = liveEnabled ? describe : describe.skip;

describeLive('Live multi-AI group chat', () => {
  jest.setTimeout(300000);

  beforeAll(() => {
    loadEnvFile('.env.local');
    loadEnvFile('.env');
    (isDemoModeEnabled as jest.Mock).mockReturnValue(false);
    global.fetch = nativeFetch;
  });

  const setup = () => {
    const keys = Object.fromEntries(LINEUP.map(({ provider, keyEnv }) => {
      const key = process.env[keyEnv]?.trim();
      if (!key) throw new Error(`Missing ${keyEnv}`);
      return [provider, key];
    }));
    const service = new AIService(keys);

    const ais: AI[] = LINEUP.map(({ provider, name }) => ({
      id: provider,
      provider,
      name,
      model: getProviderDefaultModel(provider)?.id || '',
    } as AI));

    const messages: Message[] = [];
    const dispatchMock = jest.fn((action: { type: string; payload: unknown }) => {
      if (action.type === addMessage.type) {
        messages.push(action.payload as Message);
      } else if (action.type === updateMessage.type) {
        const update = action.payload as { id: string; content?: string; metadata?: Message['metadata'] };
        const target = messages.find(m => m.id === update.id);
        if (target) {
          if (update.content !== undefined) target.content = update.content;
          if (update.metadata) target.metadata = { ...target.metadata, ...update.metadata };
        }
      }
      return action;
    });

    const session: ChatSession = {
      id: 'live-group-chat',
      selectedAIs: ais,
      messages: [],
      isActive: true,
      createdAt: Date.now(),
      sessionType: 'chat',
    };
    const orchestrator = new ChatOrchestrator(service, dispatchMock as unknown as AppDispatch);
    orchestrator.updateSession(session);

    const send = async (content: string, mentions: string[] = []) => {
      const existingMessages = [...messages];
      const userMessage: Message = { id: `u${messages.length}`, sender: 'You', senderType: 'user', content, timestamp: Date.now() };
      messages.push(userMessage);
      await orchestrator.processUserMessage({
        userMessage,
        existingMessages,
        mentions,
        aiPersonalities: {},
        selectedModels: {},
        apiKeys: keys,
        expertModeConfigs: {},
        allowStreaming: false,
        isDemo: false,
      });
    };

    const printTranscript = () => {
      const transcript = messages
        .map(m => `── ${m.sender}${m.metadata?.lifecycle ? ` (${m.metadata.lifecycle.status})` : ''}\n${m.content}`)
        .join('\n\n');
      // eslint-disable-next-line no-console -- live runs print the transcript for human review
      console.log(`\n${transcript}\n`);
    };

    return { ais, messages, send, printTranscript };
  };

  it('keeps speaker identity straight across a three-AI round', async () => {
    const { messages, send, printTranscript } = setup();
    for (const content of ROUNDS) {
      await send(content);
    }
    printTranscript();

    const aiReplies = messages.filter(m => m.senderType === 'ai');
    expect(aiReplies).toHaveLength(LINEUP.length * ROUNDS.length);
    aiReplies.forEach(reply => {
      expect(reply.metadata?.lifecycle).toBeUndefined();
      expect(reply.content.trim().length).toBeGreaterThan(0);
      expect(reply.content).not.toMatch(new RegExp(`^\\s*\\[${reply.sender}\\]`));
    });
  });

  it('does not take blame for a critique aimed at another AI', async () => {
    const { ais, messages, send, printTranscript } = setup();
    const [gemini, chatgpt] = ais;
    // The reported failure: Gemini answers, ChatGPT critiques Gemini, and the next AI
    // apologised for "overreach" it never committed. Seed that round verbatim-shaped.
    messages.push(
      { id: 's0', sender: 'You', senderType: 'user', content: 'Does cracking your knuckles cause arthritis?', timestamp: 1 },
      {
        id: 's1', sender: gemini.name, senderType: 'ai', timestamp: 2,
        content: 'Yes. Habitual knuckle cracking wears down cartilage over time and is a well-established cause of osteoarthritis in the hands.',
        metadata: { aiId: gemini.id, providerId: gemini.provider },
      },
      {
        id: 's2', sender: chatgpt.name, senderType: 'ai', timestamp: 3,
        content: "I have to push back on Gemini here — that's an overreach. Studies, including Dr. Donald Unger's 60-year self-experiment and larger cohort studies, have found no link between knuckle cracking and arthritis.",
        metadata: { aiId: chatgpt.id, providerId: chatgpt.provider },
      },
    );

    await send('Claude, where do you land on this?', ['claude']);
    printTranscript();

    const reply = messages[messages.length - 1];
    expect(reply.sender).toBe('Claude');
    expect(reply.metadata?.lifecycle).toBeUndefined();
    // Claude never made the claim, so it must not apologise for or retract it.
    expect(reply.content).not.toMatch(/\b(my|I) (overreach|overstated|was wrong|apologi[sz]e|stand corrected)\b/i);
    expect(reply.content).toMatch(/Gemini|ChatGPT/);
  });
});
