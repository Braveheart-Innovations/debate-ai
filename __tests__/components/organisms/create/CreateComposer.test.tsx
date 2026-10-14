import { fireEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { capturePropsOf } from '@test-utils/mockComponents';
import { CreateComposer } from '@/components/organisms/create/CreateComposer';
import type { ProviderPickerSheet } from '@/components/organisms/composer/ProviderPickerSheet';
import type { CreateSelectionConfig } from '@/types/createSelection';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  notificationAsync: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Warning: 'warning' },
}));

const mockPickerSheet = capturePropsOf<typeof ProviderPickerSheet>();
jest.mock('@/components/organisms/composer/ProviderPickerSheet', () => ({
  get ProviderPickerSheet() {
    return mockPickerSheet.Stub;
  },
}));

const noConfigs: CreateSelectionConfig[] = [];

const baseProps = {
  tab: 'image' as const,
  configs: noConfigs,
  maxAIs: 2,
  onAddProvider: jest.fn<void, [string]>(),
  onUpdateConfig: jest.fn<void, [number, Partial<CreateSelectionConfig>]>(),
  onRemoveConfig: jest.fn<void, [number]>(),
  pickerProviders: [{ id: 'openai', name: 'OpenAI', company: 'OpenAI', color: '#10a37f' }],
  configuredProviderIds: ['openai'],
  onRequestAddKey: jest.fn<void, [string]>(),
  attachments: [],
  onRemoveAttachment: jest.fn<void, [string]>(),
  inputText: 'a red fox',
  onChangeText: jest.fn<void, [string]>(),
  onSend: jest.fn<void, [string]>(),
  canSend: false,
  validationMessage: null,
  testID: 'create-composer',
};

describe('CreateComposer blocked send', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPickerSheet.reset();
  });

  it('opens the picker asking for an image AI when keys exist but none is picked', () => {
    const { getByTestId } = renderWithProviders(<CreateComposer {...baseProps} />);

    fireEvent.press(getByTestId('create-composer-send'));

    expect(mockPickerSheet.latest()).toEqual(
      expect.objectContaining({ visible: true, message: 'Pick an AI to create your image.' })
    );
    expect(Haptics.notificationAsync).toHaveBeenCalled();
    expect(baseProps.onSend).not.toHaveBeenCalled();
  });

  it('opens the picker with an add-a-key message when no image provider is configured', () => {
    const { getByTestId } = renderWithProviders(
      <CreateComposer {...baseProps} configuredProviderIds={[]} />
    );

    fireEvent.press(getByTestId('create-composer-send'));

    expect(mockPickerSheet.latest()).toEqual(
      expect.objectContaining({
        visible: true,
        message: 'Add an API key for an image AI (OpenAI, Google, or Grok) to create images.',
      })
    );
  });

  it('opens the picker without a message from the add pill', () => {
    const { getByTestId } = renderWithProviders(<CreateComposer {...baseProps} />);

    fireEvent.press(getByTestId('create-composer-send'));
    fireEvent.press(getByTestId('create-composer-add-ai'));

    expect(mockPickerSheet.latest()).toEqual(
      expect.objectContaining({ visible: true, message: null })
    );
  });

  it('hands a blocked video send to the screen instead of opening the picker', () => {
    const onBlockedSend = jest.fn<void, []>();
    const { getByTestId } = renderWithProviders(
      <CreateComposer {...baseProps} tab="video" onBlockedSend={onBlockedSend} />
    );

    fireEvent.press(getByTestId('create-composer-send'));

    expect(onBlockedSend).toHaveBeenCalledTimes(1);
    expect(mockPickerSheet.latest().visible).toBe(false);
  });

  it('sends normally when the composer can send', () => {
    const { getByTestId } = renderWithProviders(<CreateComposer {...baseProps} canSend />);

    fireEvent.press(getByTestId('create-composer-send'));

    expect(baseProps.onSend).toHaveBeenCalledWith('a red fox');
    expect(mockPickerSheet.latest().visible).toBe(false);
  });
});
