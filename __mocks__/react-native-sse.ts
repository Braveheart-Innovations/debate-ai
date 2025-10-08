class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  options?: Record<string, unknown>;
  listeners: Record<string, Array<(event: { data?: string | null }) => void>>;
  closed: boolean;

  constructor(url: string, options?: Record<string, unknown>) {
    this.url = url;
    this.options = options;
    this.listeners = {};
    this.closed = false;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, callback: (event: { data?: string | null }) => void) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(callback);
  }

  removeEventListener(type: string, callback: (event: { data?: string | null }) => void) {
    const callbacks = this.listeners[type];
    if (!callbacks) return;
    this.listeners[type] = callbacks.filter(cb => cb !== callback);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data?: string | null) {
    const callbacks = this.listeners[type] || [];
    callbacks.forEach(cb => cb({ data }));
  }

  emitMessage(data?: string | null) {
    this.emit('message', data);
  }

  emitError(message?: string) {
    this.emit('error', message ? JSON.stringify({ message }) : undefined);
  }

  static reset() {
    MockEventSource.instances = [];
  }
}

export default MockEventSource;
export { MockEventSource };
