import { isRecipeFilename, parseRecipeParams, recipeOutputDir, validateRecipeValues } from '../recipeParams';

const STAFFING = `
"""Staffing model."""
import pandas as pd

# Parameters (the app shows these as controls)
PARAMS = {
    "staff": 3,            # people on shift
    "growth_rate": 0.05,
    'region': 'West',
    "weekends": True,
    "arrivals_per_hour": 12.0,
}
PARAM_SPECS = {
    "staff": {"label": "Staff on shift", "min": 1, "max": 10, "step": 1},
    "growth_rate": {"label": "Annual growth", "min": 0, "max": 0.2, "unit": "%/yr", "help": "Demand growth"},
    "region": {"options": ["West", {"value": "East", "label": "East coast"}]},
}

df = pd.read_csv('/output/staffing/inputs.csv')
`;

describe('parseRecipeParams', () => {
  it('reads PARAMS and PARAM_SPECS as the Model panel needs them', () => {
    expect(parseRecipeParams(STAFFING)).toEqual([
      { name: 'staff', type: 'integer', default: 3, label: 'Staff on shift', min: 1, max: 10, step: 1 },
      { name: 'growth_rate', type: 'number', default: 0.05, label: 'Annual growth', help: 'Demand growth', unit: '%/yr', min: 0, max: 0.2 },
      { name: 'region', type: 'string', default: 'West', options: [{ value: 'West' }, { value: 'East', label: 'East coast' }] },
      { name: 'weekends', type: 'boolean', default: true },
      // 12.0 is a float in Python: the control allows decimals.
      { name: 'arrivals_per_hour', type: 'number', default: 12 },
    ]);
  });

  it('has no parameters when PARAMS is absent, and ignores indented or compared names', () => {
    expect(parseRecipeParams('x = 1\n')).toEqual([]);
    expect(parseRecipeParams('def f():\n    PARAMS = {"a": 1}\nif PARAMS == {}:\n    pass\n')).toEqual([]);
  });

  it('accepts an annotation, a tuple of options, comments, trailing commas and escapes', () => {
    const params = parseRecipeParams('PARAMS: dict = {\n  "mode": "it\\\'s",  # note\n  "n": -2,\n}\nPARAM_SPECS = {"n": {"options": (-2, 0, 2),}}\n');
    expect(params).toEqual([
      { name: 'mode', type: 'string', default: "it's" },
      { name: 'n', type: 'integer', default: -2, options: [{ value: -2 }, { value: 0 }, { value: 2 }] },
    ]);
  });

  it('refuses what ast.literal_eval would refuse, saying what to fix', () => {
    expect(() => parseRecipeParams('PARAMS = {"staff": STAFF}\n')).toThrow(/"STAFF" is not a literal/);
    expect(() => parseRecipeParams('PARAMS = dict(staff=3)\n')).toThrow(/not a literal/);
    expect(() => parseRecipeParams('PARAMS = [1, 2]\n')).toThrow(/must be a dict/);
    expect(() => parseRecipeParams('PARAMS = {"a": [1, 2]}\n')).toThrow(/must be a number, string or True\/False/);
    expect(() => parseRecipeParams('PARAMS = {"a": 1}\nPARAM_SPECS = {"b": {}}\n')).toThrow(/PARAMS doesn't declare/);
    expect(() => parseRecipeParams('PARAMS = {"a": "x"}\nPARAM_SPECS = {"a": {"min": 1}}\n')).toThrow(/isn't a number/);
    expect(() => parseRecipeParams('PARAMS = {"a": "x"}\nPARAM_SPECS = {"a": {"options": ["y"]}}\n')).toThrow(/isn't one of its options/);
    expect(() => parseRecipeParams('PARAMS = {"a": 1\n')).toThrow(/ends early/);
  });
});

describe('validateRecipeValues', () => {
  const params = parseRecipeParams(STAFFING);

  it('passes values that fit the declared parameters', () => {
    expect(validateRecipeValues(params, { staff: 4, growth_rate: 0.1, region: 'East', weekends: false }))
      .toEqual({ staff: 4, growth_rate: 0.1, region: 'East', weekends: false });
  });

  it('refuses unknown names, wrong types, out-of-range values and non-options, by label', () => {
    expect(() => validateRecipeValues(params, { nurses: 2 })).toThrow('This model has no parameter "nurses"');
    expect(() => validateRecipeValues(params, { staff: 2.5 })).toThrow('Staff on shift must be a whole number');
    expect(() => validateRecipeValues(params, { staff: 11 })).toThrow('Staff on shift must be at most 10');
    expect(() => validateRecipeValues(params, { staff: '4' })).toThrow('Staff on shift must be a number');
    expect(() => validateRecipeValues(params, { region: 'North' })).toThrow('region must be one of its options');
    expect(() => validateRecipeValues(params, { weekends: 'yes' })).toThrow('weekends must be on or off');
  });
});

describe('recipe names', () => {
  it('recognises recipes and their output folder', () => {
    expect(isRecipeFilename('staffing.recipe.py')).toBe(true);
    expect(isRecipeFilename('helpers.py')).toBe(false);
    expect(recipeOutputDir('staffing.recipe.py')).toBe('staffing');
    expect(recipeOutputDir('/output/models/queue.recipe.py')).toBe('models/queue');
  });
});
