import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { CodeBlock } from '@/components/molecules/common/CodeBlock';

// Mock Typography
jest.mock('@/components/molecules/common/Typography', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children, style }: { children: React.ReactNode; style?: object }) =>
      React.createElement(Text, { style, testID: 'language-tag' }, children),
  };
});

describe('CodeBlock', () => {
  describe('rendering', () => {
    it('renders code content', () => {
      const { getByText } = renderWithProviders(
        <CodeBlock code="const x = 1;" />
      );

      expect(getByText('const x = 1;')).toBeTruthy();
    });

    it('renders with language tag when language is provided', () => {
      const { getByText, getByTestId } = renderWithProviders(
        <CodeBlock code="const x = 1;" language="javascript" />
      );

      expect(getByText('const x = 1;')).toBeTruthy();
      expect(getByTestId('language-tag')).toBeTruthy();
    });

    it('displays the code content correctly', () => {
      const code = 'function hello() { return "world"; }';
      const { getByText } = renderWithProviders(
        <CodeBlock code={code} language="javascript" />
      );

      expect(getByText(code)).toBeTruthy();
    });
  });

  describe('language handling', () => {
    it('renders without language tag when not specified', () => {
      const { queryByTestId } = renderWithProviders(
        <CodeBlock code="plain text" />
      );

      // Language tag should not be rendered
      expect(queryByTestId('language-tag')).toBeNull();
    });

    it('renders with language tag when specified', () => {
      const { getByTestId } = renderWithProviders(
        <CodeBlock code="const x = 1;" language="javascript" />
      );

      expect(getByTestId('language-tag')).toBeTruthy();
      expect(getByTestId('language-tag').props.children).toBe('javascript');
    });

    it('normalizes language aliases - js to javascript', () => {
      const { getByTestId } = renderWithProviders(
        <CodeBlock code="const x = 1;" language="js" />
      );

      expect(getByTestId('language-tag').props.children).toBe('javascript');
    });

    it('normalizes language aliases - ts to typescript', () => {
      const { getByTestId } = renderWithProviders(
        <CodeBlock code="const x: number = 1;" language="ts" />
      );

      expect(getByTestId('language-tag').props.children).toBe('typescript');
    });

    it('normalizes language aliases - py to python', () => {
      const { getByTestId } = renderWithProviders(
        <CodeBlock code="x = 1" language="py" />
      );

      expect(getByTestId('language-tag').props.children).toBe('python');
    });

    it('normalizes language aliases - sh to bash', () => {
      const { getByTestId } = renderWithProviders(
        <CodeBlock code="echo hello" language="sh" />
      );

      expect(getByTestId('language-tag').props.children).toBe('bash');
    });

    it('normalizes language aliases - yml to yaml', () => {
      const { getByTestId } = renderWithProviders(
        <CodeBlock code="key: value" language="yml" />
      );

      expect(getByTestId('language-tag').props.children).toBe('yaml');
    });

    it('handles case insensitive language names', () => {
      const { getByTestId } = renderWithProviders(
        <CodeBlock code="const x = 1;" language="JAVASCRIPT" />
      );

      expect(getByTestId('language-tag').props.children).toBe('javascript');
    });

    it('passes through unknown languages unchanged', () => {
      const { getByTestId } = renderWithProviders(
        <CodeBlock code="some code" language="customlang" />
      );

      expect(getByTestId('language-tag').props.children).toBe('customlang');
    });
  });

  describe('code formatting', () => {
    it('removes trailing newline from code', () => {
      const { getByText } = renderWithProviders(
        <CodeBlock code={'const x = 1;\n'} language="javascript" />
      );

      // The component should remove trailing newlines - it should display without the trailing newline
      expect(getByText('const x = 1;')).toBeTruthy();
    });

    it('preserves internal newlines', () => {
      const code = 'line1\nline2\nline3';
      const { getByText } = renderWithProviders(
        <CodeBlock code={code} language="javascript" />
      );

      // The content should contain all lines
      expect(getByText(code)).toBeTruthy();
    });

    it('handles empty code', () => {
      const { getByTestId } = renderWithProviders(
        <CodeBlock code="" language="javascript" />
      );

      // Should still render with the language tag
      expect(getByTestId('language-tag')).toBeTruthy();
    });
  });

  describe('language tag display', () => {
    it('displays language tag with uppercase style', () => {
      const { getByTestId } = renderWithProviders(
        <CodeBlock code="const x = 1;" language="javascript" />
      );

      // The component should transform to uppercase via style
      const languageTag = getByTestId('language-tag');
      expect(languageTag).toBeTruthy();
      expect(languageTag.props.style.textTransform).toBe('uppercase');
    });
  });

  describe('various language support', () => {
    const languages = [
      { input: 'javascript', expected: 'javascript' },
      { input: 'typescript', expected: 'typescript' },
      { input: 'python', expected: 'python' },
      { input: 'ruby', expected: 'ruby' },
      { input: 'go', expected: 'go' },
      { input: 'rust', expected: 'rust' },
      { input: 'java', expected: 'java' },
      { input: 'cpp', expected: 'cpp' },
      { input: 'c', expected: 'c' },
      { input: 'swift', expected: 'swift' },
      { input: 'kotlin', expected: 'kotlin' },
      { input: 'json', expected: 'json' },
      { input: 'html', expected: 'html' },
      { input: 'css', expected: 'css' },
      { input: 'sql', expected: 'sql' },
    ];

    languages.forEach(({ input, expected }) => {
      it(`handles ${input} language`, () => {
        const { getByTestId } = renderWithProviders(
          <CodeBlock code="code" language={input} />
        );

        expect(getByTestId('language-tag').props.children).toBe(expected);
      });
    });
  });
});
