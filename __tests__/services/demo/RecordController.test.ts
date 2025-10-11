import { Platform } from 'react-native';

const mockStartRecording = jest.fn();
const mockRecordEvent = jest.fn();
const mockStopRecording = jest.fn(() => ({ session: { events: [], type: 'chat', id: 'session-1', title: 'Chat', comboKey: 'openai+claude' } }));
const mockIngestRecording = jest.fn();

jest.mock('@/services/demo/Recorder', () => ({
  startRecording: (...args: unknown[]) => mockStartRecording(...args),
  recordEvent: (...args: unknown[]) => mockRecordEvent(...args),
  stopRecording: () => mockStopRecording(),
}));

jest.mock('@/services/demo/DemoContentService', () => ({
  DemoContentService: {
    ingestRecording: (...args: unknown[]) => mockIngestRecording(...args),
  },
}));

const loadController = () => {
  let controller: typeof import('@/services/demo/RecordController').RecordController;
  jest.isolateModules(() => {
    controller = require('@/services/demo/RecordController').RecordController;
  });
  return controller!;
};

describe('RecordController', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00Z'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('records chat sessions and stops with metadata', () => {
    const controller = loadController();
    expect(controller.isActive()).toBe(false);

    controller.startChat({ id: 'chat-1', title: 'Demo Chat', comboKey: 'openai+claude' });
    expect(controller.isActive()).toBe(true);
    expect(mockStartRecording).toHaveBeenCalledWith({ type: 'chat', id: 'chat-1', title: 'Demo Chat', comboKey: 'openai+claude' });
    expect(mockRecordEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'divider',
      meta: expect.objectContaining({ screen: 'chat', platform: Platform.OS }),
    }));

    controller.recordUserMessage('Hello there');
    controller.recordAssistantMessage('openai', 'Hi');
    controller.recordAssistantChunk('openai', ' streaming');
    expect(mockRecordEvent).toHaveBeenCalledWith(expect.objectContaining({ role: 'assistant', content: ' streaming' }));

    const result = controller.stop();
    expect(result?.session).toBeDefined();
    expect(mockStopRecording).toHaveBeenCalled();
    expect(mockIngestRecording).toHaveBeenCalledWith(expect.objectContaining({ id: 'session-1' }));
    expect(controller.isActive()).toBe(false);
  });

  it('enriches compare sessions with runs', () => {
    const controller = loadController();
    mockStopRecording.mockReturnValueOnce({ session: { events: [], type: 'compare', id: 'compare-1', title: 'Compare' } });

    controller.startCompare({ id: 'compare-1', title: 'Compare', comboKey: 'openai+claude' });
    controller.recordUserMessage('Prompt');
    controller.recordAssistantChunk('claude', 'Answer');
    controller.recordAssistantMessage('openai', 'Response');

    const res = controller.stop();
    const session = res?.session as { runs?: any[] };
    expect(session?.runs?.length).toBe(1);
    const columns = session?.runs?.[0]?.columns;
    expect(columns).toEqual([
      expect.objectContaining({ name: 'Claude', events: [expect.objectContaining({ content: 'Answer', speakerProvider: 'claude' })] }),
      expect.objectContaining({ name: 'OpenAI', events: [expect.objectContaining({ content: 'Response', speakerProvider: 'openai' })] }),
    ]);
  });

  it('adds debate metadata and prevents double start', () => {
    const controller = loadController();
    mockStopRecording.mockReturnValueOnce({ session: { events: [], type: 'debate', id: 'debate-1', title: 'Topic' } });

    controller.startDebate({ id: 'debate-1', topic: 'Debate Topic', participants: ['claude', 'openai'] });
    controller.startDebate({ id: 'ignored', topic: 'Duplicate' });
    expect(mockStartRecording).toHaveBeenCalledTimes(1);

    const result = controller.stop();
    const session = result?.session as { topic?: string; participants?: string[] };
    expect(session.topic).toBe('Debate Topic');
    expect(session.participants).toEqual(['claude', 'openai']);
  });

  it('ignores recording when inactive', () => {
    const controller = loadController();
    controller.recordUserMessage('ignored');
    controller.recordAssistantChunk('openai', 'chunk');
    controller.recordAssistantMessage('openai', 'msg');
    controller.recordImageMarkdown('uri');
    expect(mockRecordEvent).not.toHaveBeenCalled();
    expect(controller.stop()).toBeNull();
  });
});
