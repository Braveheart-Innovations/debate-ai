import React from 'react';
import { Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { showSheet } from '@/store';

const mockDispatch = jest.fn();

jest.mock('react-redux', () => {
  const actual = jest.requireActual('react-redux');
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
const mockHandleToggleExpand = jest.fn();

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

const mockHeader = jest.fn(({ title, onBack }: { title: string; onBack: () => void }) => (
  <Text testID="header" onPress={onBack}>
    {title}
  </Text>
));

let lastProgressProps: any;
let lastProviderListProps: any;
let lastComingSoonProps: any;

const mockAPIConfigProgress = jest.fn((props) => {
  lastProgressProps = props;
  return <Text testID="progress">progress</Text>;
});
const mockAPIProviderList = jest.fn((props) => {
  lastProviderListProps = props;
  return <Text testID="provider-list">providers</Text>;
});
const mockAPISecurityNote = jest.fn(() => <Text>security</Text>);
const mockAPIComingSoon = jest.fn((props) => {
  lastComingSoonProps = props;
  return <Text testID="coming-soon">coming soon</Text>;
});

jest.mock('@/components/organisms', () => ({
  Header: (props: any) => mockHeader(props),
  APIConfigProgress: (props: any) => mockAPIConfigProgress(props),
  APIProviderList: (props: any) => mockAPIProviderList(props),
  APISecurityNote: () => mockAPISecurityNote(),
  APIComingSoon: (props: any) => mockAPIComingSoon(props),
}));

const APIConfigScreen = require('@/screens/APIConfigScreen').default;

describe('APIConfigScreen', () => {
  const navigation = { goBack: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockClear();
  });

  it('renders API configuration layout and wires actions', async () => {
    const { getByTestId } = renderWithProviders(
      <APIConfigScreen navigation={navigation} />
    );

    expect(getByTestId('progress')).toBeTruthy();
    expect(getByTestId('provider-list')).toBeTruthy();
    expect(getByTestId('coming-soon')).toBeTruthy();

    expect(lastProgressProps).toMatchObject({ configuredCount: 1, totalCount: 1 });
    await lastProgressProps.onClearAll();
    expect(mockClearAll).toHaveBeenCalledTimes(1);
    expect(mockClearAllVerifications).toHaveBeenCalledTimes(1);

    expect(lastProviderListProps).toMatchObject({
      providers: expect.arrayContaining([expect.objectContaining({ id: 'claude' })]),
      apiKeys: { claude: 'key-1' },
      verificationStatus: { claude: 'verified' },
    });

    expect(lastComingSoonProps).toMatchObject({ providers: expect.arrayContaining([expect.objectContaining({ id: 'openai' })]) });

    fireEvent.press(getByTestId('header'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(showSheet({ sheet: 'settings' }));
  });
});
