/**
 * The sandbox's run_recipe, run by the local python3 with a stub matplotlib
 * (the real one lives in the template): values replace PARAMS, the recipe
 * gets fresh globals, and unknown names are refused.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RECIPE_RUNNER_SOURCE } from '../../../sandbox/runtime';
import { recipeRunCode } from '../runRecipe';

const PLT_STUB = `
import os as _sym_os, json as _sym_json
class _Plt:
    def close(self, which): pass
    def get_fignums(self): return []
plt = _Plt()
`;

function runPython(dir: string, call: string): string {
  const script = path.join(dir, 'harness.py');
  fs.writeFileSync(script, `${PLT_STUB}\n${RECIPE_RUNNER_SOURCE}\n${call}\n`);
  return execFileSync('python3', ['-I', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

describe('run_recipe', () => {
  let dir: string;
  let recipe: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-'));
    recipe = path.join(dir, 'staffing.recipe.py');
    fs.writeFileSync(recipe, [
      'import json, os',
      'PARAMS = {"staff": 3, "region": "West"}',
      'with open(os.path.join(OUTPUT_DIR, "result.json"), "w") as f:',
      '    json.dump({"params": PARAMS, "name": __name__}, f)',
    ].join('\n'));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const result = () => JSON.parse(fs.readFileSync(path.join(dir, 'staffing', 'result.json'), 'utf8'));

  it('runs with its defaults, writing into OUTPUT_DIR', () => {
    expect(runPython(dir, `run_recipe(${JSON.stringify(recipe)})`)).toContain('Recipe ran');
    expect(result()).toEqual({ params: { staff: 3, region: 'West' }, name: '__main__' });
  });

  it('replaces PARAMS with the given values, as the server sends them', () => {
    const call = recipeRunCode(recipe, { staff: 5, region: 'East "coast"' }).replace(`"/output/${recipe}"`, JSON.stringify(recipe));
    runPython(dir, call);
    expect(result().params).toEqual({ staff: 5, region: 'East "coast"' });
  });

  it('refuses a name PARAMS does not declare', () => {
    expect(() => runPython(dir, `run_recipe(${JSON.stringify(recipe)}, nurses=2)`)).toThrow(/Unknown recipe parameter\(s\): nurses/);
  });

  it('runs in fresh globals, so a recipe leaning on notebook variables fails', () => {
    fs.writeFileSync(recipe, 'PARAMS = {}\nprint(notebook_df)\n');
    expect(() => runPython(dir, `notebook_df = 1\nrun_recipe(${JSON.stringify(recipe)})`)).toThrow(/NameError: name 'notebook_df' is not defined/);
  });
});

describe('recipeRunCode', () => {
  it('names the recipe under /output and passes the values as JSON', () => {
    expect(recipeRunCode('staffing.recipe.py', { staff: 4 }))
      .toBe('run_recipe("/output/staffing.recipe.py", params=_sym_json.loads("{\\"staff\\":4}"))');
  });
});
