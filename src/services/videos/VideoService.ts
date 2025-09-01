export interface GenerateVideoParams {
  provider: 'openai' | 'google' | 'together' | string;
  apiKey: string;
  prompt: string;
  resolution: '720p' | '1080p';
  duration: 5 | 10 | 15;
}

export interface GeneratedVideoAsset {
  uri: string; // local or remote URL
  mimeType: string;
}

export class VideoService {
  static async generateVideo(params: GenerateVideoParams): Promise<GeneratedVideoAsset[]> {
    const { provider } = params;
    switch (provider) {
      case 'google':
        throw new Error('Video generation via Google API not implemented yet');
      case 'together':
        throw new Error('Video generation via Together API not implemented yet');
      case 'openai':
      default:
        throw new Error('Video generation is not supported for the selected provider');
    }
  }
}

export default VideoService;

