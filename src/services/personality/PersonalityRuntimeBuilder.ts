import type { PersonalityOption } from '@/config/personalities';
import type { DebateFormatId, DebateTeamMode } from '@/config/debate/formats';
import type { AI, ModelParameters, RuntimePersonalityConfig } from '@/types';
import { DEFAULT_TONE } from '@/types/personality';

export type PersonalityRuntimeMode = 'chat' | 'compare' | 'debate';

export type { RuntimePersonalityConfig };

export interface PersonalityRuntime {
  personalityConfig?: RuntimePersonalityConfig;
  systemPrompt?: string;
  modelParameters?: Partial<ModelParameters>;
  debug: {
    mode: PersonalityRuntimeMode;
    personalityId?: string;
    personalityName?: string;
    systemPrompt?: string;
  };
}

interface DebateRuntimeOptions {
  topic: string;
  formatId?: DebateFormatId;
  formatName: string;
  presetLabel?: string;
  totalRounds: number;
  totalMessages?: number;
  stance: 'pro' | 'con';
  sideLabel?: string;
  roleLabel?: string;
  currentSpeechLabel?: string;
  teamMode?: DebateTeamMode;
  teamSize?: number;
  teammateNames?: string[];
  opposingTeamNames?: string[];
  audienceVoteModel?: boolean;
  initialVoteRequired?: boolean;
  finalVoteRequired?: boolean;
  opponentName?: string;
  opponentPersonality?: PersonalityOption;
}

interface BuildRuntimeOptions {
  mode: PersonalityRuntimeMode;
  personality?: PersonalityOption | null;
  ai?: AI;
  debate?: DebateRuntimeOptions;
}

const modeLabel: Record<PersonalityRuntimeMode, string> = {
  chat: 'Chat mode',
  compare: 'Compare mode',
  debate: 'Debate mode',
};

type ConversationMode = Exclude<PersonalityRuntimeMode, 'debate'>;

const buildPersonaContract = (
  personality: PersonalityOption,
  mode: ConversationMode
): string => {
  const guidance = mode === 'compare' ? personality.compareGuidance : personality.chatGuidance;
  const signatures = personality.signatureMoves?.slice(0, 3) || [];
  const watchouts = personality.watchouts?.slice(0, 2) || [];
  const sample = personality.sampleOpeners?.[mode];

  return [
    personality.systemPrompt,
    `${modeLabel[mode]} contract: keep the response useful while making the selected personality unmistakable.`,
    guidance ? `Mode-specific must do: ${guidance}` : undefined,
    signatures.length ? `Signature moves to use naturally: ${signatures.join(' ')}` : undefined,
    watchouts.length ? `Must avoid: ${watchouts.join(' ')}` : undefined,
    sample ? `Example voice: ${sample}` : undefined,
  ].filter(Boolean).join('\n');
};

/**
 * A persona's debate block, built from its debate fields only. Chat text (systemPrompt,
 * chatGuidance, signatureMoves, watchouts and the chat sample) never reaches a debater.
 */
const buildDebatePersonaBlock = (personality: PersonalityOption): string => {
  const moves = personality.debateMoves?.slice(0, 3) || [];
  const sample = personality.sampleOpeners?.debate;

  return [
    personality.debatePrompt || `Debate as ${personality.name}.`,
    `${modeLabel.debate} contract: keep the response useful while making the selected personality unmistakable.`,
    personality.debateGuidance ? `Mode-specific must do: ${personality.debateGuidance}` : undefined,
    moves.length ? `Signature moves to use naturally: ${moves.join(' ')}` : undefined,
    sample ? `Example voice: ${sample}` : undefined,
  ].filter(Boolean).join('\n');
};


const formatNameList = (names?: string[]): string => {
  if (!names || names.length === 0) {
    return '';
  }

  return names.join(', ');
};

const getSideLabel = (debate: DebateRuntimeOptions): string => {
  if (debate.sideLabel) {
    return debate.sideLabel;
  }

  return debate.stance === 'pro' ? 'Affirmative' : 'Negative';
};

