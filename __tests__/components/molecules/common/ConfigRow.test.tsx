import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ConfigRow } from '@/components/molecules/common/ConfigRow';

describe('ConfigRow', () => {
  it('renders primary and secondary text and fires onPress with haptics', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = renderWithProviders(
      <ConfigRow
        primary="Claude Sonnet 5"
        secondary="$3/$15 per 1M"
        onPress={onPress}
        testID="config-row"
      />
    );

    expect(getByText('Claude Sonnet 5')).toBeTruthy();
    expect(getByText('$3/$15 per 1M')).toBeTruthy();

    fireEvent.press(getByTestId('config-row'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(require('expo-haptics').impactAsync).toHaveBeenCalled();
  });

  it('shows the indicator dot only when requested', () => {
    const { queryByTestId, rerender } = renderWithProviders(
      <ConfigRow primary="Default" onPress={jest.fn()} testID="config-row" />
    );
    expect(queryByTestId('config-row-dot')).toBeNull();

    rerender(
      <ConfigRow primary="Default" showIndicatorDot onPress={jest.fn()} testID="config-row" />
    );
    expect(queryByTestId('config-row-dot')).toBeTruthy();
  });
});
