/**
 * Tests for CreateSetupScreen - Setup screen for AI image generation
 */
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';

// Mock dispatch and selector
const mockDispatch = jest.fn();
const mockUseSelector = jest.fn();
const mockUseFeatureAccess = jest.fn();
const mockNavigate = jest.fn();
let mockDynamicAISelectorProps: any;
let mockGradientButtonProps: any;

jest.mock('react-redux', () => {
  const actual = jest.requireActual('react-redux');
  return {
    ...actual,
    useDispatch: () => mockDispatch,
    useSelector: (selector: (state: any) => any) => mockUseSelector(selector),
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
  }),
  useFocusEffect: (cb: () => (() => void) | void) => {
    const { useEffect } = require('react');
    useEffect(() => {
      const cleanup = cb();
      return cleanup;
    }, [cb]);
  },
}));

jest.mock('@/hooks/useGreeting', () => ({
  useGreeting: () => ({
    timeBasedGreeting: 'Create something',
    welcomeMessage: 'Pick your AI',
    greeting: {
      timeBasedGreeting: 'Create something',
      welcomeMessage: 'Pick your AI',
    },
  }),
}));

jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockUseFeatureAccess(...args),
  useFeatureAccess: (...args: unknown[]) => mockUseFeatureAccess(...args),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: (props: any) => React.createElement(Text, { testID: `icon-${props.name}` }, props.name),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/components/organisms', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    Header: (props: any) =>
      React.createElement(
        View,
        { testID: 'header-container' },
        React.createElement(Text, { testID: 'header' }, props.title),
        props.rightElement
      ),
    HeaderActions: () => null,
    DynamicAISelector: (props: any) => {
      mockDynamicAISelectorProps = props;
      return React.createElement(Text, { testID: 'ai-selector' }, 'AI Selector');
    },
    ImageRefinementModal: () => null,
  };
});

let mockPromptHeroInputProps: any;
let mockAdvancedOptionsSectionProps: any;

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TextInput, TouchableOpacity, View } = require('react-native');
  return {
    Typography: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
      React.createElement(Text, { testID }, children),
    GradientButton: (props: any) => {
      mockGradientButtonProps = props;
      return React.createElement(
        TouchableOpacity,
        { testID: 'gradient-button', onPress: props.onPress, disabled: props.disabled },
        React.createElement(Text, null, props.title)
      );
    },
    HeaderIcon: (props: any) =>
      React.createElement(TouchableOpacity, { testID: props.testID, onPress: props.onPress }),
    SectionHeader: (props: any) =>
      React.createElement(Text, { testID: 'section-header' }, props.title),
    PromptHeroInput: (props: any) => {
      mockPromptHeroInputProps = props;
      return React.createElement(TextInput, {
        testID: props.testID || 'prompt-hero-input',
        value: props.value,
        onChangeText: props.onChangeText,
        placeholder: props.placeholder,
        maxLength: props.maxLength,
      });
    },
    AdvancedOptionsSection: (props: any) => {
      mockAdvancedOptionsSectionProps = props;
      return React.createElement(View, { testID: props.testID || 'advanced-options-section' },
        React.createElement(Text, null, 'Advanced Options')
      );
    },
  };
});

jest.mock('@/config/aiProviders', () => ({
  AI_PROVIDERS: [
    { id: 'openai', name: 'OpenAI', color: '#10A37F', enabled: true },
    { id: 'google', name: 'Google', color: '#4285F4', enabled: true },
    { id: 'grok', name: 'Grok', color: '#000000', enabled: true },
  ],
}));

jest.mock('@/config/create/stylePresets', () => ({
  STYLE_PRESETS: [
    { id: 'none', label: 'None', icon: 'close-circle-outline', promptSuffix: '' },
    { id: 'photo', label: 'Photo', icon: 'camera-outline', promptSuffix: 'Photorealistic' },
  ],
}));

jest.mock('@/config/create/sizeOptions', () => ({
  SIZE_OPTIONS: [
    { id: 'auto', label: 'Auto', icon: 'resize-outline', preview: 'Auto' },
    { id: 'square', label: 'Square', icon: 'square-outline', preview: '1:1' },
  ],
}));

