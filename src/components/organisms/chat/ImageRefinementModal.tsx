import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Box } from '../../atoms';
import { useTheme } from '../../../theme';
import { Typography, SheetHeader } from '@/components/molecules';
import type { AIProvider } from '@/types';

export interface RefinementProvider {
  provider: AIProvider;
  name: string;
  supportsImg2Img: boolean;
  hasApiKey: boolean;
}

export interface ImageRefinementModalProps {
  visible: boolean;
  imageUri: string;
  originalProvider: AIProvider;
  availableProviders: RefinementProvider[];
  onClose: () => void;
  onRefine: (opts: {
    instructions: string;
    provider: AIProvider;
  }) => void;
}

const QUICK_SUGGESTIONS = [
  { label: 'More detail', instruction: 'Add more fine details and textures throughout the image' },
  { label: 'Vibrant colors', instruction: 'Make the colors more vibrant and saturated' },
  { label: 'Dramatic lighting', instruction: 'Add more dramatic lighting and shadows' },
  { label: 'Sharper', instruction: 'Make the image sharper and crisper with more defined edges' },
  { label: 'Artistic style', instruction: 'Apply a more artistic, painterly style' },
  { label: 'Fix faces', instruction: 'Improve the faces to look more natural and realistic' },
];

export const ImageRefinementModal: React.FC<ImageRefinementModalProps> = ({
  visible,
  imageUri,
  originalProvider,
  availableProviders,
  onClose,
  onRefine,
}) => {
  const { theme } = useTheme();
  const [instructions, setInstructions] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(originalProvider);

  // Filter providers that support img2img and have API keys
  const eligibleProviders = useMemo(() => {
    return availableProviders.filter(p => p.supportsImg2Img && p.hasApiKey);
  }, [availableProviders]);

  // Check if selected provider is eligible
  const isSelectedProviderEligible = useMemo(() => {
    return eligibleProviders.some(p => p.provider === selectedProvider);
  }, [eligibleProviders, selectedProvider]);

  // Auto-select first eligible provider if current selection isn't eligible
  React.useEffect(() => {
    if (!isSelectedProviderEligible && eligibleProviders.length > 0) {
      setSelectedProvider(eligibleProviders[0].provider);
    }
  }, [isSelectedProviderEligible, eligibleProviders]);

  const handleQuickSuggestion = (instruction: string) => {
    setInstructions(prev => {
      if (prev.trim()) {
        return `${prev.trim()}. ${instruction}`;
      }
      return instruction;
    });
  };

  const handleRefine = () => {
    if (!instructions.trim()) return;
    onRefine({
      instructions: instructions.trim(),
      provider: selectedProvider,
    });
    setInstructions('');
  };

  const canRefine = instructions.trim().length > 0 && isSelectedProviderEligible;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}
    >
      <BlurView intensity={20} style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouchable} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: theme.colors.background }]} onPress={() => {}}>
            <SafeAreaView style={{ flex: 1 }}>
              <SheetHeader title="Refine Image" onClose={onClose} showHandle />
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                  {/* Image Preview */}
                  <Box style={styles.imagePreviewContainer}>
                    <Image
                      source={{ uri: imageUri }}
                      style={styles.imagePreview}
                      resizeMode="contain"
                    />
                  </Box>

                  {/* Instructions input */}
                  <Box style={styles.section}>
                    <Typography variant="body" weight="semibold" color="secondary" style={styles.label}>
                      What would you like to change?
                    </Typography>
                    <TextInput
                      style={[styles.input, {
                        borderColor: theme.colors.border,
                        color: theme.colors.text.primary,
                        backgroundColor: theme.colors.surface,
                      }]}
                      placeholder="Describe the improvements you want..."
                      placeholderTextColor={theme.colors.text.secondary}
                      value={instructions}
                      onChangeText={setInstructions}
                      multiline
                      numberOfLines={3}
                    />
                  </Box>

                  {/* Quick suggestions */}
                  <Box style={styles.section}>
                    <Typography variant="body" weight="semibold" color="secondary" style={styles.label}>
                      Quick suggestions
                    </Typography>
                    <Box style={styles.rowWrap}>
                      {QUICK_SUGGESTIONS.map(suggestion => (
                        <TouchableOpacity
                          key={suggestion.label}
                          onPress={() => handleQuickSuggestion(suggestion.instruction)}
                          style={[styles.suggestionChip, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                          activeOpacity={0.7}
                        >
                          <Typography variant="caption" color="primary">
                            {suggestion.label}
                          </Typography>
                        </TouchableOpacity>
                      ))}
                    </Box>
                  </Box>

                  {/* Provider selection - only show eligible providers */}
                  {eligibleProviders.length > 1 && (
                    <Box style={styles.section}>
                      <Typography variant="body" weight="semibold" color="secondary" style={styles.label}>
                        Generate with
                      </Typography>
                      <Box style={styles.providerChips}>
                        {eligibleProviders.map(providerInfo => {
                          const isSelected = selectedProvider === providerInfo.provider;

                          return (
                            <TouchableOpacity
                              key={providerInfo.provider}
                              onPress={() => setSelectedProvider(providerInfo.provider)}
                              style={[
                                styles.providerChip,
                                {
                                  borderColor: isSelected ? theme.colors.primary[500] : theme.colors.border,
                                  backgroundColor: isSelected ? theme.colors.primary[500] + '20' : theme.colors.surface,
                                  borderWidth: isSelected ? 2 : 1,
                                },
                              ]}
                              activeOpacity={0.7}
                            >
                              <Typography
                                variant="body"
                                weight={isSelected ? 'semibold' : 'normal'}
                                style={{ color: isSelected ? theme.colors.primary[500] : theme.colors.text.primary }}
                              >
                                {providerInfo.name}
                              </Typography>
                            </TouchableOpacity>
                          );
                        })}
                      </Box>
                    </Box>
                  )}
                </ScrollView>

                {/* Action buttons */}
                <Box style={[styles.actions, { borderTopColor: theme.colors.border }]}>
                  <TouchableOpacity
                    onPress={onClose}
                    style={[styles.button, styles.cancelButton, {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                    }]}
                    activeOpacity={0.7}
                  >
                    <Typography variant="body" color="secondary">Cancel</Typography>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleRefine}
                    style={[
                      styles.button,
                      styles.generateButton,
                      { backgroundColor: canRefine ? theme.colors.primary[500] : theme.colors.gray[600] },
                    ]}
                    activeOpacity={0.7}
                    disabled={!canRefine}
                  >
                    <Typography variant="body" weight="semibold" style={{ color: canRefine ? '#FFFFFF' : theme.colors.text.secondary }}>
                      Refine Image
                    </Typography>
                  </TouchableOpacity>
                </Box>
              </KeyboardAvoidingView>
            </SafeAreaView>
          </TouchableOpacity>
        </TouchableOpacity>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  backdropTouchable: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
    minHeight: '80%',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  imagePreviewContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  imagePreview: {
    width: '100%',
    height: 150,
    borderRadius: 8,
  },
  section: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  providerChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  providerChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  generateButton: {},
});

export default ImageRefinementModal;
