/**
 * CreateSetupScreen - Tab screen for setting up image generation
 * Premium-only feature with provider selection, prompt input, and options
 */
import React, { useEffect, useCallback, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector, useDispatch } from 'react-redux';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import { Typography, GradientButton, HeaderIcon, SectionHeader } from '../components/molecules';
import { Header, HeaderActions, DynamicAISelector, ImageRefinementModal } from '../components/organisms';
import type { RefinementProvider } from '../components/organisms/chat/ImageRefinementModal';
import { RootState, AppDispatch } from '../store';
import {
  setPrompt,
  setStyle,
  setSize,
  setQuality,
  setSelectedProviders,
  hydrateGallery,
  selectCreateState,
} from '../store/createSlice';
import { RootStackParamList, AIProvider, AIConfig } from '../types';
import { STYLE_PRESETS } from '../config/create/stylePresets';
import { SIZE_OPTIONS } from '../config/create/sizeOptions';
import { supportsImageGeneration, supportsImageInput } from '../config/imageGenerationModels';
import { AI_PROVIDERS } from '../config/aiProviders';
import { getAIProviderIcon } from '../utils/aiProviderAssets';

type NavigationProp = StackNavigationProp<RootStackParamList>;

const MAX_PROMPT_LENGTH = 4000;

// Image generation capable providers
const IMAGE_GEN_PROVIDERS = ['openai', 'google', 'grok'];

