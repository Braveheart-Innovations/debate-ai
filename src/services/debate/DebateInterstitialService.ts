import type { AI, Citation, DebateInterstitialKind, DebatePodcastFlowStep, Message, ModelParameters } from '@/types';
import type { AudienceDecisionResult, DebateSideId, MessageSpec, PhaseId, PresetConfig } from '@/config/debate/formats';
import { AIService } from '@/services/aiAdapter';
import { getModelById, resolveProviderModelId } from '@/config/modelConfigs';
import { getProviderErrorMessage, withProviderRetry } from '@/services/retry/ProviderRetryService';
import type { DebateSession } from './DebateOrchestrator';

const MC_SENDER = 'Debate MC';
const MC_TEMPERATURE = 0.62;
const MC_INTRO_OPENING_LINE = 'Welcome to the Symposium AI Debate Arena: where ideas converge, and understanding emerges.';
const THIRD_PARTY_DEBATE_BRAND_PATTERN = new RegExp(['Intelligence', 'Squared'].join('[-\\s]+'), 'i');
const PREMATURE_JUDGMENT_PATTERN = /\b(?:already\s+winning|winning\s+this|clearly\s+(?:ahead|stronger|superior|right|wrong)|more\s+(?:persuasive|factual|credible|convincing)|has\s+the\s+edge|takes?\s+the\s+lead|dominates?|prevails?|the\s+(?:right|wrong)\s+side)\b/i;
const INTERNAL_CUE_PREFIX_PATTERN = /^(?:cue|beat|label)?\s*:?\s*(?:vote[_\s-]*segue|phase[_\s-]*segue|mc\s+(?:voting\s+cue|segue|introduction|winner\s+announcement))\s*[:.-]?\s*/i;
const INTERNAL_CUE_LEAK_PATTERN = /\b(?:vote[_\s-]*segue|phase[_\s-]*segue|mc\s+(?:voting\s+cue|segue|introduction|winner\s+announcement))\b/i;
const RECENT_MC_LIMIT = 3;
const MAX_MC_SCRIPT_CHARS = 700;
const MC_OUTPUT_SAFETY_TOKENS = 1024;

type McFallbackReason =
  | 'provider_error'
  | 'empty_output'
  | 'third_party_brand'
  | 'internal_cue'
  | 'too_long'
  | 'missing_audience_question'
  | 'premature_judgment';

type McScriptValidation =
  | { ok: true; script: string }
  | { ok: false; reason: Exclude<McFallbackReason, 'provider_error'> };

const PHASE_LABELS: Record<PhaseId, string> = {
  opening: 'opening speeches',
  constructive: 'constructive cases',
  cross_examination: 'cross-examination',
  rebuttal: 'rebuttals',
  final_rebuttal: 'final rebuttals',
  question: 'questions',
  closing: 'closing speeches',
  synthesis: 'synthesis',
};

export interface CreateDebateInterstitialInput {
  aiService: AIService;
  session: DebateSession;
  kind: DebateInterstitialKind;
  completedMessageSpec?: MessageSpec;
  nextMessageSpec?: MessageSpec;
  votingLabel?: string;
  winnerName?: string;
  audienceResult?: AudienceDecisionResult;
  recentMcMessages?: string[];
  now?: () => number;
}

type McAdapter = {
  config?: {
    webSearchEnabled?: boolean;
    parameters?: Partial<ModelParameters>;
    isDebateMode?: boolean;
    model?: string;
    personality?: unknown;
  };
  sendMessage?: (
    message: string,
    conversationHistory?: Message[],
    resumptionContext?: unknown,
    attachments?: unknown,
    modelOverride?: string
  ) => Promise<string | CitationBackedResult>;
  setTemporaryPersonality?: (personality: undefined) => void;
};

type McAdapterConfigSnapshot = {
  webSearchEnabled?: boolean;
  parameters?: Partial<ModelParameters>;
  isDebateMode?: boolean;
  model?: string;
  personality?: unknown;
  hadWebSearchEnabled: boolean;
  hadParameters: boolean;
  hadIsDebateMode: boolean;
  hadModel: boolean;
  hadPersonality: boolean;
};

type CitationBackedResult = {
  response: string;
  modelUsed?: string;
  metadata?: {
    citations?: Citation[];
  };
};

