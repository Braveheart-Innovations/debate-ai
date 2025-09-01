declare module 'expo-webrtc' {
  export const RTCPeerConnection: unknown;
  export const RTCSessionDescription: unknown;
  export const mediaDevices: { getUserMedia: (constraints: unknown) => Promise<unknown> };
  export const RTCView: unknown;
}
