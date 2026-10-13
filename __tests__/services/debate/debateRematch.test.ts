import { buildRematchNavigationParams, buildRematchSetupFromSavedDebate, type DebateRematchSetup } from '@/services/debate/debateRematch';
import { createMockAIConfig, createMockChatSession } from '@test-utils/fixtures';
import type { DebateVoiceConfig } from '@/types';

const debaters = [
  createMockAIConfig({ id: 'claude-debater-slot-1-0', provider: 'claude', name: 'Claude', model: 'claude-sonnet', personality: 'george' }),
  createMockAIConfig({ id: 'openai-debater-slot-2-1', provider: 'openai', name: 'ChatGPT', model: 'gpt-5', personality: 'prof_sage' }),
];

const voiceConfig: DebateVoiceConfig = {
  enabled: true,
  providerId: 'elevenlabs',
  ttsModelId: 'eleven_flash_v2_5',
  debaterVoices: {
    'claude-debater-slot-1-0': { voiceId: 'voice-a', voiceName: 'Voice A' },
    'openai-debater-slot-2-1': { voiceId: 'voice-b', voiceName: 'Voice B' },
  },
  podcast: {
    enabled: true,
    scriptMode: 'byok_ai',
    outputMode: 'playlist',
    mc: { id: 'google-debater-slot-3-2', provider: 'google', name: 'Gemini', model: 'gemini-flash' },
    mcVoice: { voiceId: 'voice-host', voiceName: 'Host' },
  },
};

describe('buildRematchSetupFromSavedDebate', () => {
  it('restores the debaters, motion, format, length and voices of a saved debate', () => {
    const saved = createMockChatSession({
      id: 'debate_1',
      sessionType: 'debate',
      topic: 'Cities should ban cars',
      selectedAIs: debaters,
      debateConfig: {
        formatId: 'lincoln_douglas',
        presetId: 'standard',
        rounds: 2,
        voiceConfig,
      },
    });

    expect(buildRematchSetupFromSavedDebate(saved)).toEqual({
      selectedAIs: debaters,
      topic: 'Cities should ban cars',
      formatId: 'lincoln_douglas',
      // The saved `rounds` is the vote count; the setup length comes from the preset.
      exchanges: 5,
      voiceConfig,
    });
  });

  it('falls back to the default format and length for older saves', () => {
    const saved = createMockChatSession({ sessionType: 'debate', topic: 'Tea beats coffee', selectedAIs: debaters });

    expect(buildRematchSetupFromSavedDebate(saved)).toEqual(expect.objectContaining({
      formatId: 'oxford',
      exchanges: 3,
      voiceConfig: undefined,
    }));
  });

  it('has nothing to restage without a motion', () => {
    expect(buildRematchSetupFromSavedDebate(createMockChatSession({ sessionType: 'debate', selectedAIs: debaters }))).toBeNull();
  });
});

describe('buildRematchNavigationParams', () => {
  it('targets the Debate tab itself, which is the setup screen', () => {
    const rematch: DebateRematchSetup = {
      selectedAIs: debaters,
      topic: 'Cities should ban cars',
      formatId: 'oxford',
      exchanges: 3,
    };

    expect(buildRematchNavigationParams(rematch)).toEqual({
      screen: 'DebateTab',
      params: { rematch, rematchKey: expect.any(String) },
    });
  });
});
