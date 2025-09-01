export const getGeminiLiveWsEndpoint = (): string => {
  // Global Developer API endpoint (WebSocket) per Google documentation
  const envOverride = process.env.EXPO_PUBLIC_GEMINI_LIVE_WS || process.env.GEMINI_LIVE_WS;
  return (envOverride && envOverride.trim()) ||
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
};

export interface GeminiLiveSetup {
  setup: {
    model: string; // e.g., "models/gemini-live-2.5-flash-preview"
    generationConfig?: Record<string, unknown>;
    responseModalities?: Array<'TEXT' | 'AUDIO'>;
    systemInstruction?: unknown; // Content object
    tools?: unknown[]; // Tool declarations
    speechConfig?: unknown; // Voice selection per docs
    sessionResumption?: { handle?: string };
  };
}

