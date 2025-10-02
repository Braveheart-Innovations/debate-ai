import VideoService from '@/services/videos/VideoService';

describe('VideoService', () => {
  it('throws for openai by default', async () => {
    await expect(
      VideoService.generateVideo({ provider: 'openai', apiKey: 'key', prompt: 'story', resolution: '720p', duration: 5 })
    ).rejects.toThrow('not supported');
  });

  it('throws for google provider with specific message', async () => {
    await expect(
      VideoService.generateVideo({ provider: 'google', apiKey: 'key', prompt: 'scene', resolution: '1080p', duration: 10 })
    ).rejects.toThrow('Google API not implemented');
  });

  it('throws for together provider with specific message', async () => {
    await expect(
      VideoService.generateVideo({ provider: 'together', apiKey: 'key', prompt: 'scene', resolution: '1080p', duration: 10 })
    ).rejects.toThrow('Together API not implemented');
  });
});
