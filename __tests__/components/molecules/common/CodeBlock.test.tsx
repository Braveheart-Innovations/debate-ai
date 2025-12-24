import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { CodeBlock } from '@/components/molecules/common/CodeBlock';

// Mock react-native-code-highlighter
jest.mock('react-native-code-highlighter', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: string }) =>
      React.createElement(
        View,
        { testID: 'code-highlighter' },
        React.createElement(Text, { testID: 'code-content' }, children)
      ),
  };
});

// Mock syntax highlighter styles
jest.mock('react-syntax-highlighter/dist/esm/styles/hljs', () => ({
  atomOneDark: {
    hljs: { backgroundColor: '#282c34' },
  },
  atomOneLight: {
    hljs: { backgroundColor: '#fafafa' },
  },
}));

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
      const { getByTestId } = renderWithProviders(
        <CodeBlock code="const x = 1;" />
      );

      expect(getByTestId('code-content')).toBeTruthy();
    });

    it('renders code highlighter component', () => {
      const { getByTestId } = renderWithProviders(
        <CodeBlock code="const x = 1;" language="javascript" />
      );

      expect(getByTestId('code-highlighter')).toBeTruthy();
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
      const { getByTestId } = renderWithProviders(
        <CodeBlock code={'const x = 1;\n'} language="javascript" />
      );

      // The component should remove trailing newlines
      const content = getByTestId('code-content').props.children;
      expect(content.endsWith('\n')).toBe(false);
      expect(content).toBe('const x = 1;');
    });

    it('preserves internal newlines', () => {
      const code = 'line1\nline2\nline3';
      const { getByTestId } = renderWithProviders(
        <CodeBlock code={code} language="javascript" />
      );

      const content = getByTestId('code-content').props.children;
      expect(content).toContain('line1');
      expect(content).toContain('line2');
      expect(content).toContain('line3');
    });

    it('handles empty code', () => {
      const { getByTestId } = renderWithProviders(
        <CodeBlock code="" language="javascript" />
      );

      expect(getByTestId('code-highlighter')).toBeTruthy();
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
