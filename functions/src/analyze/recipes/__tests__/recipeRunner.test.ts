/**
 * The sandbox's run_recipe, run by the local python3 with a stub matplotlib
 * (the real one lives in the template): values replace PARAMS, the recipe
 * gets fresh globals, and unknown names are refused.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RECIPE_RUNNER_SOURCE, preCode } from '../../../sandbox/runtime';
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

  it('reads /output and /uploads from _SYM_ROOT when one is set, as a downloaded model does', () => {
    // A model's download bundle runs this same runner with _SYM_ROOT at its own folder.
    fs.mkdirSync(path.join(dir, 'output', 'm'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'output', 'm', 'data.json'), '{"value": 7}');
    fs.writeFileSync(path.join(dir, 'uploads', 'note.txt'), 'hello');
    fs.writeFileSync(path.join(dir, 'output', 'm.recipe.py'), [
      'import json, os',
      'PARAMS = {"name": "note"}',
      'value = json.load(open("/output/m/data.json"))["value"]',
      'note = open(os.path.join("/uploads", f"{PARAMS[\'name\']}.txt")).read()',
      'show_metric("Value", value, detail=note)',
    ].join('\n'));
    runPython(dir, `_SYM_ROOT = ${JSON.stringify(dir)}\nrun_recipe("m.recipe.py")`);
    const results = JSON.parse(fs.readFileSync(path.join(dir, 'output', 'm', 'model.json'), 'utf8'));
    expect(results.items).toEqual([{ kind: 'metric', label: 'Value', value: 7, detail: 'hello' }]);
  });

  it('refuses a name PARAMS does not declare', () => {
    expect(() => runPython(dir, `run_recipe(${JSON.stringify(recipe)}, nurses=2)`)).toThrow(/Unknown recipe parameter\(s\): nurses/);
  });

  it('writes model.json with the values the run used and what the recipe showed, in order', () => {
    fs.writeFileSync(recipe, [
      '"""Clinic staffing."""',
      'PARAMS = {"staff": 3, "rate": 0.5}',
      'rows = [{"staff": s, "wait": 10.0 / s} for s in range(1, 4)]',
      'show_metric("Mean wait", 12.345678, unit="min", detail="M/M/c", decimals=1)',
      'show_metric("Utilization", float("nan"))',
      'show_chart({"mark": "line", "encoding": {"x": {"field": "staff"}}}, data=rows, title="Wait by staff")',
      'show_table(rows, title="By staff")',
      'show_table([[1, "a"], [2, None]], headers=["n", "label"])',
      'show_note("Assumes Poisson arrivals.")',
    ].join('\n'));
    runPython(dir, `run_recipe(${JSON.stringify(recipe)}, staff=4)`);
    const results = JSON.parse(fs.readFileSync(path.join(dir, 'staffing', 'model.json'), 'utf8'));
    expect(results).toEqual({
      version: 1,
      kind: 'model_results',
      values: { staff: 4, rate: 0.5 },
      items: [
        { kind: 'metric', label: 'Mean wait', value: 12.345678, unit: 'min', detail: 'M/M/c', decimals: 1 },
        // NaN can't go in JSON: it reads as no value.
        { kind: 'metric', label: 'Utilization', value: null },
        {
          kind: 'chart',
          title: 'Wait by staff',
          spec: { mark: 'line', encoding: { x: { field: 'staff' } }, data: { values: [{ staff: 1, wait: 10 }, { staff: 2, wait: 5 }, { staff: 3, wait: 10 / 3 }] } },
        },
        { kind: 'table', title: 'By staff', headers: ['staff', 'wait'], rows: [[1, 10], [2, 5], [3, 10 / 3]] },
        { kind: 'table', headers: ['n', 'label'], rows: [[1, 'a'], [2, null]] },
        { kind: 'note', text: 'Assumes Poisson arrivals.' },
      ],
    });
  });

  it('writes model.json even when the recipe shows nothing, so every run records its values', () => {
    runPython(dir, `run_recipe(${JSON.stringify(recipe)})`);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'staffing', 'model.json'), 'utf8')))
      .toEqual({ version: 1, kind: 'model_results', values: { staff: 3, region: 'West' }, items: [] });
  });

  it('writes no model.json when the recipe fails', () => {
    fs.writeFileSync(recipe, 'PARAMS = {}\nshow_note("before")\nraise RuntimeError("boom")\n');
    expect(() => runPython(dir, `run_recipe(${JSON.stringify(recipe)})`)).toThrow(/RuntimeError: boom/);
    expect(fs.existsSync(path.join(dir, 'staffing', 'model.json'))).toBe(false);
  });

  it('runs in fresh globals, so a recipe leaning on notebook variables fails', () => {
    fs.writeFileSync(recipe, 'PARAMS = {}\nprint(notebook_df)\n');
    expect(() => runPython(dir, `notebook_df = 1\nrun_recipe(${JSON.stringify(recipe)})`)).toThrow(/NameError: name 'notebook_df' is not defined/);
  });
});

describe('preCode', () => {
  it('compiles as Python for the operator and for a subagent kernel', () => {
    for (const key of ['main', 'agent-r1']) {
      expect(() => execFileSync('python3', ['-I', '-c', 'import sys; compile(sys.stdin.read(), "pre", "exec")'], {
        input: preCode(key),
        stdio: ['pipe', 'pipe', 'pipe'],
      })).not.toThrow();
    }
  });
});

describe('recipeRunCode', () => {
  it('names the recipe under /output and passes the values as JSON', () => {
    expect(recipeRunCode('staffing.recipe.py', { staff: 4 }))
      .toBe('run_recipe("/output/staffing.recipe.py", params=_sym_json.loads("{\\"staff\\":4}"))');
  });
});
