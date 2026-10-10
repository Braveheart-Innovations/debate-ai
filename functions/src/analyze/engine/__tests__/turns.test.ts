import { buildUserMessage } from '../turns';

describe('buildUserMessage', () => {
  it('keeps the mentions and the composer\'s context controls on the message', () => {
    expect(buildUserMessage({
      content: '  Compare regions  ',
      messageId: 'msg_1',
      mentions: ['gemini'],
      context: { selectedConnectorIds: ['fred'], selectedAnalysisLensIds: ['security'] },
    }, 5)).toEqual({
      id: 'msg_1',
      sender: 'You',
      senderType: 'user',
      content: 'Compare regions',
      timestamp: 5,
      mentions: ['gemini'],
      metadata: { selectedConnectorIds: ['fred'], selectedAnalysisLensIds: ['security'] },
    });
  });

  it('writes no metadata when the turn carries none, and keeps rerun summaries', () => {
    expect(buildUserMessage({ content: 'Hi' }, 7)).toEqual({ id: 'msg_7', sender: 'You', senderType: 'user', content: 'Hi', timestamp: 7 });
    const teamRuns = [{ runId: 'r1' }] as never;
    expect(buildUserMessage({ content: 'Rerun', teamRuns, context: { selectedAnalysisLensIds: [] } }, 8).metadata).toEqual({ teamRuns });
  });
});
