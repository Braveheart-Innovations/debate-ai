import fs from 'fs';
import os from 'os';
import path from 'path';

import { getProviderDefaultModel } from '@/config/modelConfigs';
import { UNIVERSAL_PERSONALITIES } from '@/config/personalities';
import { BaseAdapter } from '@/services/ai/base/BaseAdapter';
import type {
  AdapterCapabilities,
  FormattedMessage,
  ResumptionContext,
  SendMessageResponse,
} from '@/services/ai/types/adapter.types';
import { AIService } from '@/services/aiAdapter';
import { DebateOrchestrator } from '@/services/debate/DebateOrchestrator';
import type { AI, AIProvider, DebateVoiceConfig, Message, MessageAttachment } from '@/types';
import { createMockAIConfig } from '@test-utils/fixtures';

/**
 * Debate persona prompt capture: drives the real DebateOrchestrator through a full Oxford 1v1
 * debate with a recording adapter standing in for each model, and writes what every speech would
 * send (system prompt, turn prompt, formatted history, effective sampling) to disk. No network.
 * This is the baseline for the debate persona eval.
 *
 *   DEBATE_PROMPT_CAPTURE=1 npm run test:debate-prompts:capture
 *   DEBATE_PROMPT_CAPTURE_OUT=<dir> overrides the output directory (default: <tmpdir>/debate-prompt-capture).
 */

const captureEnabled = process.env.DEBATE_PROMPT_CAPTURE === '1';
const outDir = process.env.DEBATE_PROMPT_CAPTURE_OUT || path.join(os.tmpdir(), 'debate-prompt-capture');

const MOTION = 'This house would ban private cars from city centres';

const PROVIDERS: Array<{ provider: AIProvider; name: string }> = [
  { provider: 'claude', name: 'Claude' },
  { provider: 'openai', name: 'ChatGPT' },
  { provider: 'google', name: 'Gemini' },
];

const VOICE_CONFIG: DebateVoiceConfig = {
  enabled: true,
  providerId: 'elevenlabs',
  debaterVoices: {},
};

interface CapturedTurn {
  systemPrompt: string;
  turnPrompt: string;
  history: FormattedMessage[];
  sampling: { temperature?: number; topP?: number; topK?: number };
  maxTokens?: number;
  webSearchEnabled: boolean;
}

interface CapturedSpeech extends CapturedTurn {
  index: number;
  label: string;
  phase: string;
  side: 'aff' | 'neg';
  speaker: string;
  provider: AIProvider;
  model: string;
  personalityId: string;
}

interface DebaterSpec {
  provider: AIProvider;
  personalityId: string;
}

interface CaptureRun {
  id: string;
  aff: DebaterSpec;
  neg: DebaterSpec;
  voice: boolean;
}

const debateAdapterCapabilities: AdapterCapabilities = {
  streaming: false,
  attachments: false,
  functionCalling: false,
  systemPrompt: true,
  maxTokens: 4096,
  contextWindow: 200000,
};

/** Records what the real adapter would compose for this turn, and answers with a labelled placeholder. */
class RecordingDebateAdapter extends BaseAdapter {
  readonly turns: CapturedTurn[] = [];

  async sendMessage(
    message: string,
    conversationHistory: Message[] = [],
    _resumptionContext?: ResumptionContext,
    _attachments?: MessageAttachment[],
    modelOverride?: string,
  ): Promise<SendMessageResponse> {
    const model = modelOverride || this.config.model || '';
    this.turns.push({
      systemPrompt: this.getSystemPrompt(),
      turnPrompt: message,
      history: this.formatHistory(conversationHistory),
      sampling: this.resolveSamplingParameters(model),
      maxTokens: this.config.parameters?.maxTokens,
      webSearchEnabled: Boolean(this.config.webSearchEnabled),
    });
    // No persona name in the placeholder: closing turns quote the speaker's own earlier speech, and
    // a name there would read as the turn prompt carrying the persona.
    const label = message.match(/^Turn: (.+)$/m)?.[1] ?? 'speech';
    return {
      response: `[Placeholder ${label}.] The capture records prompts with a recording adapter instead of a model, so later speeches quote this text where a real debate would quote what the previous speaker actually said.`,
      modelUsed: model,
    };
  }

  getCapabilities(): AdapterCapabilities {
    return debateAdapterCapabilities;
  }
}

const isMessage = (value: unknown): value is Message =>
  typeof value === 'object' && value !== null && 'senderType' in value && 'content' in value;

const providerName = (provider: AIProvider): string =>
  PROVIDERS.find(entry => entry.provider === provider)?.name ?? provider;

const defaultModel = (provider: AIProvider): string => getProviderDefaultModel(provider)?.id ?? '';

