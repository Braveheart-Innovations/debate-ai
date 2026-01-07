/**
 * Tests for CreateScreen - Active image generation session screen
 * Note: Simplified tests due to component complexity
 */
import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';

// Mock dispatch and selector
const mockDispatch = jest.fn();
const mockUseSelector = jest.fn();
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockReplace = jest.fn();

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
    goBack: mockGoBack,
    replace: mockReplace,
  }),
  useRoute: () => ({
    params: {
      providers: ['openai'],
      initialPrompt: 'A beautiful sunset',
    },
  }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  saveToLibraryAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: (props: any) => React.createElement(Text, { testID: `icon-${props.name}` }, props.name),
  };
});

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
      React.createElement(Text, { testID }, children),
  };
});

jest.mock('@/components/organisms/chat/ImageRefinementModal', () => ({
  ImageRefinementModal: () => null,
}));

jest.mock('@/services/images/ImageService', () => ({
  ImageService: {
    generateImage: jest.fn().mockResolvedValue([{ url: 'file:///generated/image.png' }]),
  },
}));

jest.mock('@/config/create/stylePresets', () => ({
  buildEnhancedPrompt: (prompt: string) => prompt,
}));

jest.mock('@/config/create/sizeOptions', () => ({
  mapSizeToProvider: () => '1024x1024',
}));

jest.mock('@/config/imageGenerationModels', () => ({
  supportsImageInput: (provider: string) => ['openai', 'google'].includes(provider),
  getImageProviderDisplayName: (provider: string) => {
    const names: Record<string, string> = {
      openai: 'OpenAI',
      google: 'Google',
      grok: 'Grok',
    };
    return names[provider] || provider;
  },
}));

jest.mock('@/services/images/fileCache', () => ({
  loadBase64FromFileUri: jest.fn().mockResolvedValue('base64encodedimage'),
}));

// Mock useFeatureAccess hook
const mockUseFeatureAccess = jest.fn();
jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: () => mockUseFeatureAccess(),
  useFeatureAccess: () => mockUseFeatureAccess(),
}));

jest.mock('@/store/createSlice', () => ({
  selectCreateState: (state: any) => state.create,
  selectGallery: (state: any) => state.create.gallery,
  selectIsGenerating: (state: any) => state.create.isGenerating,
  startGeneration: jest.fn((providers) => ({ type: 'create/startGeneration', payload: providers })),
  updateGenerationProgress: jest.fn((payload) => ({ type: 'create/updateGenerationProgress', payload })),
  completeGeneration: jest.fn(() => ({ type: 'create/completeGeneration' })),
  addToGallery: jest.fn((entry) => ({ type: 'create/addToGallery', payload: entry })),
  removeFromGallery: jest.fn((id) => ({ type: 'create/removeFromGallery', payload: id })),
  persistGallery: jest.fn((gallery) => ({ type: 'create/persistGallery', payload: gallery })),
}));

const CreateScreen = require('@/screens/CreateScreen').default;

describe('CreateScreen', () => {
  const mockGalleryImage = {
    id: 'img_1',
    uri: 'file:///test/image1.png',
    prompt: 'A beautiful sunset',
    originalPrompt: 'A beautiful sunset',
    provider: 'openai',
    model: 'gpt-image-1',
    style: 'none',
    size: 'auto',
    quality: 'standard',
    createdAt: Date.now(),
    isRefinement: false,
    isUploaded: false,
  };

  const baseState = {
    settings: {
      apiKeys: { openai: 'key-1', google: 'key-2' },
    },
    create: {
      selectedStyle: 'none',
      selectedSize: 'auto',
      selectedQuality: 'standard',
      generationProgress: {},
      generationError: undefined,
      isGenerating: false,
      gallery: [mockGalleryImage],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockClear();
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockReplace.mockClear();
    mockUseSelector.mockImplementation((selector) => selector(baseState));
    // Default to non-demo mode
    mockUseFeatureAccess.mockReturnValue({
      isDemo: false,
      isPremium: true,
      isInTrial: false,
      membershipStatus: 'premium',
      canAccessLiveAI: true,
    });
  });

  describe('rendering', () => {
    it('renders without crashing', () => {
      const { getByText } = renderWithProviders(<CreateScreen />);
      expect(getByText('Create')).toBeTruthy();
    });

    it('shows provider name', () => {
      const { getAllByText } = renderWithProviders(<CreateScreen />);
      expect(getAllByText('OpenAI').length).toBeGreaterThan(0);
    });
  });

  describe('gallery display', () => {
    it('shows empty state when no images', () => {
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            gallery: [],
            isGenerating: false,
          },
        })
      );

      const { getByText } = renderWithProviders(<CreateScreen />);
      expect(getByText('No images generated yet')).toBeTruthy();
    });
  });

  describe('generation progress', () => {
    it('shows generation progress during generation', () => {
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            isGenerating: true,
            generationProgress: { openai: 'generating' },
          },
        })
      );

      const { getAllByText } = renderWithProviders(<CreateScreen />);
      expect(getAllByText('OpenAI').length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('shows error message when present', () => {
      mockUseSelector.mockImplementation((selector) =>
        selector({
          ...baseState,
          create: {
            ...baseState.create,
            generationError: 'API rate limit exceeded',
          },
        })
      );

      const { getByText } = renderWithProviders(<CreateScreen />);
      expect(getByText('API rate limit exceeded')).toBeTruthy();
    });
  });

  describe('demo mode guards', () => {
    it('uses isDemo from useFeatureAccess hook', () => {
      // Verify that the component renders when isDemo is false
      mockUseFeatureAccess.mockReturnValue({
        isDemo: false,
        isPremium: true,
        isInTrial: false,
        membershipStatus: 'premium',
        canAccessLiveAI: true,
      });

      const { getByText } = renderWithProviders(<CreateScreen />);
      expect(getByText('Create')).toBeTruthy();
    });

    it('renders in demo mode without crashing', () => {
      mockUseFeatureAccess.mockReturnValue({
        isDemo: true,
        isPremium: false,
        isInTrial: false,
        membershipStatus: 'demo',
        canAccessLiveAI: false,
      });

      const { getByText } = renderWithProviders(<CreateScreen />);
      expect(getByText('Create')).toBeTruthy();
    });
  });
});
