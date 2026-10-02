import { Text } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { capturePropsOf, type PropsCapture } from '@test-utils/mockComponents';
import { requireDefined } from '@test-utils/queries';
import { ComposerShell } from '@/components/organisms/composer/ComposerShell';
import { AIComposer } from '@/components/organisms/composer/AIComposer';
import { getProviderDefaultModel } from '@/config/modelConfigs';
import type { AISelectionConfig } from '@/types/aiSelection';
import type { MessageAttachment } from '@/types';
import type { ProviderPickerSheet } from '@/components/organisms/composer/ProviderPickerSheet';
import type { AIConfigSheet } from '@/components/organisms/composer/AIConfigSheet';
import type { ImageUploadModal } from '@/components/organisms/chat/ImageUploadModal';
import type { DocumentUploadModal } from '@/components/organisms/chat/DocumentUploadModal';

// Root __mocks__/expo-speech-recognition.ts adds the __emit/__reset test helpers.
// Mocking explicitly routes both the component's import and requireMock through
// the mock registry, so `speech` is the instance useDictation sees, typed from the mock file.
jest.mock('expo-speech-recognition');
const speech = jest.requireMock<typeof import('../../../../__mocks__/expo-speech-recognition')>(
  'expo-speech-recognition'
);
const speechModule = speech.ExpoSpeechRecognitionModule;

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

const mockPickerSheet = capturePropsOf<typeof ProviderPickerSheet>();
const mockConfigSheet = capturePropsOf<typeof AIConfigSheet>();
const mockImageUploadModal = capturePropsOf<typeof ImageUploadModal>();
const mockDocUploadModal = capturePropsOf<typeof DocumentUploadModal>();

const resetSheetCaptures = () => {
  mockPickerSheet.reset();
  mockConfigSheet.reset();
  mockImageUploadModal.reset();
  mockDocUploadModal.reset();
};

jest.mock('@/components/organisms/composer/ProviderPickerSheet', () => ({
  get ProviderPickerSheet() {
    return mockPickerSheet.Stub;
  },
}));

jest.mock('@/components/organisms/composer/AIConfigSheet', () => ({
  get AIConfigSheet() {
    return mockConfigSheet.Stub;
  },
}));

jest.mock('@/components/organisms/chat/ImageUploadModal', () => ({
  get ImageUploadModal() {
    return mockImageUploadModal.Stub;
  },
}));

jest.mock('@/components/organisms/chat/DocumentUploadModal', () => ({
  get DocumentUploadModal() {
    return mockDocUploadModal.Stub;
  },
}));

const shellProps = {
  inputText: '',
  onChangeText: jest.fn(),
  onSend: jest.fn(),
  canSend: false,
  pills: [
    { key: 'claude-0', name: 'Claude', color: '#D97706' },
    { key: 'openai-1', name: 'ChatGPT', color: '#10A37F' },
  ],
  onPillPress: jest.fn(),
  showAddPill: true,
  onAddPill: jest.fn(),
  testID: 'shell',
};

describe('ComposerShell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSheetCaptures();
  });

  it('renders a pill per descriptor plus the add pill', () => {
    const { getByText, getByTestId } = renderWithProviders(<ComposerShell {...shellProps} />);
    expect(getByText('Claude')).toBeTruthy();
    expect(getByText('ChatGPT')).toBeTruthy();
    expect(getByTestId('shell-add-ai')).toBeTruthy();
  });

  it('hides the add pill when showAddPill is false', () => {
    const { queryByTestId } = renderWithProviders(
      <ComposerShell {...shellProps} showAddPill={false} />
    );
    expect(queryByTestId('shell-add-ai')).toBeNull();
  });

  it('reports pill presses by index', () => {
    const onPillPress = jest.fn();
    const { getByTestId } = renderWithProviders(
      <ComposerShell {...shellProps} onPillPress={onPillPress} />
    );
    fireEvent.press(getByTestId('shell-pill-1'));
    expect(onPillPress).toHaveBeenCalledWith(1);
  });

  it('blocks send when canSend is false and sends trimmed text when true', () => {
    const onSend = jest.fn();
    const { getByTestId, rerender } = renderWithProviders(
      <ComposerShell {...shellProps} onSend={onSend} inputText="  hello  " />
    );
    fireEvent.press(getByTestId('shell-send'));
    expect(onSend).not.toHaveBeenCalled();

    rerender(<ComposerShell {...shellProps} onSend={onSend} inputText="  hello  " canSend />);
    fireEvent.press(getByTestId('shell-send'));
    expect(onSend).toHaveBeenCalledWith('hello');
  });

  it('renders validation hint, aboveInput, and leadingAccessory slots', () => {
    const { getByText, getByTestId } = renderWithProviders(
      <ComposerShell
        {...shellProps}
        validationMessage="Add an AI to start chatting"
        aboveInput={<Text testID="above">chip</Text>}
        leadingAccessory={<Text testID="leading">options</Text>}
      />
    );
    expect(getByTestId('shell-validation')).toBeTruthy();
    expect(getByText('Add an AI to start chatting')).toBeTruthy();
    expect(getByTestId('above')).toBeTruthy();
    expect(getByTestId('leading')).toBeTruthy();
  });
});

