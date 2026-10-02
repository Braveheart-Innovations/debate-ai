#!/usr/bin/env node
// Counts type-system and lint escape hatches in tracked app-side code and
// holds each to a strict ratchet: a count may never rise, and when it falls
// the ceiling below must be lowered to match in the same change. The target
// for every counter is 0 (docs/TECH_DEBT_CLEANUP_PLAN.md).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ts = createRequire(import.meta.url)('typescript');

const BUDGETS = {
  'src: `as unknown as`': 0,
  'tests: `as unknown as`': 117,
  'src: eslint-disable': 3,
  'tests: eslint-disable': 1,
  'tests: skipped or todo tests': 0,
  'tests: untyped require() of app modules': 0,
  'tests: untyped require() of packages': 0,
  'src: single `as` casts': 521,
  'tests: single `as` casts': 415,
  'tests: untyped bare jest.fn()': 1577,
  'tests: malformed() inputs': 7,
};
const CODE = /\.(ts|tsx)$/;
const isTestPath = (file) =>
  file.startsWith('__tests__/') ||
  file.includes('/__tests__/') ||
  file.startsWith('test-utils/') ||
  file.startsWith('__mocks__/') ||
  /^jest\.setup(AfterEnv)?\.ts$/.test(file);

// Tracked plus new (untracked, not ignored) files, so local runs see what a
// commit would add — not only what is already in the index.
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter((file) => CODE.test(file) && !/^(functions|web|ios|android)\//.test(file));

// An app-module require is typed only via `as typeof import(...)` or
// `jest.requireActual<...>` / `jest.requireMock<...>`; otherwise the module is
// `any` and everything the test does with it escapes the type checker.
const APP_REQUIRE = /require(?:Actual|Mock)?\(\s*['"](?:@\/|@test-utils\/|\.\.?\/)/;
const TYPED_REQUIRE = /as typeof import\(|require(?:Actual|Mock)</;
// Same for packages (e.g. `require('react')` inside a jest.mock factory makes
// every stub built from it untyped): `require('react') as typeof import('react')`.
// Vendor jest-setup entry points (e.g. 'react-native-gesture-handler/jestSetup')
// ship no type declarations and are passed straight through as mock factories,
// so they are exempt.
const PACKAGE_REQUIRE = /require(?:Actual|Mock)?\(\s*['"](?!@\/|@test-utils\/|\.)(?![^'"]*\/jest(?:Setup)?['"])[^'"]+['"]/;
const countUntyped = (pattern) => (text) =>
  text.split('\n').filter((line) => pattern.test(line) && !TYPED_REQUIRE.test(line)).length;

// AST-based counters (regex can't tell `import * as X` from a cast).
const parse = (text, file) =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

const isConstAssertion = (type) => ts.isTypeReferenceNode(type) && type.typeName.getText() === 'const';
const isTypeofImport = (type) => ts.isImportTypeNode(type) && type.isTypeOf;
const isUnknown = (type) => type.kind === ts.SyntaxKind.UnknownKeyword;

/**
 * Single type assertions (`x as T`, `<T>x`). Excluded: `as const`, the sanctioned
 * `require(...) as typeof import(...)`, and `as unknown as` pairs (counted separately).
 */
const countSingleCasts = (text, file) => {
  let count = 0;
  const visit = (node) => {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      let inner = node.expression;
      while (ts.isParenthesizedExpression(inner)) inner = inner.expression;
      const partOfDoubleCast =
        isUnknown(node.type) || ((ts.isAsExpression(inner) || ts.isTypeAssertionExpression(inner)) && isUnknown(inner.type));
      if (!partOfDoubleCast && !isConstAssertion(node.type) && !isTypeofImport(node.type)) count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(text, file));
  return count;
};

/** `jest.fn()` with neither type arguments nor an implementation is `jest.Mock<any, any>`. */
const countBareJestFn = (text, file) => {
  let count = 0;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 0 &&
      !node.typeArguments &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'fn' &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'jest'
    ) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(text, file));
  return count;
};

const counters = {
  'src: `as unknown as`': { pattern: /\bas unknown as\b/g, scope: (f) => !isTestPath(f) },
  'tests: `as unknown as`': { pattern: /\bas unknown as\b/g, scope: isTestPath },
  'src: eslint-disable': { pattern: /eslint-disable/g, scope: (f) => !isTestPath(f) },
  'tests: eslint-disable': { pattern: /eslint-disable/g, scope: isTestPath },
  'tests: skipped or todo tests': {
    pattern: /\b(?:(?:it|test|describe)\.(?:skip|todo)|x(?:it|test|describe))\(/g,
    scope: isTestPath,
  },
  'tests: untyped require() of app modules': { count: countUntyped(APP_REQUIRE), scope: isTestPath },
  'tests: untyped require() of packages': { count: countUntyped(PACKAGE_REQUIRE), scope: isTestPath },
  // The sanctioned way to feed type-forbidden input to runtime guards
  // (test-utils/queries.ts). Not a target of 0 — kept visible and deliberate.
  'src: single `as` casts': { count: countSingleCasts, scope: (f) => !isTestPath(f) },
  'tests: single `as` casts': { count: countSingleCasts, scope: isTestPath },
  'tests: untyped bare jest.fn()': { count: countBareJestFn, scope: isTestPath },
  'tests: malformed() inputs': {
    pattern: /\bmalformed</g,
    scope: (f) => isTestPath(f) && f !== 'test-utils/queries.ts',
  },
};
const scriptPath = fileURLToPath(import.meta.url);
const selfRelative = 'scripts/quality/check-escape-hatch-budget.mjs';
let failed = false;

for (const [name, { pattern, count: countFn, scope }] of Object.entries(counters)) {
  const hits = [];
  for (const file of files) {
    if (file === selfRelative || !scope(file)) continue;
    const text = readFileSync(file, 'utf8');
    const count = countFn ? countFn(text, file) : (text.match(pattern)?.length ?? 0);
    if (count > 0) hits.push([file, count]);
  }
  const count = hits.reduce((sum, [, n]) => sum + n, 0);
  const budget = BUDGETS[name];
  const line = `escape-hatch budget ${name}: ${count}/${budget}`;

  if (count > budget) {
    failed = true;
    console.error(`${line}\n  Over budget. New escape hatches are not allowed; fix the types instead. Top files:`);
    hits
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([file, n]) => console.error(`    ${n}\t${file}`));
  } else if (count < budget) {
    failed = true;
    console.error(`${line}\n  Went down. Lower '${name}' in BUDGETS (${scriptPath}) to ${count} so the gain is locked in.`);
  } else {
    console.log(line);
  }
}

process.exit(failed ? 1 : 0);
