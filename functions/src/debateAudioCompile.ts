import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';

try { admin.app(); } catch { admin.initializeApp(); }

const ffmpegPath = require('ffmpeg-static') as string | null;

const STORAGE_BUCKET = 'symposium-ai.firebasestorage.app';
const COMPILE_ROOT = 'debate-audio-compile';
const OUTPUT_MIME_TYPE = 'audio/mpeg';
const OUTPUT_BITRATE = '128k';
export const DEBATE_PODCAST_ARTIST = 'SymposiumAI';
export const DEBATE_PODCAST_AUTHOR = 'Braveheart Innovations';
export const DEBATE_PODCAST_ALBUM = 'SymposiumAI Debate Podcast';
const MAX_CLIPS = 80;
const MAX_CLIP_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 250 * 1024 * 1024;
const MAX_PAUSE_MS = 10_000;
export const DEFAULT_DEBATE_AUDIO_PAUSE_MS = 1500;
export const DEBATE_PODCAST_OPENING_HANDOFF_MS = 500;
export const DEBATE_PODCAST_OPENING_TRACK = 'Arena Opening.mp3';
export const DEBATE_PODCAST_OUTRO_TRACK = 'Arena Closing.mp3';
const CLIP_DOWNLOAD_CONCURRENCY = 4;
const FFMPEG_TIMEOUT_MS = 8 * 60 * 1000;
const UPLOAD_URL_TTL_MS = 30 * 60 * 1000;
const DOWNLOAD_URL_TTL_MS = 24 * 60 * 60 * 1000;
const BUNDLED_DEBATE_PODCAST_MEDIA_DIR = path.join(__dirname, 'debate-podcast-media');

type DebatePodcastTrackKey = 'opening' | 'outro';

type DebatePodcastInputSequenceStep =
  | { kind: 'track'; track: DebatePodcastTrackKey }
  | { kind: 'clip'; clipIndex: number }
  | { kind: 'silence'; pauseMs: number };

type CompileClipInput = {
  id?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  pauseAfterMs?: unknown;
};

type NormalizedCompileClip = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  pauseAfterMs: number;
};

type CompileJobClip = NormalizedCompileClip & {
  storagePath: string;
};

type CompileJobDoc = {
  uid: string;
  status: 'uploading' | 'running' | 'succeeded' | 'failed';
  topic?: string;
  clips: CompileJobClip[];
  outputStoragePath: string;
  outputMimeType: string;
};

function bucket() {
  return getStorage().bucket(STORAGE_BUCKET);
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'item';
}

