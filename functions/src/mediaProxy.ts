import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getDecryptedApiKey, encryptionKey } from './apiKeys';
import { checkFreeTierForInteraction, freeLimitError, isPremiumOrTrial } from './usageTracking';

type MediaProviderId = 'runway' | 'elevenlabs';
type CreateMediaType = 'video' | 'audio';
type CreateMediaOperation = 'text_to_video' | 'image_to_video' | 'text_to_speech' | 'sound_effect';
type CreateMediaAssetStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

interface ProxyMediaGenerationRequest {
  providerId: MediaProviderId;
  mediaType: CreateMediaType;
  operation: CreateMediaOperation;
  modelId?: string;
  prompt: string;
  sourceImage?: string;
  voiceId?: string;
  outputFormat?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  promptInfluence?: number;
  /** The session this belongs to: 'create' (trial or subscription only), or a debate's voices ('debate' and the debate's id). */
  sessionType?: string;
  sessionId?: string;
}

interface MediaProviderOptionsRequest {
  providerId: MediaProviderId;
  voiceCatalog?: 'account' | 'shared';
  search?: string;
  pageSize?: number;
  nextPageToken?: string | null;
  page?: number;
  includeTotalCount?: boolean;
  sort?: 'created_at_unix' | 'name';
  sortDirection?: 'asc' | 'desc';
  voiceType?: 'personal' | 'community' | 'default' | 'workspace' | 'non-default' | 'non-community' | 'saved';
  category?: 'premade' | 'cloned' | 'generated' | 'professional';
  sharedCategory?: 'professional' | 'famous' | 'high_quality';
  gender?: string;
  age?: string;
  accent?: string;
  language?: string;
  locale?: string;
  useCases?: string[];
  descriptives?: string[];
  featured?: boolean;
  sharedSort?: string;
  fineTuningState?: 'draft' | 'not_verified' | 'not_started' | 'queued' | 'fine_tuning' | 'fine_tuned' | 'failed' | 'delayed';
  collectionId?: string;
  voiceIds?: string[];
}

interface AddElevenLabsSharedVoiceRequest {
  publicOwnerId?: string;
  voiceId?: string;
  name?: string;
}

interface RunwayTask {
  id?: string;
  status?: string;
}

interface RunwayTaskStatus {
  id?: string;
  status?: string;
  output?: string[];
  failure?: string;
  failureCode?: string;
  error?: string | { message?: string };
}

const RUNWAY_API_BASE = 'https://api.dev.runwayml.com/v1';
const RUNWAY_API_VERSION = '2024-11-06';
const RUNWAY_DEFAULT_MODEL = 'gen4.5';
const RUNWAY_DEFAULT_RATIO = '1280:720';
const RUNWAY_DEFAULT_DURATION = 5;

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io';
const ELEVENLABS_DEFAULT_TTS_MODEL = 'eleven_multilingual_v2';
const ELEVENLABS_DEFAULT_SFX_MODEL = 'eleven_text_to_sound_v2';
const ELEVENLABS_DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
const ELEVENLABS_DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128';
const ELEVENLABS_MAX_VOICE_PAGE_SIZE = 100;

export interface RunwayVideoTaskRequest {
  endpoint: string;
  body: Record<string, unknown>;
}

function assertAuthenticated(request: { auth?: { uid: string } | null }) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated to generate media');
  }
}

function validatePrompt(prompt: unknown, maxLength: number): string {
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Prompt is required');
  }

  const trimmed = prompt.trim();
  if (trimmed.length > maxLength) {
    throw new HttpsError('invalid-argument', `Prompt exceeds maximum length of ${maxLength} characters`);
  }

  return trimmed;
}

export function mapRunwayStatus(status: string | undefined): CreateMediaAssetStatus {
  const normalized = (status || '').toLowerCase();
  if (['succeeded', 'success', 'completed', 'complete'].includes(normalized)) return 'succeeded';
  if (['failed', 'error'].includes(normalized)) return 'failed';
  if (['canceled', 'cancelled'].includes(normalized)) return 'canceled';
  if (['running', 'processing'].includes(normalized)) return 'running';
  return 'queued';
}

