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
  TouchableOpacity,
  Alert,
  Keyboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector, useDispatch } from 'react-redux';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import { useGreeting } from '../hooks/useGreeting';
import {
  Typography,
  GradientButton,
  HeaderIcon,
  SectionHeader,
  PromptHeroInput,
  AdvancedOptionsSection,
} from '../components/molecules';
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
import { supportsImageGeneration, supportsImageInput } from '../config/imageGenerationModels';
import { AI_PROVIDERS } from '../config/aiProviders';
import { getAIProviderIcon } from '../utils/aiProviderAssets';

type NavigationProp = StackNavigationProp<RootStackParamList>;

const MAX_PROMPT_LENGTH = 4000;

// Image generation capable providers
const IMAGE_GEN_PROVIDERS = ['openai', 'google', 'grok'];

export default function CreateSetupScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useDispatch<AppDispatch>();
  const { isDemo } = useFeatureAccess();
  const greeting = useGreeting({ screenCategory: 'create' });

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
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Listen for keyboard show/hide to toggle Generate button visibility
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Hydrate gallery on mount (skip in demo mode - demo images are URLs, not local files)
  useEffect(() => {
    if (!galleryHydrated && !isDemo) {
      dispatch(hydrateGallery());
    }
  }, [dispatch, galleryHydrated, isDemo]);

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
    // Only update if the selected AIs have actually changed to prevent infinite loops
    setSelectedAIs(prev => {
      const prevIds = prev.map(a => a.id).sort().join(',');
      const newIds = ais.map(a => a.id).sort().join(',');
      return prevIds === newIds ? prev : ais;
    });
  }, [selectedProviders, configuredImageAIs]);

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
      mediaTypes: ['images'],
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

    if (isDemo) {
      Alert.alert(
        'Gallery Unavailable in Demo',
        'The image gallery is available with a premium subscription. Upgrade to save and manage your generated images.',
        [
          { text: 'Maybe Later', style: 'cancel' },
          { text: 'Upgrade', onPress: () => navigation.navigate('Subscription') },
        ]
      );
      return;
    }

    navigation.navigate('CreateSession', {});
  }, [navigation, isDemo]);

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
      <HeaderActions variant="gradient" helpCategoryId="create" />
    </View>
  );

  // Demo mode gate - only demo users should be blocked
  if (isDemo) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['top', 'left', 'right']}
      >
        <Header
          variant="gradient"
          title="Create"
          subtitle="AI Image Generation"
          rightElement={<HeaderActions variant="gradient" helpCategoryId="create" />}
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
        title={greeting.timeBasedGreeting}
        subtitle={greeting.welcomeMessage}
        showTime={true}
        showDate={true}
        rightElement={renderHeaderRight()}
        showDemoBadge={isDemo}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: 16 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
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

          {/* Hero Prompt Input */}
          <View style={styles.section}>
            <PromptHeroInput
              value={currentPrompt}
              onChangeText={(text) => dispatch(setPrompt(text))}
              maxLength={MAX_PROMPT_LENGTH}
              placeholder="Describe what you want to create..."
              testID="create-prompt-input"
            />
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
                      numberOfLines={1}
                      style={{
                        color: isSelected ? '#FFFFFF' : theme.colors.text.primary,
                        marginTop: 4,
                        textAlign: 'center',
                      }}
                    >
                      {style.label}
                    </Typography>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Advanced Options - Collapsed by default */}
          <AdvancedOptionsSection
            selectedSize={selectedSize}
            onSizeChange={handleSizeSelect}
            selectedQuality={selectedQuality}
            onQualityChange={handleQualitySelect}
            canRefine={canRefineImages}
            onUploadImage={handlePickImage}
            testID="create-advanced-options"
          />
        </ScrollView>

        {/* Generate Button - hidden when keyboard is visible */}
        {!isKeyboardVisible && (
          <View
            style={[
              styles.generateContainer,
              {
                backgroundColor: theme.colors.background,
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
        )}
      </KeyboardAvoidingView>

      {/* Image Refinement Modal - only render when we have an image */}
      {uploadedImageUri && (
        <ImageRefinementModal
          visible={showRefinementModal}
          imageUri={uploadedImageUri}
          originalProvider="openai"
          availableProviders={availableRefinementProviders}
          onClose={() => {
            setShowRefinementModal(false);
            setUploadedImageUri(null);
          }}
          onRefine={handleRefinement}
        />
      )}
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
  styleScroll: {
    paddingRight: 16,
  },
  styleChip: {
    minWidth: 88,
    height: 80,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  generateContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
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
