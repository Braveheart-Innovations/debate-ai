import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { HomeEmptyState } from '@/components/organisms/composer/HomeEmptyState';

jest.mock('@/hooks/useGreeting', () => ({
  useGreeting: () => ({ timeBasedGreeting: 'Good evening', welcomeMessage: 'Welcome' }),
}));

const baseProps = {
  hasConfiguredAIs: false,
  onConfigureAIs: jest.fn<void, []>(),
  onOpenStudio: jest.fn<void, []>(),
  testID: 'home-empty',
};

describe('HomeEmptyState without a chat AI', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers the first-run CTA when nothing is connected', () => {
    const { getByText, queryByText } = renderWithProviders(<HomeEmptyState {...baseProps} />);

    expect(getByText('Configure your first AI')).toBeTruthy();
    expect(queryByText('Open The Studio')).toBeNull();

    fireEvent.press(getByText('Configure your first AI'));
    expect(baseProps.onConfigureAIs).toHaveBeenCalledTimes(1);
  });

  it('says a Studio-only key works in The Studio and offers both next steps', () => {
    const { getByText, queryByText } = renderWithProviders(
      <HomeEmptyState {...baseProps} studioOnlyProviderNames={['Runway']} />
    );

    expect(getByText(/Your Runway key works in The Studio/)).toBeTruthy();
    expect(queryByText('Configure your first AI')).toBeNull();

    fireEvent.press(getByText('Add a chat AI key'));
    expect(baseProps.onConfigureAIs).toHaveBeenCalledTimes(1);

    fireEvent.press(getByText('Open The Studio'));
    expect(baseProps.onOpenStudio).toHaveBeenCalledTimes(1);
  });

  it('joins several Studio providers and pluralises the copy', () => {
    const { getByText } = renderWithProviders(
      <HomeEmptyState {...baseProps} studioOnlyProviderNames={['Runway', 'ElevenLabs']} />
    );

    expect(getByText(/Your Runway and ElevenLabs keys work in The Studio/)).toBeTruthy();
  });

  it('hides Open The Studio when no handler is given', () => {
    const { queryByText } = renderWithProviders(
      <HomeEmptyState
        hasConfiguredAIs={false}
        onConfigureAIs={baseProps.onConfigureAIs}
        studioOnlyProviderNames={['Runway']}
      />
    );

    expect(queryByText('Open The Studio')).toBeNull();
  });
});