function stringInput(value: unknown, label: string, maxLength = 160): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${label} is required.`);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new HttpsError('invalid-argument', `${label} is invalid.`);
  }
  return trimmed;
}

function numberInput(value: unknown, label: string, opts: { min: number; max: number; optional?: boolean }): number | undefined {
  if (value === undefined || value === null) {
    if (opts.optional) return undefined;
    throw new HttpsError('invalid-argument', `${label} is required.`);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpsError('invalid-argument', `${label} must be a number.`);
  }
  const rounded = Math.floor(value);
  if (rounded < opts.min || rounded > opts.max) {
    throw new HttpsError('invalid-argument', `${label} is out of range.`);
  }
  return rounded;
}

function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('mp4') || normalized.includes('m4a') || normalized.includes('aac')) return 'm4a';
  if (normalized.includes('ogg') || normalized.includes('opus')) return 'ogg';
  return 'mp3';
}

export function normalizeCompileClips(rawClips: unknown): NormalizedCompileClip[] {
  if (!Array.isArray(rawClips) || rawClips.length === 0) {
    throw new HttpsError('invalid-argument', 'At least one audio clip is required.');
  }
  if (rawClips.length > MAX_CLIPS) {
    throw new HttpsError('invalid-argument', `A maximum of ${MAX_CLIPS} clips can be compiled at once.`);
  }

  let declaredTotalBytes = 0;
  const clips = rawClips.map((raw, index): NormalizedCompileClip => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new HttpsError('invalid-argument', `Clip ${index + 1} is invalid.`);
    }
    const clip = raw as CompileClipInput;
    const id = sanitizeSegment(stringInput(clip.id, `Clip ${index + 1} id`, 120));
    const fileName = sanitizeSegment(stringInput(clip.fileName, `Clip ${index + 1} file name`, 180));
    const mimeType = stringInput(clip.mimeType, `Clip ${index + 1} MIME type`, 80);
    if (!mimeType.startsWith('audio/')) {
      throw new HttpsError('invalid-argument', `Clip ${index + 1} must be an audio file.`);
    }
    const sizeBytes = numberInput(clip.sizeBytes, `Clip ${index + 1} size`, {
      min: 1,
      max: MAX_CLIP_BYTES,
      optional: true,
    });
    if (sizeBytes) {
      declaredTotalBytes += sizeBytes;
    }
    const pauseAfterMs = numberInput(clip.pauseAfterMs, `Clip ${index + 1} pause`, {
      min: 0,
      max: MAX_PAUSE_MS,
      optional: true,
    }) ?? DEFAULT_DEBATE_AUDIO_PAUSE_MS;

    return { id, fileName, mimeType, sizeBytes, pauseAfterMs };
  });

  if (declaredTotalBytes > MAX_TOTAL_BYTES) {
    throw new HttpsError('invalid-argument', 'Selected audio clips are too large to compile.');
  }

  return clips;
}

export function buildConcatFilter(inputCount: number): string {
  if (inputCount <= 0) {
    throw new Error('At least one input is required.');
  }
  const normalized = Array.from({ length: inputCount }, (_, index) => (
    `[${index}:a]aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${index}]`
  ));
  const labels = Array.from({ length: inputCount }, (_, index) => `[a${index}]`).join('');
  return `${normalized.join(';')};${labels}concat=n=${inputCount}:v=0:a=1[out]`;
}

export function buildDebatePodcastInputSequence(
  clipCount: number,
  pauseAfterMsByClip: number[]
): DebatePodcastInputSequenceStep[] {
  if (clipCount <= 0) {
    throw new Error('At least one clip is required.');
  }

  const sequence: DebatePodcastInputSequenceStep[] = [
    { kind: 'track', track: 'opening' },
  ];

  if (DEBATE_PODCAST_OPENING_HANDOFF_MS > 0) {
    sequence.push({ kind: 'silence', pauseMs: DEBATE_PODCAST_OPENING_HANDOFF_MS });
  }

  for (let index = 0; index < clipCount; index += 1) {
    sequence.push({ kind: 'clip', clipIndex: index });
    const pauseMs = pauseAfterMsByClip[index] ?? DEFAULT_DEBATE_AUDIO_PAUSE_MS;
    if (pauseMs > 0) {
      sequence.push({ kind: 'silence', pauseMs });
    }
  }

  sequence.push({ kind: 'track', track: 'outro' });
  return sequence;
}

async function resolveBundledPodcastMediaPath(fileName: string): Promise<string> {
  const mediaPath = path.join(BUNDLED_DEBATE_PODCAST_MEDIA_DIR, fileName);
  try {
    const stats = await fs.stat(mediaPath);
    if (stats.isFile()) {
      return mediaPath;
    }
  } catch {
    // Throw a clearer Functions error below.
  }
  throw new HttpsError('failed-precondition', `Bundled debate podcast media is missing: ${fileName}.`);
}

function escapeFfmpegText(value: string): string {
  return value.replace(/[\\:']/g, '\\$&');
}

export function buildOutputMetadataArgs(topic?: string): string[] {
  const title = topic?.trim() || 'Debate Podcast';
  const tags: Array<[string, string]> = [
    ['title', title],
    ['artist', DEBATE_PODCAST_ARTIST],
    ['album_artist', DEBATE_PODCAST_AUTHOR],
    ['author', DEBATE_PODCAST_AUTHOR],
    ['album', DEBATE_PODCAST_ALBUM],
    ['genre', 'Podcast'],
  ];

  return [
    '-map_metadata', '-1',
    '-id3v2_version', '3',
    ...tags.flatMap(([key, value]) => ['-metadata', `${key}=${escapeFfmpegText(value)}`]),
  ];
}

async function runFfmpeg(args: string[], description: string, timeoutMs = FFMPEG_TIMEOUT_MS): Promise<void> {
  if (!ffmpegPath) {
    throw new HttpsError('internal', 'FFmpeg is not available in this Functions runtime.');
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const stderr: Buffer[] = [];
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`${description} timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);

    const finish = (error?: Error) => {
      if (settled) return false;
      settled = true;
      clearTimeout(timeoutId);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
      return true;
    };

    child.stderr.on('data', (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on('error', (error) => {
      finish(error);
    });
    child.on('close', (code) => {
      if (code === 0) {
        finish();
        return;
      }
      const detail = Buffer.concat(stderr).toString('utf8').slice(-2000);
      finish(new Error(`${description} failed with exit code ${code}: ${detail}`));
    });
  });
}

