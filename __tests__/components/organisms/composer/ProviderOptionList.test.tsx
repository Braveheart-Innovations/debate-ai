import { fireEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import {
  ProviderOptionList,
  type ProviderPickerItem,
} from '@/components/organisms/composer/ProviderOptionList';

const providers: ProviderPickerItem[] = [
  { id: 'claude', name: 'Claude', company: 'Anthropic', color: '#d97757' },
  { id: 'openai', name: 'ChatGPT', company: 'OpenAI', color: '#10a37f' },
];

const noneSelected: string[] = [];

const baseProps = {
  providers,
  configuredProviderIds: ['claude'],
  selectedProviderIds: noneSelected,
  testID: 'options',
};

describe('ProviderOptionList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Haptics.impactAsync).mockResolvedValue(undefined);
  });

  it('selects a keyed provider when its row is tapped', () => {
    const onSelectProvider = jest.fn<void, [string]>();
    const { getByTestId } = renderWithProviders(
      <ProviderOptionList {...baseProps} onSelectProvider={onSelectProvider} />
    );

    fireEvent.press(getByTestId('options-row-claude'));

    expect(onSelectProvider).toHaveBeenCalledWith('claude');
  });

  it('routes a tap anywhere on an un-keyed row to onRequestAddKey', () => {
    const onSelectProvider = jest.fn<void, [string]>();
    const onRequestAddKey = jest.fn<void, [string]>();
    const { getByTestId, getByText } = renderWithProviders(
      <ProviderOptionList
        {...baseProps}
        onSelectProvider={onSelectProvider}
        onRequestAddKey={onRequestAddKey}
      />
    );

    expect(getByText('Add key')).toBeTruthy();
    // The company line is not the chip, yet the whole row is the target.
    fireEvent.press(getByText('OpenAI'));
    fireEvent.press(getByTestId('options-row-openai'));

    expect(onRequestAddKey).toHaveBeenCalledTimes(2);
    expect(onRequestAddKey).toHaveBeenCalledWith('openai');
    expect(onSelectProvider).not.toHaveBeenCalled();
  });

  it('leaves an un-keyed row inert, with no Add key chip, when add-key is not offered', () => {
    const onSelectProvider = jest.fn<void, [string]>();
    const { getByTestId, queryByText } = renderWithProviders(
      <ProviderOptionList {...baseProps} onSelectProvider={onSelectProvider} />
    );

    expect(queryByText('Add key')).toBeNull();
    fireEvent.press(getByTestId('options-row-openai'));

    expect(onSelectProvider).not.toHaveBeenCalled();
  });

  it('shows Added and ignores taps on an already selected provider', () => {
    const onSelectProvider = jest.fn<void, [string]>();
    const { getByTestId, getByText } = renderWithProviders(
      <ProviderOptionList
        {...baseProps}
        selectedProviderIds={['claude']}
        onSelectProvider={onSelectProvider}
      />
    );

    expect(getByText('Added')).toBeTruthy();
    fireEvent.press(getByTestId('options-row-claude'));

    expect(onSelectProvider).not.toHaveBeenCalled();
  });

  it('keeps a selected provider selectable again when duplicates are allowed', () => {
    const onSelectProvider = jest.fn<void, [string]>();
    const { getByTestId, queryByText } = renderWithProviders(
      <ProviderOptionList
        {...baseProps}
        selectedProviderIds={['claude']}
        allowDuplicates
        onSelectProvider={onSelectProvider}
      />
    );

    expect(queryByText('Added')).toBeNull();
    fireEvent.press(getByTestId('options-row-claude'));

    expect(onSelectProvider).toHaveBeenCalledWith('claude');
  });
});