export default function CreateSetupScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useDispatch<AppDispatch>();
  const { membershipStatus, isDemo } = useFeatureAccess();

  const createState = useSelector(selectCreateState);
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || {});
  const verifiedProviders = useSelector((state: RootState) => state.settings.verifiedProviders || []);

  const {
    selectedProviders,
    currentPrompt,
    selectedStyle,
    selectedSize,
    selectedQuality,
    galleryHydrated,
    gallery,
  } = createState;

  const galleryCount = gallery.length;
  const [selectedAIs, setSelectedAIs] = useState<AIConfig[]>([]);
  const [uploadedImageUri, setUploadedImageUri] = useState<string | null>(null);
  const [showRefinementModal, setShowRefinementModal] = useState(false);

  // Hydrate gallery on mount
  useEffect(() => {
    if (!galleryHydrated) {
      dispatch(hydrateGallery());
    }
  }, [dispatch, galleryHydrated]);

  // Build AIConfig objects for image-capable providers
  const configuredImageAIs = useMemo(() => {
    return AI_PROVIDERS
      .filter(provider => {
        // Only image generation capable providers
        if (!IMAGE_GEN_PROVIDERS.includes(provider.id)) return false;
        // Must have API key and be verified (or in demo mode)
        if (isDemo) return IMAGE_GEN_PROVIDERS.includes(provider.id);
        const hasKey = Boolean(apiKeys[provider.id as keyof typeof apiKeys]);
        const isVerified = verifiedProviders.includes(provider.id);
        return hasKey && isVerified && supportsImageGeneration(provider.id as AIProvider);
      })
      .map(provider => {
        const iconData = getAIProviderIcon(provider.id);
        return {
          id: provider.id,
          provider: provider.id as AIProvider,
          name: provider.name,
          model: 'default',
          icon: iconData.icon,
          iconType: iconData.iconType,
          color: provider.color,
        } as AIConfig;
      });
  }, [apiKeys, verifiedProviders, isDemo]);

  // Sync selectedAIs with selectedProviders from Redux
  useEffect(() => {
    const ais = configuredImageAIs.filter(ai =>
      selectedProviders.includes(ai.provider)
    );
    setSelectedAIs(ais);
  }, [selectedProviders, configuredImageAIs]);

  const isPremium = membershipStatus === 'premium';

  const handleToggleAI = useCallback((ai: AIConfig) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const isSelected = selectedProviders.includes(ai.provider);
    let newProviders: AIProvider[];

    if (isSelected) {
      newProviders = selectedProviders.filter(p => p !== ai.provider);
    } else if (selectedProviders.length < 3) {
      newProviders = [...selectedProviders, ai.provider];
    } else {
      return; // Max 3 selected
    }

    dispatch(setSelectedProviders(newProviders));
  }, [selectedProviders, dispatch]);

  const handleStyleSelect = useCallback((styleId: typeof selectedStyle) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch(setStyle(styleId));
  }, [dispatch]);

  const handleSizeSelect = useCallback((sizeId: typeof selectedSize) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch(setSize(sizeId));
  }, [dispatch]);

  const handleQualitySelect = useCallback((quality: typeof selectedQuality) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch(setQuality(quality));
  }, [dispatch]);

  const handleGenerate = useCallback(() => {
    if (!currentPrompt.trim() || selectedProviders.length === 0) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    navigation.navigate('CreateSession', {
      providers: selectedProviders,
      initialPrompt: currentPrompt,
    });
  }, [currentPrompt, selectedProviders, navigation]);

  const canGenerate = currentPrompt.trim().length > 0 && selectedProviders.length > 0;

  // Build available providers for refinement
  const availableRefinementProviders: RefinementProvider[] = useMemo(() => {
    return IMAGE_GEN_PROVIDERS.map(providerId => ({
      provider: providerId as AIProvider,
      name: AI_PROVIDERS.find(p => p.id === providerId)?.name || providerId,
      supportsImg2Img: supportsImageInput(providerId as AIProvider),
      hasApiKey: Boolean(apiKeys[providerId as keyof typeof apiKeys]) || isDemo,
    }));
  }, [apiKeys, isDemo]);

  // Check if refinement is available (any provider supports img2img and has API key)
  const canRefineImages = useMemo(() => {
    return availableRefinementProviders.some(p => p.supportsImg2Img && p.hasApiKey);
  }, [availableRefinementProviders]);

  // Image picker for refinement
  const handlePickImage = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please grant access to your photo library to upload images for refinement.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setUploadedImageUri(result.assets[0].uri);
      setShowRefinementModal(true);
    }
  }, []);

  // Handle refinement submission from modal
  const handleRefinement = useCallback(async (opts: { instructions: string; provider: AIProvider }) => {
    if (!uploadedImageUri) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowRefinementModal(false);

    // Navigate to CreateSession with the refinement params
    navigation.navigate('CreateSession', {
      providers: [opts.provider],
      sourceImage: uploadedImageUri,
      refinementInstructions: opts.instructions,
    });

    // Clear the uploaded image
    setUploadedImageUri(null);
  }, [uploadedImageUri, navigation]);

  const handleGalleryPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('CreateSession', {});
  }, [navigation]);

  const handleAddAI = useCallback(() => {
    navigation.navigate('APIConfig');
  }, [navigation]);

  // Get badge for AI cards (show img2img badge for providers that support it)
  const getBadge = useCallback((ai: AIConfig) => {
    if (supportsImageInput(ai.provider)) {
      return { text: 'img2img', color: theme.colors.success[500] };
    }
    return undefined;
  }, [theme.colors.success]);

  // Custom right element with gallery icon and header actions
  const renderHeaderRight = () => (
    <View style={styles.headerRight}>
      <HeaderIcon
        name="images-outline"
        onPress={handleGalleryPress}
        color={theme.colors.text.inverse}
        accessibilityLabel={`Gallery (${galleryCount} images)`}
        testID="header-gallery-button"
        badge={galleryCount > 0 ? galleryCount : undefined}
      />
      <HeaderActions variant="gradient" />
    </View>
  );

  // Premium gate
  if (!isPremium && !isDemo) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['top', 'left', 'right']}
      >
        <Header
          variant="gradient"
          title="Create"
          subtitle="AI Image Generation"
          rightElement={<HeaderActions variant="gradient" />}
        />
        <View style={styles.premiumGate}>
          <Ionicons
            name="sparkles"
            size={64}
            color={theme.colors.primary[500]}
          />
          <Typography variant="title" style={styles.premiumTitle}>
            Create Mode
          </Typography>
          <Typography
            variant="body"
            color="secondary"
            style={styles.premiumDescription}
          >
            Generate and refine AI images with multiple providers. This is a premium feature.
          </Typography>
          <GradientButton
            title="Upgrade to Premium"
            onPress={() => navigation.navigate('Subscription')}
            style={styles.upgradeButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <Header
        variant="gradient"
        title="Create"
        subtitle="Generate and refine images with AI"
        showDate={true}
        rightElement={renderHeaderRight()}
        showDemoBadge={isDemo}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: 100 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* AI Provider Selection using tiles */}
          <View style={styles.section}>
            <DynamicAISelector
              configuredAIs={configuredImageAIs}
              selectedAIs={selectedAIs}
              maxAIs={3}
              onToggleAI={handleToggleAI}
              onAddAI={handleAddAI}
              hideStartButton={true}
              hideAddAI={isDemo}
              customSubtitle={`${configuredImageAIs.length} image providers • Select up to 3`}
              getBadge={getBadge}
            />
            {/* img2img badge legend */}
            {configuredImageAIs.some(ai => supportsImageInput(ai.provider)) && (
              <View style={styles.legendRow}>
                <View style={[styles.legendBadge, { backgroundColor: theme.colors.success[500] }]}>
                  <Typography variant="caption" style={{ color: '#FFFFFF', fontSize: 10 }}>
                    img2img
                  </Typography>
                </View>
                <Typography variant="caption" color="secondary">
                  Supports image refinement
                </Typography>
              </View>
            )}
          </View>

          {/* Prompt Input */}
          <View style={styles.section}>
            <SectionHeader
              title="Describe Your Image"
              subtitle={`${currentPrompt.length}/${MAX_PROMPT_LENGTH} characters`}
              icon="✨"
            />
            <TextInput
              style={[
                styles.promptInput,
                {
                  backgroundColor: theme.colors.surface,
                  color: theme.colors.text.primary,
                  borderColor: theme.colors.border,
                },
              ]}
              placeholder="A serene mountain landscape at sunset with vibrant colors..."
              placeholderTextColor={theme.colors.text.secondary}
              value={currentPrompt}
              onChangeText={(text) => dispatch(setPrompt(text))}
              multiline
              maxLength={MAX_PROMPT_LENGTH}
              textAlignVertical="top"
            />
          </View>

          {/* Refine Your Image - Upload existing image */}
          <View style={styles.section}>
            <SectionHeader
              title="Refine Your Image"
              subtitle={canRefineImages
                ? "Upload an image to modify with AI"
                : "Configure an AI provider to enable refinement"}
              icon="🖼️"
            />
            <TouchableOpacity
              style={[
                styles.uploadButton,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  opacity: canRefineImages ? 1 : 0.5,
                },
              ]}
              onPress={canRefineImages ? handlePickImage : undefined}
              activeOpacity={canRefineImages ? 0.7 : 1}
              disabled={!canRefineImages}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Upload image for refinement"
              accessibilityHint={canRefineImages
                ? "Opens photo library to select an image"
                : "Disabled. Configure an AI provider to enable"}
              accessibilityState={{ disabled: !canRefineImages }}
            >
              <View style={styles.uploadContent}>
                <View
                  style={[
                    styles.uploadIconContainer,
                    { backgroundColor: canRefineImages
                        ? theme.colors.primary[500] + '20'
                        : theme.colors.gray[300] + '20' },
                  ]}
                >
                  <Ionicons
                    name="cloud-upload-outline"
                    size={28}
                    color={canRefineImages
                      ? theme.colors.primary[500]
                      : theme.colors.gray[400]}
                  />
                </View>
                <View style={styles.uploadTextContainer}>
                  <Typography
                    variant="body"
                    weight="semibold"
                    color={canRefineImages ? undefined : 'secondary'}
                  >
                    Upload Image
                  </Typography>
                  <Typography variant="caption" color="secondary">
                    {canRefineImages
                      ? "Select from your photo library"
                      : "Requires OpenAI or Google API key"}
                  </Typography>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={theme.colors.text.secondary}
                />
              </View>
            </TouchableOpacity>
          </View>

          {/* Style Selection */}
          <View style={styles.section}>
            <SectionHeader
              title="Style"
              subtitle="Choose an artistic style"
              icon="🎨"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.styleScroll}
            >
              {STYLE_PRESETS.map(style => {
                const isSelected = selectedStyle === style.id;
                return (
                  <TouchableOpacity
                    key={style.id}
                    style={[
                      styles.styleChip,
                      {
                        backgroundColor: isSelected
                          ? theme.colors.primary[500]
                          : theme.colors.surface,
                        borderColor: isSelected
                          ? theme.colors.primary[500]
                          : theme.colors.border,
                      },
                    ]}
                    onPress={() => handleStyleSelect(style.id)}
                  >
                    <Ionicons
                      name={style.icon as keyof typeof Ionicons.glyphMap}
                      size={20}
                      color={isSelected ? '#FFFFFF' : theme.colors.text.secondary}
                    />
                    <Typography
                      variant="caption"
                      style={{
                        color: isSelected ? '#FFFFFF' : theme.colors.text.primary,
                        marginTop: 4,
                      }}
                    >
                      {style.label}
                    </Typography>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Size Selection */}
          <View style={styles.section}>
            <SectionHeader
              title="Aspect Ratio"
              subtitle="Choose image dimensions"
              icon="📐"
            />
            <View style={styles.sizeGrid}>
              {SIZE_OPTIONS.map(size => {
                const isSelected = selectedSize === size.id;
                return (
                  <TouchableOpacity
                    key={size.id}
                    style={[
                      styles.sizeChip,
                      {
                        backgroundColor: isSelected
                          ? theme.colors.primary[500]
                          : theme.colors.surface,
                        borderColor: isSelected
                          ? theme.colors.primary[500]
                          : theme.colors.border,
                      },
                    ]}
                    onPress={() => handleSizeSelect(size.id)}
                  >
                    <Ionicons
                      name={size.icon as keyof typeof Ionicons.glyphMap}
                      size={24}
                      color={isSelected ? '#FFFFFF' : theme.colors.text.secondary}
                    />
                    <Typography
                      variant="caption"
                      style={{
                        color: isSelected ? '#FFFFFF' : theme.colors.text.primary,
                        marginTop: 4,
                      }}
                    >
                      {size.preview}
                    </Typography>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Quality Selection */}
          <View style={styles.section}>
            <SectionHeader
              title="Quality"
              subtitle="Higher quality takes longer"
              icon="⚡"
            />
            <View style={styles.qualityRow}>
              <TouchableOpacity
                style={[
                  styles.qualityChip,
                  {
                    backgroundColor: selectedQuality === 'standard'
                      ? theme.colors.primary[500]
                      : theme.colors.surface,
                    borderColor: selectedQuality === 'standard'
                      ? theme.colors.primary[500]
                      : theme.colors.border,
                  },
                ]}
                onPress={() => handleQualitySelect('standard')}
              >
                <Typography
                  variant="body"
                  style={{
                    color: selectedQuality === 'standard' ? '#FFFFFF' : theme.colors.text.primary,
                  }}
                >
                  Standard
                </Typography>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.qualityChip,
                  {
                    backgroundColor: selectedQuality === 'hd'
                      ? theme.colors.primary[500]
                      : theme.colors.surface,
                    borderColor: selectedQuality === 'hd'
                      ? theme.colors.primary[500]
                      : theme.colors.border,
                  },
                ]}
                onPress={() => handleQualitySelect('hd')}
              >
                <View style={styles.qualityContent}>
                  <Typography
                    variant="body"
                    style={{
                      color: selectedQuality === 'hd' ? '#FFFFFF' : theme.colors.text.primary,
                    }}
                  >
                    HD
                  </Typography>
                  <Ionicons
                    name="sparkles"
                    size={16}
                    color={selectedQuality === 'hd' ? '#FFFFFF' : theme.colors.primary[500]}
                    style={{ marginLeft: 4 }}
                  />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* Generate Button */}
        <View
          style={[
            styles.generateContainer,
            {
              backgroundColor: theme.colors.background,
              paddingBottom: insets.bottom + 16,
              borderTopColor: theme.colors.border,
            },
          ]}
        >
          <GradientButton
            title={
              selectedProviders.length === 0
                ? 'Select an AI to generate'
                : selectedProviders.length > 1
                  ? `Generate with ${selectedProviders.length} AIs`
                  : 'Generate Image'
            }
            onPress={handleGenerate}
            disabled={!canGenerate}
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>

      {/* Image Refinement Modal */}
      <ImageRefinementModal
        visible={showRefinementModal}
        imageUri={uploadedImageUri || ''}
        originalProvider="openai"
        availableProviders={availableRefinementProviders}
        onClose={() => {
          setShowRefinementModal(false);
          setUploadedImageUri(null);
        }}
        onRefine={handleRefinement}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  section: {
    marginBottom: 24,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  legendBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  promptInput: {
    height: 120,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    fontSize: 16,
    lineHeight: 24,
  },
  uploadButton: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  uploadContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  uploadIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  styleScroll: {
    paddingRight: 16,
  },
  styleChip: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sizeGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  sizeChip: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityRow: {
    flexDirection: 'row',
    gap: 12,
  },
  qualityChip: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  generateContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  premiumGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  premiumTitle: {
    marginTop: 16,
    marginBottom: 8,
  },
  premiumDescription: {
    textAlign: 'center',
    marginBottom: 24,
  },
  upgradeButton: {
    width: '100%',
  },
});
