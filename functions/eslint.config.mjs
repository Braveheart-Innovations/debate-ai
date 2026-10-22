import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';

// The Functions code's own lint (npm run lint, in check:functions): the mobile
// app's config at the repo root never covered functions/, so nothing gated it.
// Same bar as the app's code, with two differences for a server: console is how
// Cloud Functions logs reach Cloud Logging, and destructuring a field out beside a
// rest sibling is how this code drops a field it doesn't pass on.
export default tseslint.config(
  {
    // The contract is generated from the web app (scripts/sync-analyze-contract.mjs
    // there) and linted at its source; a fix goes in web and is synced over.
    ignores: ['lib/', 'node_modules/', 'static/', 'coverage/', 'src/analyze/contract/'],
  },
  js.configs.recommended,
  // Every suppression says why, covers no whole file, and is still needed.
  eslintComments.recommended,
  {
    rules: {
      '@eslint-community/eslint-comments/require-description': 'error',
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      '@eslint-community/eslint-comments/no-unused-disable': 'error',
    },
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      // No TS suppressions of any kind, as in the app.
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true, 'ts-check': false },
      ],
    },
  },
  {
    // node --test suites and CommonJS tooling.
    files: ['test/**/*.js', '*.js'],
    languageOptions: {
      sourceType: 'commonjs',
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
