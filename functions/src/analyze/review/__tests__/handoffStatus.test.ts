import { buildOperatorReviewHandoffPrompt, parseHandoffStatuses } from '../reviewService';
import type { AnalyzeReviewItem } from '../../contract/types/analyze';

const IDS = ['review-run_1-0-0', 'review-run_1-0-1', 'review-run_1-0-3'];

describe('parseHandoffStatuses', () => {
  it('reads bracketed ids with reasons and questions', () => {
    const reply = [
      'Done. Summary:',
      '[review-run_1-0-0] completed',
      '[review-run_1-0-1] skipped — the report already renders the spec as a dashboard; a markdown copy would duplicate it.',
      '[review-run_1-0-3] needs_user_input — Which Python version will production run on: 3.9 or 3.12?',
    ].join('\n');
    const statuses = parseHandoffStatuses(reply, IDS);
    expect(statuses.get(IDS[0])).toEqual({ status: 'completed', note: '' });
    expect(statuses.get(IDS[1])).toEqual({ status: 'skipped', note: 'the report already renders the spec as a dashboard; a markdown copy would duplicate it.' });
    expect(statuses.get(IDS[2])).toEqual({ status: 'needs_user_input', note: 'Which Python version will production run on: 3.9 or 3.12?' });
  });

  it('reads items by their number when the model drops the ids (the Grok reply)', () => {
    const statuses = parseHandoffStatuses('**Item 1**: completed  \n**Item 2**: skipped  \n**Item 3**: completed', IDS);
    expect(statuses.get(IDS[0])?.status).toBe('completed');
    expect(statuses.get(IDS[1])).toEqual({ status: 'skipped', note: '' });
    expect(statuses.get(IDS[2])?.status).toBe('completed');
  });

  it('takes a reason from the lines under the item, and other spellings of the status', () => {
    const reply = '2. **Needs user input**\n   Do you want Flask 2.x or 3.x in the comparison?\n\n1. Completed';
    const statuses = parseHandoffStatuses(reply, IDS);
    expect(statuses.get(IDS[1])).toEqual({ status: 'needs_user_input', note: 'Do you want Flask 2.x or 3.x in the comparison?' });
    expect(statuses.get(IDS[0])?.status).toBe('completed');
    expect(statuses.has(IDS[2])).toBe(false);
  });

  it('ignores a reply that names no items', () => {
    expect(parseHandoffStatuses('All done, the report is updated.', IDS).size).toBe(0);
    expect(parseHandoffStatuses('', IDS).size).toBe(0);
  });
});

describe('buildOperatorReviewHandoffPrompt with handed-back items', () => {
  const base: AnalyzeReviewItem = {
    id: 'review-9', reviewerId: 'r', reviewerName: 'Gemini', priority: 'P1', confidence: 0.8, actionType: 'revise',
    title: 'Add a risk matrix', details: 'd', artifactRefs: [], expectedOutcome: 'e', estimatedCost: 'low',
    selected: true, status: 'pending', createdAt: 1,
  };

  it('carries the operator\'s question and the user\'s answer', () => {
    const prompt = buildOperatorReviewHandoffPrompt('Claude', [{
      ...base,
      operatorResponse: { status: 'needs_user_input', note: 'Which risk tolerance should I assume?', respondedAt: 2 },
    }], { 'review-9': 'Low: this is a payments service.' });
    expect(prompt).toContain('You asked the user: Which risk tolerance should I assume?');
    expect(prompt).toContain("The user's answer: Low: this is a payments service.");
  });

  it('says when the user sent it back without an answer, and when a skipped item comes back', () => {
    const noAnswer = buildOperatorReviewHandoffPrompt('Claude', [{ ...base, operatorResponse: { status: 'needs_user_input', note: 'Q?', respondedAt: 2 } }]);
    expect(noAnswer).toContain('proceed with your best judgment and say what you assumed');
    const skipped = buildOperatorReviewHandoffPrompt('Claude', [{ ...base, operatorResponse: { status: 'skipped', note: 'out of scope', respondedAt: 2 } }]);
    expect(skipped).toContain('You skipped this before (out of scope). The user sent it back');
  });
});
