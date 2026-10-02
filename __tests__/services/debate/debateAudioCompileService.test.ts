import * as FileSystem from 'expo-file-system/legacy';
import { getFunctions, httpsCallable, type HttpsCallableResult } from '@react-native-firebase/functions';
import {
  buildCompileSessionRequest,
  compileDebateVoicePack,
  DEBATE_AUDIO_COMPILE_TIMEOUT_MS,
  DEBATE_AUDIO_CREATE_SESSION_TIMEOUT_MS,
  DEBATE_AUDIO_DOWNLOAD_TIMEOUT_MS,
  DEBATE_AUDIO_UPLOAD_TIMEOUT_MS,
} from '@/services/debate/debateAudioCompileService';
import type { DebateVoicePackManifest } from '@/types/media';

type GetInfoAsync = typeof FileSystem.getInfoAsync;
type UploadAsync = typeof FileSystem.uploadAsync;
type DownloadAsync = typeof FileSystem.downloadAsync;
type MakeDirectoryAsync = typeof FileSystem.makeDirectoryAsync;

/** getInfoAsync fake reporting every clip as an existing file of `sizeFor(uri)` bytes. */
const mockGetInfoAsync = (sizeFor: (uri: string) => number) =>
  jest.fn<ReturnType<GetInfoAsync>, Parameters<GetInfoAsync>>(async (uri) => ({
    exists: true,
    uri,
    size: sizeFor(uri),
    isDirectory: false,
    modificationTime: 0,
  }));

const mockUploadAsync = () =>
  jest.fn<ReturnType<UploadAsync>, Parameters<UploadAsync>>()
    .mockResolvedValue({ status: 200, body: '', headers: {}, mimeType: null });

const mockDownloadAsync = () => jest.fn<ReturnType<DownloadAsync>, Parameters<DownloadAsync>>();

const mockMakeDirectoryAsync = () =>
  jest.fn<ReturnType<MakeDirectoryAsync>, Parameters<MakeDirectoryAsync>>().mockResolvedValue(undefined);

/** A Firebase HttpsCallable stub resolving with `data`. */
const mockCallable = (data: unknown) =>
  Object.assign(
    jest.fn<Promise<HttpsCallableResult<unknown>>, [unknown?]>().mockResolvedValue({ data }),
    { stream: jest.fn() }
  );

