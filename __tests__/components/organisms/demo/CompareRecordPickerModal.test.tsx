import type { ReactNode } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { CompareRecordPickerModal } from '@/components/organisms/demo/CompareRecordPickerModal';
import type { SheetHeader, Typography, Button, InputField } from '@/components/molecules';

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
    InputField: stubComponent<typeof InputField>('input-field', {
      render: (p) => (
        <RN.TextInput
          value={p.value}
          onChangeText={p.onChangeText}
          placeholder={p.placeholder}
          testID="input-field"
        />
      ),
    }),
    Button: stubComponent<typeof Button>('button', {
      onPress: (p) => (p.disabled ? undefined : p.onPress),
      text: (p) => p.title,
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

describe('CompareRecordPickerModal', () => {
  let consoleErrorSpy: jest.SpyInstance;
  const originalConsoleError = console.error;

  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      if (typeof args[0] === 'string' && args[0].includes('not wrapped in act')) {
        return;
      }
      originalConsoleError(...args);
    });
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockListCompareSamples.mockReturnValue([
      { id: 'sample-1', title: 'Sample One' },
    ]);
  });

  it('lists existing samples and handles selection', async () => {
    const onSelect = jest.fn();

    const { getByText } = render(
      <CompareRecordPickerModal
        visible
        leftProvider="claude"
        rightProvider="openai"
        onSelect={onSelect}
        onClose={jest.fn()}
      />
    );

    await waitFor(() => expect(getByText('Sample One')).toBeTruthy());

    fireEvent.press(getByText('Sample One'));
    expect(onSelect).toHaveBeenCalledWith({ type: 'existing', id: 'sample-1', title: 'Sample One' });
    expect(mockListCompareSamples).toHaveBeenCalledWith(['claude', 'openai']);
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it('creates a new sample when form submitted', async () => {
    const onSelect = jest.fn();

    const { getByText, getByPlaceholderText } = render(
      <CompareRecordPickerModal
        visible
        leftProvider="claude"
        rightProvider="openai"
        onSelect={onSelect}
        onClose={jest.fn()}
      />
    );

    fireEvent.press(getByText('＋ New sample…'));

    const idInput = getByPlaceholderText('e.g., compare_co_custom_v1');
    const titleInput = getByPlaceholderText('Title');

    fireEvent.changeText(idInput, 'custom-id');
    fireEvent.changeText(titleInput, 'Custom Title');
    fireEvent.press(getByText('Create & Start'));

    expect(onSelect).toHaveBeenCalledWith({ type: 'new', id: 'custom-id', title: 'Custom Title' });
  });
});
