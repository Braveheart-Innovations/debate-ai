import React from 'react';
import { Text } from 'react-native';
import { act } from '@testing-library/react-native';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { capturePropsOf } from '@test-utils/mockComponents';
import { createMockAIConfig } from '@test-utils/fixtures';
import { setAIPersonality, setAIModel, showSheet, stageComposerAttachments } from '@/store';
import type { AIConfig } from '@/types';
import type { AISelectionConfig } from '@/types/aiSelection';
import type { DemoBanner } from '@/components/molecules/subscription/DemoBanner';
import type { CompareSamplePickerModal } from '@/components/organisms/demo/CompareSamplePickerModal';
import type { AIComposer, Header, HeaderActions } from '@/components/organisms';
import type { Button } from '@/components/molecules';
import { collectTestIds } from '@test-utils/queries';

const mockDispatch = jest.fn();
const mockUseFeatureAccess = jest.fn();
const mockUseComposerSelection = jest.fn();
const mockDemoBanner = capturePropsOf<typeof DemoBanner>((props) => (
  <Text testID="demo-banner" onPress={props.onPress}>
    demo-banner
  </Text>
));
const mockCompareSamplePicker = capturePropsOf<typeof CompareSamplePickerModal>((props) => (
  <Text testID="compare-sample-picker">{props.visible ? 'visible' : 'hidden'}</Text>
));
const mockComposer = capturePropsOf<typeof AIComposer>(() => (
  <Text testID="compare-composer">composer</Text>
));
const mockButton = capturePropsOf<typeof Button>((props) => (
  <Text accessibilityRole="button" onPress={props.onPress}>
    {props.title}
  </Text>
));

jest.mock('react-redux', () => {
  const actual = jest.requireActual<typeof import('react-redux')>('react-redux');
  return {
    ...actual,
    useDispatch: () => mockDispatch,
  };
});

jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockUseFeatureAccess(...args),
  useFeatureAccess: (...args: unknown[]) => mockUseFeatureAccess(...args),
}));

jest.mock('@/hooks/home/useComposerSelection', () => ({
  useComposerSelection: (...args: unknown[]) => mockUseComposerSelection(...args),
}));

jest.mock('@/hooks/useGreeting', () => ({
  useGreeting: () => ({
    timeBasedGreeting: 'Compare mode',
    welcomeMessage: 'Pick your AIs',
    greeting: {
      timeBasedGreeting: 'Compare mode',
      welcomeMessage: 'Pick your AIs',
    },
  }),
}));

jest.mock('@/components/molecules/subscription/TrialBanner', () => ({
  TrialBanner: () => {
    const React = require('react') as typeof import('react');
    const { Text } = require('react-native') as typeof import('react-native');
    return React.createElement(Text, { testID: 'trial-banner' }, 'trial-banner');
  },
}));

jest.mock('@/components/molecules/subscription/DemoBanner', () => ({
  get DemoBanner() {
    return mockDemoBanner.Stub;
  },
}));

jest.mock('@/components/organisms/demo/CompareSamplePickerModal', () => ({
  get CompareSamplePickerModal() {
    return mockCompareSamplePicker.Stub;
  },
}));

jest.mock('@/components/organisms', () => {
  const { stubComponent } = jest.requireActual<typeof import('@test-utils/mockComponents')>(
    '@test-utils/mockComponents'
  );
  return {
    Header: stubComponent<typeof Header>('header', { text: (props) => props.title }),
    HeaderActions: stubComponent<typeof HeaderActions>('header-actions', { text: () => 'actions' }),
    get AIComposer() {
      return mockComposer.Stub;
    },
  };
});