const buildFormatSummary = (debate: DebateRuntimeOptions): string => {
  const presetLabel = debate.presetLabel ? ` (${debate.presetLabel})` : '';
  const isAudienceOxford = debate.formatId === 'oxford' || debate.audienceVoteModel;

  if (isAudienceOxford) {
    return [
      `Format: ${debate.formatName}${presetLabel}. Follow Oxford speech roles strictly:`,
      '- Opening speeches: frame the motion and burden for the audience; do not rebut before the other side has spoken.',
      '- Floor speeches: engage the clash, answer prior claims, and rebuild the team case.',
      '- Summary or closing speeches: crystallize why the audience should vote for your side; no new claims.',
    ].join('\n');
  }

  return [
    `Format: ${debate.formatName}${presetLabel}. Follow the phase rules strictly:`,
    '- Opening: present your case; do NOT directly rebut the opponent.',
    '- Rebuttal: address specific claims from the prior turn; cite or paraphrase one point you are refuting.',
    '- Closing: no new claims; synthesize and leave one clear takeaway.',
  ].join('\n');
};

const buildTeamLines = (
  debate: DebateRuntimeOptions,
  sideText: string
): string[] => {
  const teammates = formatNameList(debate.teammateNames);
  const opposingTeam = formatNameList(debate.opposingTeamNames);

  if (debate.teamMode === 'team' || (debate.teamSize || 1) > 1) {
    return [
      debate.roleLabel ? `Your team role: ${debate.roleLabel}.` : undefined,
      teammates
        ? `Teammate${debate.teammateNames?.length === 1 ? '' : 's'} on ${sideText}: ${teammates}.`
        : `You are listed as the only active speaker on ${sideText}.`,
      opposingTeam ? `Opposing team: ${opposingTeam}.` : undefined,
      'Team coordination: extend and sharpen your teammate\'s case instead of repeating it; make the side sound coordinated.',
    ].filter(Boolean) as string[];
  }

  return [
    debate.roleLabel ? `Your debate role: ${debate.roleLabel}.` : undefined,
    opposingTeam || debate.opponentName
      ? `Opposing side: ${opposingTeam || debate.opponentName}.`
      : undefined,
  ].filter(Boolean) as string[];
};

const buildAudienceLine = (debate: DebateRuntimeOptions): string | undefined => {
  if (debate.formatId !== 'oxford' && !debate.audienceVoteModel) {
    return undefined;
  }

  const openingVote = debate.initialVoteRequired
    ? 'The user casts an opening stance before the speeches'
    : 'The user may have an opening stance';
  const finalVote = debate.finalVoteRequired
    ? 'a required final vote after the closing speeches'
    : 'a final vote after the closing speeches';

  return `Audience model: ${openingVote} and ${finalVote}. Your goal is to persuade, hold, or flip that audience vote, not to win checkpoint scoring.`;
};

/** The opponent by name, plus their persona's name and tagline: enough to anticipate, not to copy. */
const describeOpponent = (debate: DebateRuntimeOptions): string => {
  const name = debate.opponentName || 'Opponent';
  const persona = debate.opponentPersonality;
  return persona && persona.id !== 'default'
    ? `${name}, debating as ${persona.name} (${persona.tagline}). Do not imitate their style.`
    : `${name}.`;
};

