import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DebateRecordPickerModal } from '@/components/organisms/demo/DebateRecordPickerModal';

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  const { View } = require('react-native');

  const MockModal = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(View, { ...props }, children);

  MockModal.displayName = 'MockModal';
  // Support both default and named import patterns React Native may use
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (MockModal as any).default = MockModal;
  // Mark as ES module to satisfy downstream interop expectations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (MockModal as any).__esModule = true;

  return MockModal;
});

const mockListDebateSamples = jest.fn();
const mockSubscribe = jest.fn(() => jest.fn());

jest.mock('@/services/demo/DemoContentService', () => ({
  DemoContentService: {
    listDebateSamples: (...args: any[]) => mockListDebateSamples(...args),
    subscribe: (callback: () => void) => mockSubscribe(callback),
  },
}));

describe('DebateRecordPickerModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListDebateSamples.mockResolvedValue([
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
