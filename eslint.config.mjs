import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { includeIgnoreFile } from '@eslint/compat';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import { fileURLToPath } from 'node:url';

export default tseslint.config(
  // Never lint what git ignores (local test-*.js scratch scripts, coverage/,
  // build output): CI doesn't have those files, so linting them locally makes
  // check:app depend on whatever happens to be on disk.
  includeIgnoreFile(fileURLToPath(new URL('.gitignore', import.meta.url))),
  js.configs.recommended,
  // Every suppression must say why, may not blanket a whole file, and must
  // still be needed (docs/TECH_DEBT_CLEANUP_PLAN.md, Phase 0).
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
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react': reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // No TS suppressions of any kind (reached 0 during the debt burn-down).
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true, 'ts-check': false },
      ],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    // App code reached zero double casts (docs/TECH_DEBT_CLEANUP_PLAN.md, Phase 3);
    // keep it there. Narrow with a type guard or validate at the boundary instead.
    files: ['src/**/*.{ts,tsx}', 'App.tsx', 'index.ts'],
    ignores: ['src/**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "TSAsExpression > TSAsExpression.expression[typeAnnotation.type='TSUnknownKeyword']",
          message: 'No `as unknown as` in app code: use a type guard, a typed boundary validator, or fix the type.',
        },
      ],
    },
  },
  {
    files: ['__tests__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Test-support code is held to the src bar: no `any` budget here. Only
    // require() is allowed, since jest.mock factories are hoisted above imports.
    files: ['jest.setup.ts', 'jest.setupAfterEnv.ts', 'test-utils/**/*.{ts,tsx}', '__mocks__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Node-side code: Expo config plugins, build/release scripts, tool configs.
    files: ['*.js', 'plugins/**/*.js', 'scripts/**/*.js', '__mocks__/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // CLI scripts report through stdout.
    files: ['scripts/**/*.{js,mjs}'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: ['node_modules/', 'dist/', '.expo/'],
  }
);
