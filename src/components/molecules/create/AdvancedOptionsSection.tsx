/**
 * AdvancedOptionsSection
 *
 * Collapsible section containing advanced image generation options:
 * - Aspect Ratio selection
 * - Quality selection
 * - Image refinement upload
 *
 * Uses FAQItem-style expand/collapse animation.
 */

import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useDerivedValue,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme';
import { Typography } from '../common/Typography';
import { SizeOption, QualityOption } from '@/store/createSlice';
import { SIZE_OPTIONS } from '@/config/create/sizeOptions';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface AdvancedOptionsSectionProps {
  // Size/Aspect Ratio
  selectedSize: SizeOption;
  onSizeChange: (size: SizeOption) => void;
  // Quality
  selectedQuality: QualityOption;
  onQualityChange: (quality: QualityOption) => void;
  // Refinement
  canRefine: boolean;
  onUploadImage: () => void;
  testID?: string;
}

export const AdvancedOptionsSection: React.FC<AdvancedOptionsSectionProps> = ({
  selectedSize,
  onSizeChange,
  selectedQuality,
  onQualityChange,
  canRefine,
  onUploadImage,
  testID,
}) => {
  const { theme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);

  const progress = useDerivedValue(() => {
    return withTiming(isExpanded ? 1 : 0, { duration: 250 });
  }, [isExpanded]);

  const chevronStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      progress.value,
      [0, 1],
      [0, 180],
      Extrapolate.CLAMP
    );
    return {
      transform: [{ rotate: `${rotation}deg` }],
    };
  });

  const contentStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      progress.value,
      [0, 0.5, 1],
      [0, 0, 1],
      Extrapolate.CLAMP
    );
    return {
      opacity,
    };
  });

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  };

  const handleSizeSelect = (size: SizeOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSizeChange(size);
  };

  const handleQualitySelect = (quality: QualityOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onQualityChange(quality);
  };

  const handleUpload = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onUploadImage();
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
      testID={testID}
    >
      {/* Header - Always visible */}
      <TouchableOpacity
        onPress={handleToggle}
        style={styles.header}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel="Advanced options"
        accessibilityHint="Tap to expand or collapse advanced options"
      >
        <View style={styles.headerLeft}>
          <Ionicons
            name="options-outline"
            size={20}
            color={theme.colors.text.secondary}
            style={styles.headerIcon}
          />
          <Typography variant="body" weight="medium">
            Advanced Options
          </Typography>
        </View>
        <Animated.View style={chevronStyle}>
          <Ionicons
            name="chevron-down"
            size={20}
            color={theme.colors.text.secondary}
          />
        </Animated.View>
      </TouchableOpacity>

      {/* Expandable content */}
      {isExpanded && (
        <Animated.View style={[styles.content, contentStyle]}>
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

          {/* Aspect Ratio Section */}
          <View style={styles.optionSection}>
            <Typography variant="caption" color="secondary" style={styles.optionLabel}>
              Aspect Ratio
            </Typography>
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
                          : theme.colors.background,
                        borderColor: isSelected
                          ? theme.colors.primary[500]
                          : theme.colors.border,
                      },
                    ]}
                    onPress={() => handleSizeSelect(size.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${size.label} aspect ratio`}
                  >
                    <Ionicons
                      name={size.icon as keyof typeof Ionicons.glyphMap}
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
                      {size.preview}
                    </Typography>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Quality Section */}
          <View style={styles.optionSection}>
            <Typography variant="caption" color="secondary" style={styles.optionLabel}>
              Quality
            </Typography>
            <View style={styles.qualityRow}>
              <TouchableOpacity
                style={[
                  styles.qualityChip,
                  {
                    backgroundColor: selectedQuality === 'standard'
                      ? theme.colors.primary[500]
                      : theme.colors.background,
                    borderColor: selectedQuality === 'standard'
                      ? theme.colors.primary[500]
                      : theme.colors.border,
                  },
                ]}
                onPress={() => handleQualitySelect('standard')}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedQuality === 'standard' }}
                accessibilityLabel="Standard quality"
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
                      : theme.colors.background,
                    borderColor: selectedQuality === 'hd'
                      ? theme.colors.primary[500]
                      : theme.colors.border,
                  },
                ]}
                onPress={() => handleQualitySelect('hd')}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedQuality === 'hd' }}
                accessibilityLabel="HD quality"
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

          {/* Refine Image Section */}
          <View style={styles.optionSection}>
            <Typography variant="caption" color="secondary" style={styles.optionLabel}>
              Refine Existing Image
            </Typography>
            <TouchableOpacity
              style={[
                styles.uploadButton,
                {
                  backgroundColor: theme.colors.background,
                  borderColor: theme.colors.border,
                  opacity: canRefine ? 1 : 0.5,
                },
              ]}
              onPress={canRefine ? handleUpload : undefined}
              activeOpacity={canRefine ? 0.7 : 1}
              disabled={!canRefine}
              accessibilityRole="button"
              accessibilityLabel="Upload image for refinement"
              accessibilityHint={canRefine
                ? "Opens photo library to select an image"
                : "Disabled. Configure an AI provider to enable"}
              accessibilityState={{ disabled: !canRefine }}
            >
              <View style={styles.uploadContent}>
                <View
                  style={[
                    styles.uploadIconContainer,
                    {
                      backgroundColor: canRefine
                        ? theme.colors.primary[500] + '20'
                        : theme.colors.gray[300] + '20',
                    },
                  ]}
                >
                  <Ionicons
                    name="cloud-upload-outline"
                    size={24}
                    color={canRefine
                      ? theme.colors.primary[500]
                      : theme.colors.gray[400]}
                  />
                </View>
                <View style={styles.uploadTextContainer}>
                  <Typography
                    variant="body"
                    weight="medium"
                    color={canRefine ? undefined : 'secondary'}
                  >
                    Upload Image
                  </Typography>
                  <Typography variant="caption" color="secondary">
                    {canRefine
                      ? "Modify an existing image with AI"
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
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    marginRight: 10,
  },
  content: {
    paddingBottom: 16,
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  optionSection: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  optionLabel: {
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sizeGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  sizeChip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  qualityChip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  uploadButton: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  uploadContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  uploadIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
});