function countRunwayOutputs(output: unknown): number {
  return Array.isArray(output) ? output.length : 0;
}

function extractProviderError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record.message === 'string') {
      try {
        const parsed = JSON.parse(record.message);
        return parsed.error?.message || parsed.message || record.message;
      } catch {
        return record.message;
      }
    }
    if (typeof record.error === 'string') return record.error;
  }
  return 'Unknown error';
}

function mapProviderError(providerId: string, error: any, prefix: string): HttpsError {
  const message = extractProviderError(error);
  const lower = message.toLowerCase();

  if (error?.code) {
    return error;
  }
  if (error?.status === 401 || error?.status === 403 || lower.includes('unauthorized') || lower.includes('forbidden')) {
    return new HttpsError('permission-denied', `Invalid ${providerId} API key`);
  }
  if (error?.status === 429 || lower.includes('rate limit') || lower.includes('too many requests')) {
    return new HttpsError('resource-exhausted', `${providerId} rate limit exceeded. Please try again later.`);
  }
  if (lower.includes('safety') || lower.includes('content policy') || lower.includes('moderation')) {
    return new HttpsError('invalid-argument', 'Content policy violation. Please modify your prompt.');
  }
  if (error?.status === 402 || lower.includes('credit') || lower.includes('quota')) {
    return new HttpsError('resource-exhausted', `${providerId} credits or quota are exhausted.`);
  }

  return new HttpsError('internal', `${prefix}: ${message}`);
}

async function getUserApiKey(uid: string, providerId: MediaProviderId, keyValue: string): Promise<string> {
  const apiKey = await getDecryptedApiKey(uid, providerId, keyValue);
  if (!apiKey) {
    throw new HttpsError('failed-precondition', `No API key configured for ${providerId}`);
  }
  return apiKey;
}

export function buildRunwayVideoTaskRequest(input: ProxyMediaGenerationRequest, prompt: string): RunwayVideoTaskRequest {
  if (input.mediaType !== 'video' || !['text_to_video', 'image_to_video'].includes(input.operation)) {
    throw new HttpsError('invalid-argument', 'Runway only supports video generation in Create mode');
  }

  if (input.operation === 'image_to_video' && !input.sourceImage) {
    throw new HttpsError('invalid-argument', 'A source image is required for image-to-video generation');
  }

  const body: Record<string, unknown> = {
    model: input.modelId || RUNWAY_DEFAULT_MODEL,
    promptText: prompt,
    ratio: input.aspectRatio || RUNWAY_DEFAULT_RATIO,
    duration: input.durationSeconds || RUNWAY_DEFAULT_DURATION,
  };

  if (input.operation === 'image_to_video') {
    body.promptImage = input.sourceImage;
  }

  return {
    endpoint: input.operation === 'text_to_video' ? 'text_to_video' : 'image_to_video',
    body,
  };
}

async function createRunwayVideoTask(apiKey: string, input: ProxyMediaGenerationRequest, prompt: string): Promise<RunwayTask> {
  const { endpoint, body } = buildRunwayVideoTaskRequest(input, prompt);

  const response = await fetch(`${RUNWAY_API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': RUNWAY_API_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw { status: response.status, message: error };
  }

  return await response.json() as RunwayTask;
}

async function getRunwayTask(apiKey: string, providerTaskId: string): Promise<RunwayTaskStatus> {
  const response = await fetch(`${RUNWAY_API_BASE}/tasks/${encodeURIComponent(providerTaskId)}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'X-Runway-Version': RUNWAY_API_VERSION,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw { status: response.status, message: error };
  }

  return await response.json() as RunwayTaskStatus;
}

function mimeTypeForOutputFormat(outputFormat: string): string {
  if (outputFormat.startsWith('wav')) return 'audio/wav';
  if (outputFormat.startsWith('pcm')) return 'audio/L16';
  if (outputFormat.startsWith('ulaw')) return 'audio/basic';
  return 'audio/mpeg';
}

