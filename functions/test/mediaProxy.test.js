const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  buildElevenLabsVoiceSearchUrl,
  buildRunwayVideoTaskRequest,
  isDebateVoice,
  mapElevenLabsModelOption,
  mapElevenLabsVoiceOption,
  mapRunwayStatus,
} = require('../lib/mediaProxy');

describe('buildRunwayVideoTaskRequest', () => {
  it('uses the text-to-video endpoint without promptImage for text-only Runway generations', () => {
    const request = buildRunwayVideoTaskRequest(
      {
        providerId: 'runway',
        mediaType: 'video',
        operation: 'text_to_video',
        modelId: 'gen4.5',
        prompt: 'unused',
        durationSeconds: 5,
        aspectRatio: '1280:720',
      },
      'A quiet mountain lake at sunrise'
    );

    assert.equal(request.endpoint, 'text_to_video');
    assert.deepEqual(request.body, {
      model: 'gen4.5',
      promptText: 'A quiet mountain lake at sunrise',
      ratio: '1280:720',
      duration: 5,
    });
    assert.equal(Object.hasOwn(request.body, 'promptImage'), false);
  });

  it('uses the image-to-video endpoint with promptImage when a source image is provided', () => {
    const request = buildRunwayVideoTaskRequest(
      {
        providerId: 'runway',
        mediaType: 'video',
        operation: 'image_to_video',
        modelId: 'gen4.5',
        prompt: 'unused',
        sourceImage: 'data:image/png;base64,abc123',
        durationSeconds: 5,
        aspectRatio: '720:1280',
      },
      'Slow camera push in'
    );

    assert.equal(request.endpoint, 'image_to_video');
    assert.deepEqual(request.body, {
      model: 'gen4.5',
      promptText: 'Slow camera push in',
      ratio: '720:1280',
      duration: 5,
      promptImage: 'data:image/png;base64,abc123',
    });
  });
});

describe('mapRunwayStatus', () => {
  it('maps current Runway terminal statuses', () => {
    assert.equal(mapRunwayStatus('SUCCEEDED'), 'succeeded');
    assert.equal(mapRunwayStatus('FAILED'), 'failed');
    assert.equal(mapRunwayStatus('CANCELED'), 'canceled');
    assert.equal(mapRunwayStatus('CANCELLED'), 'canceled');
  });

  it('keeps throttled and pending tasks in the queued phase', () => {
    assert.equal(mapRunwayStatus('PENDING'), 'queued');
    assert.equal(mapRunwayStatus('THROTTLED'), 'queued');
    assert.equal(mapRunwayStatus('QUEUED'), 'queued');
  });

  it('maps active processing states to running', () => {
    assert.equal(mapRunwayStatus('RUNNING'), 'running');
    assert.equal(mapRunwayStatus('PROCESSING'), 'running');
  });
});

describe('buildElevenLabsVoiceSearchUrl', () => {
  it('uses the maximum documented voice page size and API filter names', () => {
    const url = new URL(buildElevenLabsVoiceSearchUrl({
      pageSize: 500,
      includeTotalCount: true,
      sort: 'name',
      sortDirection: 'asc',
      search: 'warm narrator',
      category: 'professional',
      voiceType: 'saved',
      nextPageToken: 'next-token',
      voiceIds: ['voice-a', 'voice-b'],
    }));

    assert.equal(url.origin + url.pathname, 'https://api.elevenlabs.io/v2/voices');
    assert.equal(url.searchParams.get('page_size'), '100');
    assert.equal(url.searchParams.get('include_total_count'), 'true');
    assert.equal(url.searchParams.get('sort'), 'name');
    assert.equal(url.searchParams.get('sort_direction'), 'asc');
    assert.equal(url.searchParams.get('search'), 'warm narrator');
    assert.equal(url.searchParams.get('category'), 'professional');
    assert.equal(url.searchParams.get('voice_type'), 'saved');
    assert.equal(url.searchParams.get('next_page_token'), 'next-token');
    assert.deepEqual(url.searchParams.getAll('voice_ids'), ['voice-a', 'voice-b']);
  });
});

