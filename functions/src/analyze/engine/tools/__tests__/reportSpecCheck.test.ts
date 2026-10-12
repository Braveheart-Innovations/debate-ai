import { checkReportSpecs, reportSpecProblem } from '../reportSpecCheck';
import type { ToolResult } from '../../../contract/lib/ai/tools/types';

const VALID = {
  version: 1,
  kind: 'analysis_artifact_spec',
  title: 'Births',
  summary: 'Fertility by region.',
  pages: [{ slug: 'index', title: 'Overview', blocks: [{ kind: 'markdown', markdown: 'Text.' }] }],
};

function dataOutput(filename: string, text: string) {
  return { filename, base64: Buffer.from(text, 'utf8').toString('base64'), size: text.length };
}

function result(...outputs: ReturnType<typeof dataOutput>[]): ToolResult {
  return { toolCallId: 'call-1', success: true, content: 'Executed successfully.', dataOutputs: outputs };
}

describe('reportSpecProblem', () => {
  it('passes a report that reads, and JSON that is not a report', () => {
    expect(reportSpecProblem(JSON.stringify(VALID))).toBeNull();
    expect(reportSpecProblem('{"rows": [1, 2]}')).toBeNull();
    expect(reportSpecProblem('not json')).toBeNull();
  });

  it('passes a report written with Python NaN (read as null)', () => {
    const text = JSON.stringify({ ...VALID, pages: [{ ...VALID.pages[0], blocks: [{ kind: 'table', headers: ['A', 'B'], rows: [['x', '__N__']] }] }] })
      .replace('"__N__"', 'NaN');
    expect(reportSpecProblem(text)).toBeNull();
  });

  it('names broken JSON', () => {
    expect(reportSpecProblem('{"version": 1, "kind": "analysis_artifact_spec", "pages": [')).toMatch(/isn't valid JSON/);
  });

  it('lists every format error', () => {
    const problem = reportSpecProblem(JSON.stringify({ ...VALID, pages: [{ slug: 'index', title: 'Overview', blocks: [{ kind: 'table' }] }] }));
    expect(problem).toMatch(/doesn't match the report format/);
    expect(problem).toMatch(/headers/);
  });
});

describe('checkReportSpecs', () => {
  it('leaves a result with a readable report alone', () => {
    const input = result(dataOutput('/output/report.json', JSON.stringify(VALID)));
    expect(checkReportSpecs(input)).toBe(input);
  });

  it('tells the model a report that does not read was not saved, and keeps the file', () => {
    const checked = checkReportSpecs(result(dataOutput('/output/report.json', '{"kind": "analysis_artifact_spec", "version": 1, oops}')));
    expect(checked.content).toMatch(/^Executed successfully\.\n\nReport NOT saved: \/output\/report\.json declares itself a report/);
    expect(checked.content).toMatch(/Fix it and save the report again/);
    expect(checked.dataOutputs).toHaveLength(1);
  });
});
