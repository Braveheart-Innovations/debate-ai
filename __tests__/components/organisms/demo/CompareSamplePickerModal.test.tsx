import type { ReactNode } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { CompareSamplePickerModal } from '@/components/organisms/demo/CompareSamplePickerModal';
import type { SheetHeader, Typography } from '@/components/molecules';

const mockTheme = {
  spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
  colors: {
    background: '#ffffff',
    surface: '#f5f5f5',
    border: '#e0e0e0',
    text: { primary: '#111111', secondary: '#666666', disabled: '#bbbbbb' },
    primary: { 100: '#ddeeff', 300: '#99bbff', 500: '#3366ff' },
    card: '#fafafa',
    warning: { 500: '#ffb020' },
    error: { 500: '#ff4d4f' },
    success: { 500: '#4caf50' },
    brand: '#3355ff',
  },
  borderRadius: { sm: 6, md: 10, xl: 24 },
};

jest.mock('@/theme', () => {
  const actual = jest.requireActual<typeof import('@/theme')>('@/theme');
  return {
    ...actual,
    ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    useTheme: () => ({ theme: mockTheme }),
  };
});

jest.mock('@testing-library/react-native/build/helpers/host-component-names', () => {
  const hostComponentNames = {
    text: 'Text',
    textInput: 'TextInput',
    image: 'Image',
    switch: 'Switch',
    scrollView: 'ScrollView',
    modal: 'Modal',
  };
  const matches = (element: ReactTestInstance | null | undefined, key: keyof typeof hostComponentNames) => element?.type === hostComponentNames[key];
  return {
    configureHostComponentNamesIfNeeded: () => {},
    getHostComponentNames: () => hostComponentNames,
    isHostText: (element?: ReactTestInstance | null) => matches(element, 'text'),
    isHostTextInput: (element?: ReactTestInstance | null) => matches(element, 'textInput'),
    isHostImage: (element?: ReactTestInstance | null) => matches(element, 'image'),
    isHostSwitch: (element?: ReactTestInstance | null) => matches(element, 'switch'),
    isHostScrollView: (element?: ReactTestInstance | null) => matches(element, 'scrollView'),
    isHostModal: (element?: ReactTestInstance | null) => matches(element, 'modal'),
  };
});

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return ({ children }: { children?: ReactNode }) => (
    <RN.View testID="modal-wrapper">{children}</RN.View>
  );
});

jest.mock('@/components/molecules', () => {
  const { stubComponent } = jest.requireActual<
    typeof import('@test-utils/mockComponents')
  >('@test-utils/mockComponents');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Typography: stubComponent<typeof Typography>('typography', { text: (p) => p.children }),
    SheetHeader: stubComponent<typeof SheetHeader>('sheet-header', {
      text: (p) => p.title,
      render: (p) => <RN.Text onPress={p.onClose}>close</RN.Text>,
    }),
  };
});

const mockListCompareSamples = jest.fn<Array<{ id: string; title: string }>, [string[]]>();
const mockSubscribe = jest.fn<() => void, [() => void]>(() => jest.fn());

jest.mock('@/services/demo/DemoContentService', () => ({
  DemoContentService: {
    listCompareSamples: (providers: string[]) => mockListCompareSamples(providers),
    subscribe: (callback: () => void) => mockSubscribe(callback),
  },
}));

describe('CompareSamplePickerModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders samples and invokes onSelect', async () => {
    mockListCompareSamples.mockReturnValue([
      { id: 'sample-1', title: 'Sample One' },
    ]);

    const onSelect = jest.fn();

    const { getByText } = render(
      <CompareSamplePickerModal
        visible
        providers={['claude', 'openai']}
        onSelect={onSelect}
        onClose={jest.fn()}
      />
    );

    await waitFor(() => expect(getByText('Sample One')).toBeTruthy());

    fireEvent.press(getByText('Sample One'));
    expect(onSelect).toHaveBeenCalledWith('sample-1');
    expect(mockListCompareSamples).toHaveBeenCalledWith(['claude', 'openai']);
  });

  it('shows empty state when no samples returned', async () => {
    mockListCompareSamples.mockReturnValue([]);

    const { getByText } = render(
      <CompareSamplePickerModal
        visible
        providers={['claude']}
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />
    );

    await waitFor(() => expect(getByText('No demo comparisons available for this pair yet.')).toBeTruthy());
  });
});
