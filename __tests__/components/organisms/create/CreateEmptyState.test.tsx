import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { CreateEmptyState } from '@/components/organisms/create/CreateEmptyState';

jest.mock('@/hooks/useGreeting', () => ({
  useGreeting: () => ({ timeBasedGreeting: 'Good evening', welcomeMessage: 'Welcome' }),
}));

const baseProps = {
  tab: 'image' as const,
  hasConfiguredProviders: false,
  recentAssets: [],
  onPressRecent: () => {},
  onConfigureProviders: jest.fn<void, []>(),
};

describe('CreateEmptyState tab suggestion', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the suggestion note and switches tab when its button is pressed', () => {
    const onPress = jest.fn<void, []>();
    const { getByText } = renderWithProviders(
      <CreateEmptyState
        {...baseProps}
        tabSuggestion={{ note: 'Your Runway key makes videos.', label: 'Switch to Video', onPress }}
      />
    );

    expect(getByText('Your Runway key makes videos.')).toBeTruthy();
    fireEvent.press(getByText('Switch to Video'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(baseProps.onConfigureProviders).not.toHaveBeenCalled();
  });

  it('keeps Connect a provider alongside the suggestion', () => {
    const { getByText } = renderWithProviders(
      <CreateEmptyState
        {...baseProps}
        tabSuggestion={{ note: 'n', label: 'Switch to Video', onPress: jest.fn<void, []>() }}
      />
    );

    fireEvent.press(getByText('Connect a provider'));
    expect(baseProps.onConfigureProviders).toHaveBeenCalledTimes(1);
  });

  it('shows no suggestion when none is given', () => {
    const { queryByText } = renderWithProviders(<CreateEmptyState {...baseProps} />);

    expect(queryByText('Switch to Video')).toBeNull();
  });
});