const runDebate = async (run: CaptureRun): Promise<CapturedSpeech[]> => {
  const service = new AIService();
  const participants: AI[] = [run.aff, run.neg].map((spec, index) => createMockAIConfig({
    id: `${index === 0 ? 'aff' : 'neg'}-${spec.provider}`,
    provider: spec.provider,
    name: providerName(spec.provider),
    model: defaultModel(spec.provider),
  }));
  const adapters = participants.map(ai => {
    const adapter = new RecordingDebateAdapter({
      provider: ai.provider,
      identityId: ai.id,
      apiKey: 'capture',
      model: ai.model,
    });
    service.getAllAdapters().set(ai.id, adapter);
    return adapter;
  });

  const transcript: Message[] = [];
  const orchestrator = new DebateOrchestrator(service);
  orchestrator.addEventListener(event => {
    const message = event.data.message;
    if (event.type === 'message_added' && isMessage(message) && message.senderType === 'ai') {
      transcript.push(message);
    }
  });

  const startTime = Date.UTC(2026, 9, 13, 12, 0, 0);
  jest.setSystemTime(startTime);
  const session = await orchestrator.initializeDebate(
    MOTION,
    participants,
    { [participants[0].id]: run.aff.personalityId, [participants[1].id]: run.neg.personalityId },
    { formatId: 'oxford', presetId: 'short', voiceConfig: run.voice ? VOICE_CONFIG : undefined },
  );

  const speeches: CapturedSpeech[] = [];
  for (const [index, spec] of session.preset.messages.entries()) {
    // Distinct timestamps keep message ids unique; the orchestrator builds them from Date.now().
    jest.setSystemTime(startTime + (index + 1) * 60_000);
    const sideIndex = spec.speaker === 'aff' ? 0 : 1;
    const adapter = adapters[sideIndex];
    const recordedBefore = adapter.turns.length;
    await orchestrator.executeDebateMessage(index, [...transcript]);
    const turn = adapter.turns[recordedBefore];
    if (!turn) {
      throw new Error(`${run.id}: no request recorded for ${spec.label}`);
    }
    const ai = participants[sideIndex];
    speeches.push({
      ...turn,
      index,
      label: spec.label,
      phase: spec.phase,
      side: spec.speaker,
      speaker: transcript[transcript.length - 1]?.sender ?? ai.name,
      provider: ai.provider,
      model: ai.model,
      personalityId: sideIndex === 0 ? run.aff.personalityId : run.neg.personalityId,
    });
  }
  jest.clearAllTimers();
  return speeches;
};

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

interface PromptSections {
  format: string;
  ownPersona: string;
  opponentPersona: string;
  toneTags: string;
}

/**
 * Splits a composed debate system prompt at the markers BaseAdapter and PersonalityRuntimeBuilder emit.
 * A Default debater has no style directive, so its own persona section is empty.
 */
