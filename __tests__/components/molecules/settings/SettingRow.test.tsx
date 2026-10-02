import React from 'react';
import { Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { SettingRow } from '@/components/molecules/settings/SettingRow';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('@/components/molecules', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

describe('SettingRow', () => {
  it('renders title', () => {
    const { getByText } = renderWithProviders(
      <SettingRow title="Test Setting" />
    );
    expect(getByText('Test Setting')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    const { getByText } = renderWithProviders(
      <SettingRow title="Test" subtitle="Description" />
    );
    expect(getByText('Description')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(
      <SettingRow title="Test" onPress={onPress} />
    );

    fireEvent.press(getByText('Test'));
    expect(onPress).toHaveBeenCalled();
  });

  it('renders rightElement when provided', () => {
    const { getByText } = renderWithProviders(
      <SettingRow title="Test" rightElement={<Text>Right</Text>} />
    );
    expect(getByText('Right')).toBeTruthy();
  });
});
