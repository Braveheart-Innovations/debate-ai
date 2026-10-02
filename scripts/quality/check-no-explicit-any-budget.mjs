#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DEFAULT_TEST_ANY_WARNING_BUDGET = 495;
const envBudget = process.env.NO_EXPLICIT_ANY_TEST_WARNINGS_BUDGET;
const budget = envBudget === undefined ? DEFAULT_TEST_ANY_WARNING_BUDGET : Number(envBudget);

if (!Number.isInteger(budget) || budget < 0) {
  console.error(`Invalid NO_EXPLICIT_ANY_TEST_WARNINGS_BUDGET: ${envBudget}`);
  process.exit(1);
}

const repoRoot = process.cwd();
const eslintPath = fileURLToPath(new URL('../../node_modules/eslint/bin/eslint.js', import.meta.url));
const result = spawnSync(
  process.execPath,
  [eslintPath, '__tests__', 'src', '--ext', '.ts,.tsx', '--format', 'json'],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (!result.stdout) {
  if (result.stderr) {
    console.error(result.stderr);
  }
  process.exit(result.status || 1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch (error) {
  console.error('Could not parse ESLint JSON output.');
  if (result.stderr) {
    console.error(result.stderr);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const toRepoPath = (filePath) => path.relative(repoRoot, filePath).split(path.sep).join('/');
const isTestFile = (filePath) => {
  const repoPath = toRepoPath(filePath);
  return repoPath.startsWith('__tests__/')
    || repoPath.includes('/__tests__/')
    || /\.test\.tsx?$/.test(repoPath)
    || /\.spec\.tsx?$/.test(repoPath);
};

let count = 0;
let files = 0;
const byFile = [];

for (const file of report) {
  if (!isTestFile(file.filePath)) {
    continue;
  }

  const warningCount = file.messages.filter(
    (message) => message.ruleId === '@typescript-eslint/no-explicit-any'
  ).length;

  if (warningCount > 0) {
    count += warningCount;
    files += 1;
    byFile.push([toRepoPath(file.filePath), warningCount]);
  }
}

const summary = `no-explicit-any test warning budget: ${count}/${budget} warnings across ${files} files`;

if (count > budget) {
  console.error(`${summary}\n`);
  console.error('Budget exceeded. Remove new explicit-any usage or lower existing debt before merging.');
  console.error('\nTop files:');
  byFile
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .forEach(([filePath, warningCount]) => {
      console.error(`${warningCount}\t${filePath}`);
    });
  process.exit(1);
}

if (count < budget) {
  console.error(`${summary}\n`);
  console.error(
    `Explicit-any debt went down. Lower DEFAULT_TEST_ANY_WARNING_BUDGET in ${fileURLToPath(import.meta.url)} to ${count} so the gain is locked in.`
  );
  process.exit(1);
}

console.log(summary);