async function createSilenceFile(workDir: string, pauseMs: number): Promise<string> {
  const seconds = Math.max(0.001, pauseMs / 1000);
  const silencePath = path.join(workDir, `silence_${pauseMs}.mp3`);
  await runFfmpeg([
    '-y',
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-t', seconds.toFixed(3),
    '-codec:a', 'libmp3lame',
    '-b:a', OUTPUT_BITRATE,
    silencePath,
  ], `creating ${pauseMs}ms silence`);
  return silencePath;
}

async function getSilenceFile(
  workDir: string,
  silenceByPause: Map<number, string>,
  pauseMs: number
): Promise<string> {
  let silencePath = silenceByPause.get(pauseMs);
  if (!silencePath) {
    silencePath = await createSilenceFile(workDir, pauseMs);
    silenceByPause.set(pauseMs, silencePath);
  }
  return silencePath;
}

async function getExistingUploadedSize(storagePath: string): Promise<number> {
  const [metadata] = await bucket().file(storagePath).getMetadata();
  const rawSize = metadata.size;
  const size = typeof rawSize === 'number' ? rawSize : Number(rawSize);
  if (!Number.isFinite(size) || size <= 0) {
    throw new HttpsError('failed-precondition', 'Uploaded audio clip is empty.');
  }
  if (size > MAX_CLIP_BYTES) {
    throw new HttpsError('invalid-argument', 'Uploaded audio clip is too large.');
  }
  return size;
}

async function cleanupStorage(paths: string[]): Promise<void> {
  await Promise.all(paths.map(async (storagePath) => {
    try {
      await bucket().file(storagePath).delete({ ignoreNotFound: true });
    } catch (error) {
      console.warn('[debateAudioCompile] Failed to delete temporary object', { storagePath, error });
    }
  }));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }));

  return results;
}

export const createDebateAudioCompileSession = onCall(
  { timeoutSeconds: 60, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated to compile debate audio.');
    }

    const uid = request.auth.uid;
    const input = request.data || {};
    const topic = typeof input.topic === 'string' ? input.topic.trim().slice(0, 240) : undefined;
    const clips = normalizeCompileClips(input.clips);
    const jobId = crypto.randomUUID();
    const now = Date.now();
    const uploadExpiresAt = now + UPLOAD_URL_TTL_MS;
    const outputStoragePath = `${COMPILE_ROOT}/${sanitizeSegment(uid)}/${jobId}/output/debate-podcast.mp3`;

    const jobClips: CompileJobClip[] = clips.map((clip, index) => ({
      ...clip,
      storagePath: `${COMPILE_ROOT}/${sanitizeSegment(uid)}/${jobId}/clips/${String(index + 1).padStart(3, '0')}_${clip.id}.${extensionForMimeType(clip.mimeType)}`,
    }));

    const uploadUrls = await Promise.all(jobClips.map(async (clip) => {
      const [uploadUrl] = await bucket().file(clip.storagePath).getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: uploadExpiresAt,
        contentType: clip.mimeType,
      });
      return {
        clipId: clip.id,
        uploadUrl,
        storagePath: clip.storagePath,
        expiresAt: uploadExpiresAt,
        contentType: clip.mimeType,
      };
    }));

    await getFirestore().collection('debateAudioCompileJobs').doc(jobId).set({
      uid,
      topic,
      status: 'uploading',
      clips: jobClips,
      outputStoragePath,
      outputMimeType: OUTPUT_MIME_TYPE,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      jobId,
      uploadUrls,
      outputMimeType: OUTPUT_MIME_TYPE,
    };
  }
);

