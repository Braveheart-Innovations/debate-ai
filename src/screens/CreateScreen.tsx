/**
 * CreateScreen - Active image generation session screen
 * Shows generation progress, image gallery, and refinement options
 */
import React, { useEffect, useCallback, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Dimensions,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSelector, useDispatch } from 'react-redux';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme';
import { Typography } from '../components/molecules';
import { ImageRefinementModal, RefinementProvider } from '../components/organisms/chat/ImageRefinementModal';
import { RootState, AppDispatch } from '../store';
import {
  selectCreateState,
  selectGallery,
  selectIsGenerating,
  startGeneration,
  updateGenerationProgress,
  completeGeneration,
  addToGallery,
  removeFromGallery,
  persistGallery,
  GeneratedImageEntry,
} from '../store/createSlice';
import { RootStackParamList, AIProvider } from '../types';
import { ImageService, GeneratedImage } from '../services/images/ImageService';
import { buildEnhancedPrompt } from '../config/create/stylePresets';
import { mapSizeToProvider } from '../config/create/sizeOptions';
import { supportsImageInput, getImageProviderDisplayName } from '../config/imageGenerationModels';
import { loadBase64FromFileUri } from '../services/images/fileCache';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type ScreenRouteProp = RouteProp<RootStackParamList, 'CreateSession'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_SIZE = SCREEN_WIDTH - 32;

