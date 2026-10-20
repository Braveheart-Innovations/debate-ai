/**
 * A recipe's parameters, read from its source without running it.
 *
 * A recipe (`/output/<name>.recipe.py`) declares its inputs as top-level
 * literals:
 *
 *   PARAMS = {"staff": 3, "growth_rate": 0.05, "region": "West"}
 *   PARAM_SPECS = {"staff": {"label": "Staff on shift", "min": 1, "max": 10}}
 *
 * The Model panel draws a control per parameter, and analyzeRunRecipe checks
 * the values the user sends against them before the run (the sandbox's
 * run_recipe reads PARAMS with ast.literal_eval, so the two agree on what a
 * literal is: this reads the same subset).
 */
import type { Artifact, RecipeParam, RecipeParamValue } from '../contract/types/notebook';

export const RECIPE_SUFFIX = '.recipe.py';

export function isRecipeFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith(RECIPE_SUFFIX);
}

/** `models/staffing.recipe.py` → `models/staffing`: where the recipe writes its outputs, relative to /output. */
export function recipeOutputDir(recipeName: string): string {
  const normalized = recipeName.replace(/^\/?output\//, '');
  return normalized.slice(0, normalized.length - RECIPE_SUFFIX.length);
}

/** A recipe artifact's folder under /output: the one its metadata names, else from its name. */
export function modelOutputDir(recipe: Pick<Artifact, 'name' | 'metadata'>): string {
  return recipe.metadata?.recipe?.outputDir ?? recipeOutputDir(recipe.name);
}

/**
 * The recipe's name and description, from its module docstring: the first
 * line is the title, the rest the summary (paragraphs kept, lines joined).
 */
export function parseRecipeDocstring(source: string): { title?: string; summary?: string } {
  // A line scan, not a regex: recipe source comes from the model (no backtracking on odd input).
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let start = 0;
  while (start < lines.length && (lines[start].trim() === '' || lines[start].trim().startsWith('#'))) start += 1;
  let body = lines.slice(start).join('\n').trimStart();
  if ('rRuU'.includes(body[0] ?? '') && (body[1] === '"' || body[1] === "'")) body = body.slice(1);
  let text: string;
  const triple = body.slice(0, 3);
  if (triple === '"""' || triple === "'''") {
    const close = body.indexOf(triple, 3);
    if (close < 0) return {};
    text = body.slice(3, close);
  } else if (body[0] === '"' || body[0] === "'") {
    const close = body.indexOf(body[0], 1);
    const lineEnd = body.indexOf('\n');
    if (close < 0 || (lineEnd >= 0 && lineEnd < close)) return {};
    text = body.slice(1, close);
  } else {
    return {};
  }
  text = text.trim();
  if (!text) return {};
  const [first, ...rest] = text.split('\n');
  const summary = rest
    .join('\n')
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.split('\n').map((line) => line.trim()).filter(Boolean).join(' '))
    .filter(Boolean)
    .join('\n\n');
  return { title: first.trim(), ...(summary ? { summary } : {}) };
}

// ── A Python literal reader (dict, list, tuple, str, int, float, bool, None) ──

type PyValue = string | number | boolean | null | PyValue[] | { [key: string]: PyValue };

interface NumberLiteral {
  value: number;
  integer: boolean;
}

class LiteralReader {
  private pos = 0;
  /** Integer-ness of each number read, by object identity of its container slot. */
  readonly integers = new WeakMap<object, Set<string>>();

  constructor(private readonly src: string) {}

  read(): PyValue {
    return this.value(null, '');
  }

  private fail(message: string): never {
    if (this.pos >= this.src.length) throw new Error('The literal ends early: a bracket or quote isn\'t closed');
    const line = this.src.slice(0, this.pos).split('\n').length;
    throw new Error(`${message} (line ${line} of the literal)`);
  }