function getSideParticipants(participants: AI[], preset: PresetConfig, side: 'aff' | 'neg'): AI[] {
  const teamSize = preset.teamSize || 1;
  if (teamSize <= 1) {
    return side === 'aff' ? participants.slice(0, 1) : participants.slice(1, 2);
  }
  return participants.filter((_, index) => (side === 'aff' ? index % 2 === 0 : index % 2 === 1));
}

function namesFor(participants: AI[]): string {
  if (participants.length === 0) return 'the side';
  if (participants.length === 1) return participants[0].name;
  return `${participants.slice(0, -1).map((participant) => participant.name).join(', ')} and ${participants[participants.length - 1].name}`;
}

function buildIntroListeningFrame(topic: string): string {
  const normalized = topic.toLowerCase();

  if (/\b(?:minecraft|video games?|games?|gaming|players?|versions?|editions?|modding|servers?|console|pc)\b/i.test(normalized)) {
    return 'Listen for how each side defines the standard of comparison, from play experience to community support and technical tradeoffs.';
  }

  if (/\b(?:which|what)\b.*\b(?:better|best|superior|preferable)\b|\b(?:better|best|superior|preferable)\b/i.test(normalized)) {
    return 'Listen for how each side defines the standard of comparison and which tradeoffs matter most.';
  }

  if (/\bshould\b/i.test(normalized)) {
    return 'Listen for how each side weighs benefits, costs, and consequences without assuming the answer.';
  }

  return 'Listen for the key definitions, tradeoffs, and examples each side uses to test the motion.';
}

function getParticipantForMessageSpec(participants: AI[], preset: PresetConfig, messageSpec?: MessageSpec): AI | undefined {
  if (!messageSpec) return undefined;

  const teamSize = preset.teamSize || 1;
  if (teamSize <= 1) {
    return participants[messageSpec.speaker === 'aff' ? 0 : 1];
  }

  const slot = Math.min(Math.max(messageSpec.speakerSlot ?? 0, 0), teamSize - 1);
  const participantIndex = (slot * 2) + (messageSpec.speaker === 'aff' ? 0 : 1);
  return participants[participantIndex];
}

function sideLabelFor(side?: DebateSideId): string {
  return side === 'neg' ? 'Negative' : 'Affirmative';
}

function getAudienceQuestionCue(
  session: DebateSession,
  nextMessageSpec?: MessageSpec
): { question?: string; responderName?: string; side: DebateSideId; sideLabel: string } {
  const side = nextMessageSpec?.audienceQuestionTarget || nextMessageSpec?.speaker || 'aff';
  return {
    question: session.audienceQuestions?.[side],
    responderName: getParticipantForMessageSpec(session.participants, session.preset, nextMessageSpec)?.name,
    side,
    sideLabel: sideLabelFor(side),
  };
}

