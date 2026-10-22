import { buildToolResultContentForFollowUp } from '../toolResultHistory';

describe('buildToolResultContentForFollowUp', () => {
  it('lists every file the result kept, however many: the model must know each exists', () => {
    const outputs = Array.from({ length: 18 }, (_, index) => ({ filename: `salesforce-file-${index + 1}.json`, base64: '', size: 2048 }));
    const content = buildToolResultContentForFollowUp({ toolCallId: 'c1', success: true, content: 'Audit index built.', dataOutputs: outputs });
    expect(content).toContain('Durable generated files retained for this run:');
    expect(content).toContain('- /output/salesforce-file-1.json (2.0 KB)');
    expect(content).toContain('- /output/salesforce-file-18.json (2.0 KB)');
    expect(content).not.toContain('omitted');
  });

  it('says a failure as it is, with no instructions after it', () => {
    expect(buildToolResultContentForFollowUp({ toolCallId: 'c1', success: false, error: 'HTTP 404 from the source.' }))
      .toBe('Tool execution failed: HTTP 404 from the source.');
  });
});