describe('debateAudioCompileService', () => {
  const manifest: DebateVoicePackManifest = {
    kind: 'debate_podcast_playlist',
    version: 1,
    sessionId: 'debate_1',
    topic: 'Resolved: testing matters.',
    participants: [{ id: 'openai', name: 'ChatGPT' }],
    clips: [
      {
        id: 'clip_1',
        messageId: 'msg_1',
        order: 0,
        speakerId: 'openai',
        speakerName: 'ChatGPT',
        speechLabel: 'Opening statement',
        textPreview: 'Opening statement.',
        uri: 'file:///packs/debate_1/001.mp3',
        mimeType: 'audio/mpeg',
        fileName: '001.mp3',
        pauseAfterMs: 900,
      },
      {
        id: 'clip_2',
        messageId: 'msg_2',
        order: 1,
        speakerId: 'google',
        speakerName: 'Gemini',
        speechLabel: 'Opening response',
        textPreview: 'Opening response.',
        uri: 'file:///packs/debate_1/002.mp3',
        mimeType: 'audio/mpeg',
        fileName: '002.mp3',
        pauseAfterMs: 900,
      },
    ],
    pauseMs: 900,
    directoryUri: 'file:///packs/debate_1/',
    createdAt: 1000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds compile session clip metadata from local files', async () => {
    const getInfoAsync = mockGetInfoAsync((uri) => (uri.endsWith('001.mp3') ? 1024 : 2048));

    await expect(buildCompileSessionRequest(manifest, getInfoAsync)).resolves.toEqual({
      topic: manifest.topic,
      clips: [
        {
          id: 'clip_1',
          fileName: '001.mp3',
          mimeType: 'audio/mpeg',
          sizeBytes: 1024,
          pauseAfterMs: 900,
        },
        {
          id: 'clip_2',
          fileName: '002.mp3',
          mimeType: 'audio/mpeg',
          sizeBytes: 2048,
          pauseAfterMs: 900,
        },
      ],
    });
  });

  it('uploads clips, compiles the pack, and downloads the single MP3', async () => {
    const getInfoAsync = mockGetInfoAsync(() => 1024);
    const uploadAsync = mockUploadAsync();
    const downloadAsync = mockDownloadAsync()
      .mockResolvedValue({ uri: 'file:///packs/debate_1/compiled_job-1.mp3', status: 200, headers: {}, mimeType: null });
    const makeDirectoryAsync = mockMakeDirectoryAsync();
    const onStageChange = jest.fn();
    const createSession = jest.fn().mockResolvedValue({
      jobId: 'job-1',
      outputMimeType: 'audio/mpeg',
      uploadUrls: [
        {
          clipId: 'clip_1',
          uploadUrl: 'https://upload.example/clip-1',
          storagePath: 'tmp/clip-1.mp3',
          expiresAt: 2000,
          contentType: 'audio/mpeg',
        },
        {
          clipId: 'clip_2',
          uploadUrl: 'https://upload.example/clip-2',
          storagePath: 'tmp/clip-2.mp3',
          expiresAt: 2000,
          contentType: 'audio/mpeg',
        },
      ],
    });
    const compilePack = jest.fn().mockResolvedValue({
      jobId: 'job-1',
      downloadUrl: 'https://download.example/output.mp3',
      storagePath: 'tmp/output.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 4096,
      expiresAt: 3000,
    });

    await expect(compileDebateVoicePack(manifest, {
      now: () => 1500,
      getInfoAsync,
      uploadAsync,
      downloadAsync,
      makeDirectoryAsync,
      createSession,
      compilePack,
      onStageChange,
    })).resolves.toEqual({
      id: 'job-1',
      uri: 'file:///packs/debate_1/compiled_job-1.mp3',
      mimeType: 'audio/mpeg',
      fileName: 'compiled_job-1.mp3',
      createdAt: 1500,
      remoteUrl: 'https://download.example/output.mp3',
      storagePath: 'tmp/output.mp3',
      expiresAt: 3000,
    });

    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      topic: manifest.topic,
      clips: expect.arrayContaining([
        expect.objectContaining({ id: 'clip_1', sizeBytes: 1024 }),
      ]),
    }));
    expect(uploadAsync).toHaveBeenCalledWith(
      'https://upload.example/clip-1',
      'file:///packs/debate_1/001.mp3',
      expect.objectContaining({
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        sessionType: 1,
        headers: { 'Content-Type': 'audio/mpeg' },
      })
    );
    expect(compilePack).toHaveBeenCalledWith({ jobId: 'job-1' });
    expect(makeDirectoryAsync).toHaveBeenCalledWith('file:///packs/debate_1/', { intermediates: true });
    expect(downloadAsync).toHaveBeenCalledWith(
      'https://download.example/output.mp3',
      'file:///packs/debate_1/compiled_job-1.mp3',
      { sessionType: 1 }
    );
    expect(onStageChange).toHaveBeenNthCalledWith(1, 'preparing');
    expect(onStageChange).toHaveBeenNthCalledWith(2, 'creating_session');
    expect(onStageChange).toHaveBeenNthCalledWith(3, 'uploading');
    expect(onStageChange).toHaveBeenNthCalledWith(4, 'compiling');
    expect(onStageChange).toHaveBeenNthCalledWith(5, 'downloading');
  });

  it('uses the static Firebase Functions callable path for podcast compile', async () => {
    // The jest.setup.ts functions mock's own instance, pinned so call args can be matched.
    const functions = getFunctions();
    const createCallable = mockCallable({
      jobId: 'job-1',
      outputMimeType: 'audio/mpeg',
      uploadUrls: [
        {
          clipId: 'clip_1',
          uploadUrl: 'https://upload.example/clip-1',
          storagePath: 'tmp/clip-1.mp3',
          expiresAt: 2000,
          contentType: 'audio/mpeg',
        },
        {
          clipId: 'clip_2',
          uploadUrl: 'https://upload.example/clip-2',
          storagePath: 'tmp/clip-2.mp3',
          expiresAt: 2000,
          contentType: 'audio/mpeg',
        },
      ],
    });
    const compileCallable = mockCallable({
      jobId: 'job-1',
      downloadUrl: 'https://download.example/output.mp3',
      storagePath: 'tmp/output.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 4096,
      expiresAt: 3000,
    });
    const getInfoAsync = mockGetInfoAsync(() => 1024);
    const uploadAsync = mockUploadAsync();
    const downloadAsync = mockDownloadAsync()
      .mockResolvedValue({ uri: 'file:///packs/debate_1/compiled_job-1.mp3', status: 200, headers: {}, mimeType: null });
    const makeDirectoryAsync = mockMakeDirectoryAsync();

    jest.mocked(getFunctions).mockReturnValue(functions);
    jest.mocked(httpsCallable)
      .mockReturnValueOnce(createCallable)
      .mockReturnValueOnce(compileCallable);

    await expect(compileDebateVoicePack(manifest, {
      now: () => 1500,
      getInfoAsync,
      uploadAsync,
      downloadAsync,
      makeDirectoryAsync,
    })).resolves.toEqual(expect.objectContaining({
      id: 'job-1',
      uri: 'file:///packs/debate_1/compiled_job-1.mp3',
    }));

    expect(httpsCallable).toHaveBeenNthCalledWith(
      1,
      functions,
      'createDebateAudioCompileSession',
      { timeout: DEBATE_AUDIO_CREATE_SESSION_TIMEOUT_MS }
    );
    expect(httpsCallable).toHaveBeenNthCalledWith(
      2,
      functions,
      'compileDebateAudioPack',
      { timeout: DEBATE_AUDIO_COMPILE_TIMEOUT_MS }
    );
    expect(createCallable).toHaveBeenCalledWith(expect.objectContaining({ topic: manifest.topic }));
    expect(compileCallable).toHaveBeenCalledWith({ jobId: 'job-1' });
  });

  it('rejects instead of spinning forever when the compile callable does not settle', async () => {
    const getInfoAsync = mockGetInfoAsync(() => 1024);
    const uploadAsync = mockUploadAsync();
    const downloadAsync = mockDownloadAsync();
    const makeDirectoryAsync = mockMakeDirectoryAsync();
    const createSession = jest.fn().mockResolvedValue({
      jobId: 'job-1',
      outputMimeType: 'audio/mpeg',
      uploadUrls: [
        {
          clipId: 'clip_1',
          uploadUrl: 'https://upload.example/clip-1',
          storagePath: 'tmp/clip-1.mp3',
          expiresAt: 2000,
          contentType: 'audio/mpeg',
        },
        {
          clipId: 'clip_2',
          uploadUrl: 'https://upload.example/clip-2',
          storagePath: 'tmp/clip-2.mp3',
          expiresAt: 2000,
          contentType: 'audio/mpeg',
        },
      ],
    });
    const compilePack = jest.fn(() => new Promise<never>(() => undefined));

    const promise = compileDebateVoicePack(manifest, {
      getInfoAsync,
      uploadAsync,
      downloadAsync,
      makeDirectoryAsync,
      createSession,
      compilePack,
      uploadTimeoutMs: DEBATE_AUDIO_UPLOAD_TIMEOUT_MS,
      compileTimeoutMs: 1,
      downloadTimeoutMs: DEBATE_AUDIO_DOWNLOAD_TIMEOUT_MS,
    });

    await expect(promise).rejects.toThrow('Podcast generation timed out while compiling the podcast');
    expect(downloadAsync).not.toHaveBeenCalled();
  });
});