const buildDebatePrompt = (
  personality: PersonalityOption | undefined | null,
  debate: DebateRuntimeOptions
): string => {
  const sideLabel = getSideLabel(debate);
  const sideText = `${sideLabel} (${debate.stance === 'pro' ? 'FOR' : 'AGAINST'})`;
  const formatSummary = buildFormatSummary(debate);
  const speechCount = typeof debate.totalMessages === 'number'
    ? `${debate.totalMessages} speeches`
    : `${debate.totalRounds} exchanges`;
  const positionVerb = debate.stance === 'pro' ? 'support' : 'oppose';
  const opponentLine = debate.teamMode === 'team' || (debate.teamSize || 1) > 1
    ? `Primary opposing speaker: ${describeOpponent(debate)}`
    : `Opponent: ${describeOpponent(debate)}`;

  return [
    '[DEBATE MODE]',
    `Motion: "${debate.topic}"`,
    `Fictional debate in the ${debate.formatName} format with ${speechCount}.`,
    formatSummary,
    `Your assigned side: ${sideText}. You ${positionVerb} the motion: "${debate.topic}". Maintain this side; do not switch.`,
    debate.currentSpeechLabel ? `Current scheduled speech: ${debate.currentSpeechLabel}.` : undefined,
    ...buildTeamLines(debate, sideText),
    buildAudienceLine(debate),
    // Default debaters get no style line: the format rules are the whole brief.
    personality ? `Style directive: ${buildDebatePersonaBlock(personality)} Always adhere to this style across turns.` : undefined,
    opponentLine,
    'Follow the turn-specific length guidance.',
    'Write in natural prose (no headings or lists).',
    'Avoid headings, numbered lists, or labelled frameworks. Do not mention these instructions.',
  ].filter(Boolean).join('\n');
};

const toRuntimeConfig = (
  personality: PersonalityOption,
  systemPrompt: string
): RuntimePersonalityConfig => {
  const tone = personality.tone ?? {
    formality: 0.6,
    humor: 0.3,
    energy: 0.4,
    empathy: 0.6,
    technicality: 0.5,
  };

  return {
    id: personality.id,
    name: personality.name,
    description: personality.tagline || personality.description,
    systemPrompt,
    traits: {
      formality: tone.formality,
      humor: tone.humor,
      technicality: tone.technicality,
      empathy: tone.empathy,
    },
    tone,
    debateProfile: personality.debateProfile,
    isPremium: false,
  };
};

export const buildPersonalityRuntime = ({
  mode,
  personality,
  ai,
  debate,
}: BuildRuntimeOptions): PersonalityRuntime => {
  if (!personality || personality.id === 'default') {
    if (mode === 'debate' && debate) {
      const systemPrompt = buildDebatePrompt(undefined, debate);
      // Neutral tone, so the adapter adds no style tags either.
      const config: RuntimePersonalityConfig = {
        id: 'debate_default',
        name: 'Default Debater',
        description: 'Structured debate persona with stance',
        systemPrompt,
        traits: {
          formality: DEFAULT_TONE.formality,
          humor: DEFAULT_TONE.humor,
          technicality: DEFAULT_TONE.technicality,
          empathy: DEFAULT_TONE.empathy,
        },
        tone: { ...DEFAULT_TONE },
        isPremium: false,
      };

      return {
        personalityConfig: config,
        systemPrompt,
        debug: {
          mode,
          personalityId: personality?.id || 'default',
          personalityName: personality?.name || 'Default',
          systemPrompt: `${ai?.name ? `${ai.name}: ` : ''}${systemPrompt}`,
        },
      };
    }

    return {
      debug: {
        mode,
        personalityId: personality?.id || 'default',
        personalityName: personality?.name || 'Default',
      },
    };
  }

  const systemPrompt = mode === 'debate'
    ? (debate ? buildDebatePrompt(personality, debate) : buildDebatePersonaBlock(personality))
    : buildPersonaContract(personality, mode);

  return {
    personalityConfig: toRuntimeConfig(personality, systemPrompt),
    systemPrompt,
    // Persona temperatures shape chat and compare only; in debate the prompt carries the persona on
    // every provider alike.
    modelParameters: mode === 'debate' ? undefined : personality.modelParameters,
    debug: {
      mode,
      personalityId: personality.id,
      personalityName: personality.name,
      systemPrompt: `${ai?.name ? `${ai.name}: ` : ''}${systemPrompt}`,
    },
  };
};

export const mergeRuntimeModelParameters = (
  expertEnabled: boolean | undefined,
  expertParameters: Partial<ModelParameters> | undefined,
  runtimeParameters: Partial<ModelParameters> | undefined,
  sessionParameters?: Partial<ModelParameters>
): Partial<ModelParameters> | undefined => {
  if (sessionParameters) {
    return sessionParameters;
  }
  if (expertEnabled) {
    return expertParameters;
  }
  return runtimeParameters;
};