function normalizePageSize(pageSize: unknown): number {
  if (typeof pageSize !== 'number' || !Number.isFinite(pageSize)) return ELEVENLABS_MAX_VOICE_PAGE_SIZE;
  return Math.max(1, Math.min(ELEVENLABS_MAX_VOICE_PAGE_SIZE, Math.floor(pageSize)));
}

function appendStringParam(params: URLSearchParams, name: string, value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    params.set(name, value.trim());
  }
}

export function buildElevenLabsVoiceSearchUrl(input: Partial<MediaProviderOptionsRequest> = {}): string {
  const params = new URLSearchParams();
  params.set('page_size', String(normalizePageSize(input.pageSize)));
  if (typeof input.includeTotalCount === 'boolean') {
    params.set('include_total_count', String(input.includeTotalCount));
  }
  appendStringParam(params, 'next_page_token', input.nextPageToken);
  appendStringParam(params, 'search', input.search);
  appendStringParam(params, 'sort', input.sort);
  appendStringParam(params, 'sort_direction', input.sortDirection);
  appendStringParam(params, 'voice_type', input.voiceType);
  appendStringParam(params, 'category', input.category);
  appendStringParam(params, 'fine_tuning_state', input.fineTuningState);
  appendStringParam(params, 'collection_id', input.collectionId);

  if (Array.isArray(input.voiceIds)) {
    input.voiceIds
      .filter((voiceId) => typeof voiceId === 'string' && voiceId.trim().length > 0)
      .forEach((voiceId) => params.append('voice_ids', voiceId.trim()));
  }

  return `${ELEVENLABS_API_BASE}/v2/voices?${params.toString()}`;
}

