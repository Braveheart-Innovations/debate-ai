import { buildAnalyzeReviewerPrompt, buildConversationTurns, buildVerificationTask } from '../reviewService';
import type { Message } from '../../contract/types';
import type { AnalyzeReviewItem } from '../../contract/types/analyze';

const msg = (id: string, senderType: Message['senderType'], content: string, metadata?: Message['metadata']): Message =>
  ({ id, sender: senderType, senderType, content, timestamp: 1, metadata }) as Message;

// Live failure 2026-10-04: the operator asked a clarifying question, the user said
// "yes", and the reviewer was told the user's whole request was "yes".
const messages: Message[] = [
  msg('u1', 'user', 'Fetch median household income by state and compare it with unemployment.'),
  msg('a1', 'ai', 'Should I use ACS 5-year estimates (more coverage) instead of 1-year?'),
  msg('rv', 'ai', 'Review complete.', { providerMetadata: { analyzeReviewer: true } }),
  msg('u2', 'user', 'yes'),
  msg('a2', 'ai', '', { toolCalls: [{ id: 't1', type: 'function', function: { name: 'fetch_api', arguments: '{}' } }] }),
  msg('t1', 'tool', '{"rows": 51}'),
  msg('a3', 'ai', 'Here is the dashboard using ACS 5-year estimates.'),
];

describe('reviewer sees the conversation, not just the last message', () => {
  it('collects user messages and operator replies, skipping tool traffic and reviewer messages', () => {
    expect(buildConversationTurns(messages, 6)).toEqual([
      { role: 'user', content: 'Fetch median household income by state and compare it with unemployment.' },
      { role: 'operator', content: 'Should I use ACS 5-year estimates (more coverage) instead of 1-year?' },
      { role: 'user', content: 'yes' },
    ]);
  });

  it('puts the clarification in the reviewer prompt', () => {
    const prompt = buildAnalyzeReviewerPrompt({
      reviewerName: 'Claude',
      userPrompt: 'yes',
      conversation: buildConversationTurns(messages, 6),
      operatorName: 'ChatGPT',
      operatorResponse: 'Here is the dashboard using ACS 5-year estimates.',
      artifacts: [],
    });
    expect(prompt).toContain('User: Fetch median household income by state');
    expect(prompt).toContain('ChatGPT: Should I use ACS 5-year estimates');
    expect(prompt).toContain('User: yes');
    expect(prompt).not.toContain('Original user prompt:');
  });

  it('also briefs Check independently with the conversation', () => {
    const { task } = buildVerificationTask({
      item: {
        id: 'r1', reviewerId: 'x', reviewerName: 'Claude', priority: 'P1', confidence: 0.7, actionType: 'verify',
        title: 'Check the ACS vintage', details: 'd', artifactRefs: [], expectedOutcome: '', estimatedCost: 'low',
        selected: false, status: 'pending', createdAt: 1,
      } as AnalyzeReviewItem,
      userPrompt: 'yes',
      conversation: buildConversationTurns(messages, 6),
      operatorName: 'ChatGPT',
      operatorResponse: 'Here is the dashboard.',
      evidence: { code: [], sources: [] },
    });
    expect(task).toContain('ChatGPT: Should I use ACS 5-year estimates');
    expect(task).toContain('User: yes');
  });
});
