import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme';
import { useResponsive } from '@/hooks/useResponsive';
import { ComposerShell, ComposerPillDescriptor } from './ComposerShell';
import { ProviderPickerSheet } from './ProviderPickerSheet';
import { AIConfigSheet } from './AIConfigSheet';
import { ImageUploadModal } from '../chat/ImageUploadModal';
import { DocumentUploadModal } from '../chat/DocumentUploadModal';
import MultimodalOptionsRow, {
  ModalityKey,
} from '@/components/molecules/chat/MultimodalOptionsRow';
import { AttachmentChip } from '@/components/molecules';
import { AISelectionConfig, AISelectionMode } from '@/types/aiSelection';
import { MessageAttachment } from '@/types';
import { getProviderById } from '@/config/aiProviders';
import { getModelById } from '@/config/modelConfigs';
import {
  mergeAvailabilities,
  mergeAvailabilitiesStrict,
} from '@/hooks/multimodal/useModalityAvailability';

const MAX_ATTACHMENTS = 20;

export interface AIComposerProps {
  mode: AISelectionMode;
  configs: AISelectionConfig[];
  minAIs: number;
  maxAIs: number;
  onAddProvider: (providerId: string) => void;
  onUpdateConfig: (index: number, patch: Partial<AISelectionConfig>) => void;
  onRemoveConfig: (index: number) => void;
  configuredProviderIds: string[];
  /** Demo mode: restrict the picker to these providers and hide Add-key rows. */
  allowedProviderIds?: string[];
  /** Opens API configuration on that provider's key card. */
  onRequestAddKey?: (providerId: string) => void;
  /** Shows the per-pill "Advanced parameters" page (hidden in demo, where it is gated). */
  showAdvancedParams?: boolean;
  inputText: string;
  onChangeText: (text: string) => void;
  onSend: (text: string, attachments?: MessageAttachment[]) => void;
  /** Demo sends open a sample picker regardless of typed text. */
  requireText?: boolean;
  /** Enables pre-send image/document attachments (hidden in demo). */
  allowAttachments?: boolean;
  placeholder?: string;
  /** Compare labels its pills by pane, e.g. ['1', '2']. */
  pillIndexLabels?: string[];
  disabled?: boolean;
  testID?: string;
}

/**
 * Composer-first entry surface for Chat/Compare: resolves the LLM catalog
 * (providers + models) into ComposerShell pills and owns the LLM-shaped
 * sheets. Sending auto-creates the session — there is no separate Start
 * button. Attachments picked here ride the first auto-sent message.
 */
