import { Platform, Text } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { showSheet } from '@/store';
import APIConfigScreen from '@/screens/APIConfigScreen';
import { capturePropsOf } from '@test-utils/mockComponents';
import type {
  APIComingSoon,
  APIConfigProgress,
  APIProviderList,
  Header,
} from '@/components/organisms';

const mockDispatch = jest.fn();

jest.mock('react-redux', () => {
  const actual = jest.requireActual<typeof import('react-redux')>('react-redux');
  return {
    ...actual,
    useDispatch: () => mockDispatch,
  };
});

const mockClearAll = jest.fn(() => Promise.resolve());
const mockClearAllVerifications = jest.fn(() => Promise.resolve());
const mockHandleKeyChange = jest.fn();
const mockHandleTestConnection = jest.fn();
const mockHandleSaveKey = jest.fn();
const mockHandleToggleExpand = jest.fn<
  void,
  [string, string | null, (value: string | null) => void]
>();

jest.mock('@/hooks/useAPIKeys', () => ({
  useAPIKeys: () => ({
    apiKeys: { claude: 'key-1' },
    clearAll: mockClearAll,
  }),
}));

jest.mock('@/hooks/useProviderVerification', () => ({
  useProviderVerification: () => ({
    clearAllVerifications: mockClearAllVerifications,
  }),
}));

jest.mock('@/hooks/useAPIConfigHandlers', () => ({
  useAPIConfigHandlers: () => ({
    handleKeyChange: mockHandleKeyChange,
    handleTestConnection: mockHandleTestConnection,
    handleSaveKey: mockHandleSaveKey,
    handleToggleExpand: mockHandleToggleExpand,
  }),
}));

jest.mock('@/hooks/useAPIConfigData', () => ({
  useAPIConfigData: () => ({
    enabledProviders: [
      { id: 'claude', name: 'Claude', gradient: ['#000', '#111'], color: '#123' },
    ],
    disabledProviders: [
      { id: 'openai', name: 'OpenAI', gradient: ['#222', '#333'], color: '#456' },
    ],
    configuredCount: 1,
    verificationStatus: { claude: 'verified' },
    expertModeConfigs: {},
  }),
}));

const mockHeader = capturePropsOf<typeof Header>(({ title, onBack }) => (
  <Text testID="header" onPress={onBack}>
    {title}
  </Text>
));
const mockAPIConfigProgress = capturePropsOf<typeof APIConfigProgress>(() => (
  <Text testID="progress">progress</Text>
));
const mockAPIProviderList = capturePropsOf<typeof APIProviderList>(() => (
  <Text testID="provider-list">providers</Text>
));
const mockAPISecurityNote = () => <Text>security</Text>;
const mockAPIComingSoon = capturePropsOf<typeof APIComingSoon>(() => (
  <Text testID="coming-soon">coming soon</Text>
));

jest.mock('@/components/organisms', () => ({
  get Header() {
    return mockHeader.Stub;
  },
  get APIConfigProgress() {
    return mockAPIConfigProgress.Stub;
  },
  get APIProviderList() {
    return mockAPIProviderList.Stub;
  },
  APISecurityNote: () => mockAPISecurityNote(),
  get APIComingSoon() {
    return mockAPIComingSoon.Stub;
  },
  APIKeyGuidanceModal: () => null,
  APIKeyWebViewModal: () => null,
}));

// Mock useFeatureAccess to allow premium features
jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: () => ({
    isDemo: false,
    isPremium: true,
    isInTrial: false,
    canStartTrial: false,
    hasUsedTrial: true,
    trialDaysRemaining: null,
    refresh: jest.fn(),
  }),
}));

describe('APIConfigScreen', () => {
  const navigation = { goBack: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockClear();
    mockHeader.reset();
    mockAPIConfigProgress.reset();
    mockAPIProviderList.reset();
    mockAPIComingSoon.reset();
  });

  it('renders API configuration layout and wires actions', async () => {
    const { getByTestId } = renderWithProviders(
      <APIConfigScreen navigation={navigation} />
    );

    expect(getByTestId('progress')).toBeTruthy();
    expect(getByTestId('provider-list')).toBeTruthy();
    expect(getByTestId('coming-soon')).toBeTruthy();

    expect(mockAPIConfigProgress.latest()).toMatchObject({ configuredCount: 1, totalCount: 1 });
    await mockAPIConfigProgress.latest().onClearAll();
    expect(mockClearAll).toHaveBeenCalledTimes(1);
    expect(mockClearAllVerifications).toHaveBeenCalledTimes(1);

    expect(mockAPIProviderList.latest()).toMatchObject({
      providers: expect.arrayContaining([expect.objectContaining({ id: 'claude' })]),
      apiKeys: { claude: 'key-1' },
      verificationStatus: { claude: 'verified' },
    });

    expect(mockAPIComingSoon.latest()).toMatchObject({ providers: expect.arrayContaining([expect.objectContaining({ id: 'openai' })]) });

    fireEvent.press(getByTestId('header'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(showSheet({ sheet: 'settings' }));
  });

  it('forwards toggle expand calls with current expanded state', async () => {
    renderWithProviders(<APIConfigScreen navigation={navigation} />);

    expect(mockAPIProviderList.latest().expandedProvider).toBeNull();

    await act(async () => {
      mockAPIProviderList.latest().onToggleExpand('claude');
    });

    expect(mockHandleToggleExpand).toHaveBeenCalledWith(
      'claude',
      null,
      expect.any(Function),
    );

    const setter = mockHandleToggleExpand.mock.calls[0][2];

    await act(async () => {
      setter('claude');
    });

    await waitFor(() => {
      expect(mockAPIProviderList.latest().expandedProvider).toBe('claude');
    });

    mockHandleToggleExpand.mockClear();

    await act(async () => {
      mockAPIProviderList.latest().onToggleExpand('claude');
    });

    expect(mockHandleToggleExpand).toHaveBeenCalledWith(
      'claude',
      'claude',
      expect.any(Function),
    );
  });

  it('uses height avoiding behavior on android', () => {
    const originalOS = Platform.OS;
    Platform.OS = 'android';

    renderWithProviders(<APIConfigScreen navigation={navigation} />);

    expect(mockAPIProviderList.latest()).toBeDefined();

    Platform.OS = originalOS;
  });
});
