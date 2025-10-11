import { startRecording, recordEvent, stopRecording } from '@/services/demo/Recorder';

describe('Recorder', () => {
  it('captures events only when active', () => {
    expect(stopRecording()).toBeNull();

    startRecording({ type: 'chat', id: 'session-1', title: 'Session' });
    recordEvent({ type: 'message', role: 'user', content: 'Hello' });
    recordEvent({ type: 'message', role: 'assistant', content: 'Hi' });

    const result = stopRecording();
    expect(result).toEqual({
      session: {
        type: 'chat',
        id: 'session-1',
        title: 'Session',
        comboKey: undefined,
        events: [
          { type: 'message', role: 'user', content: 'Hello' },
          { type: 'message', role: 'assistant', content: 'Hi' },
        ],
      },
    });

    // After stopping, additional events are ignored
    recordEvent({ type: 'message', role: 'user', content: 'Ignored' });
    expect(stopRecording()).toBeNull();
  });
});