jest.mock('@/components/molecules', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    KeyboardAvoider: ({ children }: { children?: import('react').ReactNode }) => children,
    get Button() {
      return mockButton.Stub;
    },
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

const CompareSetupScreen = (require('@/screens/CompareSetupScreen') as typeof import('@/screens/CompareSetupScreen')).default;

const createAIConfig = (overrides: Partial<AIConfig> = {}): AIConfig =>
  createMockAIConfig({
    id: 'claude',
    provider: 'claude',
    name: 'Claude',
    model: 'claude-default',
    personality: 'default',
    ...overrides,
  });

const createSelectionConfig = (overrides: Partial<AISelectionConfig> = {}): AISelectionConfig => ({
  providerId: 'claude',
  modelId: 'claude-default',
  personalityId: 'default',
  ...overrides,
});

const createBaseSelection = () => {
  const configs: AISelectionConfig[] = [];
  const selectedAIConfigs: AIConfig[] = [];
  return {
    configs,
    configuredAIs: [createAIConfig(), createAIConfig({ id: 'openai', provider: 'openai', name: 'OpenAI', model: 'gpt-5' })],
    addProvider: jest.fn(),
    updateConfig: jest.fn(),
    removeConfig: jest.fn(),
    replaceConfigs: jest.fn(),
    selectedAIConfigs,
    sessionMaps: { personalities: {}, models: {} },
    hasEnoughAIs: false,
    hydrated: true,
    isDemo: false,
  };
};

type SelectionMock = ReturnType<typeof createBaseSelection>;

const createSelection = (overrides: Partial<SelectionMock> = {}): SelectionMock => ({
  ...createBaseSelection(),
  ...overrides,
});

const createReadySelection = () => {
  const leftAI = createAIConfig();
  const rightAI = createAIConfig({ id: 'openai', provider: 'openai', name: 'OpenAI', model: 'gpt-5', personality: 'succinct' });
  return {
    selection: createSelection({
      hasEnoughAIs: true,
      configs: [createSelectionConfig(), createSelectionConfig({ providerId: 'openai', modelId: 'gpt-5', personalityId: 'succinct' })],
      selectedAIConfigs: [leftAI, rightAI],
    }),
    leftAI,
    rightAI,
  };
};

describe('CompareSetupScreen', () => {
  const navigation = { navigate: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockClear();
    navigation.navigate.mockClear();
    mockUseFeatureAccess.mockReturnValue({ isDemo: false });
    mockUseComposerSelection.mockReturnValue(createSelection());
    mockDemoBanner.reset();
    mockCompareSamplePicker.reset();
    mockComposer.reset();
    mockButton.reset();
  });

  it('wires the composer for compare mode with left/right pill labels', () => {
    const { getByText } = renderWithProviders(
      <CompareSetupScreen navigation={navigation} />
    );

    expect(getByText('The Lens')).toBeTruthy();
    expect(mockUseComposerSelection).toHaveBeenCalledWith('compare', { minAIs: 2, maxAIs: 2 });
    expect(mockComposer.latest().mode).toBe('compare');
    expect(mockComposer.latest().minAIs).toBe(2);
    expect(mockComposer.latest().maxAIs).toBe(2);
    expect(mockComposer.latest().pillIndexLabels).toEqual(['L', 'R']);
    expect(mockComposer.latest().requireText).toBe(true);
  });

  it('places the trial banner between the header and the composer', () => {
    const renderResult = renderWithProviders(
      <CompareSetupScreen navigation={navigation} />
    );

    const testIds = collectTestIds(renderResult.toJSON());

    expect(testIds.indexOf('header')).toBeGreaterThanOrEqual(0);
    expect(testIds.indexOf('trial-banner')).toBeGreaterThanOrEqual(0);
    expect(testIds.indexOf('header')).toBeLessThan(testIds.indexOf('trial-banner'));
    expect(testIds.indexOf('trial-banner')).toBeLessThan(testIds.indexOf('compare-composer'));
  });

  it('seeds session maps and navigates with the typed prompt on send', async () => {
    const { selection, leftAI, rightAI } = createReadySelection();
    mockUseComposerSelection.mockReturnValue(selection);

    renderWithProviders(<CompareSetupScreen navigation={navigation} />);

    await act(async () => {
      mockComposer.latest().onSend('Which of you is funnier?');
    });

    expect(mockDispatch).toHaveBeenCalledWith(setAIPersonality({ aiId: leftAI.id, personalityId: 'default' }));
    expect(mockDispatch).toHaveBeenCalledWith(setAIModel({ aiId: leftAI.id, modelId: leftAI.model }));
    expect(mockDispatch).toHaveBeenCalledWith(setAIPersonality({ aiId: rightAI.id, personalityId: 'succinct' }));
    expect(mockDispatch).toHaveBeenCalledWith(setAIModel({ aiId: rightAI.id, modelId: rightAI.model }));

    expect(navigation.navigate).toHaveBeenCalledWith('CompareSession', {
      leftAI,
      rightAI,
      initialPrompt: 'Which of you is funnier?',
    });
  });

  it('stages composer attachments in Redux and keeps them out of nav params', async () => {
    const { selection, leftAI, rightAI } = createReadySelection();
    mockUseComposerSelection.mockReturnValue(selection);
    const attachment = {
      type: 'document' as const,
      uri: 'file://notes.pdf',
      mimeType: 'application/pdf',
      base64: 'def',
      fileName: 'notes.pdf',
    };

    renderWithProviders(<CompareSetupScreen navigation={navigation} />);

    expect(mockComposer.latest().allowAttachments).toBe(true);

    await act(async () => {
      mockComposer.latest().onSend('Summarize this document', [attachment]);
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      stageComposerAttachments({ mode: 'compare', attachments: [attachment] })
    );
    // Nav state is persisted to AsyncStorage — base64 must never ride params.
    expect(navigation.navigate).toHaveBeenCalledWith('CompareSession', {
      leftAI,
      rightAI,
      initialPrompt: 'Summarize this document',
    });
  });

  it('does not navigate when fewer than two AIs are selected', async () => {
    mockUseComposerSelection.mockReturnValue(
      createSelection({ hasEnoughAIs: false, selectedAIConfigs: [createAIConfig()] })
    );

    renderWithProviders(<CompareSetupScreen navigation={navigation} />);

    await act(async () => {
      mockComposer.latest().onSend('hello');
    });

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('shows demo gating and routes through sample picker', async () => {
    mockUseFeatureAccess.mockReturnValue({ isDemo: true });
    const { selection, leftAI, rightAI } = createReadySelection();
    mockUseComposerSelection.mockReturnValue(selection);

    renderWithProviders(<CompareSetupScreen navigation={navigation} />);

    expect(mockDemoBanner.latest()).toMatchObject({
      subtitle: expect.stringContaining('Demo'),
    });
    expect(mockComposer.latest().requireText).toBe(false);
    expect(mockComposer.latest().allowAttachments).toBe(false);
    expect(mockComposer.latest().allowedProviderIds).toEqual(['claude', 'openai']);

    await act(async () => {
      mockComposer.latest().onSend('');
    });

    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(mockCompareSamplePicker.latest()).toMatchObject({
      visible: true,
      providers: expect.arrayContaining([leftAI.provider, rightAI.provider]),
    });

    await act(async () => {
      mockCompareSamplePicker.latest().onSelect?.('demo-1');
    });

    expect(navigation.navigate).toHaveBeenCalledWith('CompareSession', expect.objectContaining({
      leftAI: expect.objectContaining({ id: leftAI.id }),
      rightAI: expect.objectContaining({ id: rightAI.id }),
      demoSampleId: 'demo-1',
    }));

    await act(async () => {
      mockCompareSamplePicker.latest().onClose?.();
    });

    expect(mockCompareSamplePicker.latest().visible).toBe(false);

    await act(async () => {
      mockDemoBanner.latest().onPress?.();
    });

    expect(mockDispatch).toHaveBeenCalledWith(showSheet({ sheet: 'subscription' }));
  });

  it('prompts to add API keys when fewer than two providers configured', async () => {
    mockUseComposerSelection.mockReturnValue(
      createSelection({ configuredAIs: [createAIConfig()] })
    );

    renderWithProviders(<CompareSetupScreen navigation={navigation} />);

    const addKeyCall = mockButton.calls.find((props) => props.title === 'Add AI Keys');
    expect(addKeyCall).toBeDefined();

    await act(async () => {
      addKeyCall?.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('APIConfig');
  });

  it('seeds pills from history rematch route params', () => {
    const selection = createSelection();
    mockUseComposerSelection.mockReturnValue(selection);

    const preselectedLeftAI = createAIConfig({ personality: 'friendly' });
    const preselectedRightAI = createAIConfig({ id: 'openai', provider: 'openai', name: 'OpenAI', model: 'gpt-5' });

    renderWithProviders(
      <CompareSetupScreen
        navigation={navigation}
        route={{ params: { preselectedLeftAI, preselectedRightAI } }}
      />
    );

    expect(selection.replaceConfigs).toHaveBeenCalledWith([
      { providerId: 'claude', modelId: 'claude-default', personalityId: 'friendly' },
      { providerId: 'openai', modelId: 'gpt-5', personalityId: 'default' },
    ]);
  });
});