jest.mock('@/config/imageGenerationModels', () => ({
  supportsImageGeneration: (provider: string) => ['openai', 'google', 'grok'].includes(provider),
  supportsImageInput: (provider: string) => ['openai', 'google'].includes(provider),
  getImageProviderDisplayName: (provider: string) => {
    const names: Record<string, string> = { openai: 'OpenAI', google: 'Google', grok: 'Grok' };
    return names[provider] || provider;
  },
}));

jest.mock('@/utils/aiProviderAssets', () => ({
  getAIProviderIcon: () => ({ iconType: 'letter', icon: 'O' }),
}));

jest.mock('@/store/createSlice', () => ({
  setPrompt: jest.fn((prompt) => ({ type: 'create/setPrompt', payload: prompt })),
  setStyle: jest.fn((style) => ({ type: 'create/setStyle', payload: style })),
  setSize: jest.fn((size) => ({ type: 'create/setSize', payload: size })),
  setQuality: jest.fn((quality) => ({ type: 'create/setQuality', payload: quality })),
  setSelectedProviders: jest.fn((providers) => ({ type: 'create/setSelectedProviders', payload: providers })),
  hydrateGallery: jest.fn(() => ({ type: 'create/hydrateGallery' })),
  selectCreateState: (state: any) => state.create,
}));

const CreateSetupScreen = require('@/screens/CreateSetupScreen').default;