  /** Skips spaces, newlines, comments and backslash continuations. */
  private skip(): void {
    for (;;) {
      const ch = this.src[this.pos];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        this.pos += 1;
      } else if (ch === '#') {
        while (this.pos < this.src.length && this.src[this.pos] !== '\n') this.pos += 1;
      } else if (ch === '\\' && this.src[this.pos + 1] === '\n') {
        this.pos += 2;
      } else {
        return;
      }
    }
  }

  private value(container: object | null, slot: string): PyValue {
    this.skip();
    const ch = this.src[this.pos];
    if (ch === '{') return this.dict();
    if (ch === '[') return this.sequence(']');
    if (ch === '(') return this.sequence(')');
    if (ch === '"' || ch === "'") return this.string();
    if (ch === '-' || ch === '+' || ch === '.' || (ch >= '0' && ch <= '9')) {
      const number = this.number();
      if (container && number.integer) {
        const set = this.integers.get(container) ?? new Set<string>();
        set.add(slot);
        this.integers.set(container, set);
      }
      return number.value;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.src.slice(this.pos))?.[0];
    if (word === 'True') { this.pos += 4; return true; }
    if (word === 'False') { this.pos += 5; return false; }
    if (word === 'None') { this.pos += 4; return null; }
    if (word) this.fail(`"${word}" is not a literal: PARAMS must use plain values, not names or calls`);
    return this.fail(ch === undefined ? 'The literal ends early' : `Unexpected "${ch}"`);
  }

  private dict(): { [key: string]: PyValue } {
    this.pos += 1;
    const out: { [key: string]: PyValue } = {};
    for (;;) {
      this.skip();
      if (this.src[this.pos] === '}') { this.pos += 1; return out; }
      const key = this.value(null, '');
      if (typeof key !== 'string') this.fail('Dict keys must be strings');
      this.skip();
      if (this.src[this.pos] !== ':') this.fail('Expected ":" after a dict key');
      this.pos += 1;
      out[key as string] = this.value(out, key as string);
      this.skip();
      if (this.src[this.pos] === ',') { this.pos += 1; continue; }
      if (this.src[this.pos] === '}') { this.pos += 1; return out; }
      this.fail('Expected "," or "}" in a dict');
    }
  }

  private sequence(close: ']' | ')'): PyValue[] {
    this.pos += 1;
    const out: PyValue[] = [];
    for (;;) {
      this.skip();
      if (this.src[this.pos] === close) { this.pos += 1; return out; }
      out.push(this.value(out, String(out.length)));
      this.skip();
      if (this.src[this.pos] === ',') { this.pos += 1; continue; }
      if (this.src[this.pos] === close) { this.pos += 1; return out; }
      this.fail(`Expected "," or "${close}"`);
    }
  }

  private string(): string {
    let out = '';
    // Adjacent literals concatenate, as in Python.
    for (;;) {
      out += this.oneString();
      this.skip();
      const ch = this.src[this.pos];
      if (ch !== '"' && ch !== "'") return out;
    }
  }

  private oneString(): string {
    const quote = this.src[this.pos];
    const triple = this.src.slice(this.pos, this.pos + 3) === quote.repeat(3);
    const end = triple ? quote.repeat(3) : quote;
    this.pos += end.length;
    let out = '';
    for (;;) {
      if (this.pos >= this.src.length) this.fail('A string is not closed');
      if (this.src.startsWith(end, this.pos)) { this.pos += end.length; return out; }
      const ch = this.src[this.pos];
      if (!triple && ch === '\n') this.fail('A string is not closed');
      if (ch === '\\') {
        const next = this.src[this.pos + 1];
        const escapes: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '\n': '' };
        if (next in escapes) { out += escapes[next]; this.pos += 2; continue; }
        out += ch;
        this.pos += 1;
        continue;
      }
      out += ch;
      this.pos += 1;
    }
  }

  private number(): NumberLiteral {
    const match = /^[-+]?(\d[\d_]*)?(\.[\d_]*)?([eE][-+]?\d+)?/.exec(this.src.slice(this.pos));
    const text = match?.[0] ?? '';
    if (!text || text === '-' || text === '+' || text === '.') this.fail('Not a number');
    this.pos += text.length;
    const value = Number(text.replace(/_/g, ''));
    if (!Number.isFinite(value)) this.fail(`"${text}" is not a number`);
    return { value, integer: !/[.eE]/.test(text) };
  }
}

/** The literal assigned to a top-level name (`NAME = ...` or `NAME: dict = ...`), or undefined when absent. */
function topLevelLiteral(source: string, name: string): { value: PyValue; integers: LiteralReader['integers'] } | undefined {
  const assignment = new RegExp(`^${name}\\s*(?::[^=\\n]+)?=(?!=)`, 'm').exec(source);
  if (!assignment) return undefined;
  const reader = new LiteralReader(source.slice(assignment.index + assignment[0].length));
  const value = reader.read();
  return { value, integers: reader.integers };
}

