import { Keyboard } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ProviderPickerSheet } from '@/components/organisms/composer/ProviderPickerSheet';

const noneSelected: string[] = [];

const baseProps = {
  visible: true,
  onClose: jest.fn<void, []>(),
  onSelectProvider: jest.fn<void, [string]>(),
  selectedProviderIds: noneSelected,
  configuredProviderIds: ['claude'],
  testID: 'picker',
};

describe('ProviderPickerSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Haptics.impactAsync).mockResolvedValue(undefined);
  });

  it('dismisses the keyboard when it opens, not while hidden', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const { rerender } = renderWithProviders(<ProviderPickerSheet {...baseProps} visible={false} />);
    expect(dismiss).not.toHaveBeenCalled();

    rerender(<ProviderPickerSheet {...baseProps} visible />);
    expect(dismiss).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
  });

  it('shows the message line only when one is given', () => {
    const { queryByTestId, getByText, rerender } = renderWithProviders(
      <ProviderPickerSheet {...baseProps} />
    );
    expect(queryByTestId('picker-message')).toBeNull();

    rerender(<ProviderPickerSheet {...baseProps} message="Pick an AI to answer your message." />);
    expect(getByText('Pick an AI to answer your message.')).toBeTruthy();
  });

  it('selects a keyed provider then closes', () => {
    const { getByTestId } = renderWithProviders(<ProviderPickerSheet {...baseProps} />);

    fireEvent.press(getByTestId('picker-list-row-claude'));

    expect(baseProps.onSelectProvider).toHaveBeenCalledWith('claude');
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('closes first, then reports the provider whose key should be added', () => {
    const order: string[] = [];
    const onClose = jest.fn<void, []>(() => {
      order.push('close');
    });
    const onRequestAddKey = jest.fn<void, [string]>(() => {
      order.push('addKey');
    });
    const { getByTestId } = renderWithProviders(
      <ProviderPickerSheet {...baseProps} onClose={onClose} onRequestAddKey={onRequestAddKey} />
    );

    fireEvent.press(getByTestId('picker-list-row-openai'));

    expect(onRequestAddKey).toHaveBeenCalledWith('openai');
    expect(order).toEqual(['close', 'addKey']);
    expect(baseProps.onSelectProvider).not.toHaveBeenCalled();
  });

  it('lists only the allowed providers (demo mode)', () => {
    const { queryByTestId, getByTestId, queryByText } = renderWithProviders(
      <ProviderPickerSheet {...baseProps} allowedProviderIds={['claude']} />
    );

    expect(getByTestId('picker-list-row-claude')).toBeTruthy();
    expect(queryByTestId('picker-list-row-openai')).toBeNull();
    expect(queryByText('Add key')).toBeNull();
  });
});