describe('ComposerShell dictation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSheetCaptures();
    speech.__reset();
  });

  const startDictation = async (getByTestId: (id: string) => ReactTestInstance) => {
    await act(async () => {
      fireEvent.press(getByTestId('shell-mic'));
    });
    act(() => speech.__emit('start'));
  };

  it('dictates into the input after any typed text', async () => {
    const onChangeText = jest.fn();
    const { getByTestId, getByLabelText } = renderWithProviders(
      <ComposerShell {...shellProps} inputText="Debate" onChangeText={onChangeText} />
    );
    await startDictation(getByTestId);
    expect(speechModule.start).toHaveBeenCalled();
    expect(getByLabelText('Stop dictation')).toBeTruthy();

    act(() =>
      speech.__emit('result', {
        isFinal: false,
        results: [{ transcript: 'remote work', confidence: 1, segments: [] }],
      })
    );
    expect(onChangeText).toHaveBeenLastCalledWith('Debate remote work');

    fireEvent.press(getByTestId('shell-mic'));
    expect(speechModule.stop).toHaveBeenCalled();
    act(() => speech.__emit('end'));
    expect(getByLabelText('Dictate message')).toBeTruthy();
  });

  it('cancels dictation on send so late words cannot refill the cleared input', async () => {
    const onChangeText = jest.fn();
    const onSend = jest.fn();
    const { getByTestId } = renderWithProviders(
      <ComposerShell
        {...shellProps}
        inputText="hello"
        canSend
        onSend={onSend}
        onChangeText={onChangeText}
      />
    );
    await startDictation(getByTestId);

    fireEvent.press(getByTestId('shell-send'));
    expect(onSend).toHaveBeenCalledWith('hello');
    expect(speechModule.abort).toHaveBeenCalled();

    act(() =>
      speech.__emit('result', {
        isFinal: true,
        results: [{ transcript: 'late', confidence: 1, segments: [] }],
      })
    );
    expect(onChangeText).not.toHaveBeenCalled();
  });

  it('shows dictation errors in the hint row and clears them when the user types', async () => {
    speechModule.requestPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: false,
      expires: 'never',
      status: 'denied',
    });
    const { getByTestId, queryByTestId } = renderWithProviders(<ComposerShell {...shellProps} />);
    await act(async () => {
      fireEvent.press(getByTestId('shell-mic'));
    });
    expect(getByTestId('shell-validation')).toHaveTextContent(/Microphone access is off/);

    fireEvent.changeText(getByTestId('shell-input'), 'typing instead');
    expect(queryByTestId('shell-validation')).toBeNull();
  });

  it('hides the mic when dictation is off or the device has no recognizer', () => {
    const { queryByTestId, unmount } = renderWithProviders(
      <ComposerShell {...shellProps} dictationEnabled={false} />
    );
    expect(queryByTestId('shell-mic')).toBeNull();
    unmount();

    speechModule.isRecognitionAvailable.mockReturnValue(false);
    const second = renderWithProviders(<ComposerShell {...shellProps} />);
    expect(second.queryByTestId('shell-mic')).toBeNull();
  });
});

describe('AIComposer (wrapper parity)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSheetCaptures();
  });

  const configs: AISelectionConfig[] = [
    { providerId: 'claude', modelId: 'claude-x', personalityId: 'default' },
    { providerId: 'openai', modelId: 'gpt-x', personalityId: 'default' },
  ];

  const composerProps = {
    mode: 'chat' as const,
    configs,
    minAIs: 1,
    maxAIs: 3,
    onAddProvider: jest.fn(),
    onUpdateConfig: jest.fn(),
    onRemoveConfig: jest.fn(),
    configuredProviderIds: ['claude', 'openai'],
    inputText: '',
    onChangeText: jest.fn(),
    onSend: jest.fn(),
    testID: 'composer',
  };

  it('resolves configs to catalog pills and keeps the add pill below maxAIs', () => {
    const { getByText, getByTestId } = renderWithProviders(<AIComposer {...composerProps} />);
    expect(getByText('Claude')).toBeTruthy();
    expect(getByText('ChatGPT')).toBeTruthy();
    expect(getByTestId('composer-add-ai')).toBeTruthy();
  });

  it('requires text before sending, then sends trimmed text', () => {
    const onSend = jest.fn();
    const { getByTestId, rerender } = renderWithProviders(
      <AIComposer {...composerProps} onSend={onSend} />
    );
    fireEvent.press(getByTestId('composer-send'));
    expect(onSend).not.toHaveBeenCalled();

    rerender(<AIComposer {...composerProps} onSend={onSend} inputText="  hi there  " />);
    fireEvent.press(getByTestId('composer-send'));
    expect(onSend).toHaveBeenCalledWith('hi there');
  });

  it('shows the chat validation copy when below minAIs', () => {
    const { getByText } = renderWithProviders(
      <AIComposer {...composerProps} configs={[]} minAIs={1} />
    );
    expect(getByText('Add an AI to start chatting')).toBeTruthy();
  });

  it('opens the config sheet for the tapped pill config', () => {
    const { getByTestId } = renderWithProviders(<AIComposer {...composerProps} />);
    fireEvent.press(getByTestId('composer-pill-1'));
    expect(mockConfigSheet.latest()).toEqual(
      expect.objectContaining({ visible: true, config: configs[1] })
    );
  });

  it('passes compare duplicate policy through to the picker sheet', () => {
    renderWithProviders(<AIComposer {...composerProps} mode="compare" minAIs={2} maxAIs={2} />);
    expect(mockPickerSheet.latest()).toEqual(
      expect.objectContaining({ allowDuplicates: true })
    );
  });
});

