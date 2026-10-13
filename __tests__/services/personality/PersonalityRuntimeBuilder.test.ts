import { getPersonality } from '@/config/personalities';
import {
  buildPersonalityRuntime,
  mergeRuntimeModelParameters,
} from '@/services/personality/PersonalityRuntimeBuilder';
import type { AI } from '@/types';

const ai: AI = {
  id: 'claude',
  provider: 'claude',
  name: 'Claude',
  model: 'claude-sonnet-4-6',
};

describe('PersonalityRuntimeBuilder', () => {
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
    expect(runtime.personalityConfig?.systemPrompt).toContain('Keep each scheduled speech compact');
    expect(runtime.personalityConfig?.systemPrompt).not.toContain('PG humor');
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