export function buildElevenLabsSharedVoiceUrl(input: Partial<MediaProviderOptionsRequest> = {}): string {
  const params = new URLSearchParams();
  params.set('page_size', String(normalizePageSize(input.pageSize ?? 30)));
  const page = typeof input.page === 'number'
    ? input.page
    : typeof input.nextPageToken === 'string' && input.nextPageToken.trim()
      ? Number(input.nextPageToken)
      : 0;
  params.set('page', String(Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0));

  appendStringParam(params, 'search', input.search);
  appendStringParam(params, 'category', input.sharedCategory);
  appendStringParam(params, 'gender', input.gender);
  appendStringParam(params, 'age', input.age);
  appendStringParam(params, 'accent', input.accent);
  appendStringParam(params, 'language', input.language);
  appendStringParam(params, 'locale', input.locale);
  appendStringParam(params, 'sort', input.sharedSort);
  if (typeof input.featured === 'boolean') {
    params.set('featured', String(input.featured));
  }

  if (Array.isArray(input.useCases)) {
    input.useCases
      .filter((useCase) => typeof useCase === 'string' && useCase.trim().length > 0)
      .forEach((useCase) => params.append('use_cases', useCase.trim()));
  }

  if (Array.isArray(input.descriptives)) {
    input.descriptives
      .filter((descriptive) => typeof descriptive === 'string' && descriptive.trim().length > 0)
      .forEach((descriptive) => params.append('descriptives', descriptive.trim()));
  }

  return `${ELEVENLABS_API_BASE}/v1/shared-voices?${params.toString()}`;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function isNonNull<T>(value: T | null | undefined): value is T {
  return value != null;
}

function asRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

export function mapElevenLabsVoiceOption(
  voice: unknown,
  sourceVoiceType?: MediaProviderOptionsRequest['voiceType']
) {
  if (!voice || typeof voice !== 'object' || Array.isArray(voice)) return null;
  const record = voice as Record<string, unknown>;
  const id = readString(record, 'voice_id');
  const name = readString(record, 'name');
  if (!id || !name) return null;

  const verifiedLanguages = Array.isArray(record.verified_languages)
    ? record.verified_languages
        .filter((language): language is Record<string, unknown> => (
          Boolean(language) && typeof language === 'object' && !Array.isArray(language)
        ))
        .map((language) => ({
          language: readString(language, 'language') || '',
          modelId: readString(language, 'model_id'),
          accent: readString(language, 'accent') || null,
          locale: readString(language, 'locale') || null,
          previewUrl: readString(language, 'preview_url') || null,
        }))
        .filter((language) => language.language)
    : [];

  return {
    id,
    name,
    voice_id: id,
    category: readString(record, 'category') || null,
    description: readString(record, 'description') || null,
    previewUrl: readString(record, 'preview_url') || null,
    labels: asRecord(record.labels),
    sourceVoiceType,
    availableForTiers: asStringArray(record.available_for_tiers),
    available_for_tiers: asStringArray(record.available_for_tiers),
    highQualityBaseModelIds: asStringArray(record.high_quality_base_model_ids),
    high_quality_base_model_ids: asStringArray(record.high_quality_base_model_ids),
    verifiedLanguages,
    verified_languages: verifiedLanguages,
    isOwner: readBoolean(record, 'is_owner') ?? null,
    is_owner: readBoolean(record, 'is_owner') ?? null,
    isLegacy: readBoolean(record, 'is_legacy') ?? null,
    is_legacy: readBoolean(record, 'is_legacy') ?? null,
    isMixed: readBoolean(record, 'is_mixed') ?? null,
    is_mixed: readBoolean(record, 'is_mixed') ?? null,
    createdAtUnix: readNumber(record, 'created_at_unix') ?? null,
    created_at_unix: readNumber(record, 'created_at_unix') ?? null,
    isBookmarked: readBoolean(record, 'is_bookmarked') ?? null,
    is_bookmarked: readBoolean(record, 'is_bookmarked') ?? null,
    favoritedAtUnix: readNumber(record, 'favorited_at_unix') ?? null,
    favorited_at_unix: readNumber(record, 'favorited_at_unix') ?? null,
    recordingQuality: readString(record, 'recording_quality') || null,
    recording_quality: readString(record, 'recording_quality') || null,
    labellingStatus: readString(record, 'labelling_status') || null,
    labelling_status: readString(record, 'labelling_status') || null,
    recordingQualityReason: readString(record, 'recording_quality_reason') || null,
    recording_quality_reason: readString(record, 'recording_quality_reason') || null,
    safetyControl: readString(record, 'safety_control') || null,
    safety_control: readString(record, 'safety_control') || null,
  };
}

export function mapElevenLabsSharedVoiceOption(voice: unknown) {
  if (!voice || typeof voice !== 'object' || Array.isArray(voice)) return null;
  const record = voice as Record<string, unknown>;
  const id = readString(record, 'voice_id');
  const name = readString(record, 'name');
  if (!id || !name) return null;

  const previewUrl = readString(record, 'preview_url') || null;
  const gender = readString(record, 'gender');
  const age = readString(record, 'age');
  const accent = readString(record, 'accent');
  const descriptive = readString(record, 'descriptive');
  const useCase = readString(record, 'use_case');
  const language = readString(record, 'language');
  const locale = readString(record, 'locale');
  const labels: Record<string, string> = {};

  if (gender) labels.gender = gender;
  if (age) labels.age = age;
  if (accent) labels.accent = accent;
  if (descriptive) labels.descriptive = descriptive;
  if (useCase) labels.use_case = useCase;

  const verifiedLanguages = language
    ? [{
        language,
        accent: accent || null,
        locale: locale || null,
        previewUrl,
        preview_url: previewUrl,
      }]
    : [];
  const publicOwnerId = readString(record, 'public_owner_id') || null;
  const freeUsersAllowed = readBoolean(record, 'free_users_allowed');
  const isAddedByUser = readBoolean(record, 'is_added_by_user');
  const isBookmarked = readBoolean(record, 'is_bookmarked');
  const imageUrl = readString(record, 'image_url') || null;
  const createdAtUnix = readNumber(record, 'date_unix') ?? null;

  return {
    id,
    name,
    voice_id: id,
    category: readString(record, 'category') || null,
    description: readString(record, 'description') || null,
    previewUrl,
    preview_url: previewUrl,
    labels: Object.keys(labels).length > 0 ? labels : undefined,
    verifiedLanguages,
    verified_languages: verifiedLanguages,
    sourceVoiceType: 'community',
    isCommunity: true,
    publicOwnerId,
    public_owner_id: publicOwnerId,
    freeUsersAllowed,
    free_users_allowed: freeUsersAllowed,
    isAddedByUser,
    is_added_by_user: isAddedByUser,
    isBookmarked,
    is_bookmarked: isBookmarked,
    imageUrl,
    image_url: imageUrl,
    createdAtUnix,
    created_at_unix: createdAtUnix,
  };
}

function getElevenLabsModelOperations(model: Record<string, unknown>): Extract<CreateMediaOperation, 'text_to_speech' | 'sound_effect'>[] {
  const modelId = readString(model, 'model_id') || '';
  const name = readString(model, 'name') || '';
  const description = readString(model, 'description') || '';
  const text = `${modelId} ${name} ${description}`.toLowerCase();
  const operations: Extract<CreateMediaOperation, 'text_to_speech' | 'sound_effect'>[] = [];

  if (model.can_do_text_to_speech === true) {
    operations.push('text_to_speech');
  }
  if (modelId === ELEVENLABS_DEFAULT_SFX_MODEL || text.includes('text to sound') || text.includes('sound effect')) {
    operations.push('sound_effect');
  }

  return operations;
}

function getElevenLabsMaxCharacters(model: Record<string, unknown>): number | undefined {
  const subscribed = readNumber(model, 'max_characters_request_subscribed_user');
  const free = readNumber(model, 'max_characters_request_free_user');
  if (typeof subscribed === 'number' && typeof free === 'number') return Math.max(subscribed, free);
  return subscribed ?? free;
}

export function mapElevenLabsModelOption(model: unknown) {
  if (!model || typeof model !== 'object' || Array.isArray(model)) return null;
  const record = model as Record<string, unknown>;
  const id = readString(record, 'model_id');
  if (!id) return null;

  const operations = getElevenLabsModelOperations(record);
  if (operations.length === 0) return null;

  const languages = Array.isArray(record.languages)
    ? record.languages
        .filter((language): language is Record<string, unknown> => (
          Boolean(language) && typeof language === 'object' && !Array.isArray(language)
        ))
        .map((language) => ({
          id: readString(language, 'language_id') || readString(language, 'id'),
          languageId: readString(language, 'language_id'),
          name: readString(language, 'name') || readString(language, 'language') || 'Unknown',
        }))
    : undefined;

  return {
    id,
    label: readString(record, 'name') || id,
    description: readString(record, 'description'),
    mediaType: 'audio',
    operations,
    maxInputCharacters: getElevenLabsMaxCharacters(record),
    canBeFineTuned: readBoolean(record, 'can_be_finetuned'),
    canDoTextToSpeech: readBoolean(record, 'can_do_text_to_speech'),
    canDoVoiceConversion: readBoolean(record, 'can_do_voice_conversion'),
    canUseStyle: readBoolean(record, 'can_use_style'),
    canUseSpeakerBoost: readBoolean(record, 'can_use_speaker_boost'),
    servesProVoices: readBoolean(record, 'serves_pro_voices'),
    tokenCostFactor: readNumber(record, 'token_cost_factor'),
    requiresAlphaAccess: readBoolean(record, 'requires_alpha_access'),
    languages,
    concurrencyGroup: readString(record, 'concurrency_group'),
  };
}

async function generateElevenLabsAudio(
  apiKey: string,
  input: ProxyMediaGenerationRequest,
  prompt: string
) {
  if (input.mediaType !== 'audio' || !['text_to_speech', 'sound_effect'].includes(input.operation)) {
    throw new HttpsError('invalid-argument', 'ElevenLabs only supports audio generation in Create mode');
  }

  const outputFormat = input.outputFormat || ELEVENLABS_DEFAULT_OUTPUT_FORMAT;
  const mimeType = mimeTypeForOutputFormat(outputFormat);

  const isTts = input.operation === 'text_to_speech';
  const endpoint = isTts
    ? `${ELEVENLABS_API_BASE}/v1/text-to-speech/${encodeURIComponent(input.voiceId || ELEVENLABS_DEFAULT_VOICE_ID)}?output_format=${encodeURIComponent(outputFormat)}`
    : `${ELEVENLABS_API_BASE}/v1/sound-generation?output_format=${encodeURIComponent(outputFormat)}`;

  const body = isTts
    ? {
        text: prompt,
        model_id: input.modelId || ELEVENLABS_DEFAULT_TTS_MODEL,
      }
    : {
        text: prompt,
        model_id: input.modelId || ELEVENLABS_DEFAULT_SFX_MODEL,
        ...(typeof input.durationSeconds === 'number' ? { duration_seconds: input.durationSeconds } : {}),
        ...(typeof input.promptInfluence === 'number' ? { prompt_influence: input.promptInfluence } : {}),
      };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': mimeType,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw { status: response.status, message: error };
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const responseMimeType = response.headers.get('content-type')?.split(';')[0] || mimeType;

  return {
    id: `media_${Date.now()}_elevenlabs_${Math.random().toString(36).slice(2, 7)}`,
    mediaType: 'audio',
    providerId: 'elevenlabs',
    modelId: input.modelId || (isTts ? ELEVENLABS_DEFAULT_TTS_MODEL : ELEVENLABS_DEFAULT_SFX_MODEL),
    operation: input.operation,
    prompt,
    url: `data:${responseMimeType};base64,${base64}`,
    mimeType: responseMimeType,
    durationSeconds: input.durationSeconds,
    status: 'succeeded',
    createdAt: Date.now(),
  };
}

/** A debate's voices: speech labeled with its debate. Everything else here is Create. */
export function isDebateVoice(input: Pick<ProxyMediaGenerationRequest, 'sessionType' | 'mediaType' | 'operation'>): boolean {
  return input.sessionType === 'debate' && input.mediaType === 'audio' && input.operation === 'text_to_speech';
}

export const proxyMediaGeneration = onCall(
  {
    timeoutSeconds: 300,
    memory: '512MiB',
    secrets: [encryptionKey],
  },
  async (request) => {
    assertAuthenticated(request);

    const keyValue = encryptionKey.value();
    if (!keyValue) {
      throw new HttpsError('internal', 'Encryption not configured');
    }

    const input = request.data as ProxyMediaGenerationRequest;
    const { providerId } = input || {};

    if (!providerId || !['runway', 'elevenlabs'].includes(providerId)) {
      throw new HttpsError('invalid-argument', 'Invalid media provider');
    }

    const prompt = validatePrompt(input.prompt, providerId === 'runway' ? 1000 : input.operation === 'sound_effect' ? 450 : 5000);

    // Media is Create, which needs a trial or a subscription. A debate's voices
    // are part of that debate: speech for a debate already counted, which a
    // voice never starts (like Analyze's actions on a session).
    const uid = request.auth!.uid;
    const allowed = isDebateVoice(input)
      ? ['premium', 'counted'].includes((await checkFreeTierForInteraction(uid, 'debate', input.sessionId)).reason)
      : await isPremiumOrTrial(uid);
    if (!allowed) throw freeLimitError('create');

    const apiKey = await getUserApiKey(request.auth!.uid, providerId, keyValue);

    try {
      if (providerId === 'runway') {
        const task = await createRunwayVideoTask(apiKey, input, prompt);
        if (!task.id) {
          throw new HttpsError('internal', 'Runway did not return a task ID');
        }

        console.info('Runway video task created', {
          providerId: 'runway',
          mediaType: input.mediaType,
          operation: input.operation,
          modelId: input.modelId || RUNWAY_DEFAULT_MODEL,
          durationSeconds: input.durationSeconds || RUNWAY_DEFAULT_DURATION,
          aspectRatio: input.aspectRatio || RUNWAY_DEFAULT_RATIO,
          providerTaskId: task.id,
          providerStatus: task.status,
          mappedStatus: mapRunwayStatus(task.status),
        });

        return {
          success: true,
          task: {
            providerTaskId: task.id,
            status: mapRunwayStatus(task.status),
            providerStatus: task.status,
            pollAfterMs: 5000,
          },
        };
      }

      const asset = await generateElevenLabsAudio(apiKey, input, prompt);
      return { success: true, asset };
    } catch (error: any) {
      console.error(`Media generation error for ${providerId}:`, error);
      throw mapProviderError(providerId, error, 'Media generation failed');
    }
  }
);

export const getMediaTaskStatus = onCall(
  {
    timeoutSeconds: 60,
    memory: '512MiB',
    secrets: [encryptionKey],
  },
  async (request) => {
    assertAuthenticated(request);

    const keyValue = encryptionKey.value();
    if (!keyValue) {
      throw new HttpsError('internal', 'Encryption not configured');
    }

    const { providerId, providerTaskId } = request.data || {};
    if (providerId !== 'runway') {
      throw new HttpsError('invalid-argument', 'Only Runway tasks can be polled');
    }
    if (!providerTaskId || typeof providerTaskId !== 'string') {
      throw new HttpsError('invalid-argument', 'Runway task ID is required');
    }

    const apiKey = await getUserApiKey(request.auth!.uid, 'runway', keyValue);

    try {
      const task = await getRunwayTask(apiKey, providerTaskId);
      const status = mapRunwayStatus(task.status);
      const providerError = typeof task.error === 'string'
        ? task.error
        : task.error?.message;

      console.info('Runway task status', {
        providerTaskId,
        providerStatus: task.status,
        mappedStatus: status,
        outputCount: countRunwayOutputs(task.output),
        failureCode: task.failureCode,
        hasFailure: Boolean(providerError || task.failure || task.failureCode),
      });

      return {
        success: true,
        status,
        providerStatus: task.status,
        outputUrls: Array.isArray(task.output) ? task.output : undefined,
        error: providerError || task.failure || task.failureCode,
      };
    } catch (error: any) {
      console.error('Runway task status error:', error);
      throw mapProviderError('runway', error, 'Failed to get Runway task status');
    }
  }
);

export const listMediaProviderOptions = onCall(
  {
    timeoutSeconds: 60,
    memory: '256MiB',
    secrets: [encryptionKey],
  },
  async (request) => {
    assertAuthenticated(request);

    const input = (request.data || {}) as Partial<MediaProviderOptionsRequest>;
    const { providerId } = input;
    if (!providerId || !['runway', 'elevenlabs'].includes(providerId)) {
      throw new HttpsError('invalid-argument', 'Invalid media provider');
    }

    if (providerId === 'runway') {
      return {
        success: true,
        providerId: 'runway',
        models: [
          {
            id: RUNWAY_DEFAULT_MODEL,
            label: 'Gen-4.5',
            mediaType: 'video',
            operations: ['text_to_video', 'image_to_video'],
          },
        ],
      };
    }

    const keyValue = encryptionKey.value();
    if (!keyValue) {
      throw new HttpsError('internal', 'Encryption not configured');
    }

    const apiKey = await getUserApiKey(request.auth!.uid, 'elevenlabs', keyValue);

    try {
      if (input.voiceCatalog === 'shared') {
        const voiceResponse = await fetch(buildElevenLabsSharedVoiceUrl(input), {
          method: 'GET',
          headers: {
            'xi-api-key': apiKey,
          },
        });

        if (!voiceResponse.ok) {
          const error = await voiceResponse.text();
          throw { status: voiceResponse.status, message: error };
        }

        const voiceData = await voiceResponse.json() as {
          voices?: unknown[];
          has_more?: boolean;
          total_count?: number;
        };
        const currentPage = typeof input.page === 'number'
          ? input.page
          : typeof input.nextPageToken === 'string' && input.nextPageToken.trim()
            ? Number(input.nextPageToken)
            : 0;
        const normalizedPage = Number.isFinite(currentPage) ? Math.max(0, Math.floor(currentPage)) : 0;
        const hasMore = Boolean(voiceData.has_more);

        return {
          success: true,
          providerId: 'elevenlabs',
          voices: (voiceData.voices || []).map(mapElevenLabsSharedVoiceOption).filter(isNonNull),
          voiceHasMore: hasMore,
          voiceTotalCount: typeof voiceData.total_count === 'number' ? voiceData.total_count : undefined,
          voiceNextPageToken: hasMore ? String(normalizedPage + 1) : null,
          models: [],
        };
      }

      const voiceResponse = await fetch(buildElevenLabsVoiceSearchUrl(input), {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey,
        },
      });

      if (!voiceResponse.ok) {
        const error = await voiceResponse.text();
        throw { status: voiceResponse.status, message: error };
      }

      const voiceData = await voiceResponse.json() as {
        voices?: unknown[];
        has_more?: boolean;
        total_count?: number;
        next_page_token?: string | null;
      };

      let models: Array<NonNullable<ReturnType<typeof mapElevenLabsModelOption>>> = [];
      try {
        const modelResponse = await fetch(`${ELEVENLABS_API_BASE}/v1/models`, {
          method: 'GET',
          headers: {
            'xi-api-key': apiKey,
          },
        });

        if (!modelResponse.ok) {
          const error = await modelResponse.text();
          console.warn('ElevenLabs model list error:', { status: modelResponse.status, message: error });
        } else {
          const modelData = await modelResponse.json() as unknown;
          const rawModels = Array.isArray(modelData) ? modelData : [];
          models = rawModels.map(mapElevenLabsModelOption).filter(isNonNull);
        }
      } catch (error) {
        console.warn('ElevenLabs model list failed:', error);
      }

      return {
        success: true,
        providerId: 'elevenlabs',
        voices: (voiceData.voices || [])
          .map((voice) => mapElevenLabsVoiceOption(voice, input.voiceType))
          .filter(isNonNull),
        voiceHasMore: Boolean(voiceData.has_more),
        voiceTotalCount: typeof voiceData.total_count === 'number' ? voiceData.total_count : undefined,
        voiceNextPageToken: voiceData.next_page_token || null,
        models,
      };
    } catch (error: any) {
      console.error('ElevenLabs voice list error:', error);
      throw mapProviderError('elevenlabs', error, 'Failed to list ElevenLabs voices');
    }
  }
);