function isPlainObject(value: PyValue | undefined): value is { [key: string]: PyValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalNumber(spec: { [key: string]: PyValue }, key: string, param: string): number | undefined {
  const value = spec[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number') throw new Error(`PARAM_SPECS["${param}"]["${key}"] must be a number`);
  return value;
}

function optionalText(spec: { [key: string]: PyValue }, key: string, param: string): string | undefined {
  const value = spec[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`PARAM_SPECS["${param}"]["${key}"] must be a string`);
  return value;
}

/**
 * The parameters a recipe declares. Throws with a message the model can act on
 * when PARAMS or PARAM_SPECS isn't a literal of the supported shape. A recipe
 * without PARAMS has no parameters (it still re-runs).
 */
export function parseRecipeParams(source: string): RecipeParam[] {
  const params = topLevelLiteral(source, 'PARAMS');
  if (!params) return [];
  if (!isPlainObject(params.value)) throw new Error('PARAMS must be a dict of name → default value');
  const specsLiteral = topLevelLiteral(source, 'PARAM_SPECS');
  if (specsLiteral && !isPlainObject(specsLiteral.value)) throw new Error('PARAM_SPECS must be a dict of name → {label, min, max, step, options, unit, help}');
  const specs = (specsLiteral?.value ?? {}) as { [key: string]: PyValue };
  const integers = params.integers.get(params.value) ?? new Set<string>();

  for (const name of Object.keys(specs)) {
    if (!(name in params.value)) throw new Error(`PARAM_SPECS names "${name}", which PARAMS doesn't declare`);
  }

  return Object.entries(params.value).map(([name, value]): RecipeParam => {
    let type: RecipeParam['type'];
    if (typeof value === 'boolean') type = 'boolean';
    else if (typeof value === 'number') type = integers.has(name) ? 'integer' : 'number';
    else if (typeof value === 'string') type = 'string';
    else throw new Error(`PARAMS["${name}"] must be a number, string or True/False`);

    const spec = specs[name];
    if (spec !== undefined && !isPlainObject(spec)) throw new Error(`PARAM_SPECS["${name}"] must be a dict`);
    const param: RecipeParam = { name, type, default: value };
    if (!spec) return param;

    const label = optionalText(spec, 'label', name);
    const help = optionalText(spec, 'help', name);
    const unit = optionalText(spec, 'unit', name);
    const min = optionalNumber(spec, 'min', name);
    const max = optionalNumber(spec, 'max', name);
    const step = optionalNumber(spec, 'step', name);
    if (label) param.label = label;
    if (help) param.help = help;
    if (unit) param.unit = unit;
    if ((min !== undefined || max !== undefined || step !== undefined) && type !== 'number' && type !== 'integer') {
      throw new Error(`PARAM_SPECS["${name}"] gives min/max/step, but PARAMS["${name}"] isn't a number`);
    }
    if (min !== undefined) param.min = min;
    if (max !== undefined) param.max = max;
    if (step !== undefined) param.step = step;

    const options = spec.options;
    if (options !== undefined && options !== null) {
      if (!Array.isArray(options) || options.length === 0) throw new Error(`PARAM_SPECS["${name}"]["options"] must be a non-empty list`);
      param.options = options.map((option) => {
        const entry = isPlainObject(option) ? option : { value: option };
        const optionValue = entry.value;
        if (typeof optionValue !== 'string' && typeof optionValue !== 'number') {
          throw new Error(`PARAM_SPECS["${name}"] options must be strings or numbers (or {"value": ..., "label": ...})`);
        }
        const optionLabel = entry.label;
        return typeof optionLabel === 'string' ? { value: optionValue, label: optionLabel } : { value: optionValue };
      });
      if (!param.options.some((option) => option.value === value)) {
        throw new Error(`PARAMS["${name}"] = ${JSON.stringify(value)} isn't one of its options`);
      }
    }
    return param;
  });
}

/**
 * The values to run with: the user's, checked against the declared
 * parameters. Unknown names, wrong types, values outside min/max and values
 * not among the options are refused (the message names the parameter).
 */
export function validateRecipeValues(
  params: RecipeParam[],
  values: Record<string, unknown>,
): Record<string, RecipeParamValue> {
  const byName = new Map(params.map((param) => [param.name, param]));
  const out: Record<string, RecipeParamValue> = {};
  for (const [name, raw] of Object.entries(values)) {
    const param = byName.get(name);
    if (!param) throw new Error(`This model has no parameter "${name}"`);
    const label = param.label ?? name;
    if (param.type === 'boolean') {
      if (typeof raw !== 'boolean') throw new Error(`${label} must be on or off`);
      out[name] = raw;
      continue;
    }
    if (param.type === 'string') {
      if (typeof raw !== 'string') throw new Error(`${label} must be text`);
      if (param.options && !param.options.some((option) => option.value === raw)) throw new Error(`${label} must be one of its options`);
      out[name] = raw;
      continue;
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error(`${label} must be a number`);
    if (param.type === 'integer' && !Number.isInteger(raw)) throw new Error(`${label} must be a whole number`);
    if (param.min !== undefined && raw < param.min) throw new Error(`${label} must be at least ${param.min}`);
    if (param.max !== undefined && raw > param.max) throw new Error(`${label} must be at most ${param.max}`);
    if (param.options && !param.options.some((option) => option.value === raw)) throw new Error(`${label} must be one of its options`);
    out[name] = raw;
  }
  return out;
}
