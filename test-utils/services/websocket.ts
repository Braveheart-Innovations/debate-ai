export class WebSocketMock {
  public readonly sent: unknown[] = [];
  public onopen: ((event?: unknown) => void) | null = null;
  public onmessage: ((event: { data: unknown }) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public onclose: ((event?: unknown) => void) | null = null;
  public readonly close = jest.fn((event?: unknown) => {
    this.onclose?.(event);
  });

  constructor(public readonly url: string, public readonly protocols?: string[]) {}

  send(payload: unknown) {
    this.sent.push(payload);
  }

  emitOpen(payload?: unknown) {
    this.onopen?.(payload);
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data });
  }

  emitError(error: unknown) {
    this.onerror?.(error);
  }

  emitClose(payload?: unknown) {
    this.onclose?.(payload);
  }
}

export const installWebSocketMock = (socket: WebSocketMock) => {
  const original = (globalThis as Record<string, unknown>).WebSocket;
  (globalThis as Record<string, unknown>).WebSocket = jest.fn(() => socket);
  return () => {
    (globalThis as Record<string, unknown>).WebSocket = original;
  };
};
