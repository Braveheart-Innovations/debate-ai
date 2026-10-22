import { buildReadGuideTool, guideHint, guideNames, parseGuides, readGuide } from '../guides';

describe('guides', () => {
  it('takes the turn\'s guides as name → text, and ignores anything else', () => {
    expect(parseGuides({ report: 'R', salesforce_flow: 'F' })).toEqual({ report: 'R', salesforce_flow: 'F' });
    // Bad names, non-text and blank texts are left out; nothing usable is no guides.
    expect(parseGuides({ Report: 'R', 'maps guide': 'M', '1st': 'X', model: 3, diagram: '  ', ok: 'yes' })).toEqual({ ok: 'yes' });
    expect(parseGuides(['report'])).toBeUndefined();
    expect(parseGuides('report')).toBeUndefined();
    expect(parseGuides({})).toBeUndefined();
    expect(parseGuides(undefined)).toBeUndefined();
  });

  it('defines read_guide with the run\'s guide names', () => {
    const tool = buildReadGuideTool(guideNames({ report: 'R', model: 'M' }));
    expect(tool).toMatchObject({
      name: 'read_guide',
      description: 'Read the instructions for making one kind of output (a report, a model, a diagram, a Salesforce job) or a data connector\'s documentation, before you make it or call it. A guide you read stays in your context for the rest of this turn.',
      parameters: { type: 'object', properties: { name: { type: 'string', enum: ['model', 'report'], description: 'The guide to read.' } }, required: ['name'] },
    });
  });

  it('returns a guide, or which guides there are', () => {
    const guides = { report: 'The report contract.' };
    expect(readGuide(guides, { name: 'report' })).toEqual({ success: true, content: 'The report contract.' });
    expect(readGuide(guides, { name: 'maps' })).toEqual({ success: false, content: 'There is no guide "maps". The guides are: report.' });
    expect(readGuide(undefined, { name: 'report' })).toEqual({ success: false, content: 'This session has no guides.' });
  });

  it('names a guide in a rejection only when the run has it', () => {
    expect(guideHint({ report: 'R' }, 'report')).toBe(' The how-to is in read_guide("report").');
    expect(guideHint({ report: 'R' }, 'model')).toBe('');
    expect(guideHint(undefined, 'report')).toBe('');
  });
});
