export const getRealtimeRelayUrl = (): string | undefined => {
  // Prefer explicit env for relay URL (e.g., wss://your-relay.example.com)
  const url = process.env.OPENAI_REALTIME_RELAY_URL || process.env.EXPO_PUBLIC_OPENAI_REALTIME_RELAY_URL;
  return url && url.trim().length > 0 ? url.trim() : undefined;
};

export const getRealtimeModel = (): string => {
  // Default to a current preview model; allow override via env
  return (
    process.env.OPENAI_REALTIME_MODEL ||
    process.env.EXPO_PUBLIC_OPENAI_REALTIME_MODEL ||
    'gpt-4o-realtime-preview-2024-10-01'
  );
};

export const isRealtimeConfigured = (): boolean => Boolean(getRealtimeRelayUrl());

