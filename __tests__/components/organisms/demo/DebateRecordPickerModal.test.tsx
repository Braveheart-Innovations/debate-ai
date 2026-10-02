import type { ReactNode } from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DebateRecordPickerModal } from '@/components/organisms/demo/DebateRecordPickerModal';

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');

  const MockModal = ({ children }: { children?: ReactNode }) => <RN.View>{children}</RN.View>;

  MockModal.displayName = 'MockModal';
  // Support both default and named import patterns React Native may use, and
  // mark as ES module to satisfy downstream interop expectations.
  return Object.assign(MockModal, { default: MockModal, __esModule: true });
});

const mockListDebateSamples = jest.fn<
  Array<{ id: string; title: string; topic: string }>,
  [string[], string | undefined]
>();
const mockSubscribe = jest.fn<() => void, [() => void]>(() => jest.fn());

jest.mock('@/services/demo/DemoContentService', () => ({
  DemoContentService: {
    listDebateSamples: (providers: string[], persona?: string) =>
      mockListDebateSamples(providers, persona),
    subscribe: (callback: () => void) => mockSubscribe(callback),
  },
}));

describe('DebateRecordPickerModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListDebateSamples.mockReturnValue([
      { id: 'debate-1', title: 'Climate Debate', topic: 'Climate change' },
    ]);
  });

  it('loads debates and selects existing entry', async () => {
    const onSelect = jest.fn();

    const { getByText } = renderWithProviders(
      <DebateRecordPickerModal
        visible
        providersKey="claude+openai"
        personaKey="default"
        onSelect={onSelect}
        onClose={jest.fn()}
      />
    );

    await waitFor(() => expect(mockListDebateSamples).toHaveBeenCalled());

    await waitFor(() => expect(getByText('Climate Debate')).toBeTruthy());

    fireEvent.press(getByText('Climate Debate'));
    expect(onSelect).toHaveBeenCalledWith({ type: 'existing', id: 'debate-1', topic: 'Climate change' });
    expect(mockListDebateSamples).toHaveBeenCalledWith(['claude', 'openai'], 'default');
  });

  it('creates a new debate sample when fields provided', async () => {
    const onSelect = jest.fn();

    const { getByText, getByPlaceholderText } = renderWithProviders(
      <DebateRecordPickerModal
        visible
        providersKey="claude+openai"
        personaKey="default"
        onSelect={onSelect}
        onClose={jest.fn()}
      />
    );

    await waitFor(() => expect(mockListDebateSamples).toHaveBeenCalled());

    fireEvent.press(getByText('＋ New sample…'));

    fireEvent.changeText(getByPlaceholderText('e.g., debate_co_custom_1'), 'debate-2');
    fireEvent.press(getByText('Create & Start'));
    // Should not call onSelect because topic missing
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.changeText(getByPlaceholderText('Debate motion/topic'), 'Mars colonization');
    fireEvent.press(getByText('Create & Start'));

    expect(onSelect).toHaveBeenCalledWith({ type: 'new', id: 'debate-2', topic: 'Mars colonization' });
  });
});
