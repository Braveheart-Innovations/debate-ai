/**
 * The app's process simulator (web models/processSimulator.ts, carried by the
 * runner), run through run_recipe by the local python3 with SimPy: a recipe
 * simulates a diagram file with overrides and draws the results, and the
 * engine agrees with queueing theory. CI installs simpy==4.1.2 (the
 * template's pin) before the tests.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RECIPE_RUNNER_SOURCE } from '../../../sandbox/runtime';

const PLT_STUB = `
import os as _sym_os, json as _sym_json
class _Plt:
    def close(self, which): pass
    def get_fignums(self): return []
plt = _Plt()
`;

function python(dir: string, code: string): string {
  const script = path.join(dir, 'harness.py');
  fs.writeFileSync(script, `${PLT_STUB}\n${RECIPE_RUNNER_SOURCE}\n${code}\n`);
  return execFileSync('python3', ['-I', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const dropOff = {
  version: 1, kind: 'process_flow', title: 'Morning drop-off', summary: 's', timeUnit: 'minutes',
  nodes: [
    { id: 'arrive', type: 'start', label: 'Families arrive', arrivals: { type: 'exponential', mean: 2 } },
    { id: 'checkin', type: 'step', label: 'Check in', duration: { type: 'triangular', min: 1, mode: 2, max: 4 }, resource: 'desk' },
    { id: 'complete', type: 'decision', label: 'Paperwork complete?' },
    { id: 'fix', type: 'step', label: 'Fix paperwork', duration: { type: 'uniform', min: 3, max: 8 } },
    { id: 'done', type: 'end', label: 'Child in class' },
  ],
  flows: [
    { id: 'f1', from: 'arrive', to: 'checkin' }, { id: 'f2', from: 'checkin', to: 'complete' },
    { id: 'f3', from: 'complete', to: 'done', share: 0.85 }, { id: 'f4', from: 'complete', to: 'fix', share: 0.15 },
    { id: 'f5', from: 'fix', to: 'done' },
  ],
  resources: [{ id: 'desk', label: 'Front desk staff', capacity: 1 }],
  run: { duration: 480, warmup: 30, replications: 10, seed: 7 },
};

describe('the process simulator', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'simulate-'));
    fs.writeFileSync(path.join(dir, 'dropoff.diagram.json'), JSON.stringify(dropOff));
  });

  it('runs from a recipe with overrides, and draws metrics, charts, a table and a note into model.json', () => {
    const recipe = path.join(dir, 'dropoff.recipe.py');
    fs.writeFileSync(recipe, [
      '"""Morning drop-off\nHow desk staffing changes the wait."""',
      'PARAMS = {"desk_staff": 1}',
      `results = simulate_process(${JSON.stringify(path.join(dir, 'dropoff.diagram.json'))}, overrides={"desk.capacity": PARAMS["desk_staff"]})`,
      'show_simulation(results)',
    ].join('\n'));
    python(dir, `run_recipe(${JSON.stringify(recipe)}, params={"desk_staff": 2})`);
    const results = JSON.parse(fs.readFileSync(path.join(dir, 'dropoff', 'model.json'), 'utf8'));
    expect(results.values).toEqual({ desk_staff: 2 });
    expect(results.items.map((item: { kind: string }) => item.kind)).toEqual(['metric', 'metric', 'metric', 'metric', 'chart', 'chart', 'table', 'note']);
    expect(results.items[0]).toMatchObject({ label: 'Finished per minute' });
    expect(results.items[6].headers).toEqual(['Step', 'Who', 'Average wait (min)', '9 in 10 wait under (min)', 'Busy', 'Average queue', 'Served per run']);
    expect(results.items[7].text).toContain('10 runs of 480 min');
  });

  it('is repeatable for a seed, and two desks cut the wait at an overloaded one', () => {
    const out = python(dir, [
      `flow = ${JSON.stringify(path.join(dir, 'dropoff.diagram.json'))}`,
      'one = _sym_simulate_process(flow)',
      'again = _sym_simulate_process(flow)',
      'two = _sym_simulate_process(flow, overrides={"desk.capacity": 2})',
      'print(_sym_json.dumps({"same": one["cycle_time"] == again["cycle_time"], "one": one["steps"][0]["wait"]["mean"], "two": two["steps"][0]["wait"]["mean"], "util": one["steps"][0]["utilization"]["mean"]}))',
    ].join('\n'));
    const { same, one, two, util } = JSON.parse(out.trim().split('\n').pop()!);
    expect(same).toBe(true);
    expect(util).toBeGreaterThan(0.95);
    expect(one).toBeGreaterThan(10 * two);
  });

  it('matches M/M/1 queueing theory', () => {
    const out = python(dir, [
      'mm1 = {"version": 1, "kind": "process_flow", "title": "MM1", "summary": "s", "timeUnit": "minutes",',
      '  "nodes": [{"id": "a", "type": "start", "label": "a", "arrivals": {"type": "exponential", "mean": 2}},',
      '            {"id": "s", "type": "step", "label": "s", "duration": {"type": "exponential", "mean": 1}},',
      '            {"id": "e", "type": "end", "label": "e"}],',
      '  "flows": [{"id": "1", "from": "a", "to": "s"}, {"id": "2", "from": "s", "to": "e"}],',
      '  "run": {"duration": 20000, "warmup": 500, "replications": 10, "seed": 3}}',
      'm = _sym_simulate_process(mm1)["steps"][0]',
      'print(_sym_json.dumps({"wait": m["wait"]["mean"], "util": m["utilization"]["mean"]}))',
    ].join('\n'));
    const { wait, util } = JSON.parse(out.trim().split('\n').pop()!);
    // λ = 0.5/min, μ = 1/min: Wq = ρ / (μ − λ) = 1 minute, utilization ρ = 0.5.
    expect(wait).toBeGreaterThan(0.9);
    expect(wait).toBeLessThan(1.1);
    expect(util).toBeGreaterThan(0.47);
    expect(util).toBeLessThan(0.53);
  });

  it('refuses overrides it can\'t apply, and anything but a process flow', () => {
    const out = python(dir, [
      `flow = ${JSON.stringify(path.join(dir, 'dropoff.diagram.json'))}`,
      'messages = []',
      'for overrides in ({"checkin.capacity": 3}, {"nope.mean": 3}, {"f1.capacity": 2}):',
      '    try:',
      '        _sym_simulate_process(flow, overrides=overrides)',
      '    except KeyError as error:',
      '        messages.append(str(error))',
      'try:',
      '    _sym_simulate_process({"kind": "data_model"})',
      'except ValueError as error:',
      '    messages.append(str(error))',
      'print(_sym_json.dumps(messages))',
    ].join('\n'));
    const messages: string[] = JSON.parse(out.trim().split('\n').pop()!);
    expect(messages[0]).toContain("checkin uses the shared resource 'desk'; override 'desk.capacity' instead");
    expect(messages[1]).toContain("no node, resource or flow is called 'nope'");
    expect(messages[2]).toContain('a flow only has a share');
    expect(messages[3]).toContain('simulate_process takes a process flow diagram');
  });
});
