import APIKeyService from '../APIKeyService';

export class TranscriptionService {
  static async transcribeWithOpenAI(audioUri: string, mimeType: string = 'audio/m4a', fileName: string = 'audio.m4a'): Promise<string> {
    const apiKey = await APIKeyService.getKey('openai');
    if (!apiKey) throw new Error('OpenAI API key not configured');

    const formData = new FormData();
    const file: { uri: string; type: string; name: string } = {
      uri: audioUri,
      type: mimeType,
      name: fileName,
    };
    // React Native FormData file param
    formData.append('file', file as unknown as Blob);
    formData.append('model', 'whisper-1');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Transcription failed: ${res.status} ${err}`);
    }
    const data = await res.json();
    return data.text as string;
  }
}

export default TranscriptionService;
