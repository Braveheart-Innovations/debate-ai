import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Box } from '../../atoms';
import { useTheme } from '../../../theme';
import { Typography, SheetHeader } from '@/components/molecules';
import type { AIProvider, ImageGenerationMode } from '@/types';

export interface ImageGenerationModalProps {
  visible: boolean;
  initialPrompt?: string;
  /** Single provider for Chat mode */
  provider?: AIProvider;
  /** Multiple providers for Compare mode */
  providers?: AIProvider[];
  /** Generation mode: single or compare */
  mode?: ImageGenerationMode;
  onClose: () => void;
  onGenerate: (opts: { prompt: string; size: 'auto' | 'square' | 'portrait' | 'landscape' }) => void;
}

/** Get display name for a provider */
const getProviderDisplayName = (provider: AIProvider): string => {
  const names: Record<string, string> = {
    openai: 'DALL-E',
    grok: 'Grok',
    google: 'Gemini',
    claude: 'Claude',
  };
  return names[provider] || provider;
};

/** Check if provider supports size/aspect ratio options */
const providerSupportsSize = (provider: AIProvider): boolean => {
  // Grok does not support size parameter
  return provider !== 'grok';
};

/** Get helper text for a provider */
const getProviderHelperText = (provider: AIProvider): string => {
  switch (provider) {
    case 'openai':
      return 'DALL-E supports Square (1024×1024), Portrait (1024×1536), and Landscape (1536×1024).';
    case 'grok':
      return 'Grok generates images at a fixed size. Style hints are included in your prompt.';
    case 'google':
      return 'Gemini supports various aspect ratios: Square (1:1), Portrait (9:16), and Landscape (16:9).';
    default:
      return 'Select size and style options for your generated image.';
  }
};

const { height } = Dimensions.get('window');