export default function CreateScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const dispatch = useDispatch<AppDispatch>();
  const flatListRef = useRef<FlatList>(null);

  const { providers = [], initialPrompt, sourceImage, refinementInstructions } = route.params || {};

  const createState = useSelector(selectCreateState);
  const gallery = useSelector(selectGallery);
  const isGenerating = useSelector(selectIsGenerating);
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || {});

  const {
    selectedStyle,
    selectedSize,
    selectedQuality,
    generationProgress,
    generationError: errorMessage,
  } = createState;

  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [savingImage, setSavingImage] = useState(false);
  const [refiningImage, setRefiningImage] = useState<GeneratedImageEntry | null>(null);

  // Build available providers for refinement
  const availableRefinementProviders: RefinementProvider[] = React.useMemo(() => {
    const imageProviders: AIProvider[] = ['openai', 'google', 'grok'];
    return imageProviders.map(provider => ({
      provider,
      name: getImageProviderDisplayName(provider),
      supportsImg2Img: supportsImageInput(provider),
      hasApiKey: Boolean(apiKeys[provider]),
    }));
  }, [apiKeys]);

  // Auto-persist gallery whenever it changes
  useEffect(() => {
    if (gallery.length > 0) {
      dispatch(persistGallery(gallery));
    }
  }, [gallery, dispatch]);

  // Start generation on mount (including refinement of uploaded images)
  useEffect(() => {
    // Normal generation: prompt + providers
    if (initialPrompt && providers.length > 0) {
      generateImages();
    }
    // Uploaded image refinement: sourceImage + refinementInstructions + providers
    else if (sourceImage && refinementInstructions && providers.length > 0) {
      generateRefinement();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate refinement for uploaded image
  const generateRefinement = useCallback(async () => {
    if (!sourceImage || !refinementInstructions || providers.length === 0) return;

    const provider = providers[0]; // Use the first (and typically only) provider for refinement
    dispatch(startGeneration([provider]));
    dispatch(updateGenerationProgress({ provider, progress: 'generating' }));

    try {
      const apiKey = apiKeys[provider];
      if (!apiKey) {
        throw new Error(`No API key for ${provider}`);
      }

      const size = mapSizeToProvider(selectedSize, provider);

      // Load base64 from the uploaded file URI
      const base64Image = await loadBase64FromFileUri(sourceImage);

      const images = await ImageService.generateImage({
        provider,
        apiKey,
        prompt: refinementInstructions,
        size: size as 'auto' | '1024x1024' | '1024x1536' | '1536x1024',
        sourceImage: base64Image || undefined,
      });

      dispatch(updateGenerationProgress({ provider, progress: 'complete' }));

      // Add to gallery
      for (const image of images) {
        const entry: GeneratedImageEntry = {
          id: `${provider}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          uri: image.url || '',
          prompt: refinementInstructions,
          originalPrompt: refinementInstructions,
          provider,
          model: provider === 'openai' ? 'gpt-image-1' : provider === 'google' ? 'gemini-2.5-flash-image' : 'grok-2-image-1212',
          style: selectedStyle,
          size: selectedSize,
          quality: selectedQuality,
          createdAt: Date.now(),
          isRefinement: true,
          isUploaded: true, // Mark as uploaded image refinement
        };
        dispatch(addToGallery(entry));
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error(`[CreateScreen] Refinement error for ${provider}:`, error);
      dispatch(updateGenerationProgress({ provider, progress: 'error' }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Refinement Failed',
        error instanceof Error ? error.message : 'Failed to refine image. Please try again.',
        [{ text: 'OK' }]
      );
    }

    dispatch(completeGeneration());
  }, [
    sourceImage,
    refinementInstructions,
    providers,
    selectedStyle,
    selectedSize,
    selectedQuality,
    apiKeys,
    dispatch,
  ]);

  const generateImages = useCallback(async () => {
    if (!initialPrompt) return;

    dispatch(startGeneration(providers));

    const enhancedPrompt = buildEnhancedPrompt(initialPrompt, selectedStyle);

    // Generate with each provider
    const results: { provider: AIProvider; images: GeneratedImage[] | Error }[] = [];

    await Promise.all(
      providers.map(async (provider) => {
        dispatch(updateGenerationProgress({ provider, progress: 'generating' }));

        try {
          const apiKey = apiKeys[provider];
          if (!apiKey) {
            throw new Error(`No API key for ${provider}`);
          }

          const size = mapSizeToProvider(selectedSize, provider);

          const images = await ImageService.generateImage({
            provider,
            apiKey,
            prompt: enhancedPrompt,
            size: size as 'auto' | '1024x1024' | '1024x1536' | '1536x1024',
            sourceImage,
          });

          dispatch(updateGenerationProgress({ provider, progress: 'complete' }));

          // Add to gallery
          for (const image of images) {
            const entry: GeneratedImageEntry = {
              id: `${provider}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              uri: image.url || '',
              prompt: enhancedPrompt,
              originalPrompt: initialPrompt,
              provider,
              model: provider === 'openai' ? 'gpt-image-1' : provider === 'google' ? 'gemini-2.5-flash-image' : 'grok-2-image-1212',
              style: selectedStyle,
              size: selectedSize,
              quality: selectedQuality,
              createdAt: Date.now(),
              isRefinement: Boolean(sourceImage),
              isUploaded: false,
            };
            dispatch(addToGallery(entry));
          }

          results.push({ provider, images });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
          console.error(`[CreateScreen] Generation error for ${provider}:`, error);
          dispatch(updateGenerationProgress({ provider, progress: 'error' }));
          results.push({ provider, images: error as Error });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      })
    );

    dispatch(completeGeneration());

    // Show error alert if any providers failed
    const failedProviders = results.filter(r => r.images instanceof Error);
    if (failedProviders.length > 0) {
      const failedNames = failedProviders
        .map(r => getImageProviderDisplayName(r.provider))
        .join(', ');
      Alert.alert(
        'Generation Issue',
        `Image generation failed for: ${failedNames}. ${failedProviders.length < providers.length ? 'Other providers succeeded.' : 'Please try again.'}`,
        [{ text: 'OK' }]
      );
    }
  }, [
    initialPrompt,
    providers,
    selectedStyle,
    selectedSize,
    selectedQuality,
    apiKeys,
    sourceImage,
    dispatch,
  ]);

  const handleRefine = useCallback((imageId: string) => {
    const image = gallery.find(img => img.id === imageId);
    if (!image) return;

    // Check if any provider supports refinement
    const hasRefinementProvider = availableRefinementProviders.some(p => p.supportsImg2Img && p.hasApiKey);
    if (!hasRefinementProvider) {
      Alert.alert(
        'Refinement Not Available',
        'No providers with image refinement capability are configured. Add an OpenAI or Google API key to enable refinement.'
      );
      return;
    }

    setRefiningImage(image);
  }, [gallery, availableRefinementProviders]);

  const handleRefinementSubmit = useCallback(async (opts: { instructions: string; provider: AIProvider }) => {
    if (!refiningImage) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRefiningImage(null);

    // Load base64 from the image file
    const base64 = await loadBase64FromFileUri(refiningImage.uri);
    if (!base64) {
      Alert.alert('Error', 'Could not load image for refinement.');
      return;
    }

    // Navigate to a new session with this image as source
    navigation.replace('CreateSession', {
      providers: [opts.provider],
      initialPrompt: `${refiningImage.originalPrompt}. Refinement: ${opts.instructions}`,
      sourceImage: base64,
    });
  }, [refiningImage, navigation]);

  const handleSaveToPhotos = useCallback(async (imageId: string) => {
    const image = gallery.find(img => img.id === imageId);
    if (!image) return;

    setSavingImage(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please allow access to save images.');
        return;
      }

      await MediaLibrary.saveToLibraryAsync(image.uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Image saved to your photo library.');
    } catch (error) {
      console.error('[CreateScreen] Save error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Failed to save image.');
    } finally {
      setSavingImage(false);
    }
  }, [gallery]);

  const handleShare = useCallback(async (imageId: string) => {
    const image = gallery.find(img => img.id === imageId);
    if (!image) return;

    try {
      await Share.share({
        url: image.uri,
        message: `Generated with ${getImageProviderDisplayName(image.provider)}: "${image.originalPrompt}"`,
      });
    } catch (error) {
      console.error('[CreateScreen] Share error:', error);
    }
  }, [gallery]);

  const handleDelete = useCallback((imageId: string) => {
    Alert.alert(
      'Delete Image',
      'Are you sure you want to delete this image?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            dispatch(removeFromGallery(imageId));
          },
        },
      ]
    );
  }, [dispatch]);

  const renderImageItem = useCallback(({ item }: { item: GeneratedImageEntry }) => {
    const isSelected = selectedImageId === item.id;
    const canRefine = supportsImageInput(item.provider);
    const providerName = getImageProviderDisplayName(item.provider);

    return (
      <TouchableOpacity
        style={[styles.imageCard, { backgroundColor: theme.colors.surface }]}
        onPress={() => setSelectedImageId(isSelected ? null : item.id)}
        activeOpacity={0.9}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={`Image generated by ${providerName}${item.isRefinement ? ', refined' : ''}`}
        accessibilityHint={isSelected ? "Tap to hide actions" : "Tap to show save, share, and refine options"}
        accessibilityState={{ selected: isSelected }}
      >
        <Image
          source={{ uri: item.uri }}
          style={styles.image}
          resizeMode="cover"
        />

        {/* Provider Badge */}
        <View style={[styles.providerBadge, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
          <Typography variant="caption" style={{ color: '#FFFFFF' }}>
            {providerName}
          </Typography>
          {item.isRefinement && (
            <View style={[styles.refinedBadge, { backgroundColor: theme.colors.primary[500] }]}>
              <Typography variant="caption" style={{ color: '#FFFFFF', fontSize: 10 }}>
                Refined
              </Typography>
            </View>
          )}
        </View>

        {/* Actions */}
        {isSelected && (
          <View style={[styles.actionsOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleSaveToPhotos(item.id)}
                disabled={savingImage}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Save to photos"
                accessibilityHint="Saves this image to your photo library"
                accessibilityState={{ disabled: savingImage }}
              >
                {savingImage ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Ionicons name="download-outline" size={24} color="#FFFFFF" />
                )}
                <Typography variant="caption" style={{ color: '#FFFFFF', marginTop: 4 }}>
                  Save
                </Typography>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleShare(item.id)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Share image"
                accessibilityHint="Opens share sheet to share this image"
              >
                <Ionicons name="share-outline" size={24} color="#FFFFFF" />
                <Typography variant="caption" style={{ color: '#FFFFFF', marginTop: 4 }}>
                  Share
                </Typography>
              </TouchableOpacity>

              {canRefine && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleRefine(item.id)}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel="Refine image"
                  accessibilityHint="Opens refinement options to modify this image"
                >
                  <Ionicons name="color-wand-outline" size={24} color="#FFFFFF" />
                  <Typography variant="caption" style={{ color: '#FFFFFF', marginTop: 4 }}>
                    Refine
                  </Typography>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleDelete(item.id)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Delete image"
                accessibilityHint="Permanently deletes this image from gallery"
              >
                <Ionicons name="trash-outline" size={24} color="#FF6B6B" />
                <Typography variant="caption" style={{ color: '#FF6B6B', marginTop: 4 }}>
                  Delete
                </Typography>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  }, [
    theme,
    selectedImageId,
    savingImage,
    handleSaveToPhotos,
    handleShare,
    handleRefine,
    handleDelete,
  ]);

  // In gallery mode (no initialPrompt), show all images
  // In generation mode, show only recent images from selected providers
  const isGalleryMode = !initialPrompt;
  const sessionGallery = isGalleryMode
    ? gallery
    : gallery.filter(img =>
        providers.includes(img.provider) &&
        img.createdAt >= Date.now() - 3600000 // Last hour
      );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={theme.colors.text.primary}
          />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Typography variant="subtitle">
            {isGalleryMode ? 'Gallery' : 'Create'}
          </Typography>
          <Typography variant="caption" color="secondary">
            {isGalleryMode
              ? `${gallery.length} images`
              : providers.map(p => getImageProviderDisplayName(p)).join(', ')}
          </Typography>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Generation Progress */}
      {isGenerating && (
        <View style={[styles.progressContainer, { backgroundColor: theme.colors.surface }]}>
          {providers.map(provider => {
            const progress = generationProgress[provider] || 'pending';
            return (
              <View key={provider} style={styles.progressItem}>
                <Typography variant="body">
                  {getImageProviderDisplayName(provider)}
                </Typography>
                {progress === 'generating' && (
                  <ActivityIndicator size="small" color={theme.colors.primary[500]} />
                )}
                {progress === 'complete' && (
                  <Ionicons name="checkmark-circle" size={20} color={theme.colors.success[500]} />
                )}
                {progress === 'error' && (
                  <Ionicons name="close-circle" size={20} color={theme.colors.error[500]} />
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Error Message */}
      {errorMessage && (
        <View style={[styles.errorContainer, { backgroundColor: theme.colors.error[100] }]}>
          <Typography variant="body" style={{ color: theme.colors.error[700] }}>
            {errorMessage}
          </Typography>
        </View>
      )}

      {/* Gallery */}
      <FlatList
        ref={flatListRef}
        data={sessionGallery}
        keyExtractor={(item) => item.id}
        renderItem={renderImageItem}
        contentContainerStyle={[
          styles.galleryContent,
          { paddingBottom: insets.bottom + 16 },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !isGenerating ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="image-outline"
                size={64}
                color={theme.colors.text.secondary}
              />
              <Typography variant="body" color="secondary" style={styles.emptyText}>
                No images generated yet
              </Typography>
            </View>
          ) : null
        }
      />

      {/* Refinement Modal */}
      <ImageRefinementModal
        visible={refiningImage !== null}
        imageUri={refiningImage?.uri || ''}
        originalProvider={refiningImage?.provider || 'openai'}
        availableProviders={availableRefinementProviders}
        onClose={() => setRefiningImage(null)}
        onRefine={handleRefinementSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  progressContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  progressItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
  },
  galleryContent: {
    padding: 16,
    gap: 16,
  },
  imageCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
  providerBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refinedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  actionsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 24,
  },
  actionButton: {
    alignItems: 'center',
    padding: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    marginTop: 16,
  },
});
