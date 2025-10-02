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

  it('dispatches showSheet when callbacks omitted', () => {
    const { getByTestId, store } = renderWithProviders(<HeaderActions />);

    fireEvent.press(getByTestId('header-support-button'));

    const navigationState = store.getState().navigation;
    expect(navigationState.activeSheet).toBe('support');
    expect(navigationState.sheetVisible).toBe(true);
  });

  it('passes gradient icon color when variant is gradient', () => {
    renderWithProviders(<HeaderActions variant="gradient" />);

    expect(mockHeaderIcon).toHaveBeenCalledWith(expect.objectContaining({
      color: expect.stringMatching(/rgba|#|rgb/),
    }));
  });
});