describe('CreateSetupScreen', () => {
  const baseState = {
    settings: {
      apiKeys: { openai: 'key-1', google: 'key-2', grok: 'key-3' },
      verifiedProviders: ['openai', 'google', 'grok'],
    },
    create: {
      selectedProviders: [],
      currentPrompt: '',
      selectedStyle: 'none',
      selectedSize: 'auto',
      selectedQuality: 'standard',
      gallery: [],
      galleryHydrated: true,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockClear();
    mockNavigate.mockClear();
    mockDynamicAISelectorProps = undefined;
    mockGradientButtonProps = undefined;
    mockPromptHeroInputProps = undefined;
    mockAdvancedOptionsSectionProps = undefined;
    mockUseSelector.mockImplementation((selector) => selector(baseState));
    mockUseFeatureAccess.mockReturnValue({ membershipStatus: 'premium', isDemo: false, isPremium: true });
  });

  describe('rendering', () => {
    it('renders header with correct title', () => {
      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      expect(getByTestId('header')).toBeTruthy();
    });

    it('renders AI selector', () => {
      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      expect(getByTestId('ai-selector')).toBeTruthy();
    });

    it('renders generate button', () => {
      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      expect(getByTestId('gradient-button')).toBeTruthy();
    });

    it('renders PromptHeroInput', () => {
      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      expect(getByTestId('create-prompt-input')).toBeTruthy();
    });

    it('renders AdvancedOptionsSection', () => {
      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      expect(getByTestId('create-advanced-options')).toBeTruthy();
    });
  });

  describe('demo mode gating', () => {
    it('shows upgrade gate for demo users', () => {
      mockUseFeatureAccess.mockReturnValue({ membershipStatus: 'demo', isDemo: true, isPremium: false });
      const { getByText } = renderWithProviders(<CreateSetupScreen />);
      expect(getByText('Create Mode')).toBeTruthy();
      expect(getByText('Upgrade to Premium')).toBeTruthy();
    });

    it('allows trial users to access (trial = premium access)', () => {
      mockUseFeatureAccess.mockReturnValue({ membershipStatus: 'trial', isDemo: false, isPremium: true });
      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      expect(getByTestId('ai-selector')).toBeTruthy();
    });

    it('allows premium users to access', () => {
      mockUseFeatureAccess.mockReturnValue({ membershipStatus: 'premium', isDemo: false, isPremium: true });
      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      expect(getByTestId('ai-selector')).toBeTruthy();
    });
  });

  describe('AI provider selection', () => {
    it('passes correct props to DynamicAISelector', () => {
      renderWithProviders(<CreateSetupScreen />);
      expect(mockDynamicAISelectorProps).toBeDefined();
      expect(mockDynamicAISelectorProps.maxAIs).toBe(3);
    });
  });

  describe('PromptHeroInput integration', () => {
    it('passes correct props to PromptHeroInput', () => {
      renderWithProviders(<CreateSetupScreen />);
      expect(mockPromptHeroInputProps).toBeDefined();
      expect(mockPromptHeroInputProps.maxLength).toBe(4000);
      expect(mockPromptHeroInputProps.value).toBe('');
    });

    it('passes current prompt value to PromptHeroInput', () => {
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: { ...baseState.create, currentPrompt: 'Test prompt' },
        })
      );

      renderWithProviders(<CreateSetupScreen />);
      expect(mockPromptHeroInputProps.value).toBe('Test prompt');
    });

    it('dispatches setPrompt when text changes', () => {
      renderWithProviders(<CreateSetupScreen />);
      mockPromptHeroInputProps.onChangeText('New prompt');
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'create/setPrompt', payload: 'New prompt' });
    });
  });

  describe('AdvancedOptionsSection integration', () => {
    it('passes correct props to AdvancedOptionsSection', () => {
      renderWithProviders(<CreateSetupScreen />);
      expect(mockAdvancedOptionsSectionProps).toBeDefined();
      expect(mockAdvancedOptionsSectionProps.selectedSize).toBe('auto');
      expect(mockAdvancedOptionsSectionProps.selectedQuality).toBe('standard');
    });

    it('passes updated size to AdvancedOptionsSection', () => {
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: { ...baseState.create, selectedSize: 'square' },
        })
      );

      renderWithProviders(<CreateSetupScreen />);
      expect(mockAdvancedOptionsSectionProps.selectedSize).toBe('square');
    });

    it('passes updated quality to AdvancedOptionsSection', () => {
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: { ...baseState.create, selectedQuality: 'hd' },
        })
      );

      renderWithProviders(<CreateSetupScreen />);
      expect(mockAdvancedOptionsSectionProps.selectedQuality).toBe('hd');
    });

    it('dispatches setSize when size changes', () => {
      renderWithProviders(<CreateSetupScreen />);
      mockAdvancedOptionsSectionProps.onSizeChange('portrait');
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'create/setSize', payload: 'portrait' });
    });

    it('dispatches setQuality when quality changes', () => {
      renderWithProviders(<CreateSetupScreen />);
      mockAdvancedOptionsSectionProps.onQualityChange('hd');
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'create/setQuality', payload: 'hd' });
    });
  });

  describe('generation', () => {
    it('disables generate button when no prompt', () => {
      renderWithProviders(<CreateSetupScreen />);
      expect(mockGradientButtonProps.disabled).toBe(true);
    });

    it('enables generate button when prompt and providers are set', () => {
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            currentPrompt: 'A beautiful sunset',
            selectedProviders: ['openai'],
          },
        })
      );

      renderWithProviders(<CreateSetupScreen />);
      expect(mockGradientButtonProps.disabled).toBe(false);
    });

    it('navigates to CreateSession on generate', () => {
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            currentPrompt: 'A beautiful sunset',
            selectedProviders: ['openai', 'google'],
          },
        })
      );

      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      fireEvent.press(getByTestId('gradient-button'));

      expect(mockNavigate).toHaveBeenCalledWith('CreateSession', {
        providers: ['openai', 'google'],
        initialPrompt: 'A beautiful sunset',
      });
    });
  });

  describe('gallery hydration', () => {
    it('dispatches hydrateGallery on mount when not hydrated', () => {
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: { ...baseState.create, galleryHydrated: false },
        })
      );

      renderWithProviders(<CreateSetupScreen />);
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'create/hydrateGallery' });
    });

    it('does NOT dispatch hydrateGallery in demo mode', () => {
      mockUseFeatureAccess.mockReturnValue({ membershipStatus: 'demo', isDemo: true, isPremium: false });
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: { ...baseState.create, galleryHydrated: false },
        })
      );

      renderWithProviders(<CreateSetupScreen />);
      expect(mockDispatch).not.toHaveBeenCalledWith({ type: 'create/hydrateGallery' });
    });
  });

  describe('gallery access', () => {
    it('navigates to CreateSession when gallery button is pressed (premium user)', () => {
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: { ...baseState.create, gallery: [{ id: '1' }] },
        })
      );

      const { getByTestId } = renderWithProviders(<CreateSetupScreen />);
      fireEvent.press(getByTestId('header-gallery-button'));

      expect(mockNavigate).toHaveBeenCalledWith('CreateSession', {});
    });

    // Note: Demo users now see the upgrade gate before reaching the gallery button,
    // so gallery-specific demo tests are no longer applicable
  });
});