const splitSystemPrompt = (prompt: string): PromptSections => {
  const opponentStart = prompt.search(/\n(?:Opponent|Primary opposing speaker): /);
  const styleStart = prompt.indexOf('Style directive:');
  const ownStart = styleStart === -1 ? opponentStart + 1 : styleStart;
  const rulesStart = prompt.indexOf('\nFollow the turn-specific length guidance.');
  const toneMatch = prompt.search(/\n\[(?:Style|Debate style): /);
  const toneStart = toneMatch === -1 ? prompt.length : toneMatch;
  if (opponentStart === -1 || rulesStart === -1) {
    throw new Error(`Unexpected system prompt shape:\n${prompt}`);
  }
  return {
    format: [prompt.slice(0, ownStart), prompt.slice(rulesStart, toneStart)].join('\n'),
    ownPersona: prompt.slice(ownStart, opponentStart),
    opponentPersona: prompt.slice(opponentStart, rulesStart),
    toneTags: prompt.slice(toneStart).trim(),
  };
};

const fence = (text: string): string => `\`\`\`text\n${text}\n\`\`\``;

const changedLines = (from: string, to: string): string[] => {
  const before = new Set(from.split('\n'));
  return to.split('\n').filter(line => !before.has(line));
};

const describeHistory = (history: FormattedMessage[]): string =>
  history.length === 0
    ? 'none'
    : history.map(entry => `${entry.role} (${typeof entry.content === 'string' ? wordCount(entry.content) : 0} words)`).join(', ');

const renderDebater = (speeches: CapturedSpeech[], side: 'aff' | 'neg'): string => {
  const own = speeches.filter(speech => speech.side === side);
  const [first] = own;
  return [
    `## ${first.speaker}, ${side === 'aff' ? 'Affirmative' : 'Negative'} (${first.model})`,
    '',
    `Sampling: ${JSON.stringify(first.sampling)}; maxTokens ${first.maxTokens}; web search ${first.webSearchEnabled ? 'on' : 'off'}.`,
    '',
    `### System prompt for ${first.label} (${wordCount(first.systemPrompt)} words)`,
    '',
    fence(first.systemPrompt),
    '',
    ...own.flatMap(speech => [
      `### ${speech.label}`,
      '',
      speech === first
        ? 'System prompt: as above.'
        : `System prompt lines that differ from the first speech: ${changedLines(first.systemPrompt, speech.systemPrompt).map(line => `\`${line}\``).join(', ') || 'none'}.`,
      `History sent: ${describeHistory(speech.history)}.`,
      '',
      'Turn prompt:',
      '',
      fence(speech.turnPrompt),
      '',
    ]),
  ].join('\n');
};

const renderRun = (run: CaptureRun, speeches: CapturedSpeech[]): string => [
  `# ${run.id}`,
  '',
  `Motion: "${MOTION}". Oxford 1v1, ${run.voice ? 'voice mode' : 'text mode'}. Placeholder speeches stand in for model output.`,
  '',
  renderDebater(speeches, 'aff'),
  renderDebater(speeches, 'neg'),
].join('\n');

const renderSummary = (runs: Map<string, { run: CaptureRun; speeches: CapturedSpeech[] }>): string => {
  const opening = (runId: string): CapturedSpeech | undefined =>
    runs.get(runId)?.speeches.find(speech => speech.index === 0);

  const compositionRows = UNIVERSAL_PERSONALITIES.map(persona => {
    const speech = opening(`${persona.id}-vs-default-claude`);
    if (!speech) return `| ${persona.name} | missing | | | | |`;
    const sections = splitSystemPrompt(speech.systemPrompt);
    const total = wordCount(speech.systemPrompt);
    const own = wordCount(sections.ownPersona);
    return `| ${persona.name} | ${total} | ${wordCount(sections.format)} | ${own} (${Math.round((own / total) * 100)}%) | ${wordCount(sections.opponentPersona)} | ${sections.toneTags.replace(/\n/g, ' ') || 'none'} |`;
  });

  const samplingRows = UNIVERSAL_PERSONALITIES.map(persona => {
    const cells = PROVIDERS.map(({ provider }) => {
      const speech = opening(`${persona.id}-vs-default-${provider}`);
      return speech?.sampling.temperature === undefined ? 'not sent' : String(speech.sampling.temperature);
    });
    return `| ${persona.name} | ${persona.modelParameters?.temperature ?? 'none'} | ${cells.join(' | ')} |`;
  });

  const pair = opening('george-vs-kai-claude');
  const pairSections = pair ? splitSystemPrompt(pair.systemPrompt) : undefined;
  const textRun = runs.get('george-vs-kai-claude')?.speeches ?? [];
  const voiceRun = runs.get('george-vs-kai-claude-voice')?.speeches ?? [];
  const voiceRows = textRun.map((speech, index) => {
    const voice = voiceRun[index];
    const systemSame = voice?.systemPrompt === speech.systemPrompt;
    const turnSame = voice?.turnPrompt === speech.turnPrompt;
    return `| ${speech.label} | ${systemSame ? 'same' : 'differs'} | ${turnSame ? 'same' : 'differs'} | ${speech.maxTokens} | ${voice?.maxTokens} |`;
  });

  const allSpeeches = [...runs.values()].flatMap(entry => entry.speeches);
  // Text written for chat and compare (persona system prompts, chat guidance, signature moves, card
  // notes, chat samples) has no place in a debater's prompt.
  const chatOnlyText = UNIVERSAL_PERSONALITIES.flatMap(persona => [
    persona.id === 'default' ? undefined : persona.systemPrompt,
    persona.chatGuidance,
    persona.compareGuidance,
    ...persona.signatureMoves,
    ...(persona.watchouts ?? []),
    persona.sampleOpeners?.chat,
    persona.sampleOpeners?.compare,
  ]).filter((text): text is string => Boolean(text));
  const chatTextInDebate = allSpeeches.filter(speech => chatOnlyText.some(text => speech.systemPrompt.includes(text))).length;
  const personaNamedInTurn = allSpeeches.filter(speech => {
    const name = UNIVERSAL_PERSONALITIES.find(persona => persona.id === speech.personalityId)?.name;
    return speech.personalityId !== 'default' && name !== undefined && speech.turnPrompt.includes(name);
  }).length;

  return [
    '# Debate persona prompt capture',
    '',
    `Captured ${new Date().toISOString()} by \`__tests__/integration/debatePromptCapture.test.ts\`. Motion: "${MOTION}". Oxford 1v1, all 6 speeches per run. Each persona argues Affirmative against a Default Negative; \`george-vs-kai-*\` pairs two personas.`,
    '',
    '## System prompt composition (Affirmative Opening Statement, Default opponent)',
    '',
    '| Persona | Total words | Format words | Own persona words | Opponent words | Tone tags |',
    '| --- | --- | --- | --- | --- | --- |',
    ...compositionRows,
    '',
    pairSections && pair
      ? `With a persona opponent (George vs Kai), George's opening system prompt is ${wordCount(pair.systemPrompt)} words: ${wordCount(pairSections.ownPersona)} his own persona, ${wordCount(pairSections.opponentPersona)} Kai's.`
      : 'George vs Kai run missing.',
    '',
    '## Temperature sent on each provider default model',
    '',
    `| Persona | Persona temperature | ${PROVIDERS.map(({ provider, name }) => `${name} (${defaultModel(provider)})`).join(' | ')} |`,
    '| --- | --- | --- | --- | --- |',
    ...samplingRows,
    '',
    '## Chat text in debate prompts',
    '',
    `${chatTextInDebate} of ${allSpeeches.length} speeches carry chat or compare persona text (system prompts, chat guidance, signature moves, card notes, chat samples) in their system prompt.`,
    '',
    '## Turn prompts',
    '',
    `${personaNamedInTurn} of ${allSpeeches.filter(speech => speech.personalityId !== 'default').length} persona speeches have the persona's name anywhere in the turn prompt.`,
    '',
    '## Voice mode vs text mode (George vs Kai, Claude vs Gemini)',
    '',
    '| Speech | System prompt | Turn prompt | maxTokens text | maxTokens voice |',
    '| --- | --- | --- | --- | --- |',
    ...voiceRows,
    '',
  ].join('\n');
};

const opponentProvider = (provider: AIProvider): AIProvider => (provider === 'google' ? 'openai' : 'google');

const RUNS: CaptureRun[] = [
  ...PROVIDERS.flatMap(({ provider }) => UNIVERSAL_PERSONALITIES.map(persona => ({
    id: `${persona.id}-vs-default-${provider}`,
    aff: { provider, personalityId: persona.id },
    neg: { provider: opponentProvider(provider), personalityId: 'default' },
    voice: false,
  }))),
  { id: 'george-vs-kai-claude', aff: { provider: 'claude', personalityId: 'george' }, neg: { provider: 'google', personalityId: 'kai' }, voice: false },
  { id: 'george-vs-kai-claude-voice', aff: { provider: 'claude', personalityId: 'george' }, neg: { provider: 'google', personalityId: 'kai' }, voice: true },
];

const describeCapture = captureEnabled ? describe : describe.skip;

describeCapture('Debate persona prompt capture', () => {
  jest.setTimeout(120000);

  beforeEach(() => {
    jest.useFakeTimers();
    // PromptDebugLogger dumps every composed prompt in dev; the capture writes them to files instead.
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('records every speech of every persona and writes the capture', async () => {
    const results = new Map<string, { run: CaptureRun; speeches: CapturedSpeech[] }>();
    for (const run of RUNS) {
      results.set(run.id, { run, speeches: await runDebate(run) });
    }

    // Apart from the debaters' display names, the composed prompts do not depend on the provider;
    // only sampling does.
    for (const persona of UNIVERSAL_PERSONALITIES) {
      const [reference, ...others] = PROVIDERS.map(({ provider }) => {
        const entry = results.get(`${persona.id}-vs-default-${provider}`);
        if (!entry) throw new Error(`Missing run for ${persona.id} on ${provider}`);
        const names = [providerName(entry.run.aff.provider), providerName(entry.run.neg.provider)];
        const normalize = (text: string): string =>
          names.reduce((result, name, index) => result.split(name).join(index === 0 ? '<AFF>' : '<NEG>'), text);
        return entry.speeches.map(speech => [normalize(speech.systemPrompt), normalize(speech.turnPrompt)]);
      });
      for (const prompts of others) {
        expect(prompts).toEqual(reference);
      }
    }
    for (const { speeches } of results.values()) {
      expect(speeches).toHaveLength(6);
    }

    fs.mkdirSync(path.join(outDir, 'prompts'), { recursive: true });
    fs.writeFileSync(path.join(outDir, 'summary.md'), renderSummary(results));
    for (const { run, speeches } of results.values()) {
      if (run.id.endsWith('-claude') || run.id.endsWith('-voice')) {
        fs.writeFileSync(path.join(outDir, 'prompts', `${run.id}.md`), renderRun(run, speeches));
      }
    }
    fs.writeFileSync(
      path.join(outDir, 'captures.json'),
      JSON.stringify([...results.values()].map(({ run, speeches }) => ({ ...run, motion: MOTION, speeches })), null, 2),
    );
    process.stdout.write(`\nDebate prompt capture written to ${outDir}\n`);
  });
});
