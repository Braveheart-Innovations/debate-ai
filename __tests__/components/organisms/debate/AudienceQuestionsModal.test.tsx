import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { AudienceQuestionsModal } from '@/components/organisms/debate/AudienceQuestionsModal';
import { KeyboardAvoider } from '@/components/molecules/common/KeyboardAvoider';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-blur', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  return {
    BlurView: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

jest.mock('expo-linear-gradient', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  return {
    LinearGradient: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

let mockSafeAreaInsets = { top: 0, bottom: 34, left: 0, right: 0 };

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockSafeAreaInsets,
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');

describe('AudienceQuestionsModal', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockSafeAreaInsets = { top: 0, bottom: 34, left: 0, right: 0 };
    if (originalPlatformDescriptor) {
      Object.defineProperty(Platform, 'OS', originalPlatformDescriptor);
    }
  });

  it('requires both audience questions before submitting', () => {
    const onSubmit = jest.fn();
    const { getByTestId, getByText } = renderWithProviders(
      <AudienceQuestionsModal
        visible
        onSubmit={onSubmit}
      />
    );

    fireEvent.press(getByText('Submit Questions'));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.changeText(getByTestId('audience-question-aff'), '  How would this work?  ');
    fireEvent.press(getByText('Submit Questions'));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.changeText(getByTestId('audience-question-neg'), 'Why reject the motion?');
    fireEvent.press(getByText('Submit Questions'));

    expect(onSubmit).toHaveBeenCalledWith({
      aff: 'How would this work?',
      neg: 'Why reject the motion?',
    });
  });

  it('pads the submit action above the bottom system inset', () => {
    const { getByTestId, UNSAFE_getByType } = renderWithProviders(
      <AudienceQuestionsModal
        visible
        onSubmit={jest.fn()}
      />
    );

    const scrollView = UNSAFE_getByType(ScrollView);
    const footer = getByTestId('audience-questions-footer');

    expect(StyleSheet.flatten(footer.props.style)).toEqual(
      expect.objectContaining({ paddingBottom: 50 })
    );
    expect(StyleSheet.flatten(scrollView.props.contentContainerStyle)).toEqual(
      expect.objectContaining({ paddingBottom: 4 })
    );
  });

  it('uses the shared sheet header shell without exposing a fake close action', () => {
    const { getByTestId, queryByTestId } = renderWithProviders(
      <AudienceQuestionsModal
        visible
        onSubmit={jest.fn()}
      />
    );

    expect(getByTestId('audience-questions-header')).toBeTruthy();
    expect(queryByTestId('audience-questions-header-close')).toBeNull();
  });

  it('keeps the standard full-height bottom sheet position for keyboard resizing', () => {
    const { UNSAFE_getByType } = renderWithProviders(
      <AudienceQuestionsModal
        visible
        onSubmit={jest.fn()}
      />
    );

    const keyboardAvoider = UNSAFE_getByType(KeyboardAvoider);

    expect(keyboardAvoider.props.pointerEvents).toBe('box-none');
    expect(StyleSheet.flatten(keyboardAvoider.props.style)).toEqual(
      expect.objectContaining({
        flex: 1,
        justifyContent: 'flex-end',
      })
    );
  });

  it('mounts a nested KeyboardProvider and delegates avoidance to the shared wrapper', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });

    const { UNSAFE_getAllByType, UNSAFE_getByType } = renderWithProviders(
      <AudienceQuestionsModal
        visible
        onSubmit={jest.fn()}
      />
    );

    // A native Modal renders in its own window that the app-root KeyboardProvider
    // cannot reach, so the sheet mounts its own. Keyboard avoidance is delegated
    // entirely to the library-backed KeyboardAvoider — the modal no longer
    // measures the keyboard height by hand (the removed Keyboard.addListener
    // workaround).
    expect(UNSAFE_getByType(KeyboardProvider)).toBeTruthy();

    const sheet = UNSAFE_getAllByType(View).find((view) => {
      const style = StyleSheet.flatten(view.props.style);
      return style?.borderTopLeftRadius === 24;
    });
    expect(StyleSheet.flatten(sheet?.props.style)).toEqual(
      expect.objectContaining({
        maxHeight: '88%',
      })
    );

    const keyboardAvoider = UNSAFE_getByType(KeyboardAvoider);
    // No manual paddingBottom: the library applies the keyboard inset itself.
    expect(StyleSheet.flatten(keyboardAvoider.props.style).paddingBottom).toBeUndefined();
  });

  it('keeps Android modal system bars non-translucent so bottom controls clear the navigation bar', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });

    const { UNSAFE_getByType } = renderWithProviders(
      <AudienceQuestionsModal
        visible
        onSubmit={jest.fn()}
      />
    );

    const modal = UNSAFE_getByType(Modal);

    expect(modal.props.statusBarTranslucent).toBe(false);
    expect(modal.props.navigationBarTranslucent).toBe(false);
  });

  it('keeps Android bottom controls clear when the device reports no bottom inset', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    mockSafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };

    const { getByTestId } = renderWithProviders(
      <AudienceQuestionsModal
        visible
        onSubmit={jest.fn()}
      />
    );

    const footer = getByTestId('audience-questions-footer');

    expect(StyleSheet.flatten(footer.props.style)).toEqual(
      expect.objectContaining({ paddingBottom: 40 })
    );
  });

  it('explicitly requests the soft keyboard when inputs receive focus', () => {
    const { getByTestId } = renderWithProviders(
      <AudienceQuestionsModal
        visible
        onSubmit={jest.fn()}
      />
    );

    expect(getByTestId('audience-question-aff').props.showSoftInputOnFocus).toBe(true);
    expect(getByTestId('audience-question-neg').props.showSoftInputOnFocus).toBe(true);
  });
});