describe('AIComposer attachments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSheetCaptures();
  });

  const visionModel = requireDefined(getProviderDefaultModel('claude'), 'claude default model').id;
  const capableConfigs: AISelectionConfig[] = [
    { providerId: 'claude', modelId: visionModel, personalityId: 'default' },
  ];
  const unsupportedConfigs: AISelectionConfig[] = [
    { providerId: 'openai', modelId: 'nonexistent-model', personalityId: 'default' },
  ];

  const imageAttachment: MessageAttachment = {
    type: 'image',
    uri: 'file://photo.png',
    mimeType: 'image/png',
    base64: 'abc',
    fileName: 'photo.png',
  };
  const documentAttachment: MessageAttachment = {
    type: 'document',
    uri: 'file://notes.pdf',
    mimeType: 'application/pdf',
    base64: 'def',
    fileName: 'notes.pdf',
  };

  const attachProps = {
    mode: 'chat' as const,
    configs: capableConfigs,
    minAIs: 1,
    maxAIs: 3,
    onAddProvider: jest.fn(),
    onUpdateConfig: jest.fn(),
    onRemoveConfig: jest.fn(),
    configuredProviderIds: ['claude'],
    inputText: '',
    onChangeText: jest.fn(),
    onSend: jest.fn(),
    allowAttachments: true,
    testID: 'composer',
  };

  const lastUploadHandler = (
    capture: PropsCapture<typeof ImageUploadModal> | PropsCapture<typeof DocumentUploadModal>
  ): ((atts: MessageAttachment[]) => void) => capture.latest().onUpload;

  it('hides the attach button unless allowAttachments is set', () => {
    const { queryByTestId } = renderWithProviders(
      <AIComposer {...attachProps} allowAttachments={false} />
    );
    expect(queryByTestId('composer-attach')).toBeNull();
  });

  it('hides the attach button when the selected models support no uploads', () => {
    const { queryByTestId } = renderWithProviders(
      <AIComposer {...attachProps} configs={unsupportedConfigs} />
    );
    expect(queryByTestId('composer-attach')).toBeNull();
  });

  it('picks an image through the options row and sends it with the text', () => {
    const onSend = jest.fn();
    const { getByTestId, getByLabelText, queryByTestId } = renderWithProviders(
      <AIComposer {...attachProps} onSend={onSend} inputText="What is this?" />
    );

    fireEvent.press(getByTestId('composer-attach'));
    fireEvent.press(getByLabelText('Image'));
    expect(mockImageUploadModal.latest()).toEqual(
      expect.objectContaining({ visible: true })
    );

    act(() => lastUploadHandler(mockImageUploadModal)([imageAttachment]));
    expect(getByTestId('composer-attachments')).toBeTruthy();

    fireEvent.press(getByTestId('composer-send'));
    expect(onSend).toHaveBeenCalledWith('What is this?', [imageAttachment]);
    // Chips clear after the send hands the files off.
    expect(queryByTestId('composer-attachments')).toBeNull();
  });

  it('keeps the attachment but blocks send when a selected model loses support', () => {
    const onSend = jest.fn();
    const { getByTestId, getByText, rerender } = renderWithProviders(
      <AIComposer {...attachProps} onSend={onSend} inputText="Summarize" />
    );

    act(() => lastUploadHandler(mockDocUploadModal)([documentAttachment]));
    expect(getByTestId('composer-attachments')).toBeTruthy();

    rerender(
      <AIComposer
        {...attachProps}
        onSend={onSend}
        inputText="Summarize"
        configs={unsupportedConfigs}
        configuredProviderIds={['openai']}
      />
    );

    expect(
      getByText("Attached file isn't supported by every selected AI — remove it or switch models")
    ).toBeTruthy();
    expect(getByTestId('composer-attachments')).toBeTruthy();

    fireEvent.press(getByTestId('composer-send'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends without an attachments argument when nothing is attached', () => {
    const onSend = jest.fn();
    const { getByTestId } = renderWithProviders(
      <AIComposer {...attachProps} onSend={onSend} inputText="Plain text" />
    );

    fireEvent.press(getByTestId('composer-send'));
    expect(onSend).toHaveBeenCalledWith('Plain text');
  });
});