describe('mapElevenLabsVoiceOption', () => {
  it('preserves rich voice metadata from the ElevenLabs voices API', () => {
    const voice = mapElevenLabsVoiceOption({
      voice_id: 'bella',
      name: 'Bella',
      category: 'premade',
      description: 'Professional, bright, warm narration.',
      preview_url: 'https://example.com/bella.mp3',
      labels: { accent: 'American', age: 'young adult', ignored: 12 },
      available_for_tiers: ['creator', 'pro'],
      high_quality_base_model_ids: ['eleven_multilingual_v2'],
      verified_languages: [
        {
          language: 'English',
          model_id: 'eleven_multilingual_v2',
          accent: 'American',
          locale: 'en-US',
          preview_url: 'https://example.com/bella-en.mp3',
        },
      ],
      is_owner: true,
      is_legacy: false,
      is_mixed: true,
      created_at_unix: 1710000000,
      is_bookmarked: true,
      recording_quality: 'professional',
      labelling_status: 'complete',
    });

    const verifiedLanguages = [
      {
        language: 'English',
        modelId: 'eleven_multilingual_v2',
        accent: 'American',
        locale: 'en-US',
        previewUrl: 'https://example.com/bella-en.mp3',
      },
    ];

    // The mapper emits every API field in BOTH camelCase and snake_case so
    // older clients keep working; absent optional fields map to null.
    assert.deepEqual(voice, {
      id: 'bella',
      name: 'Bella',
      voice_id: 'bella',
      category: 'premade',
      description: 'Professional, bright, warm narration.',
      previewUrl: 'https://example.com/bella.mp3',
      labels: { accent: 'American', age: 'young adult' },
      sourceVoiceType: undefined,
      availableForTiers: ['creator', 'pro'],
      available_for_tiers: ['creator', 'pro'],
      highQualityBaseModelIds: ['eleven_multilingual_v2'],
      high_quality_base_model_ids: ['eleven_multilingual_v2'],
      verifiedLanguages,
      verified_languages: verifiedLanguages,
      isOwner: true,
      is_owner: true,
      isLegacy: false,
      is_legacy: false,
      isMixed: true,
      is_mixed: true,
      createdAtUnix: 1710000000,
      created_at_unix: 1710000000,
      isBookmarked: true,
      is_bookmarked: true,
      favoritedAtUnix: null,
      favorited_at_unix: null,
      recordingQuality: 'professional',
      recording_quality: 'professional',
      labellingStatus: 'complete',
      labelling_status: 'complete',
      recordingQualityReason: null,
      recording_quality_reason: null,
      safetyControl: null,
      safety_control: null,
    });
  });

  it('drops incomplete voice entries', () => {
    assert.equal(mapElevenLabsVoiceOption({ name: 'No ID' }), null);
    assert.equal(mapElevenLabsVoiceOption({ voice_id: 'no-name' }), null);
  });
});

describe('mapElevenLabsModelOption', () => {
  it('maps current text-to-speech model capabilities', () => {
    const model = mapElevenLabsModelOption({
      model_id: 'eleven_multilingual_v2',
      name: 'Eleven Multilingual v2',
      description: 'Lifelike speech synthesis.',
      can_be_finetuned: true,
      can_do_text_to_speech: true,
      can_do_voice_conversion: false,
      can_use_style: true,
      can_use_speaker_boost: true,
      serves_pro_voices: true,
      token_cost_factor: 1,
      requires_alpha_access: false,
      max_characters_request_free_user: 2500,
      max_characters_request_subscribed_user: 10000,
      languages: [{ language_id: 'en', name: 'English' }],
      concurrency_group: 'tts',
    });

    assert.deepEqual(model, {
      id: 'eleven_multilingual_v2',
      label: 'Eleven Multilingual v2',
      description: 'Lifelike speech synthesis.',
      mediaType: 'audio',
      operations: ['text_to_speech'],
      maxInputCharacters: 10000,
      canBeFineTuned: true,
      canDoTextToSpeech: true,
      canDoVoiceConversion: false,
      canUseStyle: true,
      canUseSpeakerBoost: true,
      servesProVoices: true,
      tokenCostFactor: 1,
      requiresAlphaAccess: false,
      languages: [{ id: 'en', languageId: 'en', name: 'English' }],
      concurrencyGroup: 'tts',
    });
  });

  it('recognizes the ElevenLabs text-to-sound model as sound effect capable', () => {
    const model = mapElevenLabsModelOption({
      model_id: 'eleven_text_to_sound_v2',
      name: 'Eleven Text to Sound v2',
      description: 'Create sound effects from text.',
      can_do_text_to_speech: false,
      max_characters_request_subscribed_user: 450,
    });

    assert.equal(model.id, 'eleven_text_to_sound_v2');
    assert.deepEqual(model.operations, ['sound_effect']);
  });
});

describe('isDebateVoice', () => {
  it('is speech labeled with its debate', () => {
    assert.equal(isDebateVoice({ sessionType: 'debate', mediaType: 'audio', operation: 'text_to_speech' }), true);
  });

  it('is Create for anything else, whatever the label', () => {
    assert.equal(isDebateVoice({ sessionType: 'debate', mediaType: 'video', operation: 'text_to_video' }), false);
    assert.equal(isDebateVoice({ sessionType: 'debate', mediaType: 'audio', operation: 'sound_effect' }), false);
    assert.equal(isDebateVoice({ sessionType: 'create', mediaType: 'audio', operation: 'text_to_speech' }), false);
    assert.equal(isDebateVoice({ mediaType: 'audio', operation: 'text_to_speech' }), false);
  });
});
