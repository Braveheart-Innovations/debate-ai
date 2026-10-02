#!/usr/bin/env node
// Type-checks test code (tsconfig.tests.json), which the app typecheck never
// covered, against a ratcheting error budget: the count may never grow, and
// when it shrinks the budget must be lowered to match in the same change.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_TEST_TYPE_ERROR_BUDGET = 393;
const envBudget = process.env.TEST_TYPE_ERROR_BUDGET;
const budget = envBudget === undefined ? DEFAULT_TEST_TYPE_ERROR_BUDGET : Number(envBudget);

if (!Number.isInteger(budget) || budget < 0) {
  console.error(`Invalid TEST_TYPE_ERROR_BUDGET: ${envBudget}`);
  process.exit(1);
}

const tscPath = fileURLToPath(new URL('../../node_modules/typescript/bin/tsc', import.meta.url));
const result = spawnSync(
  process.execPath,
  [tscPath, '--noEmit', '--pretty', 'false', '-p', 'tsconfig.tests.json'],
  { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

const errorLines = result.stdout.split('\n').filter((line) => /error TS\d+:/.test(line));

// tsc exiting non-zero without reporting diagnostics means it never ran the check.
if (result.status !== 0 && errorLines.length === 0) {
  console.error(result.stdout || result.stderr || 'tsc failed without diagnostics');
  process.exit(1);
}

const byFile = new Map();
for (const line of errorLines) {
  const file = line.slice(0, line.indexOf('('));
  byFile.set(file, (byFile.get(file) || 0) + 1);
}

const count = errorLines.length;
const summary = `test typecheck error budget: ${count}/${budget} errors across ${byFile.size} files`;

if (count > budget) {
  console.error(`${summary}\n`);
  console.error('Budget exceeded. Fix the new type errors in test code before merging:\n');
  console.error(errorLines.join('\n'));
  process.exit(1);
}

if (count < budget) {
  console.error(`${summary}\n`);
  console.error(
    `Test type errors went down. Lower DEFAULT_TEST_TYPE_ERROR_BUDGET in ${fileURLToPath(import.meta.url)} to ${count} so the gain is locked in.`
  );
  process.exit(1);
}

console.log(summary);