export const compileDebateAudioPack = onCall(
  { timeoutSeconds: 540, memory: '2GiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated to compile debate audio.');
    }

    const jobId = stringInput(request.data?.jobId, 'Compile job ID', 80);
    const jobRef = getFirestore().collection('debateAudioCompileJobs').doc(jobId);
    const snapshot = await jobRef.get();
    if (!snapshot.exists) {
      throw new HttpsError('not-found', 'Compile job not found.');
    }

    const job = snapshot.data() as CompileJobDoc;
    if (job.uid !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Compile job does not belong to this user.');
    }
    if (!Array.isArray(job.clips) || job.clips.length === 0) {
      throw new HttpsError('failed-precondition', 'Compile job has no clips.');
    }

    await jobRef.update({
      status: 'running',
      updatedAt: FieldValue.serverTimestamp(),
    });

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `debate-audio-${jobId}-`));
    const tempStoragePaths = job.clips.map((clip) => clip.storagePath);

    try {
      console.info('[debateAudioCompile] Starting compile', { jobId, clipCount: job.clips.length });
      const actualSizes = await Promise.all(job.clips.map((clip) => getExistingUploadedSize(clip.storagePath)));
      const actualTotalBytes = actualSizes.reduce((sum, size) => sum + size, 0);
      if (actualTotalBytes > MAX_TOTAL_BYTES) {
        throw new HttpsError('invalid-argument', 'Uploaded audio clips are too large to compile.');
      }

      const localClipPaths = await mapWithConcurrency(job.clips, CLIP_DOWNLOAD_CONCURRENCY, async (clip, index) => {
        const localPath = path.join(workDir, `clip_${String(index + 1).padStart(3, '0')}.${extensionForMimeType(clip.mimeType)}`);
        await bucket().file(clip.storagePath).download({ destination: localPath });
        return localPath;
      });
      console.info('[debateAudioCompile] Downloaded clips', { jobId, clipCount: localClipPaths.length });

      const bundledTrackPaths: Record<DebatePodcastTrackKey, string> = {
        opening: await resolveBundledPodcastMediaPath(DEBATE_PODCAST_OPENING_TRACK),
        outro: await resolveBundledPodcastMediaPath(DEBATE_PODCAST_OUTRO_TRACK),
      };
      const silenceByPause = new Map<number, string>();
      const inputSequence = buildDebatePodcastInputSequence(
        localClipPaths.length,
        job.clips.map((clip) => clip.pauseAfterMs)
      );
      const orderedInputs: string[] = [];
      for (const step of inputSequence) {
        if (step.kind === 'track') {
          orderedInputs.push(bundledTrackPaths[step.track]);
          continue;
        }
        if (step.kind === 'clip') {
          orderedInputs.push(localClipPaths[step.clipIndex]);
          continue;
        }
        orderedInputs.push(await getSilenceFile(workDir, silenceByPause, step.pauseMs));
      }

      const outputPath = path.join(workDir, 'debate-podcast.mp3');
      const inputArgs = orderedInputs.flatMap((inputPath) => ['-i', inputPath]);
      const metadataArgs = buildOutputMetadataArgs(job.topic);
      console.info('[debateAudioCompile] Running FFmpeg', { jobId, inputCount: orderedInputs.length });
      await runFfmpeg([
        '-nostdin',
        '-y',
        ...inputArgs,
        '-filter_complex', buildConcatFilter(orderedInputs.length),
        '-map', '[out]',
        '-codec:a', 'libmp3lame',
        '-ar', '44100',
        '-ac', '2',
        '-b:a', OUTPUT_BITRATE,
        ...metadataArgs,
        outputPath,
      ], 'compiling debate audio');
      console.info('[debateAudioCompile] FFmpeg complete', { jobId });

      const outputFile = bucket().file(job.outputStoragePath);
      await outputFile.save(await fs.readFile(outputPath), {
        resumable: false,
        contentType: OUTPUT_MIME_TYPE,
        metadata: {
          cacheControl: 'private, max-age=86400',
          metadata: {
            uid: job.uid,
            jobId,
          },
        },
      });

      const [outputMetadata] = await outputFile.getMetadata();
      const downloadExpiresAt = Date.now() + DOWNLOAD_URL_TTL_MS;
      const [downloadUrl] = await outputFile.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: downloadExpiresAt,
      });

      await cleanupStorage(tempStoragePaths);
      await jobRef.update({
        status: 'succeeded',
        outputSizeBytes: Number(outputMetadata.size || 0),
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.info('[debateAudioCompile] Compile succeeded', {
        jobId,
        sizeBytes: Number(outputMetadata.size || 0),
      });

      return {
        jobId,
        downloadUrl,
        storagePath: job.outputStoragePath,
        mimeType: OUTPUT_MIME_TYPE,
        sizeBytes: Number(outputMetadata.size || 0),
        expiresAt: downloadExpiresAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to compile debate audio.';
      await jobRef.update({
        status: 'failed',
        error: message.slice(0, 500),
        updatedAt: FieldValue.serverTimestamp(),
      }).catch(() => undefined);
      console.error('[debateAudioCompile] Compile failed', { jobId, error });
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to compile debate audio.');
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
);
