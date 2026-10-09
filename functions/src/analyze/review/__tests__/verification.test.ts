import {
  buildOperatorReviewHandoffPrompt,
  buildVerificationTask,
  isVerifiableReviewItem,
  parseVerificationVerdict,
} from '../reviewService';
import type { AnalyzeReviewItem } from '../../contract/types/analyze';

const item = (overrides: Partial<AnalyzeReviewItem> = {}): AnalyzeReviewItem => ({
  id: 'review-1',
  reviewerId: 'slot-gemini',
  reviewerName: 'Gemini',
  priority: 'P0',
  confidence: 0.8,
  actionType: 'verify',
  title: '2024 revenue looks double-counted',
  details: 'Q4 appears in both the quarterly and annual series.',
  artifactRefs: ['revenue.csv'],
  expectedOutcome: 'A single, de-duplicated 2024 total.',
  estimatedCost: 'low',
  selected: false,
  status: 'pending',
  createdAt: 1,
  ...overrides,
});

describe('Verify with tools', () => {
  it('only offers verification for checkable action types', () => {
    expect(isVerifiableReviewItem(item())).toBe(true);
    expect(isVerifiableReviewItem(item({ actionType: 'countercheck' }))).toBe(true);
    expect(isVerifiableReviewItem(item({ actionType: 'reject_claim' }))).toBe(true);
    expect(isVerifiableReviewItem(item({ actionType: 'expand' }))).toBe(false);
    expect(isVerifiableReviewItem(item({ actionType: 'revise' }))).toBe(false);
  });

  it('parses the verdict line and never assumes confirmation', () => {
    expect(parseVerificationVerdict('VERDICT: DISPUTED\nThe total is 4.1M, not 5.2M.'))
      .toEqual({ verdict: 'disputed', summary: 'The total is 4.1M, not 5.2M.' });
    expect(parseVerificationVerdict('**VERDICT: Confirmed** — matches the 10-K.').verdict).toBe('confirmed');
    expect(parseVerificationVerdict('I could not access the source.'))
      .toEqual({ verdict: 'unverifiable', summary: 'I could not access the source.' });
  });

  it('briefs the verifier with the claim, the answer, sources, and code for diagnosis only', () => {
    const { task } = buildVerificationTask({
      item: item(),
      userPrompt: 'What was 2024 revenue?',
      operatorName: 'Claude',
      operatorResponse: '2024 revenue was $5.2M.',
      evidence: { code: ["df = pd.read_csv('/uploads/rev.csv')"], sources: ['https://example.com/10k'] },
    });
    expect(task).toContain('2024 revenue looks double-counted');
    expect(task).toContain('2024 revenue was $5.2M.');
    expect(task).toContain('- https://example.com/10k');
    expect(task).toContain('for diagnosing discrepancies only');
  });

  it('passes verifier evidence to the operator handoff', () => {
    const prompt = buildOperatorReviewHandoffPrompt('Claude', [item({
      verification: { status: 'done', verdict: 'disputed', summary: 'Q4 counted twice; total is 4.1M.', verifierName: 'Gemini', verifierModel: 'gemini-pro' },
    })]);
    expect(prompt).toContain('Independent verification by Gemini: DISPUTED');
    expect(prompt).toContain('Q4 counted twice; total is 4.1M.');
    expect(prompt).toContain("correct this claim in the report using the verifier's evidence");

    const unverifiable = buildOperatorReviewHandoffPrompt('Claude', [item({
      verification: { status: 'done', verdict: 'unverifiable', summary: 'Source offline.', verifierName: 'Gemini', verifierModel: 'gemini-pro' },
    })]);
    expect(unverifiable).toContain('mark it as uncertain in the report');
  });
});