export const ImageGenerationModal: React.FC<ImageGenerationModalProps> = ({
  visible,
  initialPrompt,
  provider,
  providers,
  mode = 'single',
  onClose,
  onGenerate,
}) => {
  const { theme } = useTheme();
  const [prompt, setPrompt] = useState(initialPrompt || '');
  const [size, setSize] = useState<'auto' | 'square' | 'portrait' | 'landscape'>('square');
  const [styleKey, setStyleKey] = useState<'photo' | 'anime' | 'watercolor' | 'sketch' | 'cinematic' | '3d' | 'none'>('photo');

  useEffect(() => {
    setPrompt(initialPrompt || '');
  }, [initialPrompt]);

  // Determine if we're in Compare mode (multiple providers) or single provider mode
  const isCompareMode = mode === 'compare';
  const isMultiProvider = providers && providers.length > 1;
  const activeProvider = provider || (providers && providers.length === 1 ? providers[0] : undefined);

  // Compute modal title based on mode
  const modalTitle = useMemo(() => {
    if (mode === 'compare') {
      return 'Generate Image (Compare)';
    }
    if (activeProvider) {
      return `Generate with ${getProviderDisplayName(activeProvider)}`;
    }
    return 'Generate Image';
  }, [mode, activeProvider]);

  // Build enhanced prompt with size and style specifications
  const buildEnhancedPrompt = useCallback((basePrompt: string): string => {
    const specs: string[] = [];

    // Add size/orientation hint
    if (size === 'portrait') {
      specs.push('Portrait orientation, vertical format');
    } else if (size === 'landscape') {
      specs.push('Landscape orientation, horizontal format');
    }
    // Square and auto don't need specification

    // Add style
    if (styleKey && styleKey !== 'none') {
      const styleDescriptions: Record<string, string> = {
        photo: 'Photorealistic style, like a photograph',
        anime: 'Anime style, Japanese animation aesthetic',
        watercolor: 'Watercolor painting style',
        sketch: 'Pencil sketch style, hand-drawn',
        cinematic: 'Cinematic style, dramatic lighting, movie-like',
        '3d': '3D rendered style, CGI quality',
      };
      if (styleDescriptions[styleKey]) {
        specs.push(styleDescriptions[styleKey]);
      }
    }

    if (specs.length === 0) return basePrompt.trim();
    return `${basePrompt.trim()}\n\nImage specifications: ${specs.join('. ')}.`;
  }, [size, styleKey]);

  // Determine if size options should be shown
  const showSizeOptions = useMemo(() => {
    if (isMultiProvider) {
      // In multi-provider modes, show size options (providers that don't support it will ignore)
      return true;
    }
    if (activeProvider) {
      return providerSupportsSize(activeProvider);
    }
    return true; // Default to showing
  }, [isMultiProvider, activeProvider]);

  // Get appropriate helper text
  const helperText = useMemo(() => {
    if (isCompareMode) {
      return 'Each AI will generate independently for side-by-side comparison.';
    }
    if (activeProvider) {
      return getProviderHelperText(activeProvider);
    }
    return 'Select size and style options for your generated image.';
  }, [isCompareMode, activeProvider]);

  // Build AI list display for multi-provider modes
  const aiListDisplay = useMemo(() => {
    if (!providers || providers.length <= 1) return null;
    const names = providers.map(getProviderDisplayName);
    if (isCompareMode) {
      return `Comparing: ${names.join(', ')}`;
    }
    return null;
  }, [providers, isCompareMode]);

  const Chip: React.FC<{ label: string; selected: boolean; onPress: () => void }> = ({ label, selected, onPress }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? theme.colors.primary[500] : theme.colors.border,
          backgroundColor: selected ? theme.colors.primary[500] : theme.colors.surface,
        },
      ]}
      activeOpacity={0.7}
    >
      <Typography
        variant="body"
        weight={selected ? 'semibold' : 'normal'}
        style={{ color: selected ? '#FFFFFF' : theme.colors.text.primary }}
      >
        {label}
      </Typography>
    </TouchableOpacity>
  );

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
              <SheetHeader title={modalTitle} onClose={onClose} showHandle />
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                  {/* AI List Display for multi-provider modes */}
                  {aiListDisplay && (
                    <Box style={[styles.section, { paddingBottom: 0 }]}>
                      <Typography variant="caption" color="secondary" style={{ fontStyle: 'italic' }}>
                        {aiListDisplay}
                      </Typography>
                    </Box>
                  )}
                  <Box style={styles.section}>
                    <Typography variant="body" weight="semibold" color="secondary" style={styles.label}>Prompt</Typography>
                    <TextInput
                      style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text.primary }]}
                      placeholder="Describe the image you want"
                      placeholderTextColor={theme.colors.text.secondary}
                      value={prompt}
                      onChangeText={setPrompt}
                      multiline
                    />
                  </Box>
                  {showSizeOptions && (
                    <Box style={styles.section}>
                      <Typography variant="body" weight="semibold" color="secondary" style={styles.label}>Size / Aspect</Typography>
                      <Box style={styles.row}>
                        <Chip label="Auto" selected={size==='auto'} onPress={() => setSize('auto')} />
                        <Chip label="Square" selected={size==='square'} onPress={() => setSize('square')} />
                        <Chip label="Portrait" selected={size==='portrait'} onPress={() => setSize('portrait')} />
                        <Chip label="Landscape" selected={size==='landscape'} onPress={() => setSize('landscape')} />
                      </Box>
                    </Box>
                  )}
                <Box style={styles.section}>
                  <Typography variant="body" weight="semibold" color="secondary" style={styles.label}>Style</Typography>
                  <Box style={styles.rowWrap}>
                    <Chip label="None" selected={styleKey==='none'} onPress={() => setStyleKey('none')} />
                    <Chip label="Photo Realistic" selected={styleKey==='photo'} onPress={() => setStyleKey('photo')} />
                    <Chip label="Anime" selected={styleKey==='anime'} onPress={() => setStyleKey('anime')} />
                    <Chip label="Watercolor" selected={styleKey==='watercolor'} onPress={() => setStyleKey('watercolor')} />
                    <Chip label="Sketch" selected={styleKey==='sketch'} onPress={() => setStyleKey('sketch')} />
                    <Chip label="Cinematic" selected={styleKey==='cinematic'} onPress={() => setStyleKey('cinematic')} />
                    <Chip label="3D Render" selected={styleKey==='3d'} onPress={() => setStyleKey('3d')} />
                  </Box>
                </Box>
                <Box style={styles.section}>
                  <Typography variant="caption" color="secondary">
                    {helperText}
                  </Typography>
                </Box>
                </ScrollView>
                <Box style={styles.actionsRow}>
                  <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={[styles.actionBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <Typography variant="body" style={{ color: theme.colors.text.primary }}>Cancel</Typography>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onGenerate({ prompt: buildEnhancedPrompt(prompt), size })}
                    activeOpacity={0.7}
                    disabled={!prompt.trim()}
                    style={[styles.actionBtn, { backgroundColor: theme.colors.primary[500], borderColor: theme.colors.primary[500], opacity: prompt.trim() ? 1 : 0.5 }]}
                  >
                    <Typography variant="body" weight="semibold" style={{ color: '#FFFFFF' }}>Generate</Typography>
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
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropTouchable: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    height: height * 0.7,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  content: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  label: {
    marginBottom: 6,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 8,
    minHeight: 64,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  rowWrap: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  actionsRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

export default ImageGenerationModal;
