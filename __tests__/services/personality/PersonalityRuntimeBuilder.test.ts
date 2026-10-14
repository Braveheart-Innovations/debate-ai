import { getPersonality, UNIVERSAL_PERSONALITIES } from '@/config/personalities';
import {
  buildPersonalityRuntime,
  mergeRuntimeModelParameters,
} from '@/services/personality/PersonalityRuntimeBuilder';
import type { AI } from '@/types';
import { requireDefined } from '@test-utils/queries';

const ai: AI = {
  id: 'claude',
  provider: 'claude',
  name: 'Claude',
  model: 'claude-sonnet-4-6',
};

describe('PersonalityRuntimeBuilder', () => {
  // Recorded before the debate persona block was rebuilt from debate-only data: chat and compare
  // must reach every provider byte for byte as they did.
  it.each(['chat', 'compare'] as const)('keeps every persona\'s %s runtime unchanged', (mode) => {
    const runtimes = UNIVERSAL_PERSONALITIES.map(personality => {
      const runtime = buildPersonalityRuntime({ mode, personality, ai });
      return {
        id: personality.id,
        systemPrompt: runtime.systemPrompt,
        personalityConfig: runtime.personalityConfig,
        modelParameters: runtime.modelParameters,
      };
    });

    expect(runtimes).toMatchSnapshot();
  });

  it('builds a distinct PG-13 George chat runtime', () => {
    const runtime = buildPersonalityRuntime({
      mode: 'chat',
      personality: getPersonality('george'),
      ai,
    });

    expect(runtime.personalityConfig).toEqual(expect.objectContaining({
      id: 'george',
      traits: expect.objectContaining({ humor: 0.95 }),
    }));
    expect(runtime.systemPrompt).toContain('PG-13 observational satirist');
    expect(runtime.systemPrompt).toContain('Mild profanity is allowed sparingly');
    expect(runtime.systemPrompt).toContain('sarcastic');
    expect(runtime.systemPrompt).toContain('damn load-bearing wall');
    expect(runtime.systemPrompt).not.toContain('avoid profanity by default');
    expect(runtime.systemPrompt).not.toContain('PG-rated');
    expect(runtime.modelParameters).toEqual(expect.objectContaining({ temperature: 0.9 }));
  });

  it('uses compare-specific George guidance', () => {
    const runtime = buildPersonalityRuntime({
      mode: 'compare',
      personality: getPersonality('george'),
      ai,
    });

    expect(runtime.systemPrompt).toContain('Compare mode contract');
    expect(runtime.systemPrompt).toContain('hidden incentives');
    expect(runtime.systemPrompt).toContain('sarcastic');
  });

  it('builds stance-aware debate prompts for George', () => {
    const runtime = buildPersonalityRuntime({
      mode: 'debate',
      personality: getPersonality('george'),
      ai,
      debate: {
        topic: 'AI regulation should be stricter.',
        formatName: 'Oxford',
        totalRounds: 3,
        stance: 'pro',
        opponentName: 'GPT-4',
      },
    });

    expect(runtime.personalityConfig?.systemPrompt).toContain('[DEBATE MODE]');
    expect(runtime.personalityConfig?.systemPrompt).toContain('Affirmative (FOR)');
    expect(runtime.personalityConfig?.systemPrompt).toContain('Contradiction first');
    expect(runtime.personalityConfig?.systemPrompt).toContain('Mild profanity is allowed sparingly');
    // The persona sets the tone; no intensity directive overrides it.
    expect(runtime.personalityConfig?.systemPrompt).not.toContain('Debate intensity');
    expect(runtime.personalityConfig?.systemPrompt).not.toContain('theatrical aggression');
    // Length comes from each turn's word target, not a competing "compact" instruction.
    expect(runtime.personalityConfig?.systemPrompt).toContain('Follow the turn-specific length guidance.');
    expect(runtime.personalityConfig?.systemPrompt).not.toContain('compact');
    expect(runtime.personalityConfig?.systemPrompt).not.toContain('PG humor');
  });

  describe('debate persona block', () => {
    const debateOptions = {
      topic: 'Cities should ban private cars.',
      formatId: 'oxford' as const,
      formatName: 'Oxford',
      totalRounds: 2,
      stance: 'pro' as const,
      opponentName: 'Gemini',
    };
    const personas = UNIVERSAL_PERSONALITIES.filter(persona => persona.id !== 'default');
    const debatePromptFor = (id: string, opponentId = 'default'): string => buildPersonalityRuntime({
      mode: 'debate',
      personality: getPersonality(id),
      ai,
      debate: { ...debateOptions, opponentPersonality: getPersonality(opponentId) },
    }).systemPrompt ?? '';

    it.each(personas.map(persona => [persona.id, persona] as const))('builds %s from debate text only', (id, persona) => {
      const prompt = debatePromptFor(id);
      const debateText = [persona.debatePrompt, persona.debateGuidance, ...(persona.debateMoves ?? []), persona.sampleOpeners?.debate];
      const chatText = [
        persona.systemPrompt,
        persona.chatGuidance,
        persona.compareGuidance,
        ...persona.signatureMoves,
        ...(persona.watchouts ?? []),
        persona.sampleOpeners?.chat,
        persona.sampleOpeners?.compare,
      ];

      expect(persona.debateGuidance).toBeTruthy();
      expect(persona.debateMoves).toHaveLength(3);
      for (const text of debateText) expect(prompt).toContain(text);
      for (const text of chatText) if (text) expect(prompt).not.toContain(text);
      expect(prompt).not.toContain('Needs reminders');
    });

    it('has openings anticipate the strongest objection rather than rebut a speech not yet given', () => {
      expect(debatePromptFor('devlin')).toContain('anticipate the strongest objection');
      expect(debatePromptFor('george')).toContain('anticipate the strongest objection');
      expect(debatePromptFor('devlin')).not.toContain('Lead with the opponent');
    });

    it('writes Kai and Prof. Sage as spoken prose, not tables or numbered points', () => {
      expect(debatePromptFor('kai')).not.toContain('decision tables');
      expect(debatePromptFor('kai')).toContain('never a table');
      expect(debatePromptFor('prof_sage')).not.toContain('Lists numbered points');
      expect(debatePromptFor('prof_sage')).not.toContain('1-3 structured points');
    });

    it('describes the opponent by name and persona tagline only', () => {
      const kai = requireDefined(getPersonality('kai'), 'kai');
      const prompt = debatePromptFor('george', 'kai');

      expect(prompt).toContain(`Opponent: Gemini, debating as Kai (${kai.tagline}). Do not imitate their style.`);
      expect(prompt).not.toContain(kai.systemPrompt);
      expect(prompt).not.toContain(requireDefined(kai.debatePrompt, 'kai debatePrompt'));
      for (const move of kai.debateMoves ?? []) expect(prompt).not.toContain(move);
      expect(debatePromptFor('george')).toContain('Opponent: Gemini.');
    });

    it('leaves persona temperatures to chat and compare', () => {
      const debate = buildPersonalityRuntime({ mode: 'debate', personality: getPersonality('george'), ai, debate: debateOptions });
      const chat = buildPersonalityRuntime({ mode: 'chat', personality: getPersonality('george'), ai });

      expect(debate.modelParameters).toBeUndefined();
      expect(chat.modelParameters).toEqual({ temperature: 0.9 });
    });

    it('gives a Default debater no style line beyond the format rules', () => {
      const runtime = buildPersonalityRuntime({ mode: 'debate', personality: getPersonality('default'), ai, debate: debateOptions });

      expect(runtime.systemPrompt).not.toContain('Style directive');
      expect(runtime.systemPrompt).toContain('Follow the turn-specific length guidance.');
      expect(runtime.personalityConfig?.tone).toEqual({ formality: 0.5, humor: 0.5, energy: 0.5, empathy: 0.5, technicality: 0.5 });
      expect(runtime.personalityConfig?.debateProfile).toBeUndefined();
      expect(runtime.modelParameters).toBeUndefined();
    });
  });

  it('clears non-debate default runtime but still builds a default debate role', () => {
    const chatRuntime = buildPersonalityRuntime({
      mode: 'chat',
      personality: getPersonality('default'),
      ai,
    });
    expect(chatRuntime.personalityConfig).toBeUndefined();

    const debateRuntime = buildPersonalityRuntime({
      mode: 'debate',
      personality: getPersonality('default'),
      ai,
      debate: {
        topic: 'Remote work should be standard.',
        formatName: 'Oxford',
        totalRounds: 3,
        stance: 'con',
      },
    });
    expect(debateRuntime.personalityConfig).toEqual(expect.objectContaining({
      id: 'debate_default',
      systemPrompt: expect.stringContaining('Negative (AGAINST)'),
    }));
  });

  it('builds Oxford team-aware debate prompts', () => {
    const runtime = buildPersonalityRuntime({
      mode: 'debate',
      personality: getPersonality('default'),
      ai,
      debate: {
        topic: 'Privacy is dead in the digital age.',
        formatId: 'oxford',
        formatName: 'Oxford',
        presetLabel: '2v2',
        totalRounds: 2,
        totalMessages: 6,
        stance: 'pro',
        sideLabel: 'Affirmative',
        roleLabel: 'Second Affirmative speaker',
        currentSpeechLabel: 'Second Affirmative Speech',
        teamMode: 'team',
        teamSize: 2,
        teammateNames: ['ChatGPT'],
        opposingTeamNames: ['Gemini', 'Grok'],
        audienceVoteModel: true,
        initialVoteRequired: true,
        finalVoteRequired: true,
      },
    });

    expect(runtime.personalityConfig?.systemPrompt).toContain('Oxford (2v2)');
    expect(runtime.personalityConfig?.systemPrompt).toContain('6 speeches');
    expect(runtime.personalityConfig?.systemPrompt).toContain('Affirmative (FOR)');
    expect(runtime.personalityConfig?.systemPrompt).toContain('Your team role: Second Affirmative speaker');
    expect(runtime.personalityConfig?.systemPrompt).toContain('Teammate on Affirmative (FOR): ChatGPT');
    expect(runtime.personalityConfig?.systemPrompt).toContain('Opposing team: Gemini, Grok');
    expect(runtime.personalityConfig?.systemPrompt).toContain('opening stance before the speeches');
    expect(runtime.personalityConfig?.systemPrompt).toContain('final vote after the closing speeches');
  });

  it('lets expert parameters override personality model parameters', () => {
    expect(mergeRuntimeModelParameters(
      true,
      { temperature: 0.2, maxTokens: 1000 },
      { temperature: 0.9 }
    )).toEqual({ temperature: 0.2, maxTokens: 1000 });

    expect(mergeRuntimeModelParameters(
      false,
      { temperature: 0.2, maxTokens: 1000 },
      { temperature: 0.9 }
    )).toEqual({ temperature: 0.9 });
  });
});
