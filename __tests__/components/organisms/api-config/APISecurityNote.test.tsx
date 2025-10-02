import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { APISecurityNote } from '@/components/organisms/api-config/APISecurityNote';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('APISecurityNote', () => {
  it('renders default title and security points', () => {
    const { getByText } = renderWithProviders(<APISecurityNote />);

    expect(getByText('🔒 Your Security')).toBeTruthy();
    expect(getByText('• Keys are encrypted and stored locally')).toBeTruthy();
    expect(getByText('• We never send keys to our servers')).toBeTruthy();
    expect(getByText('• You can modify or clear keys anytime')).toBeTruthy();
    expect(getByText('• Each service connection is isolated')).toBeTruthy();
  });

  it('renders custom title and security points', () => {
    const { getByText } = renderWithProviders(
      <APISecurityNote
        title="Security Checklist"
        securityPoints={['Point A', 'Point B']}
      />
    );

    expect(getByText('Security Checklist')).toBeTruthy();
    expect(getByText('• Point A')).toBeTruthy();
    expect(getByText('• Point B')).toBeTruthy();
  });
});