export const addElevenLabsSharedVoice = onCall(
  {
    timeoutSeconds: 60,
    memory: '256MiB',
    secrets: [encryptionKey],
  },
  async (request) => {
    assertAuthenticated(request);

    const input = (request.data || {}) as AddElevenLabsSharedVoiceRequest;
    const publicOwnerId = input.publicOwnerId?.trim();
    const voiceId = input.voiceId?.trim();
    const name = input.name?.trim() || 'Community voice';
    if (!publicOwnerId || !voiceId) {
      throw new HttpsError('invalid-argument', 'Shared voice owner and voice ID are required');
    }

    const keyValue = encryptionKey.value();
    if (!keyValue) {
      throw new HttpsError('internal', 'Encryption not configured');
    }

    const apiKey = await getUserApiKey(request.auth!.uid, 'elevenlabs', keyValue);

    try {
      const response = await fetch(
        `${ELEVENLABS_API_BASE}/v1/voices/add/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(voiceId)}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ new_name: name, bookmarked: true }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw { status: response.status, message: error };
      }

      const data = await response.json() as { voice_id?: string };
      const libraryVoiceId = data.voice_id || voiceId;

      return {
        success: true,
        voice: {
          id: libraryVoiceId,
          name,
          voice_id: libraryVoiceId,
          sourceVoiceType: 'saved',
          isBookmarked: true,
          is_bookmarked: true,
        },
      };
    } catch (error: any) {
      console.error('ElevenLabs shared voice add error:', error);
      throw mapProviderError('elevenlabs', error, 'Failed to add ElevenLabs shared voice');
    }
  }
);
