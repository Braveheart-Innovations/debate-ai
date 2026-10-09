import type { AIConfig } from '../../contract/types';
import type { Artifact } from '../../contract/types/notebook';
import {
  buildAnalyzeReviewerPrompt,
  buildOperatorReviewHandoffPrompt,
  getAnalyzeReviewerSystemPrompt,
  parseAnalyzeReviewItemsFromResponse,
} from '../reviewService';

const reviewer: AIConfig = {
  id: 'reviewer-slot',
  provider: 'openai',
  name: 'ChatGPT',
  model: 'gpt-4.1-mini',
};

const artifacts: Artifact[] = [
  {
    id: 'artifact-1',
    cellId: 'cell-1',
    sessionId: 'session-1',
    name: 'summary.csv',
    type: 'dataset',
    mimeType: 'text/csv',
    data: 'a,b\n1,2',
    createdAt: 1,
  },
];

describe('ReviewService', () => {
  it('parses reviewer items from fenced JSON response', () => {
    const response = `\n\`\`\`json\n{\n  "items": [\n    {\n      "priority": "P1",\n      "confidence": 0.9,\n      "actionType": "verify",\n      "title": "Validate sampling",\n      "details": "Check whether the sample excludes weekends.",\n      "artifactRefs": ["artifact-1", "missing-artifact"],\n      "expectedOutcome": "Confirm representativeness or identify bias.",\n      "estimatedCost": "low"\n    }\n  ]\n}\n\`\`\``;

    const items = parseAnalyzeReviewItemsFromResponse(reviewer, response, artifacts);

    expect(items).toHaveLength(1);
    expect(items[0].priority).toBe('P1');
    expect(items[0].artifactRefs).toEqual(['artifact-1']);
    expect(items[0].reviewerName).toBe('ChatGPT');
  });

  it('repairs a value the model left unterminated instead of dropping the whole pass (2026-10-09)', () => {
    // Claude Sonnet 5.5, live: the closing quote after "P1" was missing.
    const response = '{"items":[{"priority":"P1,"confidence":0.7,"actionType":"countercheck","title":"Benchmark the headline","details":"Compare against official projections.","artifactRefs":["artifact-1"],"expectedOutcome":"A sanity check.","estimatedCost":"low"},{"priority":"P2","confidence":0.6,"actionType":"expand","title":"Add a scenario","details":"Model an accelerating decline.","artifactRefs":[],"expectedOutcome":"A range.","estimatedCost":"med"}]}';

    const items = parseAnalyzeReviewItemsFromResponse(reviewer, response, artifacts);

    expect(items.map((item) => [item.priority, item.title])).toEqual([['P1', 'Benchmark the headline'], ['P2', 'Add a scenario']]);
    // Valid output is untouched by the repair, including values with commas and braces.
    const valid = '{"items":[{"priority":"P0","confidence":0.9,"actionType":"verify","title":"Check a, b} and c","details":"d","artifactRefs":[],"expectedOutcome":"e","estimatedCost":"low"}]}';
    expect(parseAnalyzeReviewItemsFromResponse(reviewer, valid, artifacts)[0].title).toBe('Check a, b} and c');
    expect(parseAnalyzeReviewItemsFromResponse(reviewer, '{"items":[{"priority":', artifacts)).toEqual([]);
  });

  it('builds reviewer prompt with operator context', () => {
    const prompt = buildAnalyzeReviewerPrompt({
      reviewerName: 'ChatGPT',
      userPrompt: 'Analyze revenue volatility by region.',
      operatorName: 'Claude',
      operatorResponse: 'I computed standard deviation by region.',
      artifacts,
      manualRequest: 'Focus on methodology risk.',
    });

    expect(prompt).toContain('Reviewing output from operator: Claude.');
    expect(prompt).toContain('Focus on methodology risk.');
    expect(prompt).toContain('artifact-1');
    // Perspective is gone — no per-reviewer lens lines.
    expect(prompt).not.toContain('Review perspective:');
  });

  it('reviewer system prompt is critique-only with a fixed balanced review stance', () => {
    const prompt = getAnalyzeReviewerSystemPrompt();

    expect(prompt).toContain('You are critique-only. Never call tools.');
    expect(prompt).toContain('balanced analytical judgment');
    expect(prompt).toContain('Return strict JSON only. No markdown fences.');
    expect(prompt).not.toContain('Perspective:');
  });

  it('builds operator handoff prompt with item IDs', () => {
    const handoff = buildOperatorReviewHandoffPrompt('Claude', [
      {
        id: 'review-1',
        reviewerId: 'reviewer-slot',
        reviewerName: 'ChatGPT',
        priority: 'P0',
        confidence: 0.85,
        actionType: 'countercheck',
        title: 'Cross-check outlier handling',
        details: 'Confirm outliers were treated consistently across regions.',
        artifactRefs: ['artifact-1'],
        expectedOutcome: 'Either validate or revise outlier policy notes.',
        estimatedCost: 'med',
        selected: true,
        status: 'pending',
        createdAt: Date.now(),
      },
    ]);

    expect(handoff).toContain('@claude execute the selected review items below.');
    expect(handoff).toContain('[review-1] Cross-check outlier handling');
    expect(handoff).toContain('status: completed | skipped | needs_user_input');
    // The status report is chat-only — a live ARB deck ended up with a raw
    // review-id/status table baked into the report spec before this line.
    expect(handoff).toContain('CHAT REPLY ONLY — never into the report spec');
    expect(handoff).toContain('Do NOT add review logs');
  });
});
