import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children?: React.ReactNode }) => children || null,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) =>
      React.createElement(Text, null, children),
  };
});

const { SectionHeader } = require('@/components/molecules/common/SectionHeader');

describe('SectionHeader', () => {
  it('renders title', () => {
    const { getByText } = renderWithProviders(
      <SectionHeader title="Test Section" />
    );

    expect(getByText('Test Section')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    const { getByText } = renderWithProviders(
      <SectionHeader title="Test Section" subtitle="Section description" />
    );

    expect(getByText('Section description')).toBeTruthy();
  });

  it('renders icon when provided', () => {
    const { getByText } = renderWithProviders(
      <SectionHeader title="Test Section" icon="🔥" />
    );

    expect(getByText('🔥')).toBeTruthy();
  });

  it('renders action button when onAction and actionLabel provided', () => {
    const onAction = jest.fn();
    const { getByText } = renderWithProviders(
      <SectionHeader
        title="Test Section"
        onAction={onAction}
        actionLabel="View All"
      />
    );

    expect(getByText('View All')).toBeTruthy();
  });

  it('calls onAction when action button pressed', () => {
    const onAction = jest.fn();
    const { getByText } = renderWithProviders(
      <SectionHeader
        title="Test Section"
        onAction={onAction}
        actionLabel="View All"
      />
    );

    fireEvent.press(getByText('View All'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('does not render action button when only onAction provided', () => {
    const onAction = jest.fn();
    const { queryByText } = renderWithProviders(
      <SectionHeader title="Test Section" onAction={onAction} />
    );

    expect(queryByText('View All')).toBeNull();
  });

  it('does not render action button when only actionLabel provided', () => {
    const { queryByText } = renderWithProviders(
      <SectionHeader title="Test Section" actionLabel="View All" />
    );

    expect(queryByText('View All')).toBeNull();
  });
});