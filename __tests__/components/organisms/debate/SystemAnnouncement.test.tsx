import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import {
  getSystemAnnouncementPalette,
  SystemAnnouncement,
} from '@/components/organisms/debate/SystemAnnouncement';
import { darkTheme, lightTheme } from '@/theme';

jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

describe('SystemAnnouncement', () => {
  it('renders content text', () => {
    const { getByText } = renderWithProviders(
      <SystemAnnouncement type="topic" content="Test announcement" />
    );

    expect(getByText('Test announcement')).toBeTruthy();
  });

  it('renders label when provided', () => {
    const { getByText } = renderWithProviders(
      <SystemAnnouncement type="topic" content="Test" label="ROUND 1" />
    );

    expect(getByText('ROUND 1')).toBeTruthy();
  });

  it('uses opaque, theme-aware audience stance colors in light and dark modes', () => {
    const darkPalette = getSystemAnnouncementPalette(darkTheme, true, 'audience-stance');
    const lightPalette = getSystemAnnouncementPalette(lightTheme, false, 'audience-stance');

    expect(darkPalette.gradient).toEqual([darkTheme.colors.card, darkTheme.colors.surface]);
    expect(darkPalette.contentColor).toBe(darkTheme.colors.text.primary);
    expect(darkPalette.labelColor).toBe(darkTheme.colors.primary[300]);
    expect(darkPalette.gradient.join(' ')).not.toContain('rgba');
    expect(lightPalette.gradient).toEqual([lightTheme.colors.primary[50], lightTheme.colors.card]);
    expect(lightPalette.contentColor).toBe(lightTheme.colors.text.primary);
    expect(lightPalette.labelColor).toBe(lightTheme.colors.primary[700]);
  });

  it('uses the audience palette for audience question announcements', () => {
    const darkPalette = getSystemAnnouncementPalette(darkTheme, true, 'audience-questions');

    expect(darkPalette.gradient).toEqual([darkTheme.colors.card, darkTheme.colors.surface]);
    expect(darkPalette.borderColor).toBe(darkTheme.colors.primary[500]);
    expect(darkPalette.contentColor).toBe(darkTheme.colors.text.primary);
  });

  it('renders audience questions as labeled rows', () => {
    const { getByText } = renderWithProviders(
      <SystemAnnouncement
        type="audience-questions"
        label="AUDIENCE Q&A"
        content={'Audience questions submitted:\n\nAffirmative: Should we also ban vaping?\n\nNegative: Why not ban smoking?'}
      />
    );

    expect(getByText('AUDIENCE Q&A')).toBeTruthy();
    expect(getByText('Audience questions submitted')).toBeTruthy();
    expect(getByText('Affirmative')).toBeTruthy();
    expect(getByText('Should we also ban vaping?')).toBeTruthy();
    expect(getByText('Negative')).toBeTruthy();
    expect(getByText('Why not ban smoking?')).toBeTruthy();
  });

  it('renders custom icon when provided', () => {
    const { getByText } = renderWithProviders(
      <SystemAnnouncement type="topic" content="Test" icon="🎉" />
    );

    expect(getByText('🎉')).toBeTruthy();
  });

  it('renders default icon for debate-start type', () => {
    const { getByText } = renderWithProviders(
      <SystemAnnouncement type="debate-start" content="Test" />
    );

    expect(getByText('🥊')).toBeTruthy();
  });

  it('renders default icon for exchange-winner type', () => {
    const { getByText } = renderWithProviders(
      <SystemAnnouncement type="exchange-winner" content="Test" />
    );

    expect(getByText('🎯')).toBeTruthy();
  });

  it('renders default icon for debate-complete type', () => {
    const { getByText } = renderWithProviders(
      <SystemAnnouncement type="debate-complete" content="Test" />
    );

    expect(getByText('🏁')).toBeTruthy();
  });

  it('renders default icon for overall-winner type', () => {
    const { getByText } = renderWithProviders(
      <SystemAnnouncement type="overall-winner" content="Test" />
    );

    expect(getByText('🏆')).toBeTruthy();
  });

  it('renders without icon for topic type', () => {
    const { queryByText } = renderWithProviders(
      <SystemAnnouncement type="topic" content="Test" />
    );

    // Topic type has no default icon
    expect(queryByText('📢')).toBeNull();
  });

  it('handles different animation types', () => {
    const { toJSON: slideUp } = renderWithProviders(
      <SystemAnnouncement type="topic" content="Test" animation="slide-up" />
    );

    const { toJSON: scale } = renderWithProviders(
      <SystemAnnouncement type="topic" content="Test" animation="scale" />
    );

    const { toJSON: fade } = renderWithProviders(
      <SystemAnnouncement type="topic" content="Test" animation="fade" />
    );

    expect(slideUp).toBeTruthy();
    expect(scale).toBeTruthy();
    expect(fade).toBeTruthy();
  });
});
