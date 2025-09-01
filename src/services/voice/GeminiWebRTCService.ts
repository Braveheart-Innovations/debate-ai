// Gemini Realtime (WebRTC) - BYOK scaffold
// Note: Implementation details may differ; this service is a placeholder
// to mirror the OpenAI flow and will be completed after confirming endpoints.

export interface GeminiWebRTCOptions {
  model?: string;
}

export class GeminiWebRTCService {
  async startWebRTC(_opts?: GeminiWebRTCOptions): Promise<void> {
    throw new Error('Gemini Realtime WebRTC not implemented yet. Add endpoints and SDP flow.');
  }
}

export default GeminiWebRTCService;