export const AIComposer: React.FC<AIComposerProps> = ({
  mode,
  configs,
  minAIs,
  maxAIs,
  onAddProvider,
  onUpdateConfig,
  onRemoveConfig,
  configuredProviderIds,
  allowedProviderIds,
  onRequestAddKey,
  showAdvancedParams,
  inputText,
  onChangeText,
  onSend,
  requireText = true,
  allowAttachments = false,
  placeholder = 'Ask anything…',
  pillIndexLabels,
  disabled = false,
  testID,
}) => {
  const { theme } = useTheme();
  const { isTablet } = useResponsive();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerMessage, setPickerMessage] = useState<string | null>(null);
  const [configIndex, setConfigIndex] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [showOptionsRow, setShowOptionsRow] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [showDocUpload, setShowDocUpload] = useState(false);

  // Same gating the in-session input bars use: Chat requires every selected
  // AI to accept an input modality (attachments fan out to all of them);
  // Compare uses the strict merge to match CompareScreen.
  const modality = useMemo(() => {
    const items = configs.map(config => ({ provider: config.providerId, model: config.modelId }));
    return mode === 'compare' ? mergeAvailabilitiesStrict(items) : mergeAvailabilities(items);
  }, [configs, mode]);
  const canAttachImages = modality.imageUpload.supported;
  const canAttachDocuments = modality.documentUpload.supported;
  const showAttachButton = allowAttachments && (canAttachImages || canAttachDocuments);

  const hasEnoughAIs = configs.length >= minAIs;
  const hasText = inputText.trim().length > 0;
  const hasImageAttachment = attachments.some(a => a.type === 'image');
  const hasDocumentAttachment = attachments.some(a => a.type === 'document');
  // Lineup changed after attaching (e.g. a non-vision model was added):
  // keep the file, block send, explain — never silently drop it.
  const attachmentBlocked =
    (hasImageAttachment && !canAttachImages) ||
    (hasDocumentAttachment && !canAttachDocuments);
  const canSend =
    !disabled && hasEnoughAIs && (hasText || !requireText) && !attachmentBlocked;
  const validationMessage = !hasEnoughAIs
    ? mode === 'compare'
      ? configs.length === 0
        ? 'Add 2 AIs to compare side by side'
        : 'Compare needs 2 AIs — add another to continue'
      : 'Add an AI to start chatting'
    : attachmentBlocked
      ? "Attached file isn't supported by every selected AI — remove it or switch models"
      : null;

  // Pills track their config index explicitly so a config whose provider
  // fails to resolve never shifts the tap targets of the pills after it.
  const pills: ComposerPillDescriptor[] = [];
  const pillConfigIndices: number[] = [];
  configs.forEach((config, index) => {
    const provider = getProviderById(config.providerId);
    if (!provider) return;
    const model = getModelById(config.providerId, config.modelId);
    pills.push({
      key: `${config.providerId}-${index}`,
      name: provider.name,
      color: provider.color,
      modelLabel: isTablet ? model?.name : undefined,
      indexLabel: pillIndexLabels?.[index],
    });
    pillConfigIndices.push(index);
  });

  const activeConfig = configIndex !== null ? configs[configIndex] ?? null : null;

  const closeConfigSheet = () => setConfigIndex(null);

  const openPicker = (message: string | null) => {
    setPickerMessage(message);
    setPickerVisible(true);
  };

  // Send tapped before enough AIs are picked: open the picker and say why,
  // instead of ignoring the tap.
  const missingAIs = minAIs - configs.length;
  const blockedSendMessage =
    configuredProviderIds.length === 0
      ? mode === 'compare'
        ? 'Add API keys for two AIs to compare their answers.'
        : 'Add an API key for a chat AI to send your message.'
      : mode === 'compare'
        ? missingAIs > 1
          ? 'Pick two AIs to compare side by side.'
          : 'Pick one more AI to compare against.'
        : 'Pick an AI to answer your message.';
  const handleBlockedSend =
    !hasEnoughAIs && configs.length < maxAIs ? () => openPicker(blockedSendMessage) : undefined;

  const handleToggleAttach = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setShowOptionsRow(current => !current);
  };

  const handleSelectModality = (key: ModalityKey) => {
    if (key === 'imageUpload') setShowImageUpload(true);
    if (key === 'documentUpload') setShowDocUpload(true);
  };

  const handleUpload = (picked: MessageAttachment[]) => {
    setAttachments(prev => [...prev, ...picked].slice(0, MAX_ATTACHMENTS));
  };

  const handleRemoveAttachment = (uri: string) => {
    setAttachments(prev => prev.filter(attachment => attachment.uri !== uri));
  };

  const handleSend = (text: string) => {
    if (attachments.length > 0) {
      onSend(text, attachments);
    } else {
      onSend(text);
    }
    setAttachments([]);
    setShowOptionsRow(false);
  };

  return (
    <ComposerShell
      inputText={inputText}
      onChangeText={onChangeText}
      onSend={handleSend}
      canSend={canSend}
      onBlockedSend={handleBlockedSend}
      pills={pills}
      onPillPress={pillIndex => setConfigIndex(pillConfigIndices[pillIndex] ?? null)}
      showAddPill={configs.length < maxAIs}
      onAddPill={() => openPicker(null)}
      addPillEmphasized={!hasEnoughAIs}
      aboveInput={
        showOptionsRow || attachments.length > 0 ? (
          <View>
            {showOptionsRow && (
              <View style={[styles.optionsRowWrap, { borderColor: theme.colors.border }]}>
                <MultimodalOptionsRow
                  availability={{
                    imageUpload: canAttachImages,
                    documentUpload: canAttachDocuments,
                    imageGeneration: false,
                    videoGeneration: false,
                  }}
                  availabilityReasons={{
                    imageUpload: canAttachImages
                      ? undefined
                      : 'Selected model(s) do not support image input',
                    documentUpload: canAttachDocuments
                      ? undefined
                      : 'Selected model(s) do not support document/PDF input',
                  }}
                  onSelect={handleSelectModality}
                  onClose={() => setShowOptionsRow(false)}
                />
              </View>
            )}
            {attachments.length > 0 && (
              <View
                style={styles.attachmentRow}
                testID={testID ? `${testID}-attachments` : undefined}
              >
                {attachments.map(attachment => (
                  <AttachmentChip
                    key={attachment.uri}
                    uri={attachment.uri}
                    kind={attachment.type === 'document' ? 'document' : 'image'}
                    fileName={attachment.fileName}
                    onRemove={() => handleRemoveAttachment(attachment.uri)}
                    testID={testID ? `${testID}-attachment` : undefined}
                  />
                ))}
              </View>
            )}
          </View>
        ) : undefined
      }
      leadingAccessory={
        showAttachButton ? (
          <TouchableOpacity
            onPress={handleToggleAttach}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Attach files"
            accessibilityHint="Add images or documents to your first message"
            style={[styles.attachChip, { borderColor: theme.colors.border }]}
            testID={testID ? `${testID}-attach` : undefined}
          >
            <Ionicons name="attach-outline" size={18} color={theme.colors.text.secondary} />
          </TouchableOpacity>
        ) : undefined
      }
      validationMessage={validationMessage}
      placeholder={placeholder}
      disabled={disabled}
      testID={testID}
    >
      <ProviderPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelectProvider={onAddProvider}
        selectedProviderIds={configs.map(c => c.providerId)}
        configuredProviderIds={configuredProviderIds}
        allowedProviderIds={allowedProviderIds}
        allowDuplicates={mode === 'compare'}
        onRequestAddKey={onRequestAddKey}
        message={pickerMessage}
        testID={testID ? `${testID}-picker` : undefined}
      />

      <AIConfigSheet
        visible={activeConfig !== null}
        onClose={closeConfigSheet}
        config={activeConfig}
        onChangeModel={modelId => {
          if (configIndex !== null) onUpdateConfig(configIndex, { modelId });
        }}
        onChangePersonality={personalityId => {
          if (configIndex !== null) onUpdateConfig(configIndex, { personalityId });
        }}
        onChangeParameters={parameters => {
          if (configIndex !== null) onUpdateConfig(configIndex, { parameters });
        }}
        onRemove={() => {
          if (configIndex !== null) onRemoveConfig(configIndex);
        }}
        showAdvanced={showAdvancedParams}
        testID={testID ? `${testID}-config` : undefined}
      />

      <ImageUploadModal
        visible={showImageUpload}
        onClose={() => setShowImageUpload(false)}
        onUpload={handleUpload}
      />
      <DocumentUploadModal
        visible={showDocUpload}
        onClose={() => setShowDocUpload(false)}
        onUpload={handleUpload}
      />
    </ComposerShell>
  );
};

const styles = StyleSheet.create({
  optionsRowWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
  },
  attachmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 6,
    paddingBottom: 2,
  },
  attachChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AIComposer;
