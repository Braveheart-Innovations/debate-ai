import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ModelSelectorEnhanced } from '@/components/organisms/home/ModelSelectorEnhanced';

const mockTheme = {
  spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
  colors: {
    background: '#ffffff',
    surface: '#f5f5f5',
    border: '#e0e0e0',
    card: '#f1f1f1',
    text: { primary: '#111111', secondary: '#666666' },
    primary: { 100: '#ddeeff', 300: '#99bbff', 500: '#3366ff' },
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

  const matches = (element: any, key: keyof typeof hostComponentNames) =>
    element?.type === hostComponentNames[key];

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

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  const { View } = require('react-native');
  Reanimated.View = View;
  return Reanimated;
});

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  const { View } = require('react-native');
  return ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
    visible ? React.createElement(View, { testID: 'model-modal' }, children) : null;
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const mockBadge = jest.fn(() => null);
const mockSheetHeader = jest.fn(() => null);

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Badge: (props: any) => {
      mockBadge(props);
      return React.createElement(Text, null, props.label ?? 'Badge');
    },
    SheetHeader: (props: any) => {
      mockSheetHeader(props);
      return React.createElement(Text, null, props.title ?? 'Header');
    },
  };
});

jest.mock('@/config/modelConfigs', () => ({
  getProviderModels: jest.fn(() => ([
    { id: 'modelA', name: 'Model A', description: 'Primary', contextLength: 8000, isDefault: true },
    { id: 'modelB', name: 'Model B', description: 'Secondary', contextLength: 16000 },
  ])),
}));

jest.mock('@/config/modelPricing', () => ({
  MODEL_PRICING: {
    provider: {
      modelA: { inputPer1M: 1, outputPer1M: 2 },
      modelB: { inputPer1M: 3, outputPer1M: 4 },
    },
  },
}));

describe('ModelSelectorEnhanced', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens modal in compact mode and selects model', () => {
    const onSelectModel = jest.fn();

    expect(typeof ModelSelectorEnhanced).toBe('function');

    const { getAllByText, getByText } = render(
      <ModelSelectorEnhanced
        providerId="provider"
        selectedModel="modelA"
        onSelectModel={onSelectModel}
        compactMode
        aiName="Claude"
      />
    );

    fireEvent.press(getAllByText('Model A')[0]);
    expect(require('expo-haptics').impactAsync).toHaveBeenCalled();
    expect(getByText('Select Model')).toBeTruthy();

    fireEvent.press(getByText('Model B'));
    expect(onSelectModel).toHaveBeenCalledWith('modelB');
  });

  it('selects model directly in full mode', () => {
    const onSelectModel = jest.fn();

    expect(typeof ModelSelectorEnhanced).toBe('function');

    const { getByText } = render(
      <ModelSelectorEnhanced
        providerId="provider"
        selectedModel="modelB"
        onSelectModel={onSelectModel}
        showPricing={false}
      />
    );

    fireEvent.press(getByText('Model A'));
    expect(onSelectModel).toHaveBeenCalledWith('modelA');
  });
});
