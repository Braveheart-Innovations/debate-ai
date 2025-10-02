import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { CompareRecordPickerModal } from '@/components/organisms/demo/CompareRecordPickerModal';

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
  const actual = jest.requireActual('@/theme');
  const React = require('react');
  return {
    ...actual,
    ThemeProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
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
  const matches = (element: any, key: keyof typeof hostComponentNames) => element?.type === hostComponentNames[key];
  return {
    configureHostComponentNamesIfNeeded: () => {},
    getHostComponentNames: () => hostComponentNames,
    isHostText: (element: any) => matches(element, 'text'),
    isHostTextInput: (element: any) => matches(element, 'textInput'),
    isHostImage: (element: any) => matches(element, 'image'),
    isHostSwitch: (element: any) => matches(element, 'switch'),
    isHostScrollView: (element: any) => matches(element, 'scrollView'),
    isHostModal: (element: any) => matches(element, 'modal'),
  };
});

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  const { View } = require('react-native');
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, { testID: 'modal-wrapper' }, children);
});

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  const actual = jest.requireActual('@/components/molecules');
  return {
    ...actual,
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    SheetHeader: ({ title, onClose }: { title: string; onClose: () => void }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        React.createElement(Text, { onPress: onClose }, 'close')
      ),
  };
});

const mockListCompareSamples = jest.fn();
const mockSubscribe = jest.fn(() => jest.fn());

jest.mock('@/services/demo/DemoContentService', () => ({
  DemoContentService: {
    listCompareSamples: (...args: any[]) => mockListCompareSamples(...args),
    subscribe: (callback: () => void) => mockSubscribe(callback),
  },
}));

describe('CompareRecordPickerModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListCompareSamples.mockResolvedValue([
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
