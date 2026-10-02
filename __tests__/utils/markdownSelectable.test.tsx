import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Linking, TextStyle } from 'react-native';

// Mock CodeBlock to avoid ThemeProvider dependency
jest.mock('@/components/molecules/common/CodeBlock', () => ({
  CodeBlock: ({ code, language }: { code: string; language?: string }) => {
    const React = require('react');
    const { Text, View } = require('react-native');
    return React.createElement(
      View,
      { testID: 'code-block' },
      React.createElement(Text, { testID: 'code-content' }, code),
      language && React.createElement(Text, { testID: 'code-language' }, language)
    );
  },
}));

import selectableMarkdownRules from '@/utils/markdownSelectable';

const styles = {
  text: { color: 'red' },
  strong: { fontWeight: 'bold' },
  em: { fontStyle: 'italic' },
  s: { textDecorationLine: 'line-through' },
  inline: { fontSize: 14 },
  span: { letterSpacing: 1 },
  textgroup: { lineHeight: 22 },
  code_inline: { fontFamily: 'mono' },
  code_block: { fontFamily: 'mono', backgroundColor: '#111' },
  fence: { fontFamily: 'mono', backgroundColor: '#222' },
  hardbreak: { margin: 4 },
  softbreak: { margin: 2 },
  link: { color: 'blue' },
};

type MarkdownNode = Parameters<typeof selectableMarkdownRules.text>[0];

/** Shared signature of the textual rules exercised via `renderRule` (link has its own tests). */
type TextualRule = (
  node: MarkdownNode,
  children: React.ReactNode,
  parent: MarkdownNode[],
  styles: unknown,
  inheritedStyles?: TextStyle
) => React.ReactElement;

const textualRules = {
  text: selectableMarkdownRules.text,
  strong: selectableMarkdownRules.strong,
  em: selectableMarkdownRules.em,
  s: selectableMarkdownRules.s,
  code_block: selectableMarkdownRules.code_block,
  fence: selectableMarkdownRules.fence,
  hardbreak: selectableMarkdownRules.hardbreak,
  softbreak: selectableMarkdownRules.softbreak,
} satisfies Record<string, TextualRule>;

type RuleName = keyof typeof textualRules;

const renderRule = (
  rule: RuleName,
  nodeOverrides: Partial<{ content: string; attributes: Record<string, string> }> = {},
  inheritedStyles?: TextStyle
) => {
  const node: MarkdownNode = {
    key: `${rule}-node`,
    content: nodeOverrides.content,
    attributes: nodeOverrides.attributes,
  };

  const ruleFn: TextualRule = textualRules[rule];
  const element = ruleFn(node, <>{node.content}</>, [], styles, inheritedStyles);
  return render(element);
};

describe('selectableMarkdownRules', () => {
  it('marks inline text nodes as selectable and merges inherited styles', () => {
    const { getByText } = renderRule('text', { content: 'Hello' }, { fontSize: 16 });
    const text = getByText('Hello');
    expect(text.props.selectable).toBe(true);
    expect(text.props.style).toEqual([{ fontSize: 16 }, styles.text]);
  });

  it('applies emphasis styles to strong/em/s spans', () => {
    const strong = renderRule('strong', { content: 'Bold' }).getByText('Bold');
    expect(strong.props.style).toEqual(styles.strong);

    const em = renderRule('em', { content: 'Italics' }).getByText('Italics');
    expect(em.props.style).toEqual(styles.em);

    const strike = renderRule('s', { content: 'Strike' }).getByText('Strike');
    expect(strike.props.style).toEqual(styles.s);
  });

  it('trims trailing newline characters for code blocks and fences', () => {
    const { getByText: getBlock } = renderRule('code_block', { content: 'const x = 1;\n' });
    expect(getBlock('const x = 1;').props.style).toEqual([{}, styles.code_block]);

    // fence now uses CodeBlock component which handles its own styling
    const { getByTestId } = renderRule('fence', { content: 'fn foo()\n' });
    const codeContent = getByTestId('code-content');
    // CodeBlock trims trailing newlines internally
    expect(codeContent.props.children).toBe('fn foo()');
  });

  it('renders hard and soft breaks as newline characters', () => {
    const hard = renderRule('hardbreak', { content: '' }).getByText('\n');
    expect(hard.props.style).toEqual(styles.hardbreak);

    const soft = renderRule('softbreak', { content: '' }).getByText('\n');
    expect(soft.props.style).toEqual(styles.softbreak);
  });

  it('opens links through Linking.openURL by default', () => {
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const element = selectableMarkdownRules.link(
      { key: 'link', attributes: { href: 'https://example.com' } },
      <>Docs</>,
      [],
      styles
    );
    const { getByText } = render(element);

    fireEvent.press(getByText('Docs'));
    expect(openUrlSpy).toHaveBeenCalledWith('https://example.com');
    openUrlSpy.mockRestore();
  });

  it('respects custom onLinkPress handlers that prevent navigation', () => {
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const onLinkPress = jest.fn(() => false);
    const element = selectableMarkdownRules.link(
      { key: 'link-2', attributes: { href: 'https://blocked.com' } },
      <>Cancel</>,
      [],
      styles,
      onLinkPress
    );
    const { getByText } = render(element);

    fireEvent.press(getByText('Cancel'));
    expect(onLinkPress).toHaveBeenCalledWith('https://blocked.com');
    expect(openUrlSpy).not.toHaveBeenCalled();
    openUrlSpy.mockRestore();
  });
});
