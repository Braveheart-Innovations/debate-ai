import React from 'react';
import { Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { HeaderActions } from '@/components/organisms/header/HeaderActions';

const mockHeaderIcon = jest.fn(({ testID, onPress, color }: any) => (
  <Text testID={testID} onPress={onPress} accessibilityRole="button">
    {color ?? 'icon'}
  </Text>
));

jest.mock('@/components/molecules', () => {
  const { Text } = require('react-native');
  return {
    HeaderIcon: (props: any) => mockHeaderIcon(props),
  };
});

describe('HeaderActions', () => {
  beforeEach(() => {
    mockHeaderIcon.mockClear();
  });

  it('uses provided callbacks when supplied', () => {
    const onProfilePress = jest.fn();

    const { getByTestId, store } = renderWithProviders(
      <HeaderActions
        onProfilePress={onProfilePress}
        onSupportPress={jest.fn()}
        onSettingsPress={jest.fn()}
      />
    );

    const dispatchSpy = jest.spyOn(store, 'dispatch');

    fireEvent.press(getByTestId('header-profile-button'));
    expect(onProfilePress).toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('dispatches showSheet for help when callbacks omitted', () => {
    const { getByTestId, store } = renderWithProviders(<HeaderActions />);

    fireEvent.press(getByTestId('header-support-button'));

    const navigationState = store.getState().navigation;
    expect(navigationState.activeSheet).toBe('help');
    expect(navigationState.sheetVisible).toBe(true);
    expect(navigationState.sheetData).toBeUndefined();
  });

  it('passes gradient icon color when variant is gradient', () => {
    renderWithProviders(<HeaderActions variant="gradient" />);

    expect(mockHeaderIcon).toHaveBeenCalledWith(expect.objectContaining({
      color: expect.stringMatching(/rgba|#|rgb/),
    }));
  });

  describe('helpTopicId prop', () => {
    it('passes topicId in sheetData when helpTopicId provided', () => {
      const { getByTestId, store } = renderWithProviders(
        <HeaderActions helpTopicId="debate-arena" />
      );

      fireEvent.press(getByTestId('header-support-button'));

      const navigationState = store.getState().navigation;
      expect(navigationState.activeSheet).toBe('help');
      expect(navigationState.sheetData).toEqual({ topicId: 'debate-arena' });
    });
  });

  describe('helpCategoryId prop', () => {
    it('passes categoryId in sheetData when helpCategoryId provided', () => {
      const { getByTestId, store } = renderWithProviders(
        <HeaderActions helpCategoryId="chat" />
      );

      fireEvent.press(getByTestId('header-support-button'));

      const navigationState = store.getState().navigation;
      expect(navigationState.activeSheet).toBe('help');
      expect(navigationState.sheetData).toEqual({ categoryId: 'chat' });
    });
  });

  describe('prop priority', () => {
    it('topicId takes precedence when both helpTopicId and helpCategoryId provided', () => {
      const { getByTestId, store } = renderWithProviders(
        <HeaderActions helpTopicId="expert-mode" helpCategoryId="chat" />
      );

      fireEvent.press(getByTestId('header-support-button'));

      const navigationState = store.getState().navigation;
      expect(navigationState.sheetData).toEqual({ topicId: 'expert-mode' });
      expect(navigationState.sheetData).not.toHaveProperty('categoryId');
    });
  });
});
