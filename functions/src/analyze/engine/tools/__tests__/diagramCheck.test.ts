import { checkDiagrams } from '../diagramCheck';
import type { ToolResult } from '../../../contract/lib/ai/tools/types';

const model = {
  version: 1, kind: 'data_model', platform: 'sql', title: 'Orders', summary: 'Customers and orders.',
  entities: [
    { id: 'customers', name: 'customers', fields: [{ name: 'id', primaryKey: true }] },
    { id: 'orders', name: 'orders', fields: [{ name: 'customer_id', required: true }] },
  ],
  relationships: [{
    id: 'orders.customer_id', kind: 'foreign_key', from: 'orders', field: 'customer_id', to: 'customers',
    cardinality: { from: 'zero_or_more', to: 'exactly_one' },
  }],
};

function saved(filename: string, value: unknown): ToolResult {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return {
    toolCallId: 'call-1',
    success: true,
    content: 'Wrote the file.',
    dataOutputs: [{ filename, base64: Buffer.from(text).toString('base64'), size: text.length }],
  } as ToolResult;
}

describe('checkDiagrams', () => {
  it('says a readable diagram is saved, with its size', () => {
    expect(checkDiagrams(saved('orders.diagram.json', model)).content).toBe(
      'Wrote the file.\n\nDiagram saved: /output/orders.diagram.json (2 entities, 1 relationship). The user can open it in Outputs and edit it.',
    );
  });

  it('passes on the review\'s warnings', () => {
    const optional = { ...model, relationships: [{ ...model.relationships[0], cardinality: { from: 'zero_or_more', to: 'zero_or_one' } }] };
    expect(checkDiagrams(saved('/output/orders.diagram.json', optional)).content).toContain(
      'Diagram saved: /output/orders.diagram.json (2 entities, 1 relationship), with warnings the user sees in the editor: relationship "orders.customer_id": "orders.customer_id" is required, but the to end is zero_or_one',
    );
  });

  it('says why a refused diagram is NOT readable', () => {
    const content = checkDiagrams(saved('orders.diagram.json', { ...model, platform: 'oracle' })).content;
    expect(content).toContain('Diagram NOT readable: /output/orders.diagram.json: platform: Invalid option');
    expect(content).toContain('fix these and save it again');
    expect(checkDiagrams(saved('orders.diagram.json', '{"version": 1,')).content).toMatch(/Diagram NOT readable: \/output\/orders\.diagram\.json: it isn't valid JSON/);
  });

  it('leaves other files alone', () => {
    const result = saved('orders.json', model);
    expect(checkDiagrams(result)).toBe(result);
  });
});
