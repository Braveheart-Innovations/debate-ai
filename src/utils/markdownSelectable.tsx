import React from 'react';
import { Text, Linking, TextStyle, ViewStyle, ImageStyle } from 'react-native';

/**
 * Minimal Markdown render rule overrides that make text selectable
 * while preserving link behavior.
 *
 * These rules are intended to be spread into react-native-markdown-display's
 * `rules` prop, overriding only the inline/textual nodes. Block-level
 * containers (paragraph, body, etc.) are left to the library defaults.
 */
type MDNode = {
  key: string;
  content?: string;
  attributes?: { href?: string; src?: string; alt?: string; [k: string]: unknown };
  index?: number;
  markup?: string;
};

type RNStyles = Record<string, TextStyle | ViewStyle | ImageStyle>;

export const selectableMarkdownRules = {
  text: (node: MDNode, _children: React.ReactNode, _parent: MDNode[], styles: unknown, inheritedStyles: TextStyle = {}) => (
    <Text key={node.key} selectable style={[inheritedStyles, (styles as RNStyles).text]}>
      {node.content}
    </Text>
  ),
  strong: (node: MDNode, children: React.ReactNode, _parent: MDNode[], styles: unknown) => (
    <Text key={node.key} selectable style={(styles as RNStyles).strong as TextStyle}>
      {children}
    </Text>
  ),
  em: (node: MDNode, children: React.ReactNode, _parent: MDNode[], styles: unknown) => (
    <Text key={node.key} selectable style={(styles as RNStyles).em as TextStyle}>
      {children}
    </Text>
  ),
  s: (node: MDNode, children: React.ReactNode, _parent: MDNode[], styles: unknown) => (
    <Text key={node.key} selectable style={(styles as RNStyles).s as TextStyle}>
      {children}
    </Text>
  ),
  inline: (node: MDNode, children: React.ReactNode, _parent: MDNode[], styles: unknown) => (
    <Text key={node.key} selectable style={(styles as RNStyles).inline as TextStyle}>
      {children}
    </Text>
  ),
  span: (node: MDNode, children: React.ReactNode, _parent: MDNode[], styles: unknown) => (
    <Text key={node.key} selectable style={(styles as RNStyles).span as TextStyle}>
      {children}
    </Text>
  ),
  textgroup: (node: MDNode, children: React.ReactNode, _parent: MDNode[], styles: unknown) => (
    <Text key={node.key} selectable style={(styles as RNStyles).textgroup as TextStyle}>
      {children}
    </Text>
  ),
  code_inline: (node: MDNode, _children: React.ReactNode, _parent: MDNode[], styles: unknown, inheritedStyles: TextStyle = {}) => (
    <Text key={node.key} selectable style={[inheritedStyles, (styles as RNStyles).code_inline as TextStyle]}>
      {node.content}
    </Text>
  ),
  code_block: (node: MDNode, _children: React.ReactNode, _parent: MDNode[], styles: unknown, inheritedStyles: TextStyle = {}) => {
    let { content } = node;
    if (typeof content === 'string' && content.endsWith('\n')) content = content.slice(0, -1);
    return (
      <Text key={node.key} selectable style={[inheritedStyles, (styles as RNStyles).code_block as TextStyle]}>
        {content}
      </Text>
    );
  },
  fence: (node: MDNode, _children: React.ReactNode, _parent: MDNode[], styles: unknown, inheritedStyles: TextStyle = {}) => {
    let { content } = node;
    if (typeof content === 'string' && content.endsWith('\n')) content = content.slice(0, -1);
    return (
      <Text key={node.key} selectable style={[inheritedStyles, (styles as RNStyles).fence as TextStyle]}>
        {content}
      </Text>
    );
  },
  hardbreak: (node: MDNode, _children: React.ReactNode, _parent: MDNode[], styles: unknown) => (
    <Text key={node.key} selectable style={(styles as RNStyles).hardbreak as TextStyle}>
      {'\n'}
    </Text>
  ),
  softbreak: (node: MDNode, _children: React.ReactNode, _parent: MDNode[], styles: unknown) => (
    <Text key={node.key} selectable style={(styles as RNStyles).softbreak as TextStyle}>
      {'\n'}
    </Text>
  ),
  link: (node: MDNode, children: React.ReactNode, _parent: MDNode[], styles: unknown, onLinkPress?: (url: string) => boolean | void) => (
    <Text
      key={node.key}
      selectable
      style={(styles as RNStyles).link as TextStyle}
      onPress={() => {
        const url = node?.attributes?.href;
        if (!url) return;
        if (onLinkPress) {
          const shouldOpen = onLinkPress(url);
          if (shouldOpen === false) return;
        }
        Linking.openURL(url).catch(() => {});
      }}
    >
      {children}
    </Text>
  ),
};

export default selectableMarkdownRules;
