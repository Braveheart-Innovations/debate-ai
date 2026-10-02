import React from 'react';
import {
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme';
import { AIPill, AddAIPill, ComposerValidationHint, MicButton } from '@/components/molecules';
import { useDictation } from '@/hooks/useDictation';

/** A pill already resolved to display values — the shell knows no catalogs. */
export interface ComposerPillDescriptor {
  key: string;
  name: string;
  color: string;
  modelLabel?: string;
  indexLabel?: string;
}

export interface ComposerShellProps {
  inputText: string;
  onChangeText: (text: string) => void;
  /** Receives the trimmed input. */
  onSend: (text: string) => void;
  canSend: boolean;
  pills: ComposerPillDescriptor[];
  onPillPress: (index: number) => void;
  showAddPill: boolean;
  onAddPill: () => void;
  addPillEmphasized?: boolean;
  /** Rendered above the text input (e.g. attachment chips). */
  aboveInput?: React.ReactNode;
  /** Rendered at the start of the bottom row (e.g. an options chip). */
  leadingAccessory?: React.ReactNode;
  validationMessage?: string | null;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  /** Show the mic button for speech-to-text (hidden where the device has no recognizer). */
  dictationEnabled?: boolean;
  testID?: string;
  /** Bottom sheets owned by the wrapper (picker/config), kept inside the surface. */
  children?: React.ReactNode;
}

/**
 * Catalog-agnostic composer surface: message input on top, a WHO row of
 * pre-resolved pills + [+] Add AI, and the send button. Wrappers (AIComposer,
 * CreateComposer) resolve providers/models to descriptors and own the sheets.
 */
export const ComposerShell: React.FC<ComposerShellProps> = ({
  inputText,
  onChangeText,
  onSend,
  canSend,
  pills,
  onPillPress,
  showAddPill,
  onAddPill,
  addPillEmphasized = false,
  aboveInput,
  leadingAccessory,
  validationMessage,
  placeholder = 'Ask anything…',
  maxLength,
  disabled = false,
  dictationEnabled = true,
  testID,
  children,
}) => {
  const { theme } = useTheme();
  const dictation = useDictation({
    text: inputText,
    onTextChange: onChangeText,
    maxLength,
    enabled: dictationEnabled && !disabled,
  });
  const showMic = dictationEnabled && dictation.isAvailable;

  const handleChangeText = (text: string) => {
    if (dictation.error) dictation.clearError();
    onChangeText(text);
  };

  const handleSend = () => {
    if (!canSend) return;
    // Late recognizer results must not refill the input the wrapper just cleared.
    dictation.cancel();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onSend(inputText.trim());
  };

  return (
    <View
      style={[
        styles.surface,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
      ]}
      testID={testID}
    >
      {aboveInput}

      <TextInput
        value={inputText}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.text.disabled}
        multiline
        maxLength={maxLength}
        style={[styles.input, { color: theme.colors.text.primary }]}
        editable={!disabled}
        accessibilityLabel="Message input"
        testID={testID ? `${testID}-input` : undefined}
      />

      {/* Bottom row — WHO + GO: pills scroll, Add AI and send stay pinned.
          Model names show on tablets only; phones keep pills compact. */}
      <View style={styles.bottomRow}>
        {leadingAccessory}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillScroll}
          contentContainerStyle={styles.pillRow}
          keyboardShouldPersistTaps="handled"
        >
          {pills.map((pill, index) => (
            <AIPill
              key={pill.key}
              name={pill.name}
              color={pill.color}
              modelLabel={pill.modelLabel}
              indexLabel={pill.indexLabel}
              onPress={() => onPillPress(index)}
              disabled={disabled}
              testID={testID ? `${testID}-pill-${index}` : undefined}
            />
          ))}
        </ScrollView>
        {showAddPill && (
          <AddAIPill
            onPress={onAddPill}
            emphasized={addPillEmphasized}
            compact={pills.length > 0}
            testID={testID ? `${testID}-add-ai` : undefined}
          />
        )}
        <View style={styles.rowSpacer} />
        {showMic && (
          <MicButton
            isListening={dictation.isListening}
            onPress={dictation.toggle}
            disabled={disabled}
            testID={testID ? `${testID}-mic` : undefined}
          />
        )}
        <TouchableOpacity
          onPress={handleSend}
          disabled={!canSend}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend }}
          style={[
            styles.sendButton,
            {
              backgroundColor: canSend ? theme.colors.primary[500] : theme.colors.border,
            },
          ]}
          testID={testID ? `${testID}-send` : undefined}
        >
          <Ionicons
            name="arrow-up"
            size={20}
            color={canSend ? '#FFFFFF' : theme.colors.text.disabled}
          />
        </TouchableOpacity>
      </View>

      {(validationMessage || dictation.error) && (
        <ComposerValidationHint
          message={validationMessage || dictation.error || ''}
          testID={testID ? `${testID}-validation` : undefined}
        />
      )}

      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  surface: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
  },
  input: {
    minHeight: 40,
    maxHeight: 120,
    fontSize: 16,
    lineHeight: 22,
    paddingTop: 8,
    paddingBottom: 8,
    textAlignVertical: 'top',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
  },
  pillScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowSpacer: {
    flex: 1,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ComposerShell;