function normalizeForContainment(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function generatedCopyIncludesAudienceQuestion(
  text: string,
  session: DebateSession,
  nextMessageSpec?: MessageSpec
): boolean {
  const question = getAudienceQuestionCue(session, nextMessageSpec).question;
  if (!question) return true;
  return normalizeForContainment(text).includes(normalizeForContainment(question));
}

function isPreResultKind(kind: DebateInterstitialKind): boolean {
  return kind !== 'winner';
}

function generatedCopyPrematurelyJudgesSide(
  text: string,
  input: Omit<CreateDebateInterstitialInput, 'aiService' | 'now'>
): boolean {
  if (!isPreResultKind(input.kind) || input.winnerName || input.audienceResult) return false;
  return PREMATURE_JUDGMENT_PATTERN.test(text);
}

function labelForKind(kind: DebateInterstitialKind): string {
  switch (kind) {
    case 'intro':
      return 'MC Introduction';
    case 'phase_segue':
      return 'MC Segue';
    case 'audience_question':
      return 'MC Audience Question';
    case 'vote_segue':
      return 'MC Voting Cue';
    case 'winner':
      return 'MC Winner Announcement';
  }
}

function flowStepForKind(kind: DebateInterstitialKind): DebatePodcastFlowStep {
  switch (kind) {
    case 'intro':
      return 'podcast_intro';
    case 'phase_segue':
      return 'podcast_phase_segue';
    case 'audience_question':
      return 'podcast_audience_question';
    case 'vote_segue':
      return 'podcast_vote_setup';
    case 'winner':
      return 'podcast_winner';
  }
}

function trimAtSentenceBoundary(text: string): string {
  if (text.length <= MAX_MC_SCRIPT_CHARS) {
    return text;
  }

  const candidate = text.slice(0, MAX_MC_SCRIPT_CHARS + 1);
  const matches = Array.from(candidate.matchAll(/[.!?](?=\s|$)/g));
  const lastBoundary = matches.length > 0
    ? (matches[matches.length - 1].index ?? -1) + 1
    : -1;

  if (lastBoundary <= 0) {
    return '';
  }

  const trimmed = candidate.slice(0, lastBoundary).trim();
  return trimmed.length > 0 ? trimmed : '';
}

function validateGeneratedScript(text: string): McScriptValidation {
  const normalized = text
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (INTERNAL_CUE_LEAK_PATTERN.test(normalized)) {
    return { ok: false, reason: 'internal_cue' };
  }

  const cleaned = normalized
    .replace(INTERNAL_CUE_PREFIX_PATTERN, '')
    .trim();

  if (!cleaned) {
    return { ok: false, reason: 'empty_output' };
  }

  if (THIRD_PARTY_DEBATE_BRAND_PATTERN.test(cleaned)) {
    return { ok: false, reason: 'third_party_brand' };
  }

  const script = trimAtSentenceBoundary(cleaned);
  if (!script) {
    return { ok: false, reason: 'too_long' };
  }

  return { ok: true, script };
}

// A host model that reasons first gets the debaters' ceiling: its reasoning shares the limit, and
// 1024 leaves it little room to answer.
const MC_THINKING_OUTPUT_SAFETY_TOKENS = 6144;

function getMcParameters(session: DebateSession): Partial<ModelParameters> {
  const mc = session.voiceConfig?.podcast?.mc;
  const thinks = mc ? Boolean(getModelById(mc.provider, getResolvedMcModel(session))?.supportsThinking) : false;
  return {
    temperature: MC_TEMPERATURE,
    maxTokens: thinks ? MC_THINKING_OUTPUT_SAFETY_TOKENS : MC_OUTPUT_SAFETY_TOKENS,
  };
}

function getResolvedMcModel(session: DebateSession): string {
  const mc = session.voiceConfig?.podcast?.mc;
  if (!mc) return '';
  return resolveProviderModelId(mc.provider, mc.model) || mc.model;
}

function mcModelSupportsWebSearch(session: DebateSession): boolean {
  const mc = session.voiceConfig?.podcast?.mc;
  if (!mc) return false;

  const resolvedModel = getResolvedMcModel(session);
  const model = getModelById(mc.provider, resolvedModel);
  return Boolean(model?.supportsWebSearch);
}

async function configureMcWebSearch(
  aiService: AIService,
  session: DebateSession,
  enabled: boolean,
  parameters: Partial<ModelParameters>
): Promise<{ adapter?: McAdapter; snapshot?: McAdapterConfigSnapshot }> {
  const podcast = session.voiceConfig?.podcast;
  if (!podcast) return {};

  const resolvedModel = getResolvedMcModel(session);
  const adapterId = `podcast-mc:${podcast.mc.id || podcast.mc.provider}:${resolvedModel}`;
  const service = aiService as AIService & {
    ensureAdapter?: (adapterId: string, provider?: string, model?: string) => Promise<McAdapter | undefined>;
    getAdapter?: (provider: string) => McAdapter | undefined;
  };
  const adapter = service.ensureAdapter
    ? await service.ensureAdapter.call(aiService, adapterId, podcast.mc.provider, resolvedModel)
    : service.getAdapter?.call(aiService, podcast.mc.provider);

  if (!adapter?.config) return { adapter };

  const hasOwnConfig = (key: string): boolean =>
    Object.prototype.hasOwnProperty.call(adapter.config, key);
  const snapshot: McAdapterConfigSnapshot = {
    webSearchEnabled: adapter.config.webSearchEnabled,
    parameters: adapter.config.parameters,
    isDebateMode: adapter.config.isDebateMode,
    model: adapter.config.model,
    personality: adapter.config.personality,
    hadWebSearchEnabled: hasOwnConfig('webSearchEnabled'),
    hadParameters: hasOwnConfig('parameters'),
    hadIsDebateMode: hasOwnConfig('isDebateMode'),
    hadModel: hasOwnConfig('model'),
    hadPersonality: hasOwnConfig('personality'),
  };

  adapter.config.webSearchEnabled = enabled;
  adapter.config.parameters = parameters;
  adapter.config.isDebateMode = false;
  adapter.config.model = resolvedModel;
  adapter.setTemporaryPersonality?.(undefined);
  return { adapter, snapshot };
}

function restoreMcWebSearch(
  adapter?: McAdapter,
  snapshot?: McAdapterConfigSnapshot
): void {
  if (!adapter?.config) return;

  if (!snapshot) return;

  if (snapshot.hadWebSearchEnabled) {
    adapter.config.webSearchEnabled = snapshot.webSearchEnabled;
  } else {
    delete adapter.config.webSearchEnabled;
  }
  if (snapshot.hadParameters) {
    adapter.config.parameters = snapshot.parameters;
  } else {
    delete adapter.config.parameters;
  }
  if (snapshot.hadIsDebateMode) {
    adapter.config.isDebateMode = snapshot.isDebateMode;
  } else {
    delete adapter.config.isDebateMode;
  }
  if (snapshot.hadModel) {
    adapter.config.model = snapshot.model;
  } else {
    delete adapter.config.model;
  }
  if (snapshot.hadPersonality) {
    adapter.config.personality = snapshot.personality;
  } else {
    delete adapter.config.personality;
  }
}

async function sendMcPrompt(
  input: CreateDebateInterstitialInput,
  adapter: McAdapter | undefined,
  parameters: Partial<ModelParameters>
): Promise<CitationBackedResult> {
  const podcast = input.session.voiceConfig?.podcast;
  const prompt = buildPrompt(input);
  const model = getResolvedMcModel(input.session);

  if (adapter?.sendMessage) {
    const directResult = await adapter.sendMessage(prompt, [], undefined, undefined, model);
    if (typeof directResult === 'string') {
      return { response: directResult, modelUsed: model };
    }
    return directResult;
  }

  return input.aiService.sendMessage(
    podcast?.mc.provider || '',
    prompt,
    [],
    undefined,
    undefined,
    parameters,
    model
  ) as Promise<CitationBackedResult>;
}

async function sendMcPromptWithRetry(
  input: CreateDebateInterstitialInput,
  adapter: McAdapter | undefined,
  parameters: Partial<ModelParameters>
): Promise<CitationBackedResult> {
  const podcast = input.session.voiceConfig?.podcast;
  return withProviderRetry(
    () => sendMcPrompt(input, adapter, parameters),
    {
      provider: podcast?.mc.provider,
      model: getResolvedMcModel(input.session),
      operation: 'debate_mc_interstitial',
    }
  );
}

function sanitizeFallbackDetail(error: unknown): string {
  return getProviderErrorMessage(error)
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

export function buildDebateInterstitialTemplate(input: Omit<CreateDebateInterstitialInput, 'aiService' | 'now'>): string {
  const { session, kind, completedMessageSpec, nextMessageSpec, votingLabel, winnerName, audienceResult } = input;
  const proposition = namesFor(getSideParticipants(session.participants, session.preset, 'aff'));
  const opposition = namesFor(getSideParticipants(session.participants, session.preset, 'neg'));
  const nextPhase = nextMessageSpec ? PHASE_LABELS[nextMessageSpec.phase] : undefined;
  const completedPhase = completedMessageSpec ? PHASE_LABELS[completedMessageSpec.phase] : undefined;
  const audienceQuestionCue = getAudienceQuestionCue(session, nextMessageSpec);

  switch (kind) {
    case 'intro':
      return `${MC_INTRO_OPENING_LINE} The motion is: ${session.topic}. ${buildIntroListeningFrame(session.topic)} Speaking for the motion: ${proposition}. Speaking against it: ${opposition}.`;
    case 'phase_segue':
      if (nextMessageSpec?.phase === 'question' && !session.audienceQuestions) {
        return `That concludes ${completedPhase || 'this phase'}. We will collect audience questions now, and each side will hear its question from the MC before answering.`;
      }
      return `That concludes ${completedPhase || 'this phase'}. Next, the debate moves to ${nextPhase || 'the next phase'}, where the same motion is tested from a new angle without declaring either side ahead.`;
    case 'audience_question':
      if (audienceQuestionCue.question) {
        const responderPrefix = audienceQuestionCue.responderName
          ? `${audienceQuestionCue.responderName}, for the ${audienceQuestionCue.sideLabel}, the audience asks`
          : `The audience question for the ${audienceQuestionCue.sideLabel} side is`;
        return `${responderPrefix}: ${audienceQuestionCue.question}`;
      }
      return `We now move to the audience question for the ${audienceQuestionCue.sideLabel} side.`;
    case 'vote_segue':
      return `We pause now for ${votingLabel || 'the next vote'}. Consider which side did more to advance its burden before the debate continues.`;
    case 'winner':
      if (audienceResult) {
        return `The audience decision is in: ${audienceResult.winningSideLabel}. ${audienceResult.summary}`;
      }
      return `The debate is complete. ${winnerName || 'The winning side'} carries the decision after the final scoring.`;
  }
}

function buildPrompt(input: Omit<CreateDebateInterstitialInput, 'aiService' | 'now'>): string {
  const template = buildDebateInterstitialTemplate(input);
  const { session, kind, completedMessageSpec, nextMessageSpec, votingLabel, winnerName, audienceResult, recentMcMessages } = input;
  const proposition = namesFor(getSideParticipants(session.participants, session.preset, 'aff'));
  const opposition = namesFor(getSideParticipants(session.participants, session.preset, 'neg'));
  const audienceQuestionCue = getAudienceQuestionCue(session, nextMessageSpec);
  const liveContextEnabled = mcModelSupportsWebSearch(session);
  const recentLines = recentMcMessages?.slice(-RECENT_MC_LIMIT).filter(Boolean);
  const beatInstructionMap: Record<DebateInterstitialKind, string> = {
    intro: 'Intro beat: preserve the required opening line, then frame the motion with one concrete, topic-specific listening lens. If the topic is entertainment, gaming, products, sports, culture, or personal preference, do not recast it as public policy, institutional choice, or civic values. Do not answer the motion.',
    phase_segue: 'Segue beat: connect the completed phase to the next phase with color commentary about the debate structure or stakes. Do not score arguments or imply which side is ahead.',
    audience_question: 'Audience Q&A beat: read the submitted question aloud exactly, then add at most one short neutral setup for the answering side. Do not reword the question.',
    vote_segue: 'Voting beat: invite careful evaluation of burdens, clarity, and persuasion without telling the audience how to vote.',
    winner: 'Winner beat: report the recorded result plainly and add only a concise closing reflection grounded in the provided result.',
  };
  const hostBeatMap: Record<DebateInterstitialKind, string> = {
    intro: 'opening introduction',
    phase_segue: 'phase transition',
    audience_question: 'audience question setup',
    vote_segue: 'voting setup',
    winner: 'result announcement',
  };

  return [
    'Write one concise podcast host interstitial for an AI debate.',
    'Host voice: neutral podcast host; clear, topic-specific, grounded, and not comedic.',
    'Use listening framing, not argument framing: explain what the audience should evaluate, not which side is correct.',
    'Style: no markdown, no stage directions, no headings, no labels, one paragraph.',
    'Return only the exact words the host should say aloud.',
    kind === 'intro' || kind === 'phase_segue' ? 'Length: 2-4 sentences.' : 'Length: 1-2 sentences.',
    'Do not reference third-party debate brands or programs.',
    'Do not use generic civics filler such as public values, institutional choices, or historical resonance unless the motion explicitly calls for that domain.',
    'Neutrality rule: do not say either side is stronger, more persuasive, more factual, ahead, winning, right, or wrong unless a vote/result has occurred.',
    liveContextEnabled
      ? 'Context mode: live web context is available. You may use broad current context if relevant, but keep it concise and do not include source lists or citation callouts in the script.'
      : 'Context mode: broad context only. Do not make specific current claims, cite dates, quote statistics, or name recent events; use only the motion itself and general background.',
    beatInstructionMap[kind],
    kind === 'audience_question' ? 'Audience Q&A requirement: read the submitted question aloud exactly before the answerer responds.' : undefined,
    kind === 'intro' ? `Intro opening line to preserve: ${MC_INTRO_OPENING_LINE}` : undefined,
    `Host beat: ${hostBeatMap[kind]}.`,
    `Motion: ${session.topic}`,
    `Format: ${session.format.name} / ${session.preset.shortLabel}.`,
    `For the motion: ${proposition}.`,
    `Against the motion: ${opposition}.`,
    completedMessageSpec ? `Completed speech: ${completedMessageSpec.label}.` : undefined,
    nextMessageSpec ? `Next speech: ${nextMessageSpec.label}.` : undefined,
    kind === 'audience_question' && audienceQuestionCue.responderName ? `Answerer: ${audienceQuestionCue.responderName}.` : undefined,
    kind === 'audience_question' ? `Target side: ${audienceQuestionCue.sideLabel}.` : undefined,
    kind === 'audience_question' && audienceQuestionCue.question ? `Submitted question to read aloud exactly: ${audienceQuestionCue.question}` : undefined,
    votingLabel ? `Voting cue: ${votingLabel}.` : undefined,
    winnerName ? `Winner: ${winnerName}.` : undefined,
    audienceResult ? `Audience result: ${audienceResult.winningSideLabel}; ${audienceResult.summary}` : undefined,
    recentLines && recentLines.length > 0 ? `Recent MC lines to avoid repeating:\n${recentLines.map((line, index) => `${index + 1}. ${line}`).join('\n')}` : undefined,
    `Fallback draft to improve: ${template}`,
  ].filter(Boolean).join('\n');
}

export async function createDebateInterstitialMessage(input: CreateDebateInterstitialInput): Promise<Message | null> {
  const podcast = input.session.voiceConfig?.podcast;
  if (!podcast?.enabled) return null;

  const now = input.now || Date.now;
  const template = buildDebateInterstitialTemplate(input);
  const mcWebSearchEnabled = mcModelSupportsWebSearch(input.session);
  let content = template;
  let usedTemplateFallback = true;
  let fallbackReason: McFallbackReason | undefined;
  let fallbackDetail: string | undefined;
  let generatedByModel: string | undefined;
  let citations: Citation[] | undefined;
  let adapter: McAdapter | undefined;
  let snapshot: McAdapterConfigSnapshot | undefined;
  let webSearchApplied = false;
  const mcParameters = getMcParameters(input.session);

  try {
    const webSearchConfig = await configureMcWebSearch(input.aiService, input.session, mcWebSearchEnabled, mcParameters);
    adapter = webSearchConfig.adapter;
    snapshot = webSearchConfig.snapshot;
    webSearchApplied = mcWebSearchEnabled && Boolean(adapter?.config);

    const result = await sendMcPromptWithRetry(input, adapter, mcParameters);
    const generated = validateGeneratedScript(result.response);
    if (!generated.ok) {
      fallbackReason = generated.reason;
    } else if (
      input.kind === 'audience_question' &&
      !generatedCopyIncludesAudienceQuestion(generated.script, input.session, input.nextMessageSpec)
    ) {
      fallbackReason = 'missing_audience_question';
    } else if (generatedCopyPrematurelyJudgesSide(generated.script, input)) {
      fallbackReason = 'premature_judgment';
    } else {
      content = generated.script;
      usedTemplateFallback = false;
      generatedByModel = result.modelUsed || podcast.mc.model;
      citations = mcWebSearchEnabled && result.metadata?.citations?.length
        ? result.metadata.citations
        : undefined;
    }
  } catch (error) {
    fallbackReason = 'provider_error';
    fallbackDetail = sanitizeFallbackDetail(error);
    if (process.env.NODE_ENV === 'development') {
      console.warn('[DebateInterstitialService] Falling back to local MC template', {
        kind: input.kind,
        provider: podcast.mc.provider,
        model: getResolvedMcModel(input.session),
        reason: fallbackReason,
        detail: fallbackDetail,
      });
    }
    usedTemplateFallback = true;
  } finally {
    restoreMcWebSearch(adapter, snapshot);
  }

  return {
    id: `msg_${now()}_mc_${input.kind}`,
    sender: MC_SENDER,
    senderType: 'user',
    content,
    timestamp: now(),
    metadata: {
      debateInterstitial: {
        kind: input.kind,
        flowStep: flowStepForKind(input.kind),
        label: labelForKind(input.kind),
        generatedByProvider: podcast.mc.provider,
        generatedByModel,
        usedTemplateFallback,
        fallbackReason,
        fallbackDetail,
      },
      ...(webSearchApplied && !usedTemplateFallback ? { webSearchEnabled: true } : {}),
      ...(citations ? { citations } : {}),
    },
  };
}
