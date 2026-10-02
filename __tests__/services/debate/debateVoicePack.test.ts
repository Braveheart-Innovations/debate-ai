import * as FileSystem from 'expo-file-system/legacy';
import {
  buildDebatePodcastCompilePlan,
  createDebatePodcastGalleryEntry,
  createDebateVoicePackGalleryEntry,
  DEBATE_VOICE_PACK_PAUSE_MS,
  getDebateVoicePackCandidates,
} from '@/services/debate/debateVoicePack';
import type { AI, Message } from '@/types';
import { createMockDebateSpeech } from '@test-utils/fixtures';

type CopyAsync = typeof FileSystem.copyAsync;

const createDebateMessage = (overrides: Partial<Message>): Message => ({
  id: 'msg_1_openai',
  sender: 'ChatGPT (Default)',
  senderType: 'ai',
  content: 'Opening statement for the affirmative side.',
  timestamp: 1000,
  metadata: {
    providerId: 'openai',
    debateSpeech: createMockDebateSpeech({ speaker: 'aff', label: 'Opening statement' }),
  },
  ...overrides,
});

describe('debateVoicePack', () => {
  const participants: AI[] = [
    { id: 'openai', provider: 'openai', name: 'ChatGPT', model: 'gpt-5' },
    { id: 'google', provider: 'google', name: 'Gemini', model: 'gemini-3.5-flash' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(FileSystem.getInfoAsync).mockImplementation(async (uri) => ({ exists: false, uri, isDirectory: false }));
  });

  it('collects ready and unavailable debate voice pack candidates', () => {
    const readyMessage = createDebateMessage({
      id: 'ready',
      attachments: [{ type: 'audio', uri: 'file:///ready.mp3', mimeType: 'audio/mpeg' }],
      metadata: {
        providerId: 'openai',
        debateSpeech: createMockDebateSpeech({ speaker: 'aff', label: 'Opening statement' }),
        debateAudio: {
          status: 'ready',
          voiceId: 'voice_1',
          voiceName: 'Aria',
          uri: 'file:///ready.mp3',
          mimeType: 'audio/mpeg',
        },
      },
    });
    const failedMessage = createDebateMessage({
      id: 'failed',
      sender: 'Gemini (Default)',
      metadata: {
        providerId: 'google',
        debateSpeech: createMockDebateSpeech({ speaker: 'neg', label: 'Opening response' }),
        debateAudio: {
          status: 'failed',
          voiceId: 'voice_2',
          voiceName: 'Roger',
          error: 'Too long',
        },
      },
    });
    const ignoredUserMessage = createDebateMessage({
      id: 'user',
      sender: 'You',
      senderType: 'user',
      metadata: undefined,
    });

    const candidates = getDebateVoicePackCandidates([readyMessage, failedMessage, ignoredUserMessage]);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      id: 'ready',
      status: 'ready',
      speakerId: 'openai',
      speakerName: 'ChatGPT',
      speechLabel: 'Opening statement',
      uri: 'file:///ready.mp3',
      mimeType: 'audio/mpeg',
    });
    expect(candidates[1]).toMatchObject({
      id: 'failed',
      status: 'failed',
      role: 'debater',
      speakerId: 'google',
      speakerName: 'Gemini',
      error: 'Too long',
    });
  });

  it('collects podcast MC interstitial candidates separately from debaters', () => {
    const mcMessage: Message = {
      id: 'mc-intro',
      sender: 'Debate MC',
      senderType: 'user',
      content: 'Welcome to the debate.',
      timestamp: 900,
      attachments: [{ type: 'audio', uri: 'file:///debate/mc.mp3', mimeType: 'audio/mpeg' }],
      metadata: {
        debateInterstitial: {
          kind: 'intro',
          flowStep: 'podcast_intro',
          label: 'MC Introduction',
          usedTemplateFallback: false,
        },
        debateAudio: {
          status: 'ready',
          voiceId: 'voice-host',
          voiceName: 'Host',
          uri: 'file:///debate/mc.mp3',
          mimeType: 'audio/mpeg',
        },
      },
    };

    const candidates = getDebateVoicePackCandidates([mcMessage, createDebateMessage({ id: 'debater' })]);

    expect(candidates[0]).toMatchObject({
      id: 'mc-intro',
      role: 'mc',
      speakerId: 'podcast-mc',
      speakerName: 'Debate MC',
      speechLabel: 'MC Introduction',
      status: 'ready',
    });
    expect(candidates[1]).toMatchObject({
      id: 'debater',
      role: 'debater',
    });
  });

  it('copies selected ready clips into a gallery-owned voice pack entry', async () => {
    const readyMessages = [
      createDebateMessage({
        id: 'msg_1_openai',
        attachments: [{ type: 'audio', uri: 'file:///debate/msg_1.mp3', mimeType: 'audio/mpeg' }],
        metadata: {
          providerId: 'openai',
          debateSpeech: createMockDebateSpeech({ speaker: 'aff', label: 'Opening statement' }),
          debateAudio: {
            status: 'ready',
            voiceId: 'voice_1',
            voiceName: 'Aria',
            uri: 'file:///debate/msg_1.mp3',
            mimeType: 'audio/mpeg',
          },
        },
      }),
      createDebateMessage({
        id: 'msg_2_google',
        sender: 'Gemini (Default)',
        content: 'Opening response for the negative side.',
        attachments: [{ type: 'audio', uri: 'file:///debate/msg_2.mp3', mimeType: 'audio/mpeg' }],
        metadata: {
          providerId: 'google',
          debateSpeech: createMockDebateSpeech({ speaker: 'neg', label: 'Opening response' }),
          debateAudio: {
            status: 'ready',
            voiceId: 'voice_2',
            voiceName: 'Roger',
            uri: 'file:///debate/msg_2.mp3',
            mimeType: 'audio/mpeg',
          },
        },
      }),
    ];
    const candidates = getDebateVoicePackCandidates(readyMessages);
    const copyAsync = jest.fn<ReturnType<CopyAsync>, Parameters<CopyAsync>>().mockResolvedValue(undefined);

    const entry = await createDebateVoicePackGalleryEntry({
      sessionId: 'debate_1',
      topic: 'Resolved: storage matters.',
      participants,
      candidates,
      selectedCandidateIds: ['msg_2_google', 'msg_1_openai'],
    }, {
      now: () => 123456,
      copyAsync,
    });

    expect(entry).toMatchObject({
      id: 'debate_voice_pack_debate_1_123456',
      mediaType: 'audio',
      providerId: 'elevenlabs',
      modelId: 'debate_voice_pack',
      operation: 'debate_voice_pack',
      prompt: 'Voice pack: Resolved: storage matters.',
      status: 'succeeded',
    });
    expect(entry.voicePack?.clips.map((clip) => clip.messageId)).toEqual([
      'msg_1_openai',
      'msg_2_google',
    ]);
    expect(entry.voicePack?.clips.every((clip) => clip.pauseAfterMs === DEBATE_VOICE_PACK_PAUSE_MS)).toBe(true);
    expect(copyAsync).toHaveBeenNthCalledWith(1, {
      from: 'file:///debate/msg_1.mp3',
      to: '/tmp/gallery-voice-packs/debate_voice_pack_debate_1_123456/001_msg_1_openai.mp3',
    });
    expect(copyAsync).toHaveBeenNthCalledWith(2, {
      from: 'file:///debate/msg_2.mp3',
      to: '/tmp/gallery-voice-packs/debate_voice_pack_debate_1_123456/002_msg_2_google.mp3',
    });
    expect(entry.uri).toBe(entry.voicePack?.clips[0].uri);
  });

  it('creates a podcast playlist manifest when MC clips are included', async () => {
    const mcMessage: Message = {
      id: 'mc-winner',
      sender: 'Debate MC',
      senderType: 'user',
      content: 'The decision is in.',
      timestamp: 3000,
      attachments: [{ type: 'audio', uri: 'file:///debate/mc-winner.mp3', mimeType: 'audio/mpeg' }],
      metadata: {
        debateInterstitial: {
          kind: 'winner',
          flowStep: 'podcast_winner',
          label: 'MC Winner Announcement',
          usedTemplateFallback: true,
        },
        debateAudio: {
          status: 'ready',
          voiceId: 'voice-host',
          voiceName: 'Host',
          uri: 'file:///debate/mc-winner.mp3',
          mimeType: 'audio/mpeg',
        },
      },
    };
    const debaterMessage = createDebateMessage({
      id: 'msg_1_openai',
      attachments: [{ type: 'audio', uri: 'file:///debate/msg_1.mp3', mimeType: 'audio/mpeg' }],
      metadata: {
        providerId: 'openai',
        debateSpeech: createMockDebateSpeech({ speaker: 'aff', label: 'Opening statement' }),
        debateAudio: {
          status: 'ready',
          voiceId: 'voice_1',
          voiceName: 'Aria',
          uri: 'file:///debate/msg_1.mp3',
          mimeType: 'audio/mpeg',
        },
      },
    });
    const candidates = getDebateVoicePackCandidates([mcMessage, debaterMessage]);
    const copyAsync = jest.fn<ReturnType<CopyAsync>, Parameters<CopyAsync>>().mockResolvedValue(undefined);

    const entry = await createDebateVoicePackGalleryEntry({
      sessionId: 'debate_1',
      topic: 'Resolved: podcasts matter.',
      participants,
      candidates,
      selectedCandidateIds: ['mc-winner', 'msg_1_openai'],
      playlistKind: 'debate_podcast_playlist',
    }, {
      now: () => 789,
      copyAsync,
    });

    expect(entry).toMatchObject({
      id: 'debate_podcast_debate_1_789',
      modelId: 'debate_podcast_playlist',
      operation: 'debate_podcast_playlist',
      prompt: 'Podcast playlist: Resolved: podcasts matter.',
      voicePack: {
        kind: 'debate_podcast_playlist',
      },
    });
    expect(entry.voicePack?.clips.map((clip) => clip.role)).toEqual(['mc', 'debater']);
  });

  it('builds a transient podcast compile plan from selected ready clips', () => {
    const messages = [
      createDebateMessage({
        id: 'msg_1_openai',
        attachments: [{ type: 'audio', uri: 'file:///debate/msg_1.mp3', mimeType: 'audio/mpeg' }],
        metadata: {
          providerId: 'openai',
          debateSpeech: createMockDebateSpeech({ speaker: 'aff', label: 'Opening statement' }),
          debateAudio: {
            status: 'ready',
            voiceId: 'voice_1',
            voiceName: 'Aria',
            uri: 'file:///debate/msg_1.mp3',
            mimeType: 'audio/mpeg',
          },
        },
      }),
      createDebateMessage({
        id: 'msg_2_google',
        sender: 'Gemini (Default)',
        content: 'Opening response for the negative side.',
        attachments: [{ type: 'audio', uri: 'file:///debate/msg_2.mp3', mimeType: 'audio/mpeg' }],
        metadata: {
          providerId: 'google',
          debateSpeech: createMockDebateSpeech({ speaker: 'neg', label: 'Opening response' }),
          debateAudio: {
            status: 'ready',
            voiceId: 'voice_2',
            voiceName: 'Roger',
            uri: 'file:///debate/msg_2.mp3',
            mimeType: 'audio/mpeg',
          },
        },
      }),
    ];
    const candidates = getDebateVoicePackCandidates(messages);

    const plan = buildDebatePodcastCompilePlan({
      sessionId: 'debate_1',
      topic: 'Resolved: podcasts matter.',
      participants,
      candidates,
      selectedCandidateIds: ['msg_2_google', 'msg_1_openai'],
    }, {
      now: () => 456,
    });

    expect(plan.id).toBe('debate_podcast_debate_1_456');
    expect(plan.manifest).toMatchObject({
      kind: 'debate_podcast_playlist',
      sessionId: 'debate_1',
      topic: 'Resolved: podcasts matter.',
      directoryUri: '/tmp/gallery-podcasts/debate_podcast_debate_1_456/',
    });
    expect(plan.manifest.clips.map((clip) => clip.uri)).toEqual([
      'file:///debate/msg_1.mp3',
      'file:///debate/msg_2.mp3',
    ]);
    expect(plan.manifest.clips.every((clip) => clip.pauseAfterMs === DEBATE_VOICE_PACK_PAUSE_MS)).toBe(true);
  });

  it('allows podcast compilation when the MC intro exists but is not ready', () => {
    const introMessage: Message = {
      id: 'mc-intro',
      sender: 'Debate MC',
      senderType: 'user',
      content: 'Welcome to the debate.',
      timestamp: 100,
      metadata: {
        debateInterstitial: {
          kind: 'intro',
          flowStep: 'podcast_intro',
          label: 'MC Introduction',
        },
        debateAudio: {
          status: 'generating',
          voiceId: 'voice-host',
          voiceName: 'Host',
        },
      },
    };
    const debaterMessage = createDebateMessage({
      id: 'msg_1_openai',
      attachments: [{ type: 'audio', uri: 'file:///debate/msg_1.mp3', mimeType: 'audio/mpeg' }],
      metadata: {
        providerId: 'openai',
        debateSpeech: createMockDebateSpeech({ speaker: 'aff', label: 'Opening statement' }),
        debateAudio: {
          status: 'ready',
          voiceId: 'voice_1',
          voiceName: 'Aria',
          uri: 'file:///debate/msg_1.mp3',
          mimeType: 'audio/mpeg',
        },
      },
    });
    const candidates = getDebateVoicePackCandidates([introMessage, debaterMessage]);

    const plan = buildDebatePodcastCompilePlan({
      sessionId: 'debate_1',
      topic: 'Resolved: podcasts matter.',
      participants,
      candidates,
      selectedCandidateIds: ['msg_1_openai'],
    }, {
      now: () => 123,
    });

    expect(plan.manifest.clips.map((clip) => clip.messageId)).toEqual(['msg_1_openai']);
  });

  it('creates a final podcast Gallery entry without retaining a voice pack manifest', () => {
    const plan = buildDebatePodcastCompilePlan({
      sessionId: 'debate_1',
      topic: 'Resolved: podcasts matter.',
      participants,
      candidates: getDebateVoicePackCandidates([
        createDebateMessage({
          id: 'msg_1_openai',
          attachments: [{ type: 'audio', uri: 'file:///debate/msg_1.mp3', mimeType: 'audio/mpeg' }],
          metadata: {
            providerId: 'openai',
            debateSpeech: createMockDebateSpeech({ speaker: 'aff', label: 'Opening statement' }),
            debateAudio: {
              status: 'ready',
              voiceId: 'voice_1',
              voiceName: 'Aria',
              uri: 'file:///debate/msg_1.mp3',
              mimeType: 'audio/mpeg',
            },
          },
        }),
      ]),
      selectedCandidateIds: ['msg_1_openai'],
    }, {
      now: () => 456,
    });

    const entry = createDebatePodcastGalleryEntry(plan, {
      id: 'compile-job-1',
      uri: 'file:///podcasts/compiled.mp3',
      mimeType: 'audio/mpeg',
      fileName: 'compiled.mp3',
      createdAt: 789,
      remoteUrl: 'https://signed.example/output.mp3',
      storagePath: 'debate-audio-compile/user/job/output/debate-podcast.mp3',
      expiresAt: 999,
    });

    expect(entry).toMatchObject({
      id: 'debate_podcast_debate_1_456',
      mediaType: 'audio',
      providerId: 'elevenlabs',
      modelId: 'debate_podcast',
      operation: 'debate_podcast_playlist',
      prompt: 'Debate podcast: Resolved: podcasts matter.',
      uri: 'file:///podcasts/compiled.mp3',
      mimeType: 'audio/mpeg',
      status: 'succeeded',
      createdAt: 789,
      expiresAt: 999,
    });
    expect(entry.voicePack).toBeUndefined();
  });
});
