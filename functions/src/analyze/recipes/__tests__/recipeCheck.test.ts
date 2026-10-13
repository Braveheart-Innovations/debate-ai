import { checkRecipes } from '../../engine/tools/recipeCheck';

const b64 = (text: string) => Buffer.from(text).toString('base64');
const result = (outputs: Array<{ filename: string; text: string }>) => ({
  toolCallId: 'call-1',
  success: true,
  content: 'Executed successfully.',
  dataOutputs: outputs.map((output) => ({ filename: output.filename, base64: b64(output.text), size: output.text.length })),
});

describe('checkRecipes', () => {
  it('names a saved recipe\'s parameters, or says why it has no controls', () => {
    expect(checkRecipes(result([{ filename: 'staffing.recipe.py', text: 'PARAMS = {"staff": 3, "rate": 1.5}\n' }])).content)
      .toContain('Model saved: /output/staffing.recipe.py with parameters staff, rate.');
    expect(checkRecipes(result([{ filename: 'staffing.recipe.py', text: 'PARAMS = {"staff": STAFF}\n' }])).content)
      .toContain('Model saved WITHOUT controls: /output/staffing.recipe.py: "STAFF" is not a literal');
  });

  it('flags a model.json that does not match the results format, and passes one that does', () => {
    const bad = checkRecipes(result([{ filename: 'staffing/model.json', text: '{"version": 1, "kind": "model_results", "values": {}, "items": [{"kind": "metric"}]}' }]));
    expect(bad.content).toContain('Model results NOT readable: /output/staffing/model.json: items.0.label');
    const good = result([{ filename: 'staffing/model.json', text: '{"version": 1, "kind": "model_results", "values": {"staff": 3}, "items": [{"kind": "note", "text": "ok"}]}' }]);
    expect(checkRecipes(good)).toBe(good);
  });

  it('leaves other outputs alone', () => {
    const plain = result([{ filename: 'summary.csv', text: 'a,b\n1,2\n' }, { filename: 'notes/model.json.bak', text: '{}' }]);
    expect(checkRecipes(plain)).toBe(plain);
  });
});
