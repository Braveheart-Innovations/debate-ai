import { act, fireEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { DebateSlotConfigSheet } from '@/components/organisms/debate/DebateSlotConfigSheet';
import { getProviderModels } from '@/config/modelConfigs';
import type { DebateVoicePicker } from '@/components/organisms/debate/DebateVoicePicker';
import type { AIConfig } from '@/types';
import { capturePropsOf } from '@test-utils/mockComponents';
import { requireDefined } from '@test-utils/queries';

jest.mock('@/components/organisms/help/HelpModalHost', () => ({
  HelpModalHost: () => null,
}));

const mockVoicePicker = capturePropsOf<typeof DebateVoicePicker>();
jest.mock('@/components/organisms/debate/DebateVoicePicker', () => ({
  get DebateVoicePicker() {
    return mockVoicePicker.Stub;
  },
}));

const claudeModels = (getProviderModels('claude') || []).filter((m) => !m.isDeprecated);

const claudeSlot: AIConfig = {
  id: 'claude-debater-slot-1',
  provider: 'claude',
  name: 'Claude',
  model: claudeModels[0]?.id || '',
  color: '#d97757',
};

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  ai: claudeSlot,
  slotLabel: 'Affirmative 1',
  modelId: claudeModels[0]?.id || '',
  onChangeModel: jest.fn(),
  personalityId: 'default',
  onChangePersonality: jest.fn(),
  providerOptions: [
    { id: 'claude', name: 'Claude', company: 'Anthropic', color: '#d97757' },
    { id: 'openai', name: 'ChatGPT', company: 'OpenAI', color: '#10a37f' },
    { id: 'gemini', name: 'Gemini', company: 'Google', color: '#4285f4' },
  ],
  configuredProviderIds: ['claude', 'openai'],
  onChangeProvider: jest.fn<void, [string]>(),
  onRemove: jest.fn(),
  testID: 'slot-config',
};

describe('DebateSlotConfigSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Haptics.impactAsync).mockResolvedValue(undefined);
    mockVoicePicker.reset();
  });

  it('renders the root page with model, personality, provider, and remove rows', () => {
    const { getByText, getByTestId } = renderWithProviders(
      <DebateSlotConfigSheet {...baseProps} />
    );

    expect(getByText('Claude')).toBeTruthy();
    expect(getByText('Affirmative 1')).toBeTruthy();
    expect(getByTestId('debate-slot-model-row')).toBeTruthy();
    expect(getByTestId('debate-slot-personality-row')).toBeTruthy();
    expect(getByTestId('debate-slot-change-provider-row')).toBeTruthy();
    expect(getByText('Remove debater')).toBeTruthy();
  });

  it('pushes the model page and commits a selection on tap', () => {
    const { getByTestId, getByText } = renderWithProviders(
      <DebateSlotConfigSheet {...baseProps} />
    );

    fireEvent.press(getByTestId('debate-slot-model-row'));
    expect(getByText('Select Model')).toBeTruthy();

    const target = claudeModels[claudeModels.length - 1];
    fireEvent.press(getByTestId(`debate-slot-model-list-option-${target.id}`));

    expect(baseProps.onChangeModel).toHaveBeenCalledWith(target.id);
  });

  it('pushes the personality page and commits a selection on tap', () => {
    const { getByTestId, getByText } = renderWithProviders(
      <DebateSlotConfigSheet {...baseProps} />
    );

    fireEvent.press(getByTestId('debate-slot-personality-row'));
    expect(getByText('Choose a Personality')).toBeTruthy();

    fireEvent.press(getByTestId('debate-slot-personality-grid-option-bestie'));
    expect(baseProps.onChangePersonality).toHaveBeenCalledWith('bestie');
  });

  it('hides the personality row when personalityId is undefined (MC / demo)', () => {
    const { queryByTestId } = renderWithProviders(
      <DebateSlotConfigSheet {...baseProps} personalityId={undefined} slotLabel="Podcast MC" />
    );

    expect(queryByTestId('debate-slot-personality-row')).toBeNull();
  });

  it('closes then removes when the destructive action is pressed', () => {
    const { getByText } = renderWithProviders(<DebateSlotConfigSheet {...baseProps} />);

    fireEvent.press(getByText('Remove debater'));
    expect(baseProps.onClose).toHaveBeenCalled();
    expect(baseProps.onRemove).toHaveBeenCalled();
  });

  it('pushes the provider page and commits a keyed provider, returning to the root page', () => {
    const { getByTestId, getByText, queryByText } = renderWithProviders(
      <DebateSlotConfigSheet {...baseProps} />
    );

    fireEvent.press(getByTestId('debate-slot-change-provider-row'));
    expect(baseProps.onClose).not.toHaveBeenCalled();
    expect(getByTestId('debate-slot-provider-list')).toBeTruthy();

    fireEvent.press(getByTestId('debate-slot-provider-list-row-openai'));
    expect(baseProps.onChangeProvider).toHaveBeenCalledWith('openai');
    expect(baseProps.onClose).not.toHaveBeenCalled();
    expect(getByText('Remove debater')).toBeTruthy();
    expect(queryByText('replacing Claude')).toBeNull();
  });

  it('closes the sheet then asks to add a key when an un-keyed provider is tapped', () => {
    const onRequestAddKey = jest.fn<void, [string]>();
    const { getByTestId } = renderWithProviders(
      <DebateSlotConfigSheet {...baseProps} onRequestAddKey={onRequestAddKey} />
    );

    fireEvent.press(getByTestId('debate-slot-change-provider-row'));
    fireEvent.press(getByTestId('debate-slot-provider-list-row-gemini'));

    expect(baseProps.onClose).toHaveBeenCalled();
    expect(onRequestAddKey).toHaveBeenCalledWith('gemini');
    expect(baseProps.onChangeProvider).not.toHaveBeenCalled();
  });

  it('shows the voice row only when voice props are wired, and opens the picker', () => {
    const onLoadVoices = jest.fn().mockResolvedValue({ voices: [] });
    const onSelectVoice = jest.fn();

    const { getByTestId, queryByTestId, rerender } = renderWithProviders(
      <DebateSlotConfigSheet {...baseProps} showVoice={false} />
    );
    expect(queryByTestId('debate-slot-voice-row')).toBeNull();

    rerender(
      <DebateSlotConfigSheet
        {...baseProps}
        showVoice
        voiceRequired
        voice={{ voiceId: 'voice-1', voiceName: 'Voice One' }}
        onLoadVoices={onLoadVoices}
        onSelectVoice={onSelectVoice}
      />
    );

    expect(mockVoicePicker.latest().visible).toBe(false);
    fireEvent.press(getByTestId('debate-slot-voice-row'));
    expect(mockVoicePicker.latest().visible).toBe(true);
    expect(mockVoicePicker.latest().target).toEqual({ kind: 'single', label: 'Claude — Affirmative 1' });
    expect(mockVoicePicker.latest().currentVoiceId).toBe('voice-1');

    act(() => {
      requireDefined(mockVoicePicker.latest().onSelectVoice, 'onSelectVoice')({
        id: 'voice-2',
        name: 'Voice Two',
      });
    });
    expect(onSelectVoice).toHaveBeenCalledWith({ id: 'voice-2', name: 'Voice Two' });
  });
});
